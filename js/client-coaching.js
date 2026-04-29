// client-coaching.js — Phase 5B: client-side awareness of active coaches
//
// Mirrors the read-only state every IronZ user needs to know about their
// own coaching context: who's actively coaching me right now? The Phase 3
// FROM-coach badge previously assumed the assigning coach was still
// active. When a coach is removed (admin-coaches.js soft-deactivates
// coaching_assignments via active=false), already-mirrored workouts on
// the client's calendar still carry that coach's UUID. This module
// surfaces "FROM FORMER COACH" instead of the original coach name once
// the relationship ends.
//
// Cache shape:
//   window._activeCoachIds         = Set<uuid>
//   window._activeCoachIdsLoaded   = boolean (true after first fetch)
//
// Render path callers (calendar.js coach-attribution branch) check both
// — fail open while not loaded so a slow auth boot doesn't display
// "former coach" for current ones.
//
// Spec: new features/COACHING_FEATURE_SPEC_2026-04-28.md
// Schema: supabase/migrations/20260428_coaching_schema.sql

(function () {
  "use strict";

  async function fetchActiveCoachIds() {
    const sb = window.supabaseClient;
    if (!sb) return;
    const sess = (await sb.auth.getSession())?.data?.session;
    const uid = sess?.user?.id;
    if (!uid) {
      window._activeCoachIds = new Set();
      window._activeCoachIdsLoaded = true;
      return;
    }
    try {
      const { data } = await sb.from("coaching_assignments")
        .select("coach_id")
        .eq("client_id", uid)
        .eq("active", true);
      window._activeCoachIds = new Set((data || []).map(r => r.coach_id));
      window._activeCoachIdsLoaded = true;
    } catch (e) {
      console.warn("[clientCoaching] fetch failed:", e);
      // Fail open: don't have a list, treat all as active so we don't
      // mis-label legit coaches.
      window._activeCoachIds = new Set();
      window._activeCoachIdsLoaded = false;
    }
  }

  // Sync helper used by render paths.
  function isCoachActive(coachId) {
    if (!coachId) return false;
    if (!window._activeCoachIdsLoaded) return true;          // fail open
    return window._activeCoachIds && window._activeCoachIds.has(coachId);
  }

  window.fetchActiveCoachIds = fetchActiveCoachIds;
  window.isCoachActive       = isCoachActive;
})();
