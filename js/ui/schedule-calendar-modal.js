// js/ui/schedule-calendar-modal.js
//
// Modal #4: Schedule Calendar (receiver). 7-day forward calendar where each
// day is color-coded by the validator: orange = suggested, gray = has workout,
// red = conflict (hard block or warning). Matches receiver3 in the prototype.

(function () {
  "use strict";

  function _esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function _close(id) {
    const o = document.getElementById(id);
    if (o) {
      o.classList.remove("visible");
      setTimeout(() => o.remove(), 200);
    }
  }

  function _addDays(dateStr, n) {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function _todayStr() { return new Date().toISOString().slice(0, 10); }
  function _formatMonth(dateStr) {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }
  function _dayNum(dateStr) {
    return new Date(dateStr + "T00:00:00").getDate();
  }
  function _dayShort(dateStr) {
    return ["S","M","T","W","T","F","S"][new Date(dateStr + "T00:00:00").getDay()];
  }

  function _readPlan() {
    try { return JSON.parse(localStorage.getItem("trainingPlan") || "[]"); } catch { return []; }
  }
  function _readSchedule() {
    try { return JSON.parse(localStorage.getItem("workoutSchedule") || "[]"); } catch { return []; }
  }

  /**
   * @param {Object} opts
   * @param {Object} opts.scaledWorkout — from WorkoutImportValidator
   * @param {Object} opts.sharedWorkout
   * @param {Function} opts.onPick — called with the chosen date string
   * @param {Function} [opts.onCancel]
   */
  function open(opts) {
    if (!opts || !opts.scaledWorkout) return;
    const id = "schedule-calendar-overlay";
    const old = document.getElementById(id);
    if (old) old.remove();

    const Validator = (typeof window !== "undefined" && window.WorkoutImportValidator) || null;

    // Build a 7-day window starting today.
    const start = _todayStr();
    const days = Array.from({ length: 7 }, (_, i) => _addDays(start, i));

    const planAndSchedule = _readPlan().concat(_readSchedule());
    const planByDate = new Map();
    for (const e of planAndSchedule) {
      if (!planByDate.has(e.date)) planByDate.set(e.date, []);
      planByDate.get(e.date).push(e);
    }

    // Run the validator against each day to get the per-day classification.
    const dayInfo = days.map(date => {
      const result = Validator
        ? Validator.validateImport({ sharedWorkout: opts.sharedWorkout, targetDate: date })
        : { canImport: true, conflicts: [] };
      const hasExisting = planByDate.has(date);
      const hardBlocks = (result.conflicts || []).filter(c => c.severity === "block");
      const warnings  = (result.conflicts || []).filter(c => c.severity !== "block");
      const isConflict = hardBlocks.length > 0 || warnings.length > 0;
      return { date, hasExisting, isConflict, hardBlocks, warnings, result };
    });

    // Pick the suggested date: first day with NO conflicts and NO existing.
    const suggested = dayInfo.find(d => !d.isConflict && !d.hasExisting)
      || dayInfo.find(d => !d.isConflict)
      || dayInfo[0];

    const overlay = document.createElement("div");
    overlay.id = id;
    overlay.className = "rating-modal-overlay";
    overlay.onclick = e => { if (e.target === overlay) _close(id); };

    const cellsHtml = dayInfo.map(d => {
      let cls = "cal-day";
      if (d.date === suggested.date) cls += " suggested";
      else if (d.isConflict) cls += " conflict";
      else if (d.hasExisting) cls += " has-workout";
      return `<div class="${cls}" data-date="${_esc(d.date)}">${_dayNum(d.date)}</div>`;
    }).join("");

    overlay.innerHTML = `
      <div class="rating-modal schedule-calendar-modal">
        <div class="post-test-modal-title">Pick a day</div>
        <div class="post-test-modal-body">
          <p style="font-size:12px;color:var(--color-text-muted);margin-bottom:12px;">We'll check for conflicts with your current plan.</p>
          <div class="calendar">
            <div class="cal-header">${_esc(_formatMonth(start))}</div>
            <div class="cal-grid">
              ${days.map(d => `<div class="cal-day-label">${_dayShort(d)}</div>`).join("")}
              ${cellsHtml}
            </div>
            <div class="cal-legend">
              <span class="legend-suggest">Suggested</span>
              <span class="legend-conflict">Conflict</span>
              <span class="legend-existing">Has workout</span>
            </div>
          </div>
        </div>
        <div class="post-test-modal-actions">
          <button class="rating-skip-btn" id="schedule-cal-cancel">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));

    overlay.querySelectorAll(".cal-day").forEach(cell => {
      cell.addEventListener("click", () => {
        const date = cell.dataset.date;
        const info = dayInfo.find(d => d.date === date);
        _close(id);
        if (typeof opts.onPick === "function") {
          opts.onPick({ date, info, scaledWorkout: opts.scaledWorkout, sharedWorkout: opts.sharedWorkout });
        }
      });
    });

    overlay.querySelector("#schedule-cal-cancel").onclick = () => {
      _close(id);
      if (typeof opts.onCancel === "function") opts.onCancel();
    };
  }

  const api = { open };
  if (typeof window !== "undefined") window.ScheduleCalendarModal = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
