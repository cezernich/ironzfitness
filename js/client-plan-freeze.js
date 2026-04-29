// client-plan-freeze.js — Phase 5A: read side of the plan-freeze flag
//
// When a coach picks "Freeze AI plan from this date forward" in the
// conflict-resolution modal, the trigger from 3A.1 writes a row into
// public.client_plan_freeze. This module reads that row and:
//
//   • Caches the frozen state in localStorage (`planFrozen`) so sync
//     plan-generation paths (onboarding-v2 _writeScheduleSessions,
//     etc.) can check it without an async detour.
//   • Exposes isPlanFrozen() for callers that want the current state.
//   • Surfaces a Profile-screen card when frozen, with a "Take back
//     plan control" button that writes unfrozen_at on the DB row +
//     clears the cache.
//   • Re-fetches on auth ready so the cache stays in sync across
//     devices.
//
// Spec: new features/COACHING_FEATURE_SPEC_2026-04-28.md
// Schema: supabase/migrations/20260428_coaching_schema.sql

(function () {
  "use strict";

  const LS_KEY = "planFrozen";

  // ── Read ──────────────────────────────────────────────────────────────
  async function fetchPlanFreezeState() {
    const sb = window.supabaseClient;
    if (!sb) return false;
    const sess = (await sb.auth.getSession())?.data?.session;
    const uid = sess?.user?.id;
    if (!uid) {
      _writeCache(false, null, null);
      return false;
    }
    try {
      const { data } = await sb.from("client_plan_freeze")
        .select("client_id, frozen_at, frozen_by, unfrozen_at")
        .eq("client_id", uid)
        .maybeSingle();
      if (!data || data.unfrozen_at) {
        _writeCache(false, null, null);
        return false;
      }
      _writeCache(true, data.frozen_by, data.frozen_at);
      return true;
    } catch (e) {
      console.warn("[planFreeze] fetch failed:", e);
      return false;
    }
  }

  function isPlanFrozen() {
    try { return localStorage.getItem(LS_KEY) === "true"; }
    catch { return false; }
  }

  function getFrozenMeta() {
    try {
      const raw = localStorage.getItem("planFrozenMeta");
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  }

  function _writeCache(frozen, by, at) {
    try {
      localStorage.setItem(LS_KEY, frozen ? "true" : "false");
      if (frozen && by) {
        localStorage.setItem("planFrozenMeta", JSON.stringify({ by, at }));
      } else {
        localStorage.removeItem("planFrozenMeta");
      }
    } catch {}
  }

  // ── Write (user-initiated unfreeze) ───────────────────────────────────
  async function unfreezePlan() {
    const sb = window.supabaseClient;
    if (!sb) return false;
    const sess = (await sb.auth.getSession())?.data?.session;
    const uid = sess?.user?.id;
    if (!uid) return false;

    // Set unfrozen_at — keeps the row as a historical record. The
    // 20260429b migration grants clients an UPDATE policy on their own
    // row so this write succeeds without admin escalation. fetchPlan-
    // FreezeState treats a row with unfrozen_at populated as "not
    // frozen", so the cache flips automatically on the next refresh.
    const { error } = await sb.from("client_plan_freeze")
      .update({ unfrozen_at: new Date().toISOString() })
      .eq("client_id", uid);
    if (error) {
      console.warn("[planFreeze] unfreeze failed:", error);
      return false;
    }
    _writeCache(false, null, null);
    initPlanFreezeUI();
    return true;
  }

  // ── Profile UI — visibility + handler ────────────────────────────────
  // The card markup is rendered inert in index.html; this function
  // flips display + populates the meta line.
  async function initPlanFreezeUI() {
    const card = document.getElementById("section-plan-freeze");
    if (!card) return;

    const frozen = isPlanFrozen();
    if (!frozen) {
      card.style.display = "none";
      return;
    }

    // Resolve the coach's name for the message. window._coachNameCache
    // is populated by other coach modules; if missing, fall back to
    // a generic line.
    const meta = getFrozenMeta();
    let coachName = "your coach";
    if (meta?.by && window._coachNameCache && window._coachNameCache[meta.by]) {
      coachName = window._coachNameCache[meta.by];
    } else if (meta?.by) {
      // Lazy lookup. Don't block UI; refill the line on resolve.
      try {
        const sb = window.supabaseClient;
        if (sb) {
          const { data } = await sb.from("profiles").select("full_name, email").eq("id", meta.by).maybeSingle();
          if (data) {
            coachName = data.full_name || data.email || "your coach";
            if (!window._coachNameCache) window._coachNameCache = {};
            window._coachNameCache[meta.by] = coachName;
          }
        }
      } catch {}
    }

    const msgEl = document.getElementById("plan-freeze-msg");
    if (msgEl) {
      const since = meta?.at ? ` since ${new Date(meta.at).toLocaleDateString()}` : "";
      msgEl.textContent = `${coachName} is managing your schedule${since}. AI auto-updates are paused.`;
    }
    card.style.display = "";
  }

  async function takeBackPlanControl() {
    if (!confirm("Take back AI plan control?\n\nYour coach's existing workouts on the calendar stay, but the AI will resume generating new sessions on top.")) return;
    const ok = await unfreezePlan();
    if (ok) {
      alert("Plan control restored. AI updates will resume.");
      if (typeof renderCalendar === "function") renderCalendar();
    } else {
      alert("Couldn't unfreeze — try again.");
    }
  }

  // ── Boot ──────────────────────────────────────────────────────────────
  // Re-fetch on auth ready so the cache stays current. Hooked into
  // auth.js which calls window.refreshPlanFreezeState if defined.
  async function refreshPlanFreezeState() {
    await fetchPlanFreezeState();
    initPlanFreezeUI();
  }

  // ── Public surface ─────────────────────────────────────────────────────
  window.fetchPlanFreezeState   = fetchPlanFreezeState;
  window.refreshPlanFreezeState = refreshPlanFreezeState;
  window.isPlanFrozen           = isPlanFrozen;
  window.getPlanFrozenMeta      = getFrozenMeta;
  window.unfreezePlan           = unfreezePlan;
  window.initPlanFreezeUI       = initPlanFreezeUI;
  window.takeBackPlanControl    = takeBackPlanControl;
})();
