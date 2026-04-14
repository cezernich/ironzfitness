// js/ui/circuit-card.js
//
// Renders circuit-type workouts on the calendar day detail. Matches
// circuit-mockup.html screens 1, 1b, 1c, 1d exactly:
//   - Card header with circuit-icon, title, subtitle, goal badge
//   - Time badge (top-right) with PR line underneath
//   - Visual strip (cardio cyan, exercise red, rest gray)
//   - Flat step rows + repeat blocks with orange round badge
//   - AMRAP repeat shows "AMRAP · 20 minutes" header instead of "20×"
//
// Exposes window.CircuitCard.render(workout, { cardId }) returning the
// full HTML string — caller inserts it into the day detail container.

(function () {
  "use strict";

  function _esc(s) {
    if (s == null) return "";
    const d = document.createElement("div");
    d.textContent = String(s);
    return d.innerHTML;
  }

  function _exerciseIcon(name) {
    const n = (name || "").toLowerCase();
    if (/row/.test(n)) return "🚣";
    if (/run|jog|mile/.test(n)) return "🏃";
    if (/bike|cycle/.test(n)) return "🚴";
    if (/swim/.test(n)) return "🏊";
    if (/walk/.test(n)) return "🚶";
    return "💪";
  }

  function _goalLabel(goal, goalValue) {
    if (goal === "for_time") return "For Time";
    if (goal === "amrap") {
      return goalValue ? `AMRAP · ${goalValue} min` : "AMRAP";
    }
    return "Standard";
  }

  function _goalBadgeClass(goal) {
    if (goal === "for_time") return "goal-badge goal-for-time";
    if (goal === "amrap") return "goal-badge goal-amrap";
    return "goal-badge goal-standard";
  }

  // ── Step row (exercise / cardio / rest) ─────────────────────────────────
  function _renderStepRow(step, opts) {
    if (step.kind === "rest") {
      const dur = step.duration_sec ? `${Math.round(step.duration_sec)}s` : "—";
      return `
        <div class="circuit-step-row circuit-step-row--rest">
          <div class="left"><span class="step-icon">⏸</span><span>Rest</span></div>
          <div class="right">${_esc(dur)}</div>
        </div>`;
    }

    if (step.kind === "cardio") {
      const icon = _exerciseIcon(step.name);
      const right = step.distance_display
        || (step.distance_m ? `${step.distance_m}m` : "")
        || (step.duration_sec ? `${Math.round(step.duration_sec / 60)} min` : "");
      return `
        <div class="circuit-step-row">
          <div class="left"><span class="step-icon">${icon}</span><span>${_esc(step.name || "Cardio")}</span></div>
          <div class="right">${_esc(right)}</div>
        </div>`;
    }

    // exercise
    const parts = [];
    if (step.reps != null) {
      if (step.per_side) parts.push(`${step.reps}/side`);
      else parts.push(`${step.reps} reps`);
    }
    if (step.weight != null) {
      parts.push(`${step.weight} ${step.weight_unit || "lbs"}`);
    }
    if (!parts.length && step.notes) parts.push(step.notes);
    const detail = parts.join(" · ") || "—";
    // Inside a repeat block, we hide the strength icon (tighter). Outside,
    // we show it so the top-level exercise rows have consistent alignment.
    const leadIcon = opts && opts.inRepeat ? "" : `<span class="step-icon">${_exerciseIcon(step.name)}</span>`;
    return `
      <div class="circuit-step-row">
        <div class="left">${leadIcon}<span>${_esc(step.name || "Exercise")}</span></div>
        <div class="right">${_esc(detail)}</div>
      </div>`;
  }

  // ── Repeat block ────────────────────────────────────────────────────────
  function _renderRepeat(step, workoutGoal, workoutGoalValue) {
    const children = (step.children || []).filter(c => c.kind !== "repeat");
    const isAmrap = workoutGoal === "amrap" && step.count == null;
    const headerLeft = isAmrap
      ? `<span class="repeat-badge">AMRAP</span><span>${workoutGoalValue ? `${workoutGoalValue} minutes` : "As many as possible"}</span>`
      : `<span class="repeat-badge">${_esc(step.count || 1)}×</span><span>${(step.count || 1) === 1 ? "Round" : "Rounds"}</span>`;
    const rows = children.map(c => _renderStepRow(c, { inRepeat: true })).join("");
    return `
      <div class="circuit-repeat-block">
        <div class="circuit-repeat-header">
          <div class="circuit-repeat-header-left">${headerLeft}</div>
        </div>
        <div class="circuit-repeat-children">${rows}</div>
      </div>`;
  }

  // ── Strip ───────────────────────────────────────────────────────────────
  function _renderStrip(workout) {
    const segs = (window.CircuitWorkout && window.CircuitWorkout.buildStripSegments(workout)) || [];
    if (!segs.length) return "";
    const html = segs.map(seg => {
      const cls = seg.kind === "cardio" ? "strip-cardio"
                : seg.kind === "rest"   ? "strip-rest"
                : "strip-exercise";
      return `<div class="${cls}" style="flex:${seg.flex.toFixed(2)}"></div>`;
    }).join("");
    return `<div class="circuit-strip">${html}</div>`;
  }

  // ── Completion result (time / rounds+reps) ──────────────────────────────
  function _renderResultBadge(workout) {
    const result = workout.circuit_result;
    if (!result) return "";
    if (result.time_sec != null) {
      const t = (window.CircuitWorkout && window.CircuitWorkout.formatTime(result.time_sec)) || "";
      return `<div class="circuit-time-badge">${_esc(t)}</div>`;
    }
    if (result.rounds != null) {
      const extra = result.reps ? ` + ${result.reps}` : "";
      return `<div class="circuit-time-badge circuit-time-badge--amrap">${_esc(result.rounds)} Rds${extra}</div>`;
    }
    return "";
  }

  function _renderPRLine(workout) {
    if (!window.CircuitWorkout) return "";
    const pr = window.CircuitWorkout.getPR(workout);
    if (!pr) return "";
    const result = workout.circuit_result;
    // Show PR line only when we have a comparable result
    if (!result) return "";
    if (pr.time_sec != null && result.time_sec != null) {
      const prStr = window.CircuitWorkout.formatTime(pr.time_sec);
      return `<div class="circuit-pr-line">PR: <span class="pr-val">${_esc(prStr)}</span></div>`;
    }
    if (pr.rounds != null && result.rounds != null) {
      const extra = pr.reps ? ` + ${pr.reps}` : "";
      return `<div class="circuit-pr-line">PR: <span class="pr-val">${_esc(pr.rounds)} Rds${extra}</span></div>`;
    }
    return "";
  }

  // ── Body only (for the standard session-card shell in calendar.js) ─────
  //
  // Returns just the visual strip + step tree HTML without any outer
  // wrapper, header, title, or result badge. Used when the card is
  // embedded inside the app's standard `.session-card` container so the
  // card shell, action buttons, and completion flow all match the rest
  // of the calendar. The standalone dark `.circuit-card` layout is kept
  // in render() for the builder preview.
  function renderBody(workout) {
    if (!workout) return "";
    const goal = workout.goal || "standard";
    const goalValue = workout.goal_value;
    const bodyHtml = (workout.steps || []).map(step => {
      if (step.kind === "repeat") return _renderRepeat(step, goal, goalValue);
      return _renderStepRow(step);
    }).join("");
    return `
      ${_renderStrip(workout)}
      <div class="circuit-body">${bodyHtml}</div>
    `;
  }

  // ── Full card ───────────────────────────────────────────────────────────
  function render(workout, opts) {
    opts = opts || {};
    const cardId = opts.cardId || `circuit-card-${workout.id || Math.random().toString(36).slice(2, 8)}`;

    const goal = workout.goal || "standard";
    const goalValue = workout.goal_value;
    const goalBadge = `<span class="${_goalBadgeClass(goal)}">${_esc(_goalLabel(goal, goalValue))}</span>`;

    // Subtitle: "Completed · Circuit · For Time" or "Planned · Circuit"
    const stateLabel = workout.circuit_result ? "Completed" : (opts.subtitlePrefix || "Planned");
    const subtitle = `${stateLabel} · Circuit`;

    const resultBadge = _renderResultBadge(workout);
    const prLine = _renderPRLine(workout);

    // Body: render flat steps + repeat blocks in order
    const bodyHtml = (workout.steps || []).map(step => {
      if (step.kind === "repeat") return _renderRepeat(step, goal, goalValue);
      return _renderStepRow(step);
    }).join("");

    return `
      <div class="circuit-card" id="${_esc(cardId)}">
        <div class="circuit-card-header">
          <div class="circuit-card-header-left">
            <div class="circuit-icon">⚡</div>
            <div class="circuit-title-group">
              <div class="circuit-title">${_esc(workout.name || "Circuit")}</div>
              <div class="circuit-subtitle">${_esc(subtitle)}</div>
              ${goalBadge}
            </div>
          </div>
          <div class="circuit-card-header-right">
            ${resultBadge}
            ${prLine}
          </div>
        </div>
        ${_renderStrip(workout)}
        <div class="circuit-body">
          ${bodyHtml}
        </div>
      </div>`;
  }

  if (typeof window !== "undefined") {
    window.CircuitCard = { render, renderBody };
  }
})();
