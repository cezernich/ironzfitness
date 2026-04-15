// goals.js — Goal Setting System
//
// Two kinds of goals coexist here:
//
// 1. `recurring` — structured training targets tied to a sport, a
//    repeating timeframe (weekly / monthly / annual), and a metric
//    (activities / time / distance). Progress is computed automatically
//    from logged workouts in the current period, so the user never has
//    to manually tick anything.
//
// 2. `custom` — the original free-form shape (name + numeric target +
//    manual progress). Kept around as an escape hatch for goals that
//    don't fit the recurring model, e.g. "Lose 15 lbs" or
//    "Bench 225 lbs". Goals saved under the old code path are treated
//    as kind="custom" by default.

const GOAL_TYPES = {
  performance: { label: "Performance", icon: "target",   examples: "Run sub-25 5K, Bench 225 lbs" },
  body:        { label: "Body",        icon: "activity", examples: "Lose 15 lbs, Reach 12% BF" },
  habit:       { label: "Habit",       icon: "flame",    examples: "Work out 4x/week, Drink 100oz daily" },
};

// Sport options for recurring goals. Each entry drives the card icon
// color and the workout-filter predicate.
const GOAL_SPORTS = [
  { id: "all",      label: "All sports", color: "#a855f7", iconKey: "activity" },
  { id: "run",      label: "Running",    color: "#f59e0b", iconKey: "run" },
  { id: "bike",     label: "Cycling",    color: "#22d3ee", iconKey: "bike" },
  { id: "swim",     label: "Swimming",   color: "#3b82f6", iconKey: "swim" },
  { id: "strength", label: "Strength",   color: "#a855f7", iconKey: "weights" },
];

const GOAL_TIMEFRAMES = [
  { id: "weekly",  label: "Weekly"  },
  { id: "monthly", label: "Monthly" },
  { id: "annual",  label: "Annual"  },
];

const GOAL_METRICS = [
  { id: "activities", label: "Activities", unit: "sessions" },
  { id: "time",       label: "Time",       unit: "min"      },
  { id: "distance",   label: "Distance",   unit: "mi"       },
];

function loadGoals() {
  try { return JSON.parse(localStorage.getItem("fitnessGoals")) || []; } catch { return []; }
}

function saveGoals(goals) {
  localStorage.setItem("fitnessGoals", JSON.stringify(goals));
  if (typeof DB !== "undefined") DB.syncKey("fitnessGoals");
}

// ── Period math ──────────────────────────────────────────────────────────

// Returns [startDate, endDate] as local Date objects bracketing the
// current instance of `timeframe`. Monday is treated as the start of
// the week to match triathlon training convention.
function _goalPeriodRange(timeframe, now) {
  const base = now ? new Date(now) : new Date();
  const y = base.getFullYear();
  const m = base.getMonth();
  const d = base.getDate();
  if (timeframe === "weekly") {
    const day = base.getDay();                       // 0 = Sun
    const mondayOffset = day === 0 ? -6 : 1 - day;    // shift so Mon is 0
    const start = new Date(y, m, d + mondayOffset, 0, 0, 0, 0);
    const end   = new Date(y, m, d + mondayOffset + 6, 23, 59, 59, 999);
    return [start, end];
  }
  if (timeframe === "monthly") {
    return [new Date(y, m, 1, 0, 0, 0, 0), new Date(y, m + 1, 0, 23, 59, 59, 999)];
  }
  if (timeframe === "annual") {
    return [new Date(y, 0, 1, 0, 0, 0, 0), new Date(y, 11, 31, 23, 59, 59, 999)];
  }
  return [new Date(y, m, d, 0, 0, 0, 0), new Date(y, m, d, 23, 59, 59, 999)];
}

function _periodLabel(timeframe) {
  const [start, end] = _goalPeriodRange(timeframe);
  const f = (dt) => dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (timeframe === "weekly")  return `${f(start)} – ${f(end)}`;
  if (timeframe === "monthly") return start.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  if (timeframe === "annual")  return String(start.getFullYear());
  return "";
}

