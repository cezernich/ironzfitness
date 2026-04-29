// client-coach-card.js — Phase 5C: surface the user's active coach on
// the Settings tab so they can find the relationship + leave it without
// admin intervention.
//
// Toggles #section-my-coach based on coaching_assignments where the
// signed-in user is the client. Populates name + bio from the coach's
// profile. "Leave coach" button calls the leave_coach() RPC (defined
// in 20260429d_leave_coach.sql) which soft-deactivates active rows.
//
// Wire-up: auth.js calls window.refreshMyCoachCard() after each init().

(function () {
  "use strict";

  function _esc(s) {
    const div = document.createElement("div");
    div.textContent = s == null ? "" : String(s);
    return div.innerHTML;
  }

  function _initials(name) {
    if (!name) return "?";
    return String(name).trim().slice(0, 1).toUpperCase();
  }

  // Race a supabase call against a timeout so a hung connection surfaces
  // as an error instead of a stuck UI. Same pattern as admin.js / the
  // coach-assign flow.
  function _withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${label || "Request"} timed out — please try again.`)), ms)
      ),
    ]);
  }

  async function refreshMyCoachCard() {
    const card = document.getElementById("section-my-coach");
    if (!card) return;

    const sb = window.supabaseClient;
    if (!sb) { card.style.display = "none"; return; }

    let uid;
    try {
      const sess = await _withTimeout(sb.auth.getSession(), 3000, "Sign-in check");
      uid = sess?.data?.session?.user?.id;
    } catch {
      card.style.display = "none";
      return;
    }
    if (!uid) { card.style.display = "none"; return; }

    try {
      const { data: assignments } = await sb
        .from("coaching_assignments")
        .select("coach_id, role, assigned_at")
        .eq("client_id", uid)
        .eq("active", true)
        .eq("role", "primary")
        .order("assigned_at", { ascending: false })
        .limit(1);
      const a = (assignments || [])[0];
      if (!a) { card.style.display = "none"; return; }

      // Pull the coach's display profile. Coaches expose full_name/email/
      // coach_bio (the bio column is on profiles per the coaching schema).
      const { data: coach } = await sb
        .from("profiles")
        .select("id, full_name, email, coach_bio")
        .eq("id", a.coach_id)
        .maybeSingle();
      if (!coach) { card.style.display = "none"; return; }

      const displayName = coach.full_name || coach.email || "Your coach";
      const nameEl = document.getElementById("my-coach-name");
      const avatarEl = document.getElementById("my-coach-avatar");
      const bioEl = document.getElementById("my-coach-bio");
      if (nameEl) nameEl.textContent = displayName;
      if (avatarEl) avatarEl.textContent = _initials(displayName);
      if (bioEl) {
        if (coach.coach_bio) {
          bioEl.textContent = coach.coach_bio;
          bioEl.style.display = "";
        } else {
          bioEl.style.display = "none";
        }
      }
      card.dataset.coachName = displayName;
      card.style.display = "";
    } catch (e) {
      console.warn("[client-coach-card] refresh failed:", e);
      card.style.display = "none";
    }
  }

  // ── In-app confirm modal — reuses .rating-modal-overlay shell so it
  // matches the rest of the app instead of triggering a native confirm().
  function _openConfirmModal({ title, body, confirmLabel, danger, onConfirm }) {
    const id = "leave-coach-modal-overlay";
    const old = document.getElementById(id);
    if (old) old.remove();
    const overlay = document.createElement("div");
    overlay.id = id;
    overlay.className = "rating-modal-overlay";
    const close = () => {
      overlay.classList.remove("visible");
      setTimeout(() => overlay.remove(), 200);
    };
    overlay.onclick = (e) => { if (e.target === overlay) close(); };
    overlay.innerHTML = `
      <div class="rating-modal" style="max-width:380px">
        <div class="rating-modal-title">${_esc(title || "Confirm")}</div>
        ${body ? `<div style="text-align:center;color:var(--color-text-muted);font-size:0.9rem;margin-bottom:14px">${body}</div>` : ""}
        <div style="display:flex;gap:8px">
          <button class="btn-secondary" id="leave-coach-cancel" style="flex:1;min-height:38px">Cancel</button>
          <button class="${danger ? "btn-danger" : "btn-primary"}" id="leave-coach-confirm" style="flex:1;min-height:38px">${_esc(confirmLabel || "Confirm")}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));
    overlay.querySelector("#leave-coach-cancel").onclick = (e) => {
      e.stopPropagation();
      close();
    };
    overlay.querySelector("#leave-coach-confirm").onclick = (e) => {
      e.stopPropagation();
      close();
      try { onConfirm && onConfirm(); } catch (err) { console.warn(err); }
    };
  }

  async function leaveCoach() {
    const card = document.getElementById("section-my-coach");
    const coachName = card?.dataset?.coachName || "your coach";
    _openConfirmModal({
      title: `Leave ${coachName}?`,
      body: "Their assigned workouts will stay on your calendar — you can keep doing them. The AI plan will resume on any open days.",
      confirmLabel: "Leave coach",
      danger: true,
      onConfirm: async () => {
        const sb = window.supabaseClient;
        if (!sb) return;
        try {
          const res = await _withTimeout(sb.rpc("leave_coach"), 8000, "Leave");
          if (res?.error) throw new Error(res.error.message);
          if (typeof window._showShareToast === "function") {
            window._showShareToast(`Left ${coachName}.`);
          }
          await refreshMyCoachCard();
          // Keep coach-request card + active-coach state in sync.
          if (typeof window.initCoachVisibility === "function") {
            try { await window.initCoachVisibility(); } catch {}
          }
          if (typeof window.fetchActiveCoachIds === "function") {
            try { await window.fetchActiveCoachIds(); } catch {}
          }
        } catch (e) {
          console.warn("[client-coach-card] leave_coach failed:", e);
          _openConfirmModal({
            title: "Couldn't leave coach",
            body: e?.message || "Try again in a moment.",
            confirmLabel: "OK",
            onConfirm: () => {},
          });
        }
      },
    });
  }

  window.refreshMyCoachCard = refreshMyCoachCard;
  window.leaveCoach         = leaveCoach;
})();
