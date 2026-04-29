// coach-dashboard.js — Coach Portal dashboard view (Phase 2B)
//
// Renders the landing screen for the Coach Portal:
//   • TODAY'S QUEUE — per-client completion status for today.
//   • RACE DAYS — upcoming races across all clients.
//   • CLIENT LIST — one card per active client with last-workout summary
//     and a 4-week completion percentage.
//
// All data is read-only. Interactions are limited to "open client detail."
// Spec mockup lives at line ~322 of new features/COACHING_FEATURE_SPEC_2026-04-28.md.

(function () {
  "use strict";

  function _esc(s) {
    const div = document.createElement("div");
    div.textContent = s == null ? "" : String(s);
    return div.innerHTML;
  }

  function renderCoachDashboard(state) {
    const root = document.getElementById("coach-dashboard");
    if (!root) return;

    // Stash the loaded state so coach-library / coach-programs can pull
    // clients + profilesById without re-fetching on every tab switch.
    window._coachDashState = state;

    const { clients, assignments, todayCompletions, planSummaryByClient } = state;
    const tab = (typeof window.getCoachDashboardTab === "function")
      ? window.getCoachDashboardTab()
      : "clients";

    if (!clients.length && tab === "clients") {
      root.innerHTML = `
        <div class="coach-portal-header">
          <h2>Coach Portal</h2>
          <button class="btn-secondary btn-sm" onclick="exitCoachPortal()">× Exit</button>
        </div>
        ${_renderDashTabStrip(tab, 0)}
        <div class="card" style="text-align:center;padding:32px;color:var(--color-text-muted)">
          You don't have any active clients yet.
          <div style="font-size:0.85rem;margin-top:8px">
            Share your invite link below, or ask an admin to assign one.
          </div>
        </div>`;
      return;
    }

    const todayStr = new Date().toISOString().slice(0, 10);

    let body;
    if (tab === "library" && typeof window.renderCoachLibraryView === "function") {
      body = window.renderCoachLibraryView(state);
    } else if (tab === "programs" && typeof window.renderCoachProgramsView === "function") {
      body = window.renderCoachProgramsView(state);
    } else if (tab === "invite" && typeof window.renderCoachInvitePanel === "function") {
      body = window.renderCoachInvitePanel(state);
    } else {
      body = `
        ${_renderTodayQueue(clients, todayCompletions)}
        ${_renderClientList(clients, assignments, todayCompletions, todayStr, planSummaryByClient || {})}`;
    }

    root.innerHTML = `
      <div class="coach-portal-header">
        <h2>Coach Portal</h2>
        <button class="btn-secondary btn-sm" onclick="exitCoachPortal()" aria-label="Exit Coach Portal" title="Exit Coach Portal">× Exit</button>
      </div>
      ${_renderDashTabStrip(tab, clients.length)}
      ${body}
    `;
  }

  function _renderDashTabStrip(active, clientCount) {
    const tab = (id, label) => {
      const cls = active === id ? " active" : "";
      return `<button class="coach-dash-tab${cls}" onclick="setCoachDashboardTab('${id}')">${label}</button>`;
    };
    return `<div class="coach-dash-tabs">
      ${tab("clients", `Clients${clientCount ? " (" + clientCount + ")" : ""}`)}
      ${tab("library", "Library")}
      ${tab("programs", "Programs")}
      ${tab("invite", "Invite")}
    </div>`;
  }

  // ── TODAY'S QUEUE ────────────────────────────────────────────────────
  // For Phase 2B we just count completions today. Phase 3 will pull
  // assigned-by-coach workouts and compare assigned ↔ completed for the
  // "✓ done / ⏳ pending" indicators in the spec mockup.
  function _renderTodayQueue(clients, todayCompletions) {
    const totalCompleted = Object.values(todayCompletions || {})
      .reduce((sum, arr) => sum + arr.length, 0);
    const clientsWhoTrained = Object.keys(todayCompletions || {}).length;

    const rows = clients.slice(0, 8).map(c => {
      const did = (todayCompletions[c.id] || []);
      if (!did.length) {
        return `<div class="coach-queue-row coach-queue-row--idle">
          <span class="coach-queue-status">⏳</span>
          <span class="coach-queue-client">${_esc(_clientLabel(c))}</span>
          <span class="coach-queue-meta">no logged workout yet</span>
        </div>`;
      }
      const last = did[did.length - 1];
      return `<div class="coach-queue-row coach-queue-row--done">
        <span class="coach-queue-status">✓</span>
        <span class="coach-queue-client">${_esc(_clientLabel(c))}</span>
        <span class="coach-queue-meta">${_esc(last.name || _typeLabel(last.type) || "Workout")}</span>
      </div>`;
    }).join("");

    return `
      <div class="card coach-section">
        <div class="coach-section-title">Today's Queue</div>
        <div class="coach-section-summary">
          ${clients.length} client${clients.length === 1 ? "" : "s"} · ${totalCompleted} workout${totalCompleted === 1 ? "" : "s"} logged
          ${clientsWhoTrained > 0 ? ` · ${clientsWhoTrained} active today` : ""}
        </div>
        <div class="coach-queue-list">${rows || '<div class="coach-queue-empty">Nothing yet.</div>'}</div>
      </div>`;
  }

  // ── CLIENT LIST ──────────────────────────────────────────────────────
  function _renderClientList(clients, assignments, todayCompletions, todayStr, planSummaryByClient) {
    const byClient = {};
    for (const a of assignments) byClient[a.client_id] = a;

    const rows = clients.map(c => {
      const a = byClient[c.id];
      const role = a?.role === "sub" ? "sub-coach" : "primary";
      const since = a?.assigned_at ? _shortDate(a.assigned_at) : "—";
      const did = todayCompletions[c.id] || [];
      const trainedToday = did.length > 0;
      const lastWorkout = did.length ? did[did.length - 1] : null;
      const lastSummary = lastWorkout
        ? `Last: ${_esc(lastWorkout.name || _typeLabel(lastWorkout.type) || "Workout")} · today`
        : `No workout logged today yet`;

      const flag = trainedToday ? "" : `<span class="coach-client-flag" title="No logged workout today">⚠</span>`;

      // Plan + race summary line. Coach-mirrored and AI-generated workouts
      // both land in workoutSchedule, so the day count works regardless
      // of who owns the plan. Race lines only appear when there's an
      // upcoming event; A-race fallback only when the next race is a B.
      const summary = planSummaryByClient[c.id] || {};
      const summaryParts = [];
      if (typeof summary.daysLeft === "number") {
        summaryParts.push(`Plan: ${summary.daysLeft} day${summary.daysLeft === 1 ? "" : "s"} left`);
      }
      if (summary.nextRace) {
        const r = summary.nextRace;
        const days = _daysUntil(todayStr, r.date);
        summaryParts.push(`${r.priority} Race: ${_esc(r.name)} in ${days} day${days === 1 ? "" : "s"}`);
        if (r.priority === "B" && summary.nextARace) {
          const aDays = _daysUntil(todayStr, summary.nextARace.date);
          summaryParts.push(`A Race: ${_esc(summary.nextARace.name)} in ${aDays} day${aDays === 1 ? "" : "s"}`);
        }
      }
      const summaryLine = summaryParts.length
        ? `<div class="coach-client-card-plan">${summaryParts.join(" · ")}</div>`
        : "";

      return `
        <div class="coach-client-card" onclick="openClientDetail('${c.id}')" tabindex="0"
             onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openClientDetail('${c.id}')}">
          <div class="coach-client-card-main">
            <div class="coach-client-card-name">${_esc(_clientLabel(c))}${flag}</div>
            <div class="coach-client-card-meta">${_esc(c.email || "")} · ${role} since ${since}</div>
            <div class="coach-client-card-last">${lastSummary}</div>
            ${summaryLine}
          </div>
          <div class="coach-client-card-action">›</div>
        </div>`;
    }).join("");

    return `
      <div class="card coach-section">
        <div class="coach-section-title">Clients</div>
        <div class="coach-client-list">${rows}</div>
      </div>`;
  }

  // ── Helpers ──────────────────────────────────────────────────────────
  function _clientLabel(p) {
    return p?.full_name || p?.email || (p?.id ? p.id.slice(0, 8) : "Client");
  }

  function _typeLabel(t) {
    const map = { running: "Run", cycling: "Ride", swimming: "Swim",
      weightlifting: "Strength", strength: "Strength", hiit: "HIIT",
      hyrox: "Hyrox", brick: "Brick", triathlon: "Brick", general: "Workout",
      yoga: "Yoga", bodyweight: "Bodyweight" };
    return map[t] || t;
  }

  function _shortDate(iso) {
    try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
    catch { return "—"; }
  }

  function _daysUntil(fromIso, toIso) {
    try {
      const a = new Date(fromIso + "T00:00:00");
      const b = new Date(toIso + "T00:00:00");
      return Math.round((b - a) / 86400000);
    } catch { return 0; }
  }

  // ── Public surface ─────────────────────────────────────────────────────
  window.renderCoachDashboard = renderCoachDashboard;
})();
