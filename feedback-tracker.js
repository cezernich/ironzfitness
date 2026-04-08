// feedback-tracker.js — 1/3 Feedback Calibration System
// Post-workout perceived effort tracking and weekly calibration signals.
// Evidence: Tier 4 coaching heuristic. Compatible with 80/20 polarized model (Seiler, 2010).
// This assesses perceived effort relative to intent, NOT intensity distribution.

const EFFORT_OPTIONS = [
  { value: 'easier', label: 'Easier than expected', emoji: null },
  { value: 'about_right', label: 'About right', emoji: null },
  { value: 'harder', label: 'Harder than expected', emoji: null }
];

const CALIBRATION_THRESHOLDS = {
  SKEW_THRESHOLD: 0.50,       // >50% in one category triggers a signal
  CONSECUTIVE_WEEKS: 2,       // Must persist for 2+ weeks before recommending changes
  VOLUME_REDUCTION_PCT: 0.10  // Reduce 10% when too hard
};

// ── Storage Keys ───────────────────────────────────────────────────────────

const EFFORT_FEEDBACK_KEY = 'workoutEffortFeedback';
const CALIBRATION_SIGNALS_KEY = 'calibrationSignals';

// ── Record Effort Feedback ─────────────────────────────────────────────────

/**
 * Record how a workout felt relative to intent.
 * Called after the user logs a completed workout.
 * @param {string} workoutId - ID of the completed workout
 * @param {string} effort - 'easier' | 'about_right' | 'harder'
 * @param {string} dateStr - ISO date string (YYYY-MM-DD)
 */
function recordEffortFeedback(workoutId, effort, dateStr) {
  if (!['easier', 'about_right', 'harder'].includes(effort)) {
    console.warn('[IronZ] Invalid effort value:', effort);
    return;
  }

  const feedbackList = getEffortFeedbackList();
  feedbackList.push({
    workoutId,
    effort,
    date: dateStr || new Date().toISOString().slice(0, 10),
    recordedAt: new Date().toISOString()
  });

  localStorage.setItem(EFFORT_FEEDBACK_KEY, JSON.stringify(feedbackList));
  if (typeof DB !== 'undefined') DB.syncKey(EFFORT_FEEDBACK_KEY);
}

/**
 * Get all stored effort feedback entries.
 */
function getEffortFeedbackList() {
  try {
    return JSON.parse(localStorage.getItem(EFFORT_FEEDBACK_KEY) || '[]');
  } catch { return []; }
}

// ── Weekly Aggregation ─────────────────────────────────────────────────────

/**
 * Get effort distribution for a given week.
 * @param {string} weekStartDate - Monday of the week (YYYY-MM-DD)
 * @returns {{ easier: number, about_right: number, harder: number, total: number }}
 */
function getWeeklyEffortDistribution(weekStartDate) {
  const feedbackList = getEffortFeedbackList();
  const weekStart = new Date(weekStartDate);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const weekFeedback = feedbackList.filter(f => {
    const d = new Date(f.date);
    return d >= weekStart && d < weekEnd;
  });

  const dist = { easier: 0, about_right: 0, harder: 0, total: weekFeedback.length };
  for (const f of weekFeedback) {
    if (dist.hasOwnProperty(f.effort)) dist[f.effort]++;
  }
  return dist;
}

/**
 * Analyze calibration for a given week.
 * Returns a signal object with recommendation if skewed.
 */
function analyzeWeekCalibration(weekStartDate) {
  const dist = getWeeklyEffortDistribution(weekStartDate);
  if (dist.total < 2) return { status: 'insufficient_data', distribution: dist };

  const harderPct = dist.harder / dist.total;
  const easierPct = dist.easier / dist.total;

  if (harderPct > CALIBRATION_THRESHOLDS.SKEW_THRESHOLD) {
    return {
      status: 'too_aggressive',
      distribution: dist,
      message: 'Most workouts felt harder than intended this week. Training load may be too aggressive or recovery is insufficient.'
    };
  }
  if (easierPct > CALIBRATION_THRESHOLDS.SKEW_THRESHOLD) {
    return {
      status: 'ready_to_progress',
      distribution: dist,
      message: 'Most workouts felt easier than intended. You may be ready for a progression step.'
    };
  }
  return {
    status: 'well_calibrated',
    distribution: dist,
    message: 'Training load appears well-calibrated this week.'
  };
}

// ── Multi-Week Trend Detection ─────────────────────────────────────────────

/**
 * Check calibration trend over the last N weeks.
 * Only recommends action if the same signal persists for CONSECUTIVE_WEEKS.
 * @param {number} weeksBack - Number of weeks to analyze (default 4)
 */
