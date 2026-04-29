// coach-invite-flow.js — Phase B handler for the invite-link auth flow.
//
// One job: after auth (sign-in or post-onboarding), check for a pending
// invite. If present and not in cooldown, fetch the coach details and
// open the Accept Coaching modal. The modal's Accept button calls
// pair_with_coach() or switch_coach() on the server (Phase B SQL
// functions); Not now calls dismiss_invite().
//
// Wire-up:
//   • js/auth.js — calls window.checkPendingInvite() right after each
//     init() (returning user via getSession + fresh sign-in via
//     onAuthStateChange SIGNED_IN).
//   • js/onboarding-v2.js — same call inside _goToHomeTab() so a new
//     user signing up via /c/<code> sees the modal at the end of onboarding.
//   • c/index.html — stashes the pending invite in localStorage with
//     24h TTL. This module reads + clears localStorage and (P0) moves
//     the value into profiles.pending_invite_link_id so it stays
//     per-user even if multiple people share the device.
//
// Error contract — pair_with_coach + switch_coach raise SQLSTATE codes
// the spec defines:
//   IRO01 INVITE_LINK_INACTIVE  → toast: "This invite link is no longer active."
//   IRO02 COACH_INACTIVE        → toast + redirect to Request a Coach.
//   IRO03 SAME_COACH            → toast: "You're already coached by X."
//   IRO04 NO_EXISTING_COACH     → call pair_with_coach instead and retry.