// ── Workout helpers ─────────────────────────────────────────────────────

// Normalize a workout's sport into one of the GOAL_SPORTS ids so we can
// match against a goal's sport filter.
function _goalNormalizeSport(w) {
  if (!w) return null;
  const t = String(w.type || w.discipline || "").toLowerCase();
  if (t === "running"   || t === "run")  return "run";
  if (t === "cycling"   || t === "bike") return "bike";
  if (t === "swimming"  || t === "swim") return "swim";
  if (t === "weightlifting" || t === "bodyweight" || t === "strength" || t === "hiit" || t === "circuit" || t === "hyrox") return "strength";
  if (t === "brick") return "bike"; // brick counts toward cycling by default
  // Title-based fallback for workouts that came in with an unknown type
  const name = `${w.sessionName || ""} ${w.notes || ""} ${w.aiSession?.title || ""}`.toLowerCase();
  if (/\brun|tempo|track|pace\b/.test(name))  return "run";
  if (/\bbike|cycl|ftp|sweet.?spot\b/.test(name)) return "bike";
  if (/\bswim|css|freestyle\b/.test(name)) return "swim";
  return null;
}

// Best-effort duration reader. Prefers an explicit w.duration, falls
// back to aiSession.duration, then sums interval durations (respecting
// reps + rest) — same shape _expandRepeatGroups emits.
function _goalWorkoutMinutes(w) {
  const direct = parseFloat(w.duration);
  if (!isNaN(direct) && direct > 0) return direct;
  const ai = w.aiSession || w.generatedSession || {};
  if (ai.duration) {
    const n = parseFloat(ai.duration);
    if (!isNaN(n) && n > 0) return n;
  }
  const intervals = Array.isArray(ai.intervals) ? ai.intervals : [];
  if (!intervals.length) return 0;
  const parseMin = (s) => {
    const str = String(s || "").trim();
    const m = str.match(/([\d.]+)/);
    if (!m) return 0;
    const v = parseFloat(m[1]);
    return /sec|s\b/i.test(str) ? v / 60 : v;
  };
  let total = 0;
  for (const iv of intervals) {
    const reps = parseInt(iv.reps, 10) || 1;
    const each = parseMin(iv.duration);
    const rest = iv.restDuration ? parseMin(iv.restDuration) : 0;
    total += reps * each + Math.max(0, reps - 1) * rest;
  }
  return total;
}

// Distance reader. We only surface this for workouts where distance
// was explicitly logged (Strava import, manual distance entry) —
// treadmill/indoor won't contribute.
function _goalWorkoutDistanceMiles(w) {
  const direct = parseFloat(w.distance);
  if (!isNaN(direct) && direct > 0) {
    const unit = String(w.distanceUnit || w.distance_unit || "mi").toLowerCase();
    return unit === "km" ? direct * 0.621371 : direct;
  }
  const ai = w.aiSession || w.generatedSession || {};
  if (ai.distance_miles) return parseFloat(ai.distance_miles) || 0;
  if (ai.distance) {
    const n = parseFloat(ai.distance);
    if (!isNaN(n)) return n;
  }
  return 0;
}

function _goalCompletedWorkouts(start, end) {
  let out = [];
  try {
    const ws = JSON.parse(localStorage.getItem("workouts") || "[]") || [];
    out = out.concat(ws);
  } catch {}
  // Filter: date inside [start, end] and counted as actually done.
  // Logged workouts (no isCompletion flag, not from Strava) are
  // user-entered sessions that already represent completed work —
  // count those unless they're a planning placeholder.
  const startMs = start.getTime();
  const endMs   = end.getTime();
  return out.filter(w => {
    if (!w.date) return false;
    const dt = new Date(w.date + "T12:00:00");
    const ms = dt.getTime();
    if (isNaN(ms) || ms < startMs || ms > endMs) return false;
    // A workout counts if it's not a future-planned stub. Strava imports
    // always count. isCompletion receipts always count. Everything else
    // counts so long as it has a date in the past-or-present.
    return true;
  });
}

