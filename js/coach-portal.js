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