(function () {
  "use strict";

  // localStorage key used by c/index.html and the post-auth handler. The
  // shape is `{ invite_link_id, code, set_at, expires_at }` — see
  // c/index.html stashPendingInvite() for the writer side.
  const PENDING_KEY = "ironz_pending_invite";
  // Local 7-day cooldown cache. Key per link_id; value is the dismissed
  // timestamp. Server-side dismissed_at is canonical (cross-device); this
  // is the fast path so we don't hit the network on every auth.
  const COOLDOWN_PREFIX = "ironz_invite_dismiss_";
  const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

  // Edge function URL — same coach-invite endpoint used by the static
  // landing page. format=json returns the coach JSON for modal render.
  const EDGE_URL = "https://dagdpdcwqdlibxbitdgr.supabase.co/functions/v1/coach-invite";

  // Module state — populated when openAcceptCoachingModal opens, cleared
  // on dismiss / accept / error so a stale handler can't fire after the
  // modal closes.
  let _activeInvite = null; // { invite_link_id, code, coach, existingCoach, mode }
  // Captures the in-flight URL-param consumer so checkPendingInvite can
  // await its localStorage write before reading. Set at module load
  // bottom; nullable until then.
  let _urlConsumePromise = null;

  // ── Public entry: called by auth.js + onboarding-v2.js ───────────────
  async function checkPendingInvite() {
    try {
      // Make sure the URL-param consumer has finished writing
      // localStorage before we read it. Returns immediately on second+
      // call (the in-flight promise is shared).
      if (_urlConsumePromise) {
        try { await _urlConsumePromise; } catch {}
      }

      const sb = window.supabaseClient;
      if (!sb) return;
      const { data: sessData } = await sb.auth.getSession();
      const userId = sessData?.session?.user?.id;
      if (!userId) return;

      // Resolve the pending invite. Two sources, in priority order:
      //   1. profiles.pending_invite_link_id — set by an earlier
      //      checkPendingInvite() that ran post-auth. Tied to the user,
      //      not the device. Survives across devices.
      //   2. localStorage — set by c/index.html on landing page click,
      //      before auth. 24h TTL. Migrated into the profile then cleared.
      const pending = await _resolvePendingInvite(sb, userId);
      if (!pending || !pending.invite_link_id) return;

      // Cooldown check — local cache first (fast path), then ask the
      // server. Server is canonical so a user dismissing on phone A and
      // signing in on phone B doesn't get re-prompted within the window.
      if (_isLocallyDismissed(pending.invite_link_id)) {
        return;
      }
      const { data: dismissed } = await sb.rpc("invite_dismissed_recently", {
        p_invite_link_id: pending.invite_link_id,
      });
      if (dismissed === true) {
        // Mirror the server's verdict back into the local cache so the
        // next auth on this device skips the network round-trip.
        _markLocallyDismissed(pending.invite_link_id);
        return;
      }

      // Fetch the coach details. Uses the same coach-invite edge
      // function as the landing page (no JWT required — the lookup is
      // public for active links).
      const coach = await _fetchCoachByCode(pending.code);
      if (!coach) {
        // Link's no longer active OR coach was deactivated. Clear the
        // pending pointer so we don't loop on every sign-in.
        await _clearPendingInvite(sb, userId);
        return;
      }

      // Same-coach short-circuit (pre-kickoff P1). Skip the modal
      // entirely and clear the pending invite — no toast spam if the
      // user just clicked their own coach's link.
      const existingCoach = await _getActivePrimaryCoach(sb, userId);
      if (existingCoach && existingCoach.id === coach.id) {
        await _clearPendingInvite(sb, userId);
        if (typeof window._showShareToast === "function") {
          window._showShareToast(`You're already coached by ${coach.full_name || "this coach"}.`);
        }
        return;
      }

      openAcceptCoachingModal({
        invite_link_id: pending.invite_link_id,
        code: pending.code,
        coach,
        existingCoach,
      });
    } catch (e) {
      console.warn("[coach-invite-flow] checkPendingInvite failed:", e);
    }
  }

  // ── Pending resolution ────────────────────────────────────────────────
  async function _resolvePendingInvite(sb, userId) {
    // 1) profile pointer (canonical)
    try {
      const { data: profile } = await sb
        .from("profiles")
        .select("pending_invite_link_id, pending_invite_set_at")
        .eq("id", userId)
        .maybeSingle();
      if (profile && profile.pending_invite_link_id) {
        // Resolve the code from the link id so we can reuse the existing
        // edge function (which keys on code).
        const { data: link } = await sb
          .from("coach_invite_links")
          .select("code")
          .eq("id", profile.pending_invite_link_id)
          .maybeSingle();
        if (link && link.code) {
          return { invite_link_id: profile.pending_invite_link_id, code: link.code };
        }
      }
    } catch (e) {
      console.warn("[coach-invite-flow] profile pending lookup failed:", e);
    }

    // 2) localStorage (pre-auth landing-page write). Migrate into the
    // profile then clear localStorage so this device can't re-leak.
    try {
      const raw = localStorage.getItem(PENDING_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.invite_link_id || !parsed.code) {
        localStorage.removeItem(PENDING_KEY);
        return null;
      }
      // 24h TTL on the localStorage value (P0 fix).
      if (parsed.expires_at && Date.now() > parsed.expires_at) {
        localStorage.removeItem(PENDING_KEY);
        return null;
      }
      // Move into the profile — ties the pending invite to the user, not
      // the device. Other users signing in on this device won't inherit
      // the previous user's pending invite once we clear localStorage.
      try {
        await sb
          .from("profiles")
          .update({
            pending_invite_link_id: parsed.invite_link_id,
            pending_invite_set_at: new Date().toISOString(),
          })
          .eq("id", userId);
      } catch (e) {
        // Don't block the modal if the profile write fails — we still
        // have the value in this in-memory call.
        console.warn("[coach-invite-flow] profile update failed:", e);
      }
      localStorage.removeItem(PENDING_KEY);
      return { invite_link_id: parsed.invite_link_id, code: parsed.code };
    } catch (e) {
      console.warn("[coach-invite-flow] localStorage parse failed:", e);
      localStorage.removeItem(PENDING_KEY);
      return null;
    }
  }

  async function _clearPendingInvite(sb, userId) {
    try { localStorage.removeItem(PENDING_KEY); } catch {}
    try {
      await sb
        .from("profiles")
        .update({ pending_invite_link_id: null, pending_invite_set_at: null })
        .eq("id", userId);
    } catch (e) {
      console.warn("[coach-invite-flow] clear pending failed:", e);
    }
  }

  async function _fetchCoachByCode(code) {
    try {
      const url = `${EDGE_URL}?format=json&code=${encodeURIComponent(code)}`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      const text = await res.text();
      let payload;
      try { payload = JSON.parse(text); } catch { return null; }
      if (!payload || !payload.ok) return null;
      return payload.coach || null;
    } catch (e) {
      console.warn("[coach-invite-flow] _fetchCoachByCode failed:", e);
      return null;
    }
  }

  async function _getActivePrimaryCoach(sb, userId) {
    try {
      const { data } = await sb
        .from("coaching_assignments")
        .select("coach_id")
        .eq("client_id", userId)
        .eq("role", "primary")
        .eq("active", true)
        .maybeSingle();
      if (!data) return null;
      const { data: coachProfile } = await sb
        .from("profiles")
        .select("id, full_name, avatar_url")
        .eq("id", data.coach_id)
        .maybeSingle();
      return coachProfile || { id: data.coach_id };
    } catch (e) {
      console.warn("[coach-invite-flow] active primary lookup failed:", e);
      return null;
    }
  }

  // ── Cooldown cache ────────────────────────────────────────────────────
  function _isLocallyDismissed(linkId) {
    try {
      const raw = localStorage.getItem(COOLDOWN_PREFIX + linkId);
      if (!raw) return false;
      const ts = parseInt(raw, 10);
      if (!ts) { localStorage.removeItem(COOLDOWN_PREFIX + linkId); return false; }
      if (Date.now() - ts > COOLDOWN_MS) {
        localStorage.removeItem(COOLDOWN_PREFIX + linkId);
        return false;
      }
      return true;
    } catch { return false; }
  }
  function _markLocallyDismissed(linkId) {
    try { localStorage.setItem(COOLDOWN_PREFIX + linkId, String(Date.now())); } catch {}
  }
  function _clearLocalDismissal(linkId) {
    try { localStorage.removeItem(COOLDOWN_PREFIX + linkId); } catch {}
  }

  // ── Modal rendering ───────────────────────────────────────────────────
  function openAcceptCoachingModal(opts) {
    const overlay = document.getElementById("invite-accept-overlay");
    if (!overlay) return;

    _activeInvite = {
      invite_link_id: opts.invite_link_id,
      code: opts.code,
      coach: opts.coach,
      existingCoach: opts.existingCoach || null,
      mode: opts.existingCoach ? "switch" : "first",
    };

    const coach = opts.coach || {};
    const isSwitch = !!opts.existingCoach;

    // Avatar: image if URL is set, otherwise initial letter.
    const avatarEl = document.getElementById("invite-accept-avatar");
    if (avatarEl) {
      if (coach.avatar_url) {
        avatarEl.innerHTML = `<img src="${_attr(coach.avatar_url)}" alt="">`;
      } else {
        const initial = (coach.full_name || "?").trim().slice(0, 1).toUpperCase();
        avatarEl.textContent = initial;
      }
    }

    const nameEl = document.getElementById("invite-accept-coach-name");
    if (nameEl) nameEl.textContent = coach.full_name || "Your coach";

    const bioEl = document.getElementById("invite-accept-bio");
    if (bioEl) {
      if (coach.coach_bio) {
        bioEl.textContent = coach.coach_bio;
        bioEl.style.display = "";
      } else {
        bioEl.style.display = "none";
      }
    }

    const titleEl = document.getElementById("invite-accept-title");
    if (titleEl) {
      titleEl.textContent = isSwitch
        ? `Switch to ${coach.full_name || "this coach"}?`
        : `Accept coaching from ${coach.full_name || "your coach"}?`;
    }

    const conflictEl = document.getElementById("invite-accept-conflict");
    if (conflictEl) {
      if (isSwitch) {
        const prev = (opts.existingCoach && opts.existingCoach.full_name) || "your current coach";
        conflictEl.textContent = `This will replace your current coach, ${prev}.`;
        conflictEl.style.display = "";
      } else {
        conflictEl.textContent = "";
        conflictEl.style.display = "none";
      }
    }

    const primaryBtn = document.getElementById("invite-accept-primary-btn");
    const secondaryBtn = document.getElementById("invite-accept-secondary-btn");
    if (primaryBtn) {
      primaryBtn.textContent = isSwitch
        ? `Switch to ${(coach.full_name || "this coach").split(" ")[0]}`
        : "Accept";
      primaryBtn.disabled = false;
    }
    if (secondaryBtn) {
      secondaryBtn.textContent = isSwitch
        ? `Keep ${(opts.existingCoach && opts.existingCoach.full_name || "current").split(" ")[0]}`
        : "Not now";
      secondaryBtn.disabled = false;
    }

    const errEl = document.getElementById("invite-accept-error");
    if (errEl) errEl.textContent = "";

    overlay.classList.add("is-open");
  }

  function _closeModal() {
    const overlay = document.getElementById("invite-accept-overlay");
    if (overlay) overlay.classList.remove("is-open");
  }

  function _setModalError(msg) {
    const el = document.getElementById("invite-accept-error");
    if (el) el.textContent = msg || "";
  }

  function _setModalBusy(on) {
    const primary = document.getElementById("invite-accept-primary-btn");
    const secondary = document.getElementById("invite-accept-secondary-btn");
    if (primary) primary.disabled = !!on;
    if (secondary) secondary.disabled = !!on;
    if (primary && on) primary.dataset.origLabel = primary.textContent;
    if (primary && on) primary.textContent = "Connecting…";
    if (primary && !on && primary.dataset.origLabel) {
      primary.textContent = primary.dataset.origLabel;
      delete primary.dataset.origLabel;
    }
  }

  // ── Accept / Dismiss ─────────────────────────────────────────────────
  async function inviteAcceptConfirm() {
    if (!_activeInvite) { _closeModal(); return; }
    const sb = window.supabaseClient;
    if (!sb) { _setModalError("You're offline. Try again."); return; }

    _setModalBusy(true);
    _setModalError("");

    const { invite_link_id, mode, coach } = _activeInvite;
    const rpc = mode === "switch" ? "switch_coach" : "pair_with_coach";

    try {
      const { error } = await sb.rpc(rpc, { p_invite_link_id: invite_link_id });

      if (error) {
        // Custom SQLSTATEs (IRO01..IRO04) can land in different supabase-js
        // fields depending on the client version: `error.code` is the
        // standard slot, but PostgREST sometimes shoves them into
        // `error.details`/`error.hint` and the human-readable RAISE
        // message into `error.message`. Check all four so the branch
        // routing works regardless of where the code surfaces.
        const errcode = _extractIROCode(error);

        if (errcode === "IRO03") {
          // Same-coach race — the user got here via the modal but the
          // server says we're already paired. Treat as success and
          // clear the pending invite.
          _toast(`You're already coached by ${coach?.full_name || "this coach"}.`);
          await _onSuccess(sb, invite_link_id, /*paired=*/true);
          return;
        }
        if (errcode === "IRO02") {
          _setModalError("This coach is no longer accepting clients.");
          // Clear pending so we don't re-prompt next sign-in.
          await _clearPending(sb, invite_link_id);
          _setModalBusy(false);
          return;
        }
        if (errcode === "IRO01") {
          _setModalError("This invite link is no longer active.");
          await _clearPending(sb, invite_link_id);
          _setModalBusy(false);
          return;
        }
        if (errcode === "IRO04") {
          // switch_coach was called but the user has no active primary —
          // fall back to pair_with_coach. Rare race (admin removed the
          // primary while the modal was open).
          const { error: pairErr } = await sb.rpc("pair_with_coach", { p_invite_link_id: invite_link_id });
          if (pairErr) {
            console.warn("[coach-invite-flow] fallback pair failed:", pairErr);
            _setModalError("Couldn't connect with coach — try again.");
            _setModalBusy(false);
            return;
          }
          await _onSuccess(sb, invite_link_id, /*paired=*/true);
          return;
        }
        // Unknown error — generic toast + retry.
        console.warn("[coach-invite-flow] rpc error:", error);
        _setModalError("Couldn't connect with coach — try again.");
        _setModalBusy(false);
        return;
      }

      // Success path.
      await _onSuccess(sb, invite_link_id, /*paired=*/true);
    } catch (e) {
      console.warn("[coach-invite-flow] inviteAcceptConfirm threw:", e);
      _setModalError("Couldn't connect with coach — try again.");
      _setModalBusy(false);
    }
  }

  async function inviteAcceptDismiss() {
    if (!_activeInvite) { _closeModal(); return; }
    const sb = window.supabaseClient;
    const { invite_link_id, coach } = _activeInvite;

    _setModalBusy(true);

    // Mark dismissed locally first (fast path) so the cooldown sticks
    // even if the server call fails. We'll retry on next auth — the
    // Postgres function is idempotent.
    _markLocallyDismissed(invite_link_id);

    try {
      if (sb) await sb.rpc("dismiss_invite", { p_invite_link_id: invite_link_id });
    } catch (e) {
      console.warn("[coach-invite-flow] dismiss_invite rpc failed:", e);
    }

    _toast(`Saved for later — we won't ask again for 7 days.`);
    _activeInvite = null;
    _closeModal();
  }

  async function _onSuccess(sb, invite_link_id, paired) {
    const coach = _activeInvite ? _activeInvite.coach : null;
    _activeInvite = null;
    _clearLocalDismissal(invite_link_id);
    _closeModal();

    if (paired && coach) {
      _toast(`Connected with ${coach.full_name || "your coach"}.`);
    }

    // Trigger any client-side listeners that need to refresh after a
    // pairing change (e.g., the coach-assigned workout subscription).
    if (typeof window.subscribeCoachAssignments === "function") {
      try { window.subscribeCoachAssignments(); } catch {}
    }
    if (typeof window.refreshPlanFreezeState === "function") {
      try { await window.refreshPlanFreezeState(); } catch {}
    }
  }

  async function _clearPending(sb, invite_link_id) {
    try {
      const { data } = await sb.auth.getSession();
      const uid = data?.session?.user?.id;
      if (uid) await _clearPendingInvite(sb, uid);
    } catch {}
    _activeInvite = null;
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  // Extract the custom IRO0x SQLSTATE from a supabase-js error object.
  //
  // CANONICAL SLOT: deferred to post-launch — DevTools verification
  // skipped per Chase's launch call. The fallback chain below handles
  // all four plausible slots (code → details → hint → message regex →
  // exact-string match), so routing is correct regardless of which
  // slot supabase-js / PostgREST actually populates. The post-launch
  // optimization is a single reorder: confirm which slot is canonical
  // for our supabase-js version, hoist that lookup first, leave the
  // rest as belt-and-suspenders against future client changes.
  //
  // Verification recipe (run in DevTools console as a paired coach):
  //   await window.sb.rpc('pair_with_coach',
  //     { p_invite_link_id: '<your-already-paired-link-uuid>' })
  // The IRO03 SAME_COACH error will surface in exactly one of:
  // error.code, error.details, error.hint, error.message.
  //
  // Final-defense regexes match the exact RAISE EXCEPTION strings from
  // 20260430b_coach_invite_pair_functions.sql in case a future
  // supabase-js version strips SQLSTATEs entirely from non-message
  // fields. Returns null if no IRO0x found.
  function _extractIROCode(error) {
    if (!error) return null;
    const slots = [error.code, error.details, error.hint]
      .filter((v) => typeof v === "string" && v);
    for (const v of slots) {
      const m = v.match(/IRO0[1-4]/);
      if (m) return m[0];
    }
    const msg = (error.message || "").toString();
    const m = msg.match(/IRO0[1-4]/);
    if (m) return m[0];
    // Final defense — match the exact RAISE EXCEPTION strings the
    // Postgres function uses, in case future supabase-js versions strip
    // SQLSTATE entirely from non-message fields.
    if (/already paired with this coach/i.test(msg)) return "IRO03";
    if (/coach is no longer accepting clients/i.test(msg)) return "IRO02";
    if (/invite link not found/i.test(msg)) return "IRO01";
    if (/no existing primary coach to switch from/i.test(msg)) return "IRO04";
    return null;
  }

  function _attr(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
    );
  }
  function _toast(msg) {
    if (typeof window._showShareToast === "function") {
      window._showShareToast(msg);
    } else if (typeof window.showToast === "function") {
      window.showToast(msg);
    }
    // Silent fallback if no toast helper is loaded.
  }

  // ── URL-param consumer ───────────────────────────────────────────────
  // Runs once at module load. Catches direct hits to
  // `ironz.fit/?invite=<code>` (when a user opens the coach's link
  // straight in the SPA, skipping the c/index.html landing) and stashes
  // the pending invite into localStorage so the post-auth handler can
  // pick it up like any other invite. Strips the param off the URL so
  // refreshing doesn't re-trigger the flow.
  async function _consumeUrlParam() {
    if (typeof window === "undefined" || !window.location) return;
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("invite");
    if (!raw) return;

    const code = raw.trim().toUpperCase();
    // Clean the URL immediately — keep ?signup=1 etc. so onboarding gating
    // still works.
    try {
      params.delete("invite");
      const search = params.toString();
      const cleanUrl = window.location.pathname + (search ? "?" + search : "") + window.location.hash;
      history.replaceState(null, "", cleanUrl);
    } catch {}

    if (!/^[2-9A-HJ-NP-Z]{6}$/.test(code)) return;

    try {
      const url = `${EDGE_URL}?format=json&code=${encodeURIComponent(code)}`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      const text = await res.text();
      let payload;
      try { payload = JSON.parse(text); } catch { return; }
      if (!payload || !payload.ok || !payload.invite_link_id) return;
      const value = JSON.stringify({
        invite_link_id: payload.invite_link_id,
        code,
        set_at: Date.now(),
        expires_at: Date.now() + 24 * 60 * 60 * 1000,
      });
      localStorage.setItem(PENDING_KEY, value);
    } catch (e) {
      console.warn("[coach-invite-flow] _consumeUrlParam fetch failed:", e);
    }
  }

  // Fire-and-forget at module load. The promise is captured so
  // checkPendingInvite() can `await` it on the post-auth hook — that
  // closes the race where init() resolves before the edge-function
  // fetch lands localStorage.
  _urlConsumePromise = _consumeUrlParam();

  // ── Public surface ───────────────────────────────────────────────────
  if (typeof window !== "undefined") {
    window.checkPendingInvite       = checkPendingInvite;
    window.openAcceptCoachingModal  = openAcceptCoachingModal;
    window.inviteAcceptConfirm      = inviteAcceptConfirm;
    window.inviteAcceptDismiss      = inviteAcceptDismiss;
  }
})();