// Public: compute the current-period progress for a recurring goal.
// Returns { current, target, pct, label, unit }.
function computeGoalProgress(goal) {
  if (!goal || goal.kind !== "recurring") return null;
  const [start, end] = _goalPeriodRange(goal.timeframe || "weekly");
  const workouts = _goalCompletedWorkouts(start, end);
  const matches = workouts.filter(w => {
    if (!goal.sport || goal.sport === "all") return true;
    return _goalNormalizeSport(w) === goal.sport;
  });

  let current = 0;
  let unit = goal.unit || "sessions";
  if (goal.metric === "activities") {
    current = matches.length;
    unit = matches.length === 1 ? "session" : "sessions";
  } else if (goal.metric === "time") {
    const minutes = matches.reduce((sum, w) => sum + _goalWorkoutMinutes(w), 0);
    current = Math.round(minutes);
    unit = "min";
  } else if (goal.metric === "distance") {
    const miles = matches.reduce((sum, w) => sum + _goalWorkoutDistanceMiles(w), 0);
    current = Math.round(miles * 10) / 10;
    unit = "mi";
  }

  const target = Number(goal.target) || 0;
  const pct = target > 0 ? Math.min(Math.round((current / target) * 100), 100) : 0;
  return { current, target, pct, unit, label: _periodLabel(goal.timeframe || "weekly") };
}

// ── Rendering ────────────────────────────────────────────────────────────

function renderGoals() {
  const container = document.getElementById("goals-content");
  if (!container) return;

  const goals = loadGoals();
  const active = goals.filter(g => !g.archived);
  const archived = goals.filter(g => g.archived);

  let html = "";

  if (active.length > 0) {
    active.forEach(g => {
      html += _renderGoalCard(g);
    });
    html += `<button class="btn-secondary" style="margin-top:8px;width:100%" onclick="openGoalForm()">+ Add Goal</button>`;
  } else {
    html += `<div class="goals-empty">
      <p class="empty-msg" style="margin:0">No active goals yet.</p>
      <button class="btn-primary" onclick="openGoalForm()" style="margin-top:10px">+ Add Goal</button>
    </div>`;
  }

  if (archived.length > 0) {
    html += `<div class="goals-archived-section">
      <button class="goals-archived-toggle" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'':'none';this.textContent=this.nextElementSibling.style.display==='none'?'Show completed (${archived.length})':'Hide completed'">
        Show completed (${archived.length})
      </button>
      <div style="display:none">`;
    archived.forEach(g => {
      html += `<div class="goal-card goal-card--archived">
        <div class="goal-header">
          <span class="goal-icon">${typeof ICONS !== "undefined" ? ICONS.check || "" : ""}</span>
          <div class="goal-info">
            <div class="goal-name">${_escGoalHtml(g.name || _defaultGoalName(g))}</div>
            <div class="goal-meta">Completed ${g.archivedAt ? formatDisplayDate(g.archivedAt.slice(0, 10)) : ""}</div>
          </div>
          <button class="goal-edit-btn" onclick="deleteGoal('${g.id}')">Remove</button>
        </div>
      </div>`;
    });
    html += `</div></div>`;
  }

  container.innerHTML = html;
}

