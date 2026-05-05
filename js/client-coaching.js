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
  // Helper — strip setDetails arrays whose entries all match the parent
  // reps/weight, mirroring the c8eed87 / 09294fa fixes for the local
  // write paths.
  function _stripRedundantSetDetails(merged) {
    if (!Array.isArray(merged.exercises)) return merged;
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
    return merged;
  }
  async function selfHealCoachScheduleEntries() {
    if (_selfHealRan) return { changed: 0, skipped: "already-ran" };
    _selfHealRan = true;
    try {
      const sb = window.supabaseClient;
      if (!sb) return { changed: 0, skipped: "no-client" };
      const sess = (await sb.auth.getSession())?.data?.session;
      const uid = sess?.user?.id;
      if (!uid) return { changed: 0, skipped: "no-session" };

      let schedule = [];
      try { schedule = JSON.parse(localStorage.getItem("workoutSchedule") || "[]") || []; } catch {}
      if (!Array.isArray(schedule)) schedule = [];

      // Pull every coach assignment for THIS user. Driving off the
      // canonical table (instead of the local schedule) lets us also
      // recover from a previous broken self-heal that stripped
      // legitimate entries — any assignment that should be visible
      // gets re-materialized.
      const { data: rows, error } = await sb
        .from("coach_assigned_workouts")
        .select("id, date, coach_note, coach_id, workout, created_at")
        .eq("client_id", uid);
      if (error) {
        // Network / RLS error — DO NOT mutate local schedule. Bail and
        // try again on next boot. Previous version dropped local
        // entries when it couldn't see the canonical row, which wiped
        // the schedule when auth was locked.
        console.warn("[selfHeal] canonical fetch failed, leaving schedule untouched:", error.message);
        return { changed: 0, skipped: "fetch-error" };
      }

      const canonicalById = {};
      for (const r of (rows || [])) canonicalById[r.id] = r;
      const canonicalIds = new Set(Object.keys(canonicalById));

      let changed = 0;
      const seenAssignmentIds = new Set();
      const next = [];

      for (const w of schedule) {
        // Non-coach entries pass through unchanged.
        if (!w || w.source !== "coach_assigned" || !w.coachAssignmentId) {
          next.push(w);
          continue;
        }
        const aid = String(w.coachAssignmentId);

        // De-dupe: if we already kept an entry for this assignment,
        // skip subsequent ones (the AFTER UPDATE trigger appends a
        // new 'coach-...' entry alongside legacy ones — keep the
        // first occurrence, drop the rest). This is the only case
        // where we drop a local entry, and only because we already
        // kept its sibling.
        if (seenAssignmentIds.has(aid)) {
          changed++;
          continue;
        }
        seenAssignmentIds.add(aid);

        const canonical = canonicalById[aid];
        if (!canonical) {
          // Canonical is missing from the response. DO NOT drop —
          // could be RLS, a transient sync gap, or simply that the
          // row hasn't replicated yet. Pass through as-is.
          next.push(w);
          continue;
        }

        // Merge canonical content onto the local entry. CRITICALLY,
        // preserve local id AND local date — the user may have moved
        // the workout to a different day via the calendar Move flow,
        // and that move IS the source of truth for placement (the
        // move handler already calls _persistCoachAssignmentMove to
        // update the canonical row's date too, but a sync race can
        // leave the canonical lagging by a tick). Overwriting w.date
        // with canonical.date here silently snaps the moved workout
        // back to its original day — the bug that wiped the user's
        // May 3 leg day after they'd moved it from May 9.
        let merged = {
          ...w,
          ...(canonical.workout || {}),
          id:                w.id,
          date:              w.date || canonical.date,
          source:            "coach_assigned",
          coachAssignmentId: canonical.id,
          coachId:           canonical.coach_id || w.coachId,
          coachNote:         canonical.coach_note ?? w.coachNote ?? null,
        };
        merged = _stripRedundantSetDetails(merged);

        const drift =
          (merged.coachNote || null) !== (w.coachNote || null) ||
          JSON.stringify(merged.exercises || null) !== JSON.stringify(w.exercises || null) ||
          (merged.sessionName || "") !== (w.sessionName || "");
        if (drift) changed++;
        next.push(merged);
      }

      // Rebuild any canonical assignment that has no local entry —
      // covers the recovery case where a previous broken self-heal
      // wiped legitimate entries. Synthesize the schedule entry the
      // mirror trigger would have created (id 'coach-' || uuid,
      // source 'coach_assigned', spread of workout JSONB + mirror
      // metadata).
      for (const aid of canonicalIds) {
        if (seenAssignmentIds.has(aid)) continue;
        const c = canonicalById[aid];
        if (!c) continue;
        let entry = {
          ...(c.workout || {}),
          id:                "coach-" + c.id,
          date:              c.date,
          source:            "coach_assigned",
          coachId:           c.coach_id || null,
          coachAssignmentId: c.id,
          coachNote:         c.coach_note || null,
          assignedAt:        c.created_at,
        };
        entry = _stripRedundantSetDetails(entry);
        next.push(entry);
        changed++;
      }

      if (changed > 0) {
        localStorage.setItem("workoutSchedule", JSON.stringify(next));
        if (typeof DB !== "undefined" && DB.syncKey) DB.syncKey("workoutSchedule");
        if (typeof renderCalendar === "function") renderCalendar();
        if (typeof selectedDate !== "undefined" && selectedDate && typeof renderDayDetail === "function") {
          renderDayDetail(selectedDate);
        }
        console.log("[selfHeal] healed/recovered", changed, "coach-assigned entries (",
                    canonicalIds.size, "canonical /", seenAssignmentIds.size, "matched local)");
      }
      return { changed, canonical: canonicalIds.size, matched: seenAssignmentIds.size };
    } catch (e) {
      console.warn("[selfHeal] failed:", e);
      return { changed: 0, skipped: "exception" };
    }
  }

  // Console diagnostic — `await diagnoseSchedule("2026-05-03")` dumps
  // local schedule, server user_data.workoutSchedule, and any
  // coach_assigned_workouts rows for the given date side-by-side.
  // Beats pasting three separate snippets when figuring out which
  // sync layer dropped a workout. Reads token straight from the
  // sb-*-auth-token blob so it works even when the supabase-js
  // client is wedged on the auth lock.
  async function diagnoseSchedule(dateStr) {
    if (!dateStr) {
      console.warn("[diag] usage: await diagnoseSchedule('YYYY-MM-DD')");
      return null;
    }
    const out = { date: dateStr, local: [], serverUserData: [], coachAssigned: [], serverUserDataUpdatedAt: null };

    // 1) Local
    try {
      const ws = JSON.parse(localStorage.getItem("workoutSchedule") || "[]");
      out.local = ws.filter(w => w?.date === dateStr).map(w => ({
        id: w.id, source: w.source, type: w.type,
        sessionName: w.sessionName, coachAssignmentId: w.coachAssignmentId,
      }));
    } catch (e) { console.warn("[diag] local read failed:", e); }

    // 2) Read auth token from localStorage to bypass any gotrue lock
    const sb = window.supabaseClient;
    const url = sb?.supabaseUrl;
    const key = sb?.supabaseKey;
    if (!url || !key) { console.warn("[diag] supabase client not initialized"); return out; }
    const tokenKey = Object.keys(localStorage).find(k => /^sb-.*-auth-token$/.test(k));
    let token = key;
    try {
      const blob = JSON.parse(localStorage.getItem(tokenKey) || "{}");
      token = blob?.access_token || token;
    } catch {}
    const headers = { apikey: key, Authorization: `Bearer ${token}` };

    // 3) Server user_data.workoutSchedule
    try {
      const r = await fetch(`${url}/rest/v1/user_data?data_key=eq.workoutSchedule&select=data_value,updated_at`, { headers });
      const [ud] = await r.json();
      out.serverUserDataUpdatedAt = ud?.updated_at || null;
      out.serverUserData = ((ud?.data_value || []).filter(w => w?.date === dateStr)).map(w => ({
        id: w.id, source: w.source, type: w.type,
        sessionName: w.sessionName, coachAssignmentId: w.coachAssignmentId,
      }));
    } catch (e) { console.warn("[diag] server user_data fetch failed:", e); }

    // 4) Server coach_assigned_workouts for this date
    try {
      const r = await fetch(`${url}/rest/v1/coach_assigned_workouts?date=eq.${dateStr}&select=id,date,workout,program_id`, { headers });
      const rows = await r.json();
      out.coachAssigned = rows.map(x => ({
        id: x.id, sessionName: x.workout?.sessionName, type: x.workout?.type,
        program_id: x.program_id,
      }));
    } catch (e) { console.warn("[diag] coach_assigned fetch failed:", e); }

    console.log(`%c[diag] Schedule for ${dateStr}`, "font-weight:bold;color:#16a34a");
    console.log(`LOCAL workoutSchedule (${out.local.length}):`);
    if (out.local.length) console.table(out.local); else console.log("  (empty)");
    console.log(`SERVER user_data.workoutSchedule (${out.serverUserData.length}, updated_at=${out.serverUserDataUpdatedAt}):`);
    if (out.serverUserData.length) console.table(out.serverUserData); else console.log("  (empty)");
    console.log(`SERVER coach_assigned_workouts (${out.coachAssigned.length}):`);
    if (out.coachAssigned.length) console.table(out.coachAssigned); else console.log("  (empty)");
    return out;
  }
  if (typeof window !== "undefined") window.diagnoseSchedule = diagnoseSchedule;

  window.fetchActiveCoachIds         = fetchActiveCoachIds;
  window.isCoachActive               = isCoachActive;
  window.subscribeCoachAssignments   = subscribeCoachAssignments;
  window.unsubscribeCoachAssignments = unsubscribeCoachAssignments;
  window.selfHealCoachScheduleEntries = selfHealCoachScheduleEntries;
})();
