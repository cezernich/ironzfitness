// coach-portal.js — Coach Portal orchestrator (Phase 2B, read-only)
//
// Top-level controller for the Coach Portal experience. Owns:
//   • Tab switching (Profile → Coach Portal entry button → showTab('coach')).
//   • View state (dashboard ↔ client-detail).
//   • Shared state cache (clients list, today's queue, race banner).
//   • Loading lifecycle — fetches once on tab open, primes downstream views.
//
// Phase 2B is read-only — coach can SEE clients, but no write actions.
// Phase 3 layers in workout assignment + edit flows on top of this shell.
//
// Spec: new features/COACHING_FEATURE_SPEC_2026-04-28.md

(function () {
  "use strict";

  // ── State ──────────────────────────────────────────────────────────────
  // _clients = profiles for everyone the coach actively coaches.
  // _assignments = active coaching_assignments rows where coach_id = me.
  // _profilesById = id → profile lookup primed from the clients fetch.
  let _clients = [];
  let _assignments = [];
  let _profilesById = {};
  let _todayCompletions = {};   // client_id → array of completed workouts logged today
  let _planSummaryByClient = {}; // client_id → { daysLeft, nextRace, nextARace }
  let _activeView = "dashboard"; // "dashboard" | "client-detail"
  let _activeClientId = null;
  let _coachUid = null;

  // ── Public surface — entry point from Profile button ───────────────────
  // Tab switch fires loadCoachPortal via the showTab patch, so we don't
  // call it directly. Setting the view BEFORE the tab swap so the
  // dashboard is what the user lands on (not a stale client-detail
  // from a prior session).
  function openCoachPortal() {
    _setView("dashboard");
    if (typeof showTab === "function") showTab("coach");
  }

  // Called from showTab when the user lands on the coach tab.
  async function loadCoachPortal() {
    const client = window.supabaseClient;
    if (!client) return _renderError("Supabase client not available.");

    const { data: sess } = await client.auth.getSession();
    _coachUid = sess?.session?.user?.id;
    if (!_coachUid) return _renderError("Not signed in.");

    _setLoading(true);

    try {
      // Two parallel reads. assignments tells us who we coach; profiles
      // gives us names/emails for the cards. Coach SELECT policy on
      // profiles allows reads of any client we're assigned to.
      const assignRes = await client.from("coaching_assignments")
        .select("*")
        .eq("coach_id", _coachUid)
        .eq("active", true)
        .order("assigned_at", { ascending: false });

      _assignments = assignRes.data || [];
      const clientIds = [...new Set(_assignments.map(a => a.client_id))];

      if (!clientIds.length) {
        _clients = [];
        _profilesById = {};
        _renderDashboard();
        _setLoading(false);
        return;
      }

      const profilesRes = await client.from("profiles")
        .select("id, full_name, email, gender, weight_lbs, age")
        .in("id", clientIds);

      _clients = (profilesRes.data || []);
      _profilesById = {};
      for (const p of _clients) _profilesById[p.id] = p;

      // Today's completion picture for the "queue" + per-client status.
      // We pull the last 24h of workouts with completed:true. Coach RLS
      // grants read on workouts where user_id = an active client.
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      const completionsRes = await client.from("workouts")
        .select("id, user_id, name, type, date, completed, created_at")
        .in("user_id", clientIds)
        .gte("date", since.toISOString().slice(0, 10));

      _todayCompletions = {};
      for (const w of (completionsRes.data || [])) {
        if (!_todayCompletions[w.user_id]) _todayCompletions[w.user_id] = [];
        _todayCompletions[w.user_id].push(w);
      }

      // Per-client plan + race summary, sourced from user_data. Plan end
      // date comes from MAX(workoutSchedule[*].date) regardless of whether
      // the schedule was AI-generated or coach-mirrored — the trigger
      // funnels both into the same key, so this works for either coaching
      // style. Race info reads both legacy `events` and `raceEvents` keys.
      _planSummaryByClient = {};
      for (const cid of clientIds) {
        _planSummaryByClient[cid] = { daysLeft: null, nextRace: null, nextARace: null };
      }
      try {
        const todayStr = since.toISOString().slice(0, 10);
        const userDataRes = await client.from("user_data")
          .select("user_id, data_key, data_value")
          .in("user_id", clientIds)
          .in("data_key", ["workoutSchedule", "events", "raceEvents", "workouts"]);
        const byClient = {};
        for (const r of (userDataRes.data || [])) {
          if (!byClient[r.user_id]) byClient[r.user_id] = {};
          byClient[r.user_id][r.data_key] = r.data_value;
        }
        // Fallback for Today's Queue: db.syncWorkouts() writes to user_data
        // primarily and to the structured `workouts` table secondarily
        // (debounced). When the structured query above returns nothing
        // for a client — debounce lag, RLS, transient failure — pull
        // today's logs from user_data so the coach isn't told "0 logged"
        // when the client actually trained.
        for (const cid of clientIds) {
          const bag = byClient[cid] || {};
          const wList = Array.isArray(bag.workouts) ? bag.workouts : [];
          if (!_todayCompletions[cid]) _todayCompletions[cid] = [];
          const seenIds = new Set(_todayCompletions[cid].map(w => w && w.id).filter(Boolean));
          for (const w of wList) {
            if (!w || w.date !== todayStr) continue;
            if (w.id && seenIds.has(w.id)) continue;
            _todayCompletions[cid].push({
              id: w.id || null,
              user_id: cid,
              name: w.name || w.type || null,
              type: w.type || null,
              date: w.date,
              completed: w.completed !== false,
              created_at: w.createdAt || w.created_at || null,
            });
          }
          if (_todayCompletions[cid].length === 0) delete _todayCompletions[cid];
        }
        for (const cid of clientIds) {
          const bag = byClient[cid] || {};
          const sched = Array.isArray(bag.workoutSchedule) ? bag.workoutSchedule : [];
          let maxFutureDate = null;
          for (const s of sched) {
            if (s && s.date && s.date >= todayStr && (!maxFutureDate || s.date > maxFutureDate)) {
              maxFutureDate = s.date;
            }
          }
          if (maxFutureDate) {
            const a = new Date(todayStr + "T00:00:00");
            const b = new Date(maxFutureDate + "T00:00:00");
            _planSummaryByClient[cid].daysLeft = Math.round((b - a) / 86400000);
          }
          const races = []
            .concat(Array.isArray(bag.raceEvents) ? bag.raceEvents : [])
            .concat(Array.isArray(bag.events)     ? bag.events     : [])
            .filter(e => e && e.date && e.date >= todayStr)
            .sort((x, y) => String(x.date).localeCompare(String(y.date)));
          if (races.length) {
            const next = races[0];
            const nextPri = String(next.priority || "A").toUpperCase();
            _planSummaryByClient[cid].nextRace = {
              name: next.name || "Race",
              date: next.date,
              priority: nextPri,
            };
            if (nextPri === "B") {
              const nextA = races.find(r => String(r.priority || "A").toUpperCase() === "A");
              if (nextA) {
                _planSummaryByClient[cid].nextARace = {
                  name: nextA.name || "A Race",
                  date: nextA.date,
                };
              }
            }
          }
        }
      } catch (e) {
        console.warn("[CoachPortal] plan summary fetch failed:", e);
      }

      _renderDashboard();
    } catch (e) {
      console.warn("[CoachPortal] load failed:", e);
      _renderError("Couldn't load coach data — try again.");
    } finally {
      _setLoading(false);
    }
  }

  // ── View switching ─────────────────────────────────────────────────────
  function _setView(view) {
    _activeView = view;
    const dash = document.getElementById("coach-dashboard");
    const detail = document.getElementById("coach-client-detail");
    if (dash)   dash.style.display   = view === "dashboard"      ? "" : "none";
    if (detail) detail.style.display = view === "client-detail"  ? "" : "none";
  }

  function openClientDetail(clientId) {
    _activeClientId = clientId;
    _setView("client-detail");
    if (typeof window.loadCoachClientDetail === "function") {
      window.loadCoachClientDetail(clientId);
    }
  }

  function backToCoachDashboard() {
    _activeClientId = null;
    _setView("dashboard");
    // Re-render in case completions changed while we were away.
    _renderDashboard();
  }

  function exitCoachPortal() {
    if (typeof showTab === "function") showTab("settings");
  }

  // ── Render hooks (delegated to coach-dashboard.js) ─────────────────────
  function _renderDashboard() {
    if (typeof window.renderCoachDashboard === "function") {
      window.renderCoachDashboard({
        coachUid: _coachUid,
        clients: _clients,
        assignments: _assignments,
        profilesById: _profilesById,
        todayCompletions: _todayCompletions,
        planSummaryByClient: _planSummaryByClient,
      });
    }
  }

  function _setLoading(on) {
    const el = document.getElementById("coach-loading");
    if (el) el.style.display = on ? "" : "none";
  }

  function _renderError(msg) {
    const el = document.getElementById("coach-error");
    if (!el) return;
    el.textContent = msg;
    el.style.display = "";
  }

  // ── Patch showTab to fire loadCoachPortal on tab open ─────────────────
  // Mirrors the admin.js pattern. Wraps the existing showTab so a deep
  // link / state restore that lands on tab-coach also kicks off the load.
  if (typeof window.showTab === "function" && !window._coachPortalShowTabPatched) {
    const _origShowTab = window.showTab;
    window.showTab = function (name) {
      _origShowTab(name);
      if (name === "coach") {
        loadCoachPortal();
      }
    };
    window._coachPortalShowTabPatched = true;
  }

  // ── Coach Portal entry button on Profile ───────────────────────────────
  // The card markup landed in Phase 1 with the Open button disabled
  // ("Phase 2"). Phase 2B enables it + wires the click.
  function _wireCoachEntryButton() {
    const btn = document.getElementById("coach-entry-open-btn");
    if (!btn) return;
    btn.disabled = false;
    btn.style.opacity = "";
    btn.textContent = "Open";
    btn.onclick = (ev) => {
      ev.preventDefault();
      openCoachPortal();
    };
    // Also enrich the summary line under the heading with the actual
    // client + workout count once data is loaded.
    const summary = document.getElementById("coach-entry-summary");
    if (summary && _assignments.length) {
      const n = _assignments.length;
      summary.textContent = `${n} active client${n === 1 ? "" : "s"} · tap to open the portal`;
    }
  }

  // Run wiring when the entry card becomes visible (visibility set by
  // initCoachVisibility in coach-request-flow.js after auth ready).
  // MutationObserver is overkill here; just hook into the same auth
  // event that flips visibility.
  document.addEventListener("DOMContentLoaded", _wireCoachEntryButton);
  if (document.readyState !== "loading") _wireCoachEntryButton();

  // ── Public surface ─────────────────────────────────────────────────────
  window.openCoachPortal       = openCoachPortal;
  window.loadCoachPortal       = loadCoachPortal;
  window.openClientDetail      = openClientDetail;
  window.backToCoachDashboard  = backToCoachDashboard;
  window.exitCoachPortal       = exitCoachPortal;
})();