function _renderGoalCard(g) {
  const kind = g.kind || "custom";
  const title = g.name || _defaultGoalName(g);
  const icon = _goalCardIcon(g);
  const color = _goalCardColor(g);

  if (kind === "recurring") {
    const p = computeGoalProgress(g) || { current: 0, target: g.target || 0, pct: 0, unit: g.unit || "", label: "" };
    const isComplete = p.target > 0 && p.current >= p.target;
    const progressColor = isComplete ? "var(--color-success)" : color;
    return `
      <div class="goal-card goal-card-v2${isComplete ? " goal-card--complete" : ""}">
        <div class="goal-header">
          <span class="goal-icon" style="background:${color}22;color:${color}">${icon}</span>
          <div class="goal-info">
            <div class="goal-name">${_escGoalHtml(title)}</div>
            <div class="goal-meta">${_escGoalHtml(p.label)}</div>
          </div>
          <div class="goal-actions">
            <button class="goal-edit-btn" onclick="openGoalEdit('${g.id}')">Edit</button>
            <button class="delete-btn" title="Delete" onclick="if(confirm('Delete this goal?')) deleteGoal('${g.id}')">${typeof ICONS !== "undefined" ? ICONS.trash || "&times;" : "&times;"}</button>
          </div>
        </div>
        <div class="goal-progress-row">
          <div class="goal-progress-track">
            <div class="goal-progress-fill" style="width:${p.pct}%;background:${progressColor}"></div>
          </div>
          <span class="goal-progress-pct">${p.pct}%</span>
        </div>
        <div class="goal-progress-detail">${p.current} / ${p.target} ${_escGoalHtml(p.unit || "")}</div>
      </div>`;
  }

  // Legacy custom goal — manual progress entry
  const pct = Math.min(Math.round((g.progress || 0) / (g.target || 1) * 100), 100);
  const isComplete = pct >= 100;
  const typeInfo = GOAL_TYPES[g.type] || GOAL_TYPES.habit;
  const legacyIcon = (typeof ICONS !== "undefined") ? (ICONS[typeInfo.icon] || "") : "";
  const deadlineStr = g.deadline ? ` · by ${formatDisplayDate(g.deadline)}` : "";
  const progressColor = isComplete ? "var(--color-success)" : "var(--color-accent)";
  return `
    <div class="goal-card goal-card-v2${isComplete ? " goal-card--complete" : ""}">
      <div class="goal-header">
        <span class="goal-icon" style="background:#a855f722;color:#a855f7">${legacyIcon}</span>
        <div class="goal-info">
          <div class="goal-name">${_escGoalHtml(title)}</div>
          <div class="goal-meta">Custom · ${typeInfo.label}${deadlineStr}</div>
        </div>
        <div class="goal-actions">
          <button class="goal-edit-btn" onclick="openGoalEdit('${g.id}')">Edit</button>
          ${isComplete ? `<button class="goal-archive-btn" onclick="archiveGoal('${g.id}')">Archive</button>` : ""}
          <button class="delete-btn" title="Delete" onclick="if(confirm('Delete this goal?')) deleteGoal('${g.id}')">${typeof ICONS !== "undefined" ? ICONS.trash || "&times;" : "&times;"}</button>
        </div>
      </div>
      <div class="goal-progress-row">
        <div class="goal-progress-track">
          <div class="goal-progress-fill" style="width:${pct}%;background:${progressColor}"></div>
        </div>
        <span class="goal-progress-pct">${pct}%</span>
      </div>
      ${g.unit ? `<div class="goal-progress-detail">${g.progress || 0} / ${g.target} ${g.unit}</div>` : ""}
      <div class="goal-update-row">
        <input type="number" class="goal-update-input" id="goal-update-${g.id}" placeholder="Update progress" min="0" step="any" />
        <button class="goal-update-btn" onclick="updateGoalProgress('${g.id}')">Update</button>
      </div>
    </div>`;
}

function _defaultGoalName(g) {
  if (g.kind === "recurring") {
    const sport = (GOAL_SPORTS.find(s => s.id === g.sport) || {}).label || "All sports";
    const tf    = (GOAL_TIMEFRAMES.find(t => t.id === g.timeframe) || {}).label || "";
    const metric = (GOAL_METRICS.find(m => m.id === g.metric) || {}).label || "";
    return `${tf} ${sport} — ${g.target || 0} ${metric.toLowerCase()}`.trim();
  }
  return g.name || "Goal";
}

function _goalCardIcon(g) {
  const I = (typeof ICONS !== "undefined") ? ICONS : {};
  if (g.kind === "recurring") {
    const sport = GOAL_SPORTS.find(s => s.id === g.sport);
    if (sport) return I[sport.iconKey] || I.activity || "";
    return I.activity || "";
  }
  const typeInfo = GOAL_TYPES[g.type] || GOAL_TYPES.habit;
  return I[typeInfo.icon] || "";
}

