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

  // Self-heal coach-assigned schedule entries.
  //
  // The mirror trigger in 20260429_coach_assignment_mirror.sql identifies
  // synthetic entries by id 'coach-' || uuid. Entries created before that
  // trigger was wired carry a JS-generated id (Date.now().toString(36)
  // style), so the trigger's UPDATE strip predicate doesn't match them
  // and any field the coach edits later (coach_note, sessionName,
  // exercises) reaches the server's coach_assigned_workouts row but
  // never propagates into user_data.workoutSchedule's legacy entry.
  //
  // Real bug 2026-05-04: a backfill of coach_note for program-applied
  // assignments updated 4 rows server-side, the trigger appended new
  // 'coach-...' entries alongside the existing legacy ones, and on the
  // client the renderer kept showing the stale legacy entry without
  // the note.
  //
  // This pass runs once after auth + DB.refreshAllKeys. For every local
  // schedule entry with source='coach_assigned' AND coachAssignmentId,
  // it pulls the canonical row from coach_assigned_workouts and merges
  // current coach_note + workout JSONB into the local entry. Then it
  // strips any duplicate 'coach-...' siblings the trigger may have
  // appended, leaving one entry per assignment with current data.
  // Idempotent — re-running with no drift is a no-op.
  let _selfHealRan = false;
  async function selfHealCoachScheduleEntries() {
    if (_selfHealRan) return { changed: 0, skipped: "already-ran" };
    _selfHealRan = true;
    try {
      const sb = window.supabaseClient;
      if (!sb) return { changed: 0, skipped: "no-client" };

      let schedule = [];
      try { schedule = JSON.parse(localStorage.getItem("workoutSchedule") || "[]") || []; } catch {}
      if (!Array.isArray(schedule) || !schedule.length) return { changed: 0, skipped: "empty" };

      // Collect every coach assignment id referenced from local entries.
      const assignmentIds = new Set();
      for (const w of schedule) {
        if (w && w.source === "coach_assigned" && w.coachAssignmentId) {
          assignmentIds.add(String(w.coachAssignmentId));
        }
      }
      if (!assignmentIds.size) return { changed: 0, skipped: "no-coach-entries" };

      // Single batched fetch over the canonical rows.
      const ids = Array.from(assignmentIds);
      const { data: rows, error } = await sb
        .from("coach_assigned_workouts")
        .select("id, date, coach_note, coach_id, workout, created_at")
        .in("id", ids);
      if (error) {
        console.warn("[selfHeal] fetch failed:", error.message);
        return { changed: 0, skipped: "fetch-error" };
      }
      const byId = {};
      for (const r of (rows || [])) byId[r.id] = r;

      let changed = 0;
      const seenAssignmentIds = new Set();
      const next = [];
      for (const w of schedule) {
        // Pass through anything that isn't a coach-assigned mirror.
        if (!w || w.source !== "coach_assigned" || !w.coachAssignmentId) {
          next.push(w);
          continue;
        }
        const aid = String(w.coachAssignmentId);
        // Drop trigger-format duplicates when we've already kept one
        // entry for this assignment (legacy entry usually wins because
        // it appears first in the array — the trigger appends).
        if (seenAssignmentIds.has(aid)) {
          changed++;
          continue;
        }
        seenAssignmentIds.add(aid);

        const canonical = byId[aid];
        if (!canonical) {
          // Assignment was deleted server-side but local entry persists.
          // Drop it — coach removed the workout.
          changed++;
          continue;
        }

        // Merge canonical fields onto the local entry. Preserve the
        // local id (legacy or trigger-format) so other code that joins
        // by id stays stable.
        const merged = {
          ...w,
          ...(canonical.workout || {}),
          id:                w.id,
          date:              canonical.date || w.date,
          source:            "coach_assigned",
          coachAssignmentId: canonical.id,
          coachId:           canonical.coach_id || w.coachId,
          coachNote:         canonical.coach_note ?? w.coachNote ?? null,
        };
        // Strip redundant setDetails — canonical exercises sometimes
        // carry per-set arrays where every entry matches the parent
        // reps/weight (auto-populated from the assign-flow editor).
        // Without this the day-detail renderer drops Set 1..N rows
        // beneath the exercise even when there's no real per-set
        // variation, mirroring the c8eed87 / 09294fa fixes for the
        // local write paths.
        if (Array.isArray(merged.exercises)) {
          merged.exercises = merged.exercises.map(e => {
            if (!e || !Array.isArray(e.setDetails) || !e.setDetails.length) return e;
            const pr = String(e.reps   == null ? "" : e.reps).trim();
            const pw = String(e.weight == null ? "" : e.weight).trim();
            const allMatch = e.setDetails.every(sd => {
              const r = String(sd?.reps   == null ? "" : sd.reps).trim();
              const w = String(sd?.weight == null ? "" : sd.weight).trim();
              return r === pr && w === pw;
            });
            if (!allMatch) return e;
            const { setDetails: _drop, perSet: _drop2, ...rest } = e;
            return rest;
          });
        }
        // Detect drift only on the fields the trigger would propagate.
        const drift =
          (merged.coachNote || null) !== (w.coachNote || null) ||
          JSON.stringify(merged.exercises || null) !== JSON.stringify(w.exercises || null) ||
          (merged.sessionName || "") !== (w.sessionName || "");
        if (drift) changed++;
        next.push(merged);
      }

      if (changed > 0) {
        localStorage.setItem("workoutSchedule", JSON.stringify(next));
        if (typeof DB !== "undefined" && DB.syncKey) DB.syncKey("workoutSchedule");
        if (typeof renderCalendar === "function") renderCalendar();
        if (typeof selectedDate !== "undefined" && selectedDate && typeof renderDayDetail === "function") {
          renderDayDetail(selectedDate);
        }
        console.log("[selfHeal] healed", changed, "coach-assigned entries");
      }
      return { changed, total: assignmentIds.size };
    } catch (e) {
      console.warn("[selfHeal] failed:", e);
      return { changed: 0, skipped: "exception" };
    }
  }

  window.fetchActiveCoachIds         = fetchActiveCoachIds;
  window.isCoachActive               = isCoachActive;
  window.subscribeCoachAssignments   = subscribeCoachAssignments;
  window.unsubscribeCoachAssignments = unsubscribeCoachAssignments;
  window.selfHealCoachScheduleEntries = selfHealCoachScheduleEntries;
})();