function getCalibrationTrend(weeksBack) {
  weeksBack = weeksBack || 4;
  const today = new Date();
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  const signals = [];
  for (let i = 0; i < weeksBack; i++) {
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - mondayOffset - (i * 7));
    const dateStr = weekStart.toISOString().slice(0, 10);
    signals.unshift(analyzeWeekCalibration(dateStr)); // oldest first
  }

  // Check for consecutive "too_aggressive" weeks
  let consecutiveHard = 0;
  let consecutiveEasy = 0;
  for (const s of signals.slice(-CALIBRATION_THRESHOLDS.CONSECUTIVE_WEEKS)) {
    if (s.status === 'too_aggressive') consecutiveHard++;
    if (s.status === 'ready_to_progress') consecutiveEasy++;
  }

  let recommendation = null;
  if (consecutiveHard >= CALIBRATION_THRESHOLDS.CONSECUTIVE_WEEKS) {
    recommendation = {
      action: 'reduce',
      message: `Training has felt harder than intended for ${consecutiveHard} consecutive weeks. Consider reducing volume by 10% or backing off intensity next week.`,
      severity: 'warning'
    };
  } else if (consecutiveEasy >= CALIBRATION_THRESHOLDS.CONSECUTIVE_WEEKS) {
    recommendation = {
      action: 'progress',
      message: `Training has felt easier than intended for ${consecutiveEasy} consecutive weeks. You may be ready to increase volume or intensity.`,
      severity: 'info'
    };
  }

  // Store latest calibration signal
  const latest = {
    signals,
    recommendation,
    analyzedAt: new Date().toISOString()
  };
  localStorage.setItem(CALIBRATION_SIGNALS_KEY, JSON.stringify(latest));
  if (typeof DB !== 'undefined') DB.syncKey(CALIBRATION_SIGNALS_KEY);

  return latest;
}

/**
 * Get the most recent stored calibration signal (no recomputation).
 */
function getStoredCalibrationSignal() {
  try {
    return JSON.parse(localStorage.getItem(CALIBRATION_SIGNALS_KEY) || 'null');
  } catch { return null; }
}

// ── UI Helper: Build Effort Prompt HTML ────────────────────────────────────

/**
 * Build the post-workout effort prompt HTML.
 * @param {string} workoutId - ID of the workout to attach feedback to
 * @param {string} dateStr - Date of the workout
 * @returns {string} HTML string
 */
function buildEffortPromptHTML(workoutId, dateStr) {
  return `
    <div class="effort-prompt" data-workout-id="${workoutId}">
      <p class="effort-prompt__question">How did this feel compared to what you expected?</p>
      <div class="effort-prompt__options">
        ${EFFORT_OPTIONS.map(opt => `
          <button class="effort-prompt__btn" data-effort="${opt.value}"
            onclick="handleEffortFeedback('${workoutId}', '${opt.value}', '${dateStr}')">
            ${opt.label}
          </button>
        `).join('')}
      </div>
    </div>`;
}

/**
 * Handle effort feedback button click.
 * Records the feedback and removes the prompt from the UI.
 */
function handleEffortFeedback(workoutId, effort, dateStr) {
  recordEffortFeedback(workoutId, effort, dateStr);

  // Remove the prompt from DOM
  const prompt = document.querySelector(`.effort-prompt[data-workout-id="${workoutId}"]`);
  if (prompt) {
    prompt.innerHTML = '<p class="effort-prompt__thanks">Feedback recorded. Thanks!</p>';
    setTimeout(() => prompt.remove(), 2000);
  }
}

/**
 * Build weekly calibration summary HTML for the check-in dashboard.
 * @param {string} weekStartDate - Monday of the week
 */
function buildCalibrationSummaryHTML(weekStartDate) {
  const analysis = analyzeWeekCalibration(weekStartDate);
  if (analysis.status === 'insufficient_data') {
    return '<p class="calibration-note">Not enough workout feedback this week to assess calibration.</p>';
  }

  const d = analysis.distribution;
  const total = d.total;
  const bars = [
    { label: 'Easier', count: d.easier, cls: 'easier' },
    { label: 'About right', count: d.about_right, cls: 'right' },
    { label: 'Harder', count: d.harder, cls: 'harder' }
  ];

  let statusCls = 'calibration--ok';
  if (analysis.status === 'too_aggressive') statusCls = 'calibration--warning';
  if (analysis.status === 'ready_to_progress') statusCls = 'calibration--info';

  return `
    <div class="calibration-summary ${statusCls}">
      <h4>Effort Calibration</h4>
      <div class="calibration-bars">
        ${bars.map(b => `
          <div class="calibration-bar">
            <span class="calibration-bar__label">${b.label}</span>
            <div class="calibration-bar__track">
              <div class="calibration-bar__fill calibration-bar__fill--${b.cls}"
                style="width:${total > 0 ? (b.count / total * 100) : 0}%"></div>
            </div>
            <span class="calibration-bar__count">${b.count}/${total}</span>
          </div>
        `).join('')}
      </div>
      <p class="calibration-message">${analysis.message}</p>
    </div>`;
}