function _goalCardColor(g) {
  if (g.kind === "recurring") {
    const sport = GOAL_SPORTS.find(s => s.id === g.sport);
    if (sport) return sport.color;
  }
  return "#a855f7";
}

// ── Form modal ───────────────────────────────────────────────────────────

function openGoalForm() {
  const modal = document.getElementById("goal-form-modal");
  if (!modal) return;
  modal.style.display = "";
  modal.classList.add("is-open");
  // Reset to the recurring default — the thing most users should pick.
  const kindEl = document.getElementById("goal-form-kind");
  if (kindEl) kindEl.value = "recurring";
  _setGoalFormSport("all");
  _setGoalFormTimeframe("weekly");
  _setGoalFormMetric("activities");
  const targetEl = document.getElementById("goal-form-target");
  if (targetEl) targetEl.value = "";
  const nameEl = document.getElementById("goal-form-name");
  if (nameEl) nameEl.value = "";
  const deadlineEl = document.getElementById("goal-form-deadline");
  if (deadlineEl) deadlineEl.value = "";
  const typeEl = document.getElementById("goal-form-type");
  if (typeEl) typeEl.value = "performance";
  const unitEl = document.getElementById("goal-form-unit");
  if (unitEl) unitEl.value = "";
  const idEl = document.getElementById("goal-form-id");
  if (idEl) idEl.value = "";
  const titleEl = document.getElementById("goal-form-title");
  if (titleEl) titleEl.textContent = "New Goal";
  _applyGoalFormKind("recurring");
  _updateGoalFormPlaceholders();
}

// Update the custom-goal name/unit placeholders to match the selected
// category so a "Performance" category doesn't show "e.g. Lose 15 lbs".
function _updateGoalFormPlaceholders() {
  const typeEl = document.getElementById("goal-form-type");
  const nameEl = document.getElementById("goal-form-name");
  const unitEl = document.getElementById("goal-form-unit");
  if (!typeEl) return;
  const examples = {
    performance: { name: "e.g. Sub-20 5K",           unit: "e.g. seconds, mph, watts" },
    habit:       { name: "e.g. Stretch 10 min daily", unit: "e.g. days, sessions" },
    body:        { name: "e.g. Lose 15 lbs",          unit: "e.g. lbs, % body fat" },
    nutrition:   { name: "e.g. 150g protein / day",   unit: "e.g. grams, calories" },
  };
  const ex = examples[typeEl.value] || examples.performance;
  if (nameEl) nameEl.placeholder = ex.name;
  if (unitEl) unitEl.placeholder = ex.unit;
}
if (typeof window !== "undefined") window._updateGoalFormPlaceholders = _updateGoalFormPlaceholders;

function closeGoalForm() {
  const modal = document.getElementById("goal-form-modal");
  if (modal) { modal.classList.remove("is-open"); modal.style.display = "none"; }
}

function openGoalEdit(id) {
  const goals = loadGoals();
  const goal = goals.find(g => g.id === id);
  if (!goal) return;

  const modal = document.getElementById("goal-form-modal");
  if (!modal) return;
  modal.style.display = "";
  modal.classList.add("is-open");

  const kind = goal.kind || "custom";
  const kindEl = document.getElementById("goal-form-kind");
  if (kindEl) kindEl.value = kind;

  if (kind === "recurring") {
    _setGoalFormSport(goal.sport || "all");
    _setGoalFormTimeframe(goal.timeframe || "weekly");
    _setGoalFormMetric(goal.metric || "activities");
    const targetEl = document.getElementById("goal-form-target");
    if (targetEl) targetEl.value = goal.target || "";
  } else {
    const nameEl = document.getElementById("goal-form-name");
    if (nameEl) nameEl.value = goal.name || "";
    const typeEl = document.getElementById("goal-form-type");
    if (typeEl) typeEl.value = goal.type || "performance";
    const targetEl = document.getElementById("goal-form-target");
    if (targetEl) targetEl.value = goal.target || "";
    const unitEl = document.getElementById("goal-form-unit");
    if (unitEl) unitEl.value = goal.unit || "";
    const deadlineEl = document.getElementById("goal-form-deadline");
    if (deadlineEl) deadlineEl.value = goal.deadline || "";
  }

  document.getElementById("goal-form-id").value = id;
  document.getElementById("goal-form-title").textContent = "Edit Goal";
  _applyGoalFormKind(kind);
  _updateGoalFormPlaceholders();
}

