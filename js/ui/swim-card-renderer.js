// js/ui/swim-card-renderer.js
//
// Renders a canonical swim workout (js/swim-workout-model.js shape) as
// HTML modeled loosely on the Garmin pool workout builder: a header with
// total distance + pool size, followed by a step list where intervals are
// tall cards, rests are thin gray rows, and repeat blocks are outlined
// containers with an "N×" label.
//
// Public API:
//   window.SwimCardRenderer.render(workout)   -> string (HTML)
//   window.SwimCardRenderer.renderSteps(steps, poolSize) -> string
//
// Designed to be dropped into existing workout card surfaces — the caller
// wraps the returned HTML in whatever container it wants.

(function () {
  "use strict";

  function _esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function _strokeLabel(stroke) {
    const M = window.SwimWorkout;
    if (!M) return stroke || "Free";
    return M.STROKE_SHORT[stroke] || M.STROKE_SHORT.freestyle;
  }

  function _formatRest(sec) {
    const s = Number(sec) || 0;
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r ? `${m}:${String(r).padStart(2, "0")}` : `${m} min`;
  }

  function _formatDistance(m, pool) {
    if (!m) return "0 m";
    if (pool && pool.unit === "yd") {
      const yd = Math.round(m / 0.9144);
      return `${yd} yd`;
    }
    return `${Math.round(m)} m`;
  }

  function _poolForWorkout(w) {
    const M = window.SwimWorkout;
    if (!M) return { length_m: 25, unit: "m", label: "25 m" };
    // Prefer the snapshot on the workout
    if (w && w.pool_size_m) {
      const match = M.POOL_SIZES.find(s => Math.round(s.length_m) === Math.round(w.pool_size_m));
      if (match) return match;
    }
    return M.getUserPoolSize();
  }

  // Render one step (interval | rest | repeat) recursively.
  function _renderStep(step, pool, depth) {
    if (!step) return "";
    if (step.kind === "rest") {
      return `<div class="swim-step swim-rest" style="margin-left:${depth * 12}px">
        <span class="swim-rest-dot"></span>
        <span class="swim-rest-label">Rest ${_formatRest(step.duration_sec)}</span>
      </div>`;
    }
    if (step.kind === "repeat") {
      const childrenHtml = (step.children || []).map(c => _renderStep(c, pool, depth + 1)).join("");
      return `<div class="swim-repeat" style="margin-left:${depth * 12}px">
        <div class="swim-repeat-label">${_esc(step.count)}× <span class="swim-repeat-text">repeat</span></div>
        <div class="swim-repeat-body">${childrenHtml}</div>
      </div>`;
    }
    // interval
    const stroke = _strokeLabel(step.stroke);
    const pace = step.pace_target ? `<span class="swim-iv-pace">@ ${_esc(step.pace_target)}</span>` : "";
    const nameHtml = step.name
      ? `<div class="swim-iv-name">${_esc(step.name)}</div>`
      : "";
    const notes = step.notes ? `<div class="swim-iv-notes">${_esc(step.notes)}</div>` : "";
    return `<div class="swim-step swim-interval" style="margin-left:${depth * 12}px">
      ${nameHtml}
      <div class="swim-iv-row">
        <span class="swim-iv-distance">${_formatDistance(step.distance_m, pool)}</span>
        <span class="swim-iv-stroke">${_esc(stroke)}</span>
        ${pace}
      </div>
      ${notes}
    </div>`;
  }

  function renderSteps(steps, pool) {
    if (!Array.isArray(steps) || !steps.length) {
      return `<div class="swim-empty">No steps yet.</div>`;
    }
    const p = pool || _poolForWorkout({});
    return `<div class="swim-step-list">${steps.map(s => _renderStep(s, p, 0)).join("")}</div>`;
  }

  function render(workout) {
    if (!workout) return "";
    const M = window.SwimWorkout;
    const pool = _poolForWorkout(workout);
    const total = workout.total_distance_m || (M ? M.totalDistance(workout.steps) : 0);
    const title = workout.title ? `<div class="swim-card-title">${_esc(workout.title)}</div>` : "";
    const why = workout.why_text ? `<div class="swim-card-why">${_esc(workout.why_text)}</div>` : "";
    return `
      <div class="swim-card">
        ${title}
        <div class="swim-card-header">
          <div class="swim-total">
            <span class="swim-total-value">${_formatDistance(total, pool)}</span>
            <span class="swim-total-label">Total Distance</span>
          </div>
          <div class="swim-pool-badge">${_esc(pool.label || (pool.length_m + " " + pool.unit))}</div>
        </div>
        ${why}
        ${renderSteps(workout.steps, pool)}
      </div>
    `;
  }

  const api = { render, renderSteps };
  if (typeof window !== "undefined") window.SwimCardRenderer = api;
})();
