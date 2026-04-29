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

  // ── Realtime: live-pick up coach assignments without a refresh ───────────
  //
  // Coach inserts/updates/deletes on coach_assigned_workouts trigger an
  // update to user_data.workoutSchedule on the client side (see
  // 20260429_coach_assignment_mirror.sql). Without realtime the client
  // doesn't know to re-pull, so the coach's new workout only appears on
  // hard refresh. Subscribing here re-pulls the schedule + re-renders
  // the calendar within ~1s of the coach's save.
  //
  // Migration 20260429c adds the table to supabase_realtime publication.
  // RLS restricts client SELECT to client_id = auth.uid(), so the
  // postgres_changes filter is layered on top of (not instead of) RLS.

  let _coachRealtimeChannel = null;
  let _coachRealtimeRefreshTimer = null;

  async function subscribeCoachAssignments() {
    const sb = window.supabaseClient;
    if (!sb) return;
    const sess = (await sb.auth.getSession())?.data?.session;
    const uid = sess?.user?.id;
    if (!uid) return;

    // Tear down any prior channel so a re-login on the same tab doesn't
    // leave the previous user's subscription wired up.
    if (_coachRealtimeChannel) {
      try { sb.removeChannel(_coachRealtimeChannel); } catch {}
      _coachRealtimeChannel = null;
    }

    const onChange = () => {
      // Coalesce bursty events (a bulk-assign can fire N inserts back to
      // back) into one refresh. 800 ms is short enough to feel live but
      // long enough to amortize a 7-day program drop.
      if (_coachRealtimeRefreshTimer) clearTimeout(_coachRealtimeRefreshTimer);
      _coachRealtimeRefreshTimer = setTimeout(async () => {
        _coachRealtimeRefreshTimer = null;
        try {
          if (typeof DB !== "undefined" && DB.refreshAllKeys) await DB.refreshAllKeys();
          if (typeof renderCalendar === "function") renderCalendar();
          if (typeof selectedDate !== "undefined" && selectedDate && typeof renderDayDetail === "function") {
            renderDayDetail(selectedDate);
          }
        } catch (e) { console.warn("[clientCoaching] realtime refresh failed:", e); }
      }, 800);
    };

    _coachRealtimeChannel = sb
      .channel("coach-assignments-" + uid)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "coach_assigned_workouts", filter: `client_id=eq.${uid}` },
        onChange)
      .subscribe();
  }

  function unsubscribeCoachAssignments() {
    const sb = window.supabaseClient;
    if (_coachRealtimeChannel && sb) {
      try { sb.removeChannel(_coachRealtimeChannel); } catch {}
    }
    _coachRealtimeChannel = null;
    if (_coachRealtimeRefreshTimer) {
      clearTimeout(_coachRealtimeRefreshTimer);
      _coachRealtimeRefreshTimer = null;
    }
  }

  window.fetchActiveCoachIds         = fetchActiveCoachIds;
  window.isCoachActive               = isCoachActive;
  window.subscribeCoachAssignments   = subscribeCoachAssignments;
  window.unsubscribeCoachAssignments = unsubscribeCoachAssignments;
})();