// ── Form field helpers ──────────────────────────────────────────────────

// Which metrics make sense for each sport. Distance is disabled for
// strength (no meaningful distance) and for "all sports" (can't
// aggregate miles across swim + bike + run — 1 mi ≠ 1 mi).
function _goalMetricsAllowedFor(sportId) {
  if (sportId === "strength") return ["activities", "time"];
  if (sportId === "all")      return ["activities", "time"];
  return ["activities", "time", "distance"];
}

function _setGoalFormSport(sportId) {
  document.querySelectorAll("#goal-form-sport-chips [data-sport]").forEach(el => {
    el.classList.toggle("is-active", el.dataset.sport === sportId);
  });
  const hidden = document.getElementById("goal-form-sport");
  if (hidden) hidden.value = sportId;

  // Hide metric tiles that don't apply to this sport. If the current
  // metric just got disabled, fall back to Activities so the user
  // isn't left with a stale selection.
  const allowed = _goalMetricsAllowedFor(sportId);
  document.querySelectorAll("#goal-form-metric-tiles [data-metric]").forEach(el => {
    el.style.display = allowed.includes(el.dataset.metric) ? "" : "none";
  });
  const currentMetric = document.getElementById("goal-form-metric")?.value || "activities";
  if (!allowed.includes(currentMetric)) {
    _setGoalFormMetric("activities");
  }
}
function _setGoalFormTimeframe(tfId) {
  document.querySelectorAll("#goal-form-timeframe-chips [data-timeframe]").forEach(el => {
    el.classList.toggle("is-active", el.dataset.timeframe === tfId);
  });
  const hidden = document.getElementById("goal-form-timeframe");
  if (hidden) hidden.value = tfId;
  _updateGoalFormTargetHint();
}
function _setGoalFormMetric(metricId) {
  // Guard against picking a metric that's been disabled for the
  // current sport (e.g. someone programmatically calls us with
  // "distance" while strength is selected).
  const currentSport = document.getElementById("goal-form-sport")?.value || "all";
  const allowed = _goalMetricsAllowedFor(currentSport);
  const safeMetric = allowed.includes(metricId) ? metricId : "activities";
  document.querySelectorAll("#goal-form-metric-tiles [data-metric]").forEach(el => {
    el.classList.toggle("is-active", el.dataset.metric === safeMetric);
  });
  const hidden = document.getElementById("goal-form-metric");
  if (hidden) hidden.value = safeMetric;
  _updateGoalFormTargetHint();
}
function _updateGoalFormTargetHint() {
  const metric = document.getElementById("goal-form-metric")?.value || "activities";
  const tf = document.getElementById("goal-form-timeframe")?.value || "weekly";
  const metricInfo = GOAL_METRICS.find(m => m.id === metric) || GOAL_METRICS[0];
  const label = document.getElementById("goal-form-target-label");
  if (label) label.textContent = `Target ${metricInfo.label.toLowerCase()} per ${tf === "annual" ? "year" : tf.replace(/ly$/, "")}`;
  const input = document.getElementById("goal-form-target");
  if (input) input.placeholder = `e.g. ${metric === "activities" ? "4" : metric === "time" ? "300" : "25"}`;
  const unit = document.getElementById("goal-form-target-unit");
  if (unit) unit.textContent = metricInfo.unit;
}

// Show/hide recurring vs custom field groups inside the modal.
function _applyGoalFormKind(kind) {
  const recurringBlock = document.getElementById("goal-form-recurring");
  const customBlock    = document.getElementById("goal-form-custom");
  if (recurringBlock) recurringBlock.style.display = kind === "recurring" ? "" : "none";
  if (customBlock)    customBlock.style.display    = kind === "custom"    ? "" : "none";
  document.querySelectorAll("#goal-form-kind-chips [data-kind]").forEach(el => {
    el.classList.toggle("is-active", el.dataset.kind === kind);
  });
  const hidden = document.getElementById("goal-form-kind");
  if (hidden) hidden.value = kind;
  if (kind === "recurring") _updateGoalFormTargetHint();
}

function saveGoalForm() {
  const editId = document.getElementById("goal-form-id")?.value || "";
  const kind = document.getElementById("goal-form-kind")?.value || "recurring";

  let next;
  if (kind === "recurring") {
    const sport     = document.getElementById("goal-form-sport")?.value     || "all";
    const timeframe = document.getElementById("goal-form-timeframe")?.value || "weekly";
    const metric    = document.getElementById("goal-form-metric")?.value    || "activities";
    const target    = parseFloat(document.getElementById("goal-form-target")?.value) || 0;
    if (target <= 0) return;
    next = {
      kind: "recurring",
      sport, timeframe, metric,
      target,
      unit: (GOAL_METRICS.find(m => m.id === metric) || GOAL_METRICS[0]).unit,
    };
  } else {
    const name   = (document.getElementById("goal-form-name")?.value || "").trim();
    const type   = document.getElementById("goal-form-type")?.value || "performance";
    const target = parseFloat(document.getElementById("goal-form-target")?.value) || 0;
    const unit   = (document.getElementById("goal-form-unit")?.value || "").trim();
    const deadline = document.getElementById("goal-form-deadline")?.value || "";
    if (!name) return;
    next = { kind: "custom", name, type, target, unit, deadline, progress: 0 };
  }

  const goals = loadGoals();
  if (editId) {
    const idx = goals.findIndex(g => g.id === editId);
    if (idx !== -1) {
      goals[idx] = { ...goals[idx], ...next, lastUpdated: new Date().toISOString() };
    }
  } else {
    goals.push({
      id: String(Date.now()),
      ...next,
      createdAt: new Date().toISOString(),
      archived: false,
    });
  }
  saveGoals(goals);
  closeGoalForm();
  renderGoals();
}

function updateGoalProgress(id) {
  const input = document.getElementById(`goal-update-${id}`);
  if (!input) return;
  const val = parseFloat(input.value);
  if (isNaN(val)) return;

  const goals = loadGoals();
  const goal = goals.find(g => g.id === id);
  if (!goal) return;

  goal.progress = val;
  goal.lastUpdated = new Date().toISOString();

  saveGoals(goals);
  renderGoals();
}

function archiveGoal(id) {
  const goals = loadGoals();
  const goal = goals.find(g => g.id === id);
  if (!goal) return;
  goal.archived = true;
  goal.archivedAt = new Date().toISOString();
  saveGoals(goals);
  renderGoals();
}

function deleteGoal(id) {
  let goals = loadGoals();
  goals = goals.filter(g => g.id !== id);
  saveGoals(goals);
  renderGoals();
}

function buildGoalsSummaryForHome() {
  const goals = loadGoals().filter(g => !g.archived);
  if (goals.length === 0) return "";

  const topGoal = goals[0];
  let pct, name;
  if (topGoal.kind === "recurring") {
    const p = computeGoalProgress(topGoal);
    pct = p ? p.pct : 0;
    name = _defaultGoalName(topGoal);
  } else {
    pct = Math.min(Math.round((topGoal.progress || 0) / (topGoal.target || 1) * 100), 100);
    name = topGoal.name || "Goal";
  }

  return `<div class="home-goal-summary">
    <div class="home-goal-label">${typeof ICONS !== "undefined" ? ICONS.target : ""} ${_escGoalHtml(name)}</div>
    <div class="home-goal-bar">
      <div class="home-goal-fill" style="width:${pct}%"></div>
    </div>
    <span class="home-goal-pct">${pct}%</span>
  </div>`;
}

function _escGoalHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}
