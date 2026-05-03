// stats.js — Cumulative stats tab

/* ─── Local date helper (avoids UTC offset issues) ──────────────────────── */

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

/* ─── Computations ─────────────────────────────────────────────────────── */

function computeByType(workouts) {
  const order  = ["weightlifting","bodyweight","hiit","running","swimming","cycling","brick","stairstepper","hyrox","yoga","wellness","general","other"];
  const counts = {};
  order.forEach(t => counts[t] = 0);
  workouts.forEach(w => {
    // Run subtypes (easy_recovery, long_run), bike/swim subtypes, and
    // aliases (run/bike/swim) used to fall through to "other" — fold
    // them up via the same normalizer the Totals card uses. Also map
    // legacy triathlon-typed bricks (onboarding-v2 used to store
    // brick sessions with type:"triathlon"; the Log a Workout form
    // still does too) onto the brick bucket so they stop landing in
    // a row called "Triathlon" with a swim icon next to their actual
    // brick metadata.
    let t = (typeof _normalizeType === "function") ? _normalizeType(w.type) : (w.type || "general");
    if (t === "triathlon") t = "brick";
    if (!order.includes(t)) t = "other";
    counts[t]++;
  });
  return counts;
}

function computeStreaks(workouts) {
  if (!workouts.length) return { currentDay:0, bestDay:0, currentWeek:0, bestWeek:0 };

  const daySet  = new Set(workouts.map(w => w.date));
  const days    = [...daySet].sort();
  const today   = getTodayString();

  // ── Daily streak ──────────────────────────────────────────────────────
  // Anchor on today if it has a workout; otherwise on yesterday — today
  // isn't over, so an empty today shouldn't zero out a live streak.
  let currentDay = 0;
  const cur = new Date(today + "T00:00:00");
  if (!daySet.has(localDateStr(cur))) cur.setDate(cur.getDate() - 1);
  while (daySet.has(localDateStr(cur))) { currentDay++; cur.setDate(cur.getDate() - 1); }

  let bestDay = currentDay, run = 1;
  for (let i = 1; i < days.length; i++) {
    const gap = (new Date(days[i]+"T00:00:00") - new Date(days[i-1]+"T00:00:00")) / 86400000;
    gap === 1 ? (run++, bestDay = Math.max(bestDay, run)) : (run = 1);
  }
  if (days.length === 1) bestDay = Math.max(bestDay, 1);

  // ── Weekly streak (each Mon–Sun week with ≥1 workout) ─────────────────
  const weekSet  = new Set(days.map(d => localDateStr(getWeekStart(new Date(d+"T00:00:00")))));
  const weekKeys = [...weekSet].sort();
  const thisWk   = localDateStr(getWeekStart(new Date(today+"T00:00:00")));
  const lastWkD  = new Date(thisWk+"T00:00:00"); lastWkD.setDate(lastWkD.getDate()-7);
  const lastWk   = localDateStr(lastWkD);

  let currentWeek = 0;
  const anchor = weekSet.has(thisWk) ? thisWk : weekSet.has(lastWk) ? lastWk : null;
  if (anchor) {
    const wc = new Date(anchor+"T00:00:00");
    while (weekSet.has(localDateStr(wc))) { currentWeek++; wc.setDate(wc.getDate()-7); }
  }

  let bestWeek = currentWeek, wrun = 1;
  for (let i = 1; i < weekKeys.length; i++) {
    const gap = (new Date(weekKeys[i]+"T00:00:00") - new Date(weekKeys[i-1]+"T00:00:00")) / 86400000;
    gap === 7 ? (wrun++, bestWeek = Math.max(bestWeek, wrun)) : (wrun = 1);
  }
  if (weekKeys.length === 1) bestWeek = Math.max(bestWeek, 1);

  return { currentDay, bestDay, currentWeek, bestWeek };
}

function getThisWeekCount(workouts) {
  const ws = localDateStr(getWeekStart(new Date()));
  return workouts.filter(w => w.date >= ws).length;
}

function getThisMonthCount(workouts) {
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const ms = localDateStr(firstOfMonth);
  return workouts.filter(w => w.date >= ms).length;
}

function getDowCounts(workouts) {
  const counts = new Array(7).fill(0);
  workouts.forEach(w => counts[new Date(w.date+"T00:00:00").getDay()]++);
  return counts; // index 0 = Sun
}

/* ─── Section builders ─────────────────────────────────────────────────── */

function buildStatsOverview(total, streaks, thisWeek, thisMonth) {
  const activeStreak = streaks.currentDay > 0;
  const streakClass = activeStreak ? " stat-hero--active" : "";
  const flame = activeStreak ? ` <span class="stat-hero-flame">${ICONS.flame}</span>` : "";
  return `
    <div class="stats-overview">
      <div class="stat-hero stat-hero--total stat-hero--link" onclick="selectStatsView('history')">
        <div class="stat-hero-value">${total}</div>
        <div class="stat-hero-label">Total Workouts</div>
      </div>
      <div class="stat-hero stat-hero--streak${streakClass}">
        <div class="stat-hero-value">${streaks.currentDay}${flame}</div>
        <div class="stat-hero-label">Day Streak</div>
      </div>
      <div class="stat-hero stat-hero--week">
        <div class="stat-hero-value">${thisWeek}</div>
        <div class="stat-hero-label">This Week</div>
      </div>
      <div class="stat-hero stat-hero--month">
        <div class="stat-hero-value">${thisMonth}</div>
        <div class="stat-hero-label">This Month</div>
      </div>
    </div>`;
}

/* ─── Totals Section ──────────────────────────────────────────────────── */

// Types that conceptually track distance. Everything else is time-only.
const _DIST_TYPES = new Set([
  "running", "run",
  "cycling", "bike", "bicycling",
  "swimming", "swim",
  "walking", "walk",
  "rowing", "row",
  "hiking", "hike",
  "triathlon", "brick",
  "stairstepper",
  "hyrox",
]);

// Types grouped as "lifting" for display consolidation. Bodyweight and
// weightlifting roll up to a single row because most users think of them
// together. Everything else keeps its own row.
// Subtype → parent-discipline buckets. The running-workout generator
// emits type values like "easy_recovery", "long_run", "tempo_threshold"
// per individual session template. Without bucketing these up, the
// Totals breakdown fragments into rows like "Easy recovery" and
// "Long run" alongside "Running", which reads as separate categories.
const _RUN_SUBTYPES = new Set([
  "easy_recovery", "endurance", "long_run", "tempo_threshold",
  "track_workout", "speed_work", "hills", "fun_social",
  "recovery_run", "base_run", "progression_run",
]);
const _BIKE_SUBTYPES = new Set([
  "bike_endurance", "bike_tempo", "bike_threshold", "bike_intervals",
  "bike_vo2", "bike_recovery", "bike_long", "bike_sweetspot",
]);
const _SWIM_SUBTYPES = new Set([
  "swim_endurance", "swim_technique", "swim_css_intervals", "swim_speed",
  "swim_threshold", "swim_recovery", "swim_long",
]);

function _normalizeType(t) {
  const x = (t || "").toLowerCase();
  // Subtype rollups first so "easy_recovery" resolves to "running" before
  // the simpler alias checks below.
  if (_RUN_SUBTYPES.has(x))  return "running";
  if (_BIKE_SUBTYPES.has(x)) return "cycling";
  if (_SWIM_SUBTYPES.has(x)) return "swimming";
  if (x === "bodyweight") return "weightlifting";
  if (x === "run")  return "running";
  if (x === "bike" || x === "bicycling") return "cycling";
  if (x === "swim") return "swimming";
  if (x === "walk") return "walking";
  if (x === "row")  return "rowing";
  if (x === "hike") return "hiking";
  // Legacy: onboarding-v2's brick template + the Log a Workout form's
  // "Triathlon / Brick" option both stored type:"triathlon" for what
  // are functionally brick sessions. Fold them into the brick bucket
  // so the Totals card stops showing a separate Triathlon row.
  if (x === "triathlon") return "brick";
  return x || "general";
}

function _computeTotals(workouts) {
  const byType = {};
  let totalMin = 0;

  function _ensure(t) {
    if (!byType[t]) byType[t] = { timeMin: 0, km: 0 };
    return byType[t];
  }

  workouts.forEach(w => {
    const type = _normalizeType(w.type);
    const mins = _extractWorkoutMinutes(w);
    const bucket = _ensure(type);
    bucket.timeMin += mins;
    totalMin += mins;

    // Only accumulate distance for types that conceptually support it.
    const tracksDist = _DIST_TYPES.has(type);
    if (!tracksDist) return;

    // Distance from intervals
    if (w.aiSession?.intervals) {
      w.aiSession.intervals.forEach(iv => {
        const durStr = String(iv.duration || "");
        const reps = iv.reps || 1;
        const miMatch = durStr.match(/([\d.]+)\s*mi$/i);
        const kmMatch = durStr.match(/([\d.]+)\s*km$/i);
        let km = 0;
        if (miMatch) km = parseFloat(miMatch[1]) * 1.60934;
        else if (kmMatch) km = parseFloat(kmMatch[1]);
        km *= reps;
        if (km > 0) bucket.km += km;
      });
    }
    // Distance from direct field. Two stored shapes:
    //   1. Legacy / generated: a string with units baked in ("4.3 mi",
    //      "10 km") — match via regex.
    //   2. Completion form: a bare number string ("10.67") with the
    //      unit on the separate `distance_unit` field ("mi" | "km" |
    //      "m" | "yd"). The previous regex-only code dropped #2 on the
    //      floor, so a hand-completed run / ride / swim contributed 0
    //      km to the totals card.
    if (w.distance) {
      const dStr = String(w.distance);
      const miM = dStr.match(/([\d.]+)\s*mi/i);
      const kmM = dStr.match(/([\d.]+)\s*km/i);
      let km = 0;
      if (miM)      km = parseFloat(miM[1]) * 1.60934;
      else if (kmM) km = parseFloat(kmM[1]);
      else {
        const num = parseFloat(dStr);
        if (isFinite(num) && num > 0) {
          const unitRaw = w.distance_unit
            || (typeof getDistanceUnit === "function" ? getDistanceUnit() : "mi");
          const unit = String(unitRaw).toLowerCase();
          if      (unit === "km") km = num;
          else if (unit === "m")  km = num / 1000;
          else if (unit === "yd") km = num * 0.0009144;
          else                    km = num * 1.60934; // default: miles
        }
      }
      if (km > 0) bucket.km += km;
    }
    // Swim fallback: generated swim sessions carry total_distance_m
    // even when `distance` isn't set. Only applied when no per-distance
    // value was already added above.
    else if (type === "swimming" && w.total_distance_m) {
      const m = parseFloat(w.total_distance_m);
      if (isFinite(m) && m > 0) bucket.km += m / 1000;
    }
  });
  return { byType, totalMin };
}

function _parseDurMinFromStr(str) {
  const m = String(str || "").match(/([\d.]+)\s*min/i);
  return m ? parseFloat(m[1]) : 0;
}

function _fmtDist(km) {
  const isMetric = typeof getMeasurementSystem === "function" && getMeasurementSystem() === "metric";
  if (isMetric) return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
  const mi = km / 1.60934;
  return `${mi.toFixed(1)} mi`;
}

function _fmtHours(min) {
  if (!min) return "0 min";
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function _fmtSwimDist(km) {
  const isMetric = typeof getMeasurementSystem === "function" && getMeasurementSystem() === "metric";
  if (isMetric) {
    return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
  }
  const yd = km * 1093.61;
  return yd < 1760 ? `${Math.round(yd)} yd` : `${(yd / 1760).toFixed(1)} mi`;
}

// Per-type display metadata for the Totals section. The label is what
// the user sees; the icon is from icons.js. Types not listed here fall
// back to a title-cased version of the key + ICONS.activity.
const _TOTALS_TYPE_META = {
  running:      { label: "Running",       icon: () => ICONS.run     },
  cycling:      { label: "Cycling",       icon: () => ICONS.bike    },
  swimming:     { label: "Swimming",      icon: () => ICONS.swim    },
  weightlifting:{ label: "Lifting",       icon: () => ICONS.weights },
  hiit:         { label: "HIIT",          icon: () => ICONS.flame   },
  yoga:         { label: "Yoga",          icon: () => ICONS.activity},
  walking:      { label: "Walking",       icon: () => ICONS.activity},
  rowing:       { label: "Rowing",        icon: () => ICONS.activity},
  hiking:       { label: "Hiking",        icon: () => ICONS.activity},
  brick:        { label: "Brick",         icon: () => ICONS.brick   },
  hyrox:        { label: "Hyrox",         icon: () => ICONS.flame   },
  stairstepper: { label: "Stair Stepper", icon: () => ICONS.run     },
  mobility:     { label: "Mobility",      icon: () => ICONS.activity},
  wellness:     { label: "Wellness",      icon: () => ICONS.activity},
  sauna:        { label: "Sauna",         icon: () => ICONS.activity},
  sport:        { label: "Sport",         icon: () => ICONS.activity},
  general:      { label: "General",       icon: () => ICONS.activity},
};

function _totalsLabelFor(type) {
  const meta = _TOTALS_TYPE_META[type];
  if (meta) return meta.label;
  return type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, " ");
}
function _totalsIconFor(type) {
  const meta = _TOTALS_TYPE_META[type];
  if (meta && typeof meta.icon === "function") return meta.icon();
  return ICONS.activity;
}

function buildStatsTotals() {
  let allWorkouts = [];
  try { allWorkouts = JSON.parse(localStorage.getItem("workouts")) || []; } catch {}
  const today = getTodayString();
  allWorkouts = allWorkouts.filter(w => w.date <= today);

  // Dedup: when both a hand-logged workout and an isCompletion record
  // exist for the same (date, type), keep only the hand-log. Mirrors
  // loadCompletedSessions so Totals don't double-count wellness etc.
  const handLoggedKeys = new Set(
    allWorkouts.filter(w => !w.isCompletion).map(w => `${w.date}|${w.type}`)
  );
  allWorkouts = allWorkouts.filter(w =>
    !w.isCompletion || !handLoggedKeys.has(`${w.date}|${w.type}`)
  );

  const yearStart  = today.slice(0, 4) + "-01-01";
  const monthStart = today.slice(0, 7) + "-01";
  const thisYear  = allWorkouts.filter(w => w.date >= yearStart);
  const thisMonth = allWorkouts.filter(w => w.date >= monthStart);

  const allTotals   = _computeTotals(allWorkouts);
  const yearTotals  = _computeTotals(thisYear);
  const monthTotals = _computeTotals(thisMonth);

  // Collect every type that has any time in any timeframe — "starts blank,
  // fills up as you log workouts."
  const typeSet = new Set([
    ...Object.keys(allTotals.byType),
    ...Object.keys(yearTotals.byType),
    ...Object.keys(monthTotals.byType),
  ]);
  const typesWithTime = [...typeSet].filter(t =>
    (allTotals.byType[t]?.timeMin || 0) > 0
    || (yearTotals.byType[t]?.timeMin || 0) > 0
    || (monthTotals.byType[t]?.timeMin || 0) > 0
  );
  // Sort by all-time minutes desc so the biggest activity shows first.
  typesWithTime.sort((a, b) =>
    (allTotals.byType[b]?.timeMin || 0) - (allTotals.byType[a]?.timeMin || 0)
  );

  function _row(type) {
    const icon  = _totalsIconFor(type);
    const label = _totalsLabelFor(type);
    const mT = allTotals.byType;
    const monthMin = monthTotals.byType[type]?.timeMin || 0;
    const yearMin  = yearTotals.byType[type]?.timeMin  || 0;
    const allMin   = allTotals.byType[type]?.timeMin   || 0;
    const monthKm  = monthTotals.byType[type]?.km      || 0;
    const yearKm   = yearTotals.byType[type]?.km       || 0;
    const allKm    = allTotals.byType[type]?.km        || 0;
    const hasDist  = (monthKm + yearKm + allKm) > 0;
    const fmtDist  = type === "swimming" ? _fmtSwimDist : _fmtDist;

    const mTimeStr = _fmtHours(monthMin);
    const yTimeStr = _fmtHours(yearMin);
    const aTimeStr = _fmtHours(allMin);
    const mDistStr = hasDist ? fmtDist(monthKm) : "";
    const yDistStr = hasDist ? fmtDist(yearKm)  : "";
    const aDistStr = hasDist ? fmtDist(allKm)   : "";

    return `<div class="totals-row" data-type="${type}"${hasDist ? ' data-has-dist="1"' : ''}>
      <span class="totals-icon">${icon}</span>
      <span class="totals-label">${label}</span>
      <span class="totals-value"
        data-month="${mTimeStr}" data-year="${yTimeStr}" data-all="${aTimeStr}"
        ${hasDist ? `data-month-dist="${mDistStr}" data-year-dist="${yDistStr}" data-all-dist="${aDistStr}"` : ""}
      >${mTimeStr}</span>
    </div>`;
  }

  const rows = typesWithTime.map(_row).join("");

  if (!rows) return "";

  return `
    <section class="card collapsible" id="section-stats-totals">
      <div class="card-toggle" onclick="toggleSection('section-stats-totals')" style="display:flex;align-items:center;justify-content:space-between">
        <h2 style="margin:0">Totals</h2>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="totals-toggle" onclick="event.stopPropagation()">
            <button class="totals-toggle-btn is-active" onclick="switchTotalsView('month', this)">This Month</button>
            <button class="totals-toggle-btn" onclick="switchTotalsView('year', this)">This Year</button>
            <button class="totals-toggle-btn" onclick="switchTotalsView('all', this)">All Time</button>
          </div>
          <span class="card-chevron">▾</span>
        </div>
      </div>
      <div class="card-body">
        <div style="display:flex;justify-content:flex-end;margin-bottom:8px" onclick="event.stopPropagation()">
          <div class="totals-unit-toggle">
            <button class="totals-unit-btn is-active" onclick="switchTotalsUnit('time', this)">Time</button>
            <button class="totals-unit-btn" onclick="switchTotalsUnit('distance', this)">Distance</button>
          </div>
        </div>
        <div class="totals-grid">${rows}</div>
      </div>
    </section>`;
}

let _totalsCurrentView = "month";
let _totalsCurrentUnit = "time";

function switchTotalsView(view, btn) {
  _totalsCurrentView = view;
  const section = document.getElementById("section-stats-totals");
  if (!section) return;
  section.querySelectorAll(".totals-toggle-btn").forEach(b => b.classList.remove("is-active"));
  btn.classList.add("is-active");
  _updateTotalsValues(section);
}

function switchTotalsUnit(unit, btn) {
  _totalsCurrentUnit = unit;
  const section = document.getElementById("section-stats-totals");
  if (!section) return;
  section.querySelectorAll(".totals-unit-btn").forEach(b => b.classList.remove("is-active"));
  btn.classList.add("is-active");
  _updateTotalsValues(section);
}

function _updateTotalsValues(section) {
  const view = _totalsCurrentView;
  const unit = _totalsCurrentUnit;

  // In Distance mode, hide rows that don't track distance (strength, HIIT,
  // yoga, etc.). In Time mode, every row is visible.
  section.querySelectorAll(".totals-row").forEach(row => {
    const hasDist = row.dataset.hasDist === "1";
    row.style.display = (unit === "distance" && !hasDist) ? "none" : "";
  });

  // Show an empty message if Distance mode has zero visible rows.
  const grid = section.querySelector(".totals-grid");
  let emptyEl = section.querySelector(".totals-empty-msg");
  if (grid) {
    const anyVisible = !!grid.querySelector('.totals-row:not([style*="display: none"])');
    if (unit === "distance" && !anyVisible) {
      if (!emptyEl) {
        emptyEl = document.createElement("p");
        emptyEl.className = "totals-empty-msg empty-msg";
        emptyEl.textContent = "No distance logged yet. Log a run, ride, or swim to fill this in.";
        grid.appendChild(emptyEl);
      }
      emptyEl.style.display = "";
    } else if (emptyEl) {
      emptyEl.style.display = "none";
    }
  }

  section.querySelectorAll(".totals-value").forEach(el => {
    const hasDist = el.dataset.monthDist;
    if (unit === "distance" && hasDist) {
      el.textContent = view === "all" ? el.dataset.allDist : view === "year" ? el.dataset.yearDist : el.dataset.monthDist;
    } else {
      el.textContent = view === "all" ? el.dataset.all : view === "year" ? el.dataset.year : el.dataset.month;
    }
  });
}

function buildStatsBreakdown(byType, total) {
  const META = {
    weightlifting: { label:"Weight Lifting", icon:ICONS.weights,  color:"var(--color-violet)" },
    bodyweight:    { label:"Bodyweight",     icon:ICONS.activity, color:"var(--color-accent)" },
    hiit:          { label:"HIIT",           icon:ICONS.flame,    color:"var(--color-danger)" },
    running:       { label:"Running",        icon:ICONS.run,      color:"var(--color-amber)"  },
    swimming:      { label:"Swimming",       icon:ICONS.swim,     color:"var(--color-cyan)"   },
    cycling:       { label:"Cycling",        icon:ICONS.bike,     color:"var(--color-teal)"   },
    brick:         { label:"Brick",          icon:ICONS.brick,    color:"var(--color-accent)" },
    stairstepper:  { label:"Stair Stepper",  icon:ICONS.run,      color:"var(--color-amber)"  },
    hyrox:         { label:"Hyrox",          icon:ICONS.flame,    color:"var(--color-danger)" },
    yoga:          { label:"Yoga",           icon:ICONS.activity, color:"var(--color-teal)"   },
    wellness:      { label:"Wellness",       icon:ICONS.activity, color:"var(--color-success)"},
    general:       { label:"General Fitness",icon:ICONS.activity, color:"var(--color-success)"},
    other:         { label:"Other",          icon:ICONS.zap,      color:"var(--color-text-muted)"},
  };
  const body = total === 0
    ? `<p class="empty-msg">No workouts logged yet.</p>`
    : Object.entries(META)
        .filter(([k]) => byType[k] > 0)
        .sort((a,b) => byType[b[0]] - byType[a[0]])
        .map(([k, m]) => {
          const pct = Math.round((byType[k]/total)*100);
          return `
            <div class="breakdown-row">
              <div class="breakdown-label">${m.icon} ${m.label}</div>
              <div class="breakdown-bar-wrap">
                <div class="breakdown-bar" style="width:${pct}%;background:${m.color}"></div>
              </div>
              <div class="breakdown-count">${byType[k]} <span class="breakdown-pct">${pct}%</span></div>
            </div>`;
        }).join("");

  return `
    <section class="card collapsible" id="section-stats-breakdown">
      <div class="card-toggle" onclick="toggleSection('section-stats-breakdown')">
        <h2>Workout Breakdown</h2><span class="card-chevron">▾</span>
      </div>
      <div class="card-body">${body}</div>
    </section>`;
}

// Sport → color/label map for the heatmap cells and the sport legend.
// Keys are normalized workout types (_normalizeType output).
const _HEATMAP_SPORT_COLOR = {
  running:      { color: "var(--color-amber)",   label: "Run"        },
  cycling:      { color: "var(--color-teal)",    label: "Bike"       },
  swimming:     { color: "var(--color-cyan)",    label: "Swim"       },
  weightlifting:{ color: "var(--color-violet)",  label: "Strength"   },
  hiit:         { color: "var(--color-danger)",  label: "HIIT"       },
  triathlon:    { color: "var(--color-cyan)",    label: "Triathlon"  },
  brick:        { color: "var(--color-teal)",    label: "Brick"      },
  hyrox:        { color: "var(--color-danger)",  label: "Hyrox"      },
  yoga:         { color: "var(--color-teal)",    label: "Yoga"       },
  walking:      { color: "var(--color-success)", label: "Walk"       },
  rowing:       { color: "var(--color-teal)",    label: "Row"        },
  hiking:       { color: "var(--color-success)", label: "Hike"       },
  stairstepper: { color: "var(--color-amber)",   label: "Stairs"     },
};
const _HEATMAP_MIXED_COLOR = "var(--color-accent)"; // multi-sport days

// Pick the dominant sport for a day — if multiple workouts share the
// same normalized type, that's the color. If the day had a mix of
// sports, we use the accent color so the user knows at a glance.
function _heatmapDominantSport(dayWorkouts) {
  if (!dayWorkouts || !dayWorkouts.length) return null;
  const types = dayWorkouts.map(w => _normalizeType(w.type));
  const unique = [...new Set(types)];
  if (unique.length === 1) return unique[0];
  return "_mixed";
}

function buildStatsHeatmap(workouts, streaks) {
  // ── Index workouts by date for O(1) cell lookup ───────────────────
  const byDate = {};
  workouts.forEach(w => {
    if (!w.date) return;
    (byDate[w.date] ||= []).push(w);
  });

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayStr = localDateStr(today);
  const year = today.getFullYear();

  // ── Year-to-date summary: totals, active days, sport chips ────────
  const ytdStart = `${year}-01-01`;
  const ytdWorkouts = workouts.filter(w => w.date && w.date >= ytdStart && w.date <= todayStr);
  const ytdCount = ytdWorkouts.length;
  const ytdMinutes = ytdWorkouts.reduce((sum, w) => sum + (_extractWorkoutMinutes(w) || 0), 0);
  const ytdActiveDays = new Set(ytdWorkouts.map(w => w.date)).size;

  const sportCounts = {};
  ytdWorkouts.forEach(w => {
    const t = _normalizeType(w.type);
    sportCounts[t] = (sportCounts[t] || 0) + 1;
  });
  const sportChipOrder = Object.entries(sportCounts).sort((a, b) => b[1] - a[1]);

  // ── Last 4 weeks (formerly the Weekly Activity card) ──────────────
  // Monday-based weeks to match the week strip convention.
  function _weekStartMon(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    const day = x.getDay();
    const shift = day === 0 ? -6 : 1 - day;
    x.setDate(x.getDate() + shift);
    return x;
  }
  const thisWeekStart = _weekStartMon(today);
  const lastWeekStart = new Date(thisWeekStart); lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd   = new Date(thisWeekStart); lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
  const thisWeekStr = localDateStr(thisWeekStart);
  const lastWeekStartStr = localDateStr(lastWeekStart);
  const lastWeekEndStr   = localDateStr(lastWeekEnd);
  const thisWeekCount = workouts.filter(w => w.date >= thisWeekStr && w.date <= todayStr).length;
  const lastWeekCount = workouts.filter(w => w.date >= lastWeekStartStr && w.date <= lastWeekEndStr).length;

  // ── Build the grid ────────────────────────────────────────────────
  // Start on the Sunday on or before Jan 1 so the grid is aligned.
  const jan1 = new Date(year, 0, 1); jan1.setHours(0, 0, 0, 0);
  const startDate = new Date(jan1);
  startDate.setDate(startDate.getDate() - startDate.getDay());

  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));
  const totalWeeks = Math.ceil((endDate - startDate + 1) / (7 * 86400000));
  const recentStartCol = Math.max(0, totalWeeks - 4); // for "last 4 weeks" highlight

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const monthLabels = [];
  let cells = "";
  let lastMonth = -1;
  const d = new Date(startDate);

  for (let w = 0; w < totalWeeks; w++) {
    const m = d.getMonth();
    monthLabels.push(m !== lastMonth ? MONTHS[m] : "");
    lastMonth = m;
    const isRecent = w >= recentStartCol;
    for (let day = 0; day < 7; day++) {
      const ds = localDateStr(d);
      const dayWorkouts = byDate[ds] || [];
      const count = dayWorkouts.length;
      const beforeJan1 = ds < ytdStart;
      const future = ds > todayStr;
      const isToday = ds === todayStr;
      const empty = beforeJan1 || future;

      // Intensity shade driven by workout count (1 / 2 / 3+).
      const shade = empty ? 0 : count === 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : 3;
      const dom = empty ? null : _heatmapDominantSport(dayWorkouts);
      const color = dom === "_mixed"
        ? _HEATMAP_MIXED_COLOR
        : (dom && _HEATMAP_SPORT_COLOR[dom] ? _HEATMAP_SPORT_COLOR[dom].color : null);

      // Opacity ramps with shade so multiple workouts visually stand
      // out even within the same sport color.
      const alpha = shade === 0 ? 0 : shade === 1 ? 0.45 : shade === 2 ? 0.75 : 1;
      const bg = color && alpha > 0
        ? `background: color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent);`
        : "";

      // Tooltip lists the actual workout names so hovering gives
      // context without needing to click.
      const names = dayWorkouts
        .slice(0, 3)
        .map(w => w.sessionName || w.name || w.notes || _normalizeType(w.type))
        .filter(Boolean)
        .join(", ");
      const tip = empty
        ? ""
        : count === 0
          ? ds
          : `${ds} · ${count} workout${count > 1 ? "s" : ""}${names ? " · " + names : ""}${dayWorkouts.length > 3 ? "…" : ""}`;

      // Clickable — jump to this day on the Home calendar.
      const onclick = empty
        ? ""
        : ` onclick="showTab('home');selectDay('${ds}')"`;

      const classes = [
        "heatmap-cell",
        `heat-${shade}`,
        isToday ? "heat-today" : "",
        empty ? "heat-empty" : "",
        isRecent ? "heat-recent" : "",
      ].filter(Boolean).join(" ");

      cells += `<div class="${classes}" style="${bg}" title="${tip}"${onclick}></div>`;
      d.setDate(d.getDate() + 1);
    }
  }

  const monthRow = monthLabels.map(m => `<span class="heatmap-mlabel">${m}</span>`).join("");
  const dayRow   = ["S","M","T","W","T","F","S"].map(l => `<span class="heatmap-dlabel">${l}</span>`).join("");

  // ── Summary stat pills across the top ─────────────────────────────
  const flame = streaks.currentDay > 0 ? ' <span class="heat-summary-flame">🔥</span>' : "";
  const summaryRow = `
    <div class="heat-summary">
      <div class="heat-summary-stat">
        <div class="heat-summary-value">${ytdCount}</div>
        <div class="heat-summary-label">Workouts</div>
      </div>
      <div class="heat-summary-stat">
        <div class="heat-summary-value">${_fmtHours(ytdMinutes)}</div>
        <div class="heat-summary-label">Time</div>
      </div>
      <div class="heat-summary-stat">
        <div class="heat-summary-value">${ytdActiveDays}</div>
        <div class="heat-summary-label">Active days</div>
      </div>
      <div class="heat-summary-stat">
        <div class="heat-summary-value">${streaks.currentDay}${flame}</div>
        <div class="heat-summary-label">Day streak</div>
      </div>
    </div>`;

  // ── Sport legend (replaces the generic Less/More) ─────────────────
  const sportLegend = sportChipOrder.length
    ? `<div class="heat-sport-legend">
         ${sportChipOrder.map(([t, n]) => {
           const meta = _HEATMAP_SPORT_COLOR[t] || { color: _HEATMAP_MIXED_COLOR, label: _totalsLabelFor(t) };
           return `<span class="heat-sport-chip">
                     <span class="heat-sport-dot" style="background:${meta.color}"></span>
                     ${meta.label} <span class="heat-sport-count">${n}</span>
                   </span>`;
         }).join("")}
       </div>`
    : "";

  // ── Recent-weeks footer (replaces the separate Weekly Activity card) ──
  const recentFooter = `
    <div class="heat-recent-row">
      <div class="heat-recent-stat">
        <div class="heat-recent-value">${thisWeekCount}</div>
        <div class="heat-recent-label">This week</div>
      </div>
      <div class="heat-recent-stat">
        <div class="heat-recent-value">${lastWeekCount}</div>
        <div class="heat-recent-label">Last week</div>
      </div>
      <div class="heat-recent-stat">
        <div class="heat-recent-value">${streaks.bestDay}</div>
        <div class="heat-recent-label">Longest streak</div>
      </div>
    </div>`;

  return `
    <section class="card collapsible" id="section-stats-heatmap">
      <div class="card-toggle" onclick="toggleSection('section-stats-heatmap')">
        <h2>Activity</h2><span class="card-chevron">▾</span>
      </div>
      <div class="card-body">
        ${summaryRow}
        <div class="heatmap-scroll">
          <div class="heatmap-wrap">
            <div class="heatmap-dlabels">${dayRow}</div>
            <div class="heatmap-right">
              <div class="heatmap-mrow">${monthRow}</div>
              <div class="heatmap-grid">${cells}</div>
            </div>
          </div>
        </div>
        ${sportLegend}
        ${recentFooter}
      </div>
    </section>`;
}

// buildStatsWeekly was removed — the 4-week bar chart it rendered
// duplicated information already present in the Activity heatmap
// (the rightmost 4 columns) and the summary stats at the top. Its
// "this week / last week" insight now lives in the heatmap card's
// recent-row footer.

function buildStatsStreaks(streaks, workouts) {
  const DAY_NAMES  = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const dowCounts  = getDowCounts(workouts);
  const maxDow     = Math.max(...dowCounts, 1);

  const dowBars = DAY_NAMES.map((name, i) => {
    const pct = Math.round((dowCounts[i]/maxDow)*100);
    return `
      <div class="dow-col">
        <div class="dow-count">${dowCounts[i]||""}</div>
        <div class="dow-track"><div class="dow-fill" style="height:${pct}%"></div></div>
        <div class="dow-label">${name}</div>
      </div>`;
  }).join("");

  const boxes = [
    { val: streaks.currentDay,  label: "Current Day Streak",  sub: "days in a row",  active: streaks.currentDay > 0 },
    { val: streaks.bestDay,     label: "Best Day Streak",     sub: "days in a row",  active: false },
    { val: streaks.currentWeek, label: "Current Week Streak", sub: "weeks in a row", active: streaks.currentWeek > 0 },
    { val: streaks.bestWeek,    label: "Best Week Streak",    sub: "weeks in a row", active: false },
  ].map(r => `
    <div class="streak-box${r.active ? " streak-box--active" : ""}">
      <div class="streak-val">${r.val}${r.active ? ` <span class="streak-flame">${ICONS.flame}</span>` : ""}</div>
      <div class="streak-label">${r.label}</div>
      <div class="streak-sub">${r.sub}</div>
    </div>`).join("");

  return `
    <section class="card collapsible" id="section-stats-streaks">
      <div class="card-toggle" onclick="toggleSection('section-stats-streaks')">
        <h2>Streaks &amp; Patterns</h2><span class="card-chevron">▾</span>
      </div>
      <div class="card-body">
        <div class="streak-grid">${boxes}</div>
        ${workouts.length > 0 ? `
          <div class="section-label"><span>Active Days of the Week</span></div>
          <div class="dow-chart">${dowBars}</div>` : ""}
      </div>
    </section>`;
}

function buildStatsPRs() {
  return `
    <section class="card collapsible" id="section-stats-prs">
      <div class="card-toggle" onclick="toggleSection('section-stats-prs')">
        <h2>Personal Records</h2><span class="card-chevron">▾</span>
      </div>
      <div class="card-body">
        <p class="hint">Log your best times for common distances.</p>
        <div class="pr-entry-row">
          <select id="pr-distance">
            <option value="mile">Mile</option>
            <option value="5k">5K</option>
            <option value="10k">10K</option>
            <option value="half">Half Marathon</option>
            <option value="marathon">Marathon</option>
            <option value="oly-swim">Oly Swim (1500m)</option>
            <option value="oly-bike">Oly Bike (40km)</option>
            <option value="oly-run">Oly Run (10km)</option>
            <option value="im-swim">IM Swim (3.8km)</option>
            <option value="im-bike">IM Bike (180km)</option>
            <option value="im-run">IM Run (42.2km)</option>
          </select>
          <input type="text" id="pr-time" placeholder="e.g. 22:30 or 1:45:00" />
          <button class="btn-primary" onclick="savePR()">Save</button>
        </div>
        <div id="pr-list"></div>
      </div>
    </section>`;
}

// Trophy case of completed races. Replaces the old Next Race card
// that used to live in Stats — the Next Race banner now sits at the
// top of the Training tab via planner.js renderNextRaceBanner(),
// since that's where upcoming-race context actually matters.
// Fixed race distances we can derive pace from. Keyed by race.type — only
// the pure-running distances get a pace line on the trophy card; tris and
// cycling events don't (pace isn't as meaningful across mixed disciplines
// or for shorter/sprint distances).
const _RACE_DISTANCES_MI = {
  marathon:     26.2188,
  halfMarathon: 13.1094,
};

function _formatRunPace(race) {
  const distMi = _RACE_DISTANCES_MI[race?.type];
  if (!distMi) return "";
  const totalSec = _parseTimeToSeconds(race.finishTime);
  if (!totalSec || totalSec <= 0) return "";

  const metric = typeof getMeasurementSystem === "function" && getMeasurementSystem() === "metric";
  const distance = metric ? distMi * 1.609344 : distMi;
  const secPerUnit = totalSec / distance;
  const m = Math.floor(secPerUnit / 60);
  const s = Math.round(secPerUnit - m * 60);
  const pad = n => n.toString().padStart(2, "0");
  const carry = s === 60 ? 1 : 0;
  return `${m + carry}:${pad(s === 60 ? 0 : s)} /${metric ? "km" : "mi"}`;
}

// Map race type → sport-themed inner icon for the trophy badge. Triathlon
// races render as a stacked swim/bike/run triptych so the multisport
// nature reads at a glance.
function _getTrophySportBadge(raceType) {
  const RUN = ["marathon", "halfMarathon", "tenK", "fiveK"];
  const BIKE = ["centuryRide", "granFondo"];
  const TRI = ["ironman", "halfIronman", "olympic", "sprint"];
  const HYROX = ["hyrox", "hyroxDoubles"];

  if (TRI.includes(raceType)) {
    return `<div class="trophy-badge-tri">
      <span>${ICONS.swim}</span>
      <span>${ICONS.bike}</span>
      <span>${ICONS.run}</span>
    </div>`;
  }
  if (RUN.includes(raceType))  return `<div class="trophy-badge-icon">${ICONS.run}</div>`;
  if (BIKE.includes(raceType)) return `<div class="trophy-badge-icon">${ICONS.bike}</div>`;
  if (HYROX.includes(raceType)) return `<div class="trophy-badge-icon">${ICONS.weights}</div>`;
  return `<div class="trophy-badge-icon">${ICONS.trophy || ICONS.flag}</div>`;
}

// Maps a race.type to its broad sport group — used by the trophy-case
// filter dropdown. Keeping this in one place means adding a new race
// type to RACE_CONFIGS only requires a single update here.
const _TROPHY_SPORT_GROUP = {
  marathon: "running", halfMarathon: "running", tenK: "running", fiveK: "running",
  ironman: "triathlon", halfIronman: "triathlon", olympic: "triathlon", sprint: "triathlon",
  centuryRide: "cycling", granFondo: "cycling",
  hyrox: "hyrox", hyroxDoubles: "hyrox",
};

// Trophy case filter state — module-level so rerenders preserve it.
let _trophyFilter = { sport: "all", sort: "newest" };

function _setTrophyFilter(key, value) {
  _trophyFilter = { ..._trophyFilter, [key]: value };
  renderStats();
}

function _shortTrophyDate(dateStr) {
  if (!dateStr) return "";
  // Parse at local noon to avoid TZ rolling the date back.
  const d = new Date(dateStr + "T12:00:00");
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function buildStatsCompletedRaces(events) {
  const today = getTodayString();
  // A race is "completed" when its date is strictly in the past.
  const past = events.filter(e => e.date && e.date < today);

  // "+ Add Race" — covers both past finishes (the trophy case path) and
  // a coach / athlete logging a finish that wasn't on the calendar.
  // Renamed from "Add Past Race" per user feedback so the affordance
  // doesn't read as backfill-only.
  const addBtn = `<button class="btn-secondary" style="font-size:0.78rem;padding:6px 12px" onclick="event.stopPropagation();openPastRaceModal()">+ Add Race</button>`;

  if (!past.length) {
    return `
      <section class="card collapsible" id="section-stats-races-completed">
        <div class="card-toggle" onclick="toggleSection('section-stats-races-completed')">
          <h2>Race Trophy Case</h2><span class="card-chevron">▾</span>
        </div>
        <div class="card-body">
          <p class="empty-msg" style="margin:0 0 12px">
            No completed races yet. Your finishes will show up here.
          </p>
          ${addBtn}
        </div>
      </section>`;
  }

  // Only offer filter pills for sports actually present in the user's
  // trophy case — no point showing a "Cycling" filter if they don't have
  // any cycling finishes yet.
  const presentSports = new Set(past.map(r => _TROPHY_SPORT_GROUP[r.type] || "other"));
  const sportLabel = { running: "Running", triathlon: "Triathlon", cycling: "Cycling", hyrox: "Hyrox", other: "Other" };
  const sportOrder = ["all", "running", "triathlon", "cycling", "hyrox", "other"];
  const sportPills = sportOrder
    .filter(s => s === "all" || presentSports.has(s))
    .map(s => {
      const label = s === "all" ? "All" : sportLabel[s];
      const active = _trophyFilter.sport === s ? " trophy-filter-pill--active" : "";
      return `<button class="trophy-filter-pill${active}" onclick="event.stopPropagation();_setTrophyFilter('sport','${s}')">${label}</button>`;
    })
    .join("");

  const sortOptions = [
    ["newest", "Newest"],
    ["oldest", "Oldest"],
    ["fastest", "Fastest"],
  ].map(([v, l]) => `<option value="${v}" ${_trophyFilter.sort === v ? "selected" : ""}>${l}</option>`).join("");
  const sortSelect = `<select class="trophy-filter-sort" onchange="event.stopPropagation();_setTrophyFilter('sort',this.value)" onclick="event.stopPropagation()">${sortOptions}</select>`;

  // Apply filter
  const filtered = past.filter(r => {
    if (_trophyFilter.sport === "all") return true;
    return (_TROPHY_SPORT_GROUP[r.type] || "other") === _trophyFilter.sport;
  });

  // Apply sort
  filtered.sort((a, b) => {
    if (_trophyFilter.sort === "oldest") return a.date.localeCompare(b.date);
    if (_trophyFilter.sort === "fastest") {
      const as = _parseTimeToSeconds(a.finishTime) || Infinity;
      const bs = _parseTimeToSeconds(b.finishTime) || Infinity;
      return as - bs;
    }
    return b.date.localeCompare(a.date);
  });

  const cards = filtered.map(race => {
    const showTime = race.showFinishTime && race.finishTime;
    const pace = showTime ? _formatRunPace(race) : "";
    const timeHtml = showTime
      ? `<div class="trophy-card-v2-time">${_escapeStatsHtml(race.finishTime)}${pace ? ` <span class="trophy-card-v2-pace">(${_escapeStatsHtml(pace)})</span>` : ""}</div>`
      : "";
    return `
      <div class="trophy-card-v2" title="Click to edit or delete" onclick="openPastRaceModal('${race.id}')">
        <div class="trophy-card-v2-date">${_escapeStatsHtml(_shortTrophyDate(race.date))}</div>
        <div class="trophy-badge">${_getTrophySportBadge(race.type)}</div>
        <div class="trophy-card-v2-name">${_escapeStatsHtml(race.name || "Unnamed race")}</div>
        ${timeHtml}
      </div>`;
  }).join("");

  const emptyFilterMsg = filtered.length === 0
    ? `<p class="empty-msg" style="margin:0">No races match this filter.</p>`
    : "";

  return `
    <section class="card collapsible" id="section-stats-races-completed">
      <div class="card-toggle" onclick="toggleSection('section-stats-races-completed')">
        <h2>Race Trophy Case <span class="trophy-count">${past.length}</span></h2>
        <span class="card-chevron">▾</span>
      </div>
      <div class="card-body" style="gap:12px">
        <div class="trophy-toolbar trophy-toolbar--add-row">${addBtn}</div>
        <div class="trophy-toolbar">
          <div class="trophy-filter-pills">${sportPills}</div>
          ${sortSelect}
        </div>
        ${filtered.length ? `<div class="trophy-case-grid-v2">${cards}</div>` : emptyFilterMsg}
      </div>
    </section>`;
}

// ─── Add Past Race modal ───────────────────────────────────────────────
// Lets the user backfill completed races into the trophy case. Separate
// from the planner "add race" flow because that one requires a future
// date (it generates a training plan). Past races are display-only.

const _TRI_RACE_TYPES = ["ironman", "halfIronman", "olympic", "sprint"];

// Opens the Add / Edit past-race modal. Pass a raceId to edit an existing
// trophy; omit to add a new one. Keeping one function for both paths means
// the field layout, validation, and segment parsing stay in sync.
function openPastRaceModal(raceId) {
  let overlay = document.getElementById("add-past-race-overlay");
  if (overlay) overlay.remove();

  const today = getTodayString();
  const typeOptions = Object.entries(RACE_CONFIGS || {})
    .map(([k, cfg]) => `<option value="${k}">${_escapeStatsHtml(cfg.label || k)}</option>`)
    .join("") + `<option value="other">Other</option>`;

  const editing = !!raceId;
  const existing = editing ? loadEvents().find(e => e.id === raceId) : null;
  if (editing && !existing) return;

  overlay = document.createElement("div");
  overlay.id = "add-past-race-overlay";
  overlay.className = "quick-entry-overlay is-open";
  overlay.style.cssText = "display:flex;z-index:10001";
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

  const title = editing ? "Edit Race" : "Add Past Race";
  const subtitle = editing
    ? "Update or remove this trophy."
    : "Log a completed race for your trophy case.";
  const saveBtnLabel = editing ? "Save Changes" : "Save";
  const deleteBtn = editing
    ? `<button class="btn-danger" style="flex:0 0 auto;padding:10px 14px" onclick="_deletePastRaceFromModal('${raceId}')">Delete</button>`
    : "";

  overlay.innerHTML = `
    <div class="quick-entry-modal" style="max-width:460px;padding:24px">
      <h3 style="margin:0 0 4px">${title}</h3>
      <p style="margin:0 0 16px;color:var(--color-text-muted);font-size:0.82rem">${subtitle}</p>

      <input type="hidden" id="past-race-id" value="${editing ? _escapeStatsHtml(raceId) : ''}" />

      <div class="form-row" style="margin-bottom:10px">
        <label>Race Name</label>
        <input type="text" id="past-race-name" placeholder="e.g. Chicago Marathon 2024" />
      </div>

      <div class="form-grid" style="margin-bottom:10px">
        <div class="form-row">
          <label>Date</label>
          <input type="date" id="past-race-date" max="${today}" />
        </div>
        <div class="form-row">
          <label>Type</label>
          <select id="past-race-type" onchange="_onPastRaceTypeChange()">${typeOptions}</select>
        </div>
      </div>

      <div class="form-row" id="past-race-custom-row" style="display:none;margin-bottom:10px">
        <label>Sport / Distance</label>
        <input type="text" id="past-race-custom-type" placeholder="e.g. Obstacle Course, Trail Run 50K" />
      </div>

      <div class="form-row" style="margin-bottom:10px">
        <label>Location (optional)</label>
        <input type="text" id="past-race-location" placeholder="e.g. Chicago, IL" />
      </div>

      <div id="past-race-time-section" style="margin-bottom:10px"></div>

      <label style="display:flex;align-items:center;gap:8px;font-size:0.85rem;margin-bottom:16px;cursor:pointer">
        <input type="checkbox" id="past-race-show-time" checked />
        Display time under the trophy
      </label>

      <div style="display:flex;gap:8px">
        ${deleteBtn}
        <button class="btn-primary" style="flex:1" onclick="saveAddPastRace()">${saveBtnLabel}</button>
        <button class="btn-secondary" style="flex:1" onclick="document.getElementById('add-past-race-overlay').remove()">Cancel</button>
      </div>
      <p id="past-race-msg" class="save-msg" style="margin-top:8px"></p>
    </div>
  `;

  document.body.appendChild(overlay);

  // Pre-fill values when editing
  if (editing && existing) {
    document.getElementById("past-race-name").value = existing.name || "";
    document.getElementById("past-race-date").value = existing.date || "";
    document.getElementById("past-race-type").value = existing.type || "";
    document.getElementById("past-race-location").value = existing.location || "";
    document.getElementById("past-race-show-time").checked = !!existing.showFinishTime;
  }

  _onPastRaceTypeChange();

  if (editing && existing) {
    if (existing.type === "other" && existing.customType) {
      document.getElementById("past-race-custom-type").value = existing.customType;
    }
    _prefillTimeInputs(existing);
  }
}

// Backwards-compat alias — the old button label called openAddPastRaceModal.
function openAddPastRaceModal() { openPastRaceModal(); }

// Pre-fill time inputs from an existing race record. For tris we can't
// recover per-segment times from just a total, so if segment data exists
// on the record we use it; otherwise we drop the user into total-time
// mode so their old trophies still load cleanly.
function _prefillTimeInputs(race) {
  const isTri = _TRI_RACE_TYPES.includes(race.type);
  if (!isTri) {
    const el = document.getElementById("past-race-time");
    if (el) el.value = race.finishTime || "";
    return;
  }

  const hasSegments = race.segments && (
    race.segments.swim || race.segments.bike || race.segments.run ||
    race.segments.t1 || race.segments.t2
  );
  if (hasSegments) {
    _setTriMode("segments");
    const s = race.segments;
    if (document.getElementById("past-race-swim")) document.getElementById("past-race-swim").value = s.swim || "";
    if (document.getElementById("past-race-t1"))   document.getElementById("past-race-t1").value   = s.t1 || "";
    if (document.getElementById("past-race-bike")) document.getElementById("past-race-bike").value = s.bike || "";
    if (document.getElementById("past-race-t2"))   document.getElementById("past-race-t2").value   = s.t2 || "";
    if (document.getElementById("past-race-run"))  document.getElementById("past-race-run").value  = s.run || "";
  } else {
    _setTriMode("total");
    const el = document.getElementById("past-race-time");
    if (el) el.value = race.finishTime || "";
  }
}

function _onPastRaceTypeChange() {
  const type = document.getElementById("past-race-type")?.value;
  const timeSection = document.getElementById("past-race-time-section");
  const customRow = document.getElementById("past-race-custom-row");
  if (!timeSection) return;

  if (customRow) customRow.style.display = type === "other" ? "" : "none";

  if (_TRI_RACE_TYPES.includes(type)) {
    _setTriMode("segments");
  } else {
    timeSection.innerHTML = `
      <div class="form-row">
        <label>Finish Time</label>
        <input type="text" id="past-race-time" placeholder="e.g. 3:45:12 or 22:30" />
      </div>
    `;
  }
}

// Render either the full segment grid (Swim/T1/Bike/T2/Run) or a single
// total-time input for triathlon races, and wire the mode toggle.
//
// Preserves any values the user has already typed across toggles so
// Total → Segments → Total doesn't wipe the finish time.
function _setTriMode(mode) {
  const timeSection = document.getElementById("past-race-time-section");
  if (!timeSection) return;

  const cache = (_setTriMode._cache ||= { time: "", swim: "", t1: "", bike: "", t2: "", run: "" });
  const pick = id => document.getElementById(id)?.value ?? "";
  if (document.getElementById("past-race-time")) cache.time = pick("past-race-time");
  if (document.getElementById("past-race-swim")) {
    cache.swim = pick("past-race-swim");
    cache.t1   = pick("past-race-t1");
    cache.bike = pick("past-race-bike");
    cache.t2   = pick("past-race-t2");
    cache.run  = pick("past-race-run");
  }

  const esc = s => String(s).replace(/"/g, "&quot;");
  const toggleRow = `
    <div class="tri-mode-toggle" style="display:flex;gap:6px;margin-bottom:8px">
      <button type="button" class="btn-secondary" style="flex:1;font-size:0.78rem;padding:5px 10px${mode === 'segments' ? ';background:var(--color-accent,#f59e0b);color:#fff;border-color:transparent' : ''}" onclick="_setTriMode('segments')">By segment</button>
      <button type="button" class="btn-secondary" style="flex:1;font-size:0.78rem;padding:5px 10px${mode === 'total' ? ';background:var(--color-accent,#f59e0b);color:#fff;border-color:transparent' : ''}" onclick="_setTriMode('total')">Total only</button>
    </div>
  `;

  if (mode === "total") {
    // If switching from segments with values but no prior total, compute one
    // so the finish-time field isn't unexpectedly blank.
    let totalVal = cache.time;
    if (!totalVal) {
      const segTotal = ["swim","t1","bike","t2","run"]
        .reduce((sum, k) => {
          const s = _parseTimeToSeconds(cache[k]);
          return s == null ? sum : sum + s;
        }, 0);
      if (segTotal > 0) totalVal = _formatSecondsToTime(segTotal);
    }
    timeSection.innerHTML = `
      ${toggleRow}
      <div class="form-row">
        <label>Finish Time</label>
        <input type="text" id="past-race-time" placeholder="e.g. 9:45:12" value="${esc(totalVal)}" />
      </div>
    `;
    return;
  }

  timeSection.innerHTML = `
    ${toggleRow}
    <label style="font-size:0.82rem;color:var(--color-text-muted);margin-bottom:4px;display:block">Segment Times</label>
    <div class="form-grid" style="grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:6px">
      <div class="form-row">
        <label style="font-size:0.72rem">Swim</label>
        <input type="text" id="past-race-swim" placeholder="mm:ss" value="${esc(cache.swim)}" />
      </div>
      <div class="form-row">
        <label style="font-size:0.72rem">T1</label>
        <input type="text" id="past-race-t1" placeholder="mm:ss" value="${esc(cache.t1)}" />
      </div>
      <div class="form-row">
        <label style="font-size:0.72rem">Bike</label>
        <input type="text" id="past-race-bike" placeholder="h:mm:ss" value="${esc(cache.bike)}" />
      </div>
    </div>
    <div class="form-grid" style="grid-template-columns:1fr 1fr;gap:8px">
      <div class="form-row">
        <label style="font-size:0.72rem">T2</label>
        <input type="text" id="past-race-t2" placeholder="mm:ss" value="${esc(cache.t2)}" />
      </div>
      <div class="form-row">
        <label style="font-size:0.72rem">Run</label>
        <input type="text" id="past-race-run" placeholder="h:mm:ss" value="${esc(cache.run)}" />
      </div>
    </div>
    <p style="font-size:0.72rem;color:var(--color-text-muted);margin:6px 0 0">Total time includes transitions and is computed automatically.</p>
  `;
}

function _deletePastRaceFromModal(id) {
  if (!confirm("Remove this race from your trophy case?")) return;
  const events = loadEvents().filter(e => e.id !== id);
  saveEvents(events);
  document.getElementById("add-past-race-overlay")?.remove();
  renderStats();
}

// Parse "h:mm:ss" / "mm:ss" / "ss" → total seconds. Returns null on invalid.
function _parseTimeToSeconds(str) {
  if (!str) return null;
  const s = String(str).trim();
  if (!s) return null;
  const parts = s.split(":").map(p => p.trim());
  if (parts.some(p => p === "" || !/^\d+(\.\d+)?$/.test(p))) return null;
  const nums = parts.map(Number);
  if (nums.length === 1) return nums[0];
  if (nums.length === 2) return nums[0] * 60 + nums[1];
  if (nums.length === 3) return nums[0] * 3600 + nums[1] * 60 + nums[2];
  return null;
}

function _formatSecondsToTime(secs) {
  if (secs == null || !isFinite(secs) || secs < 0) return "";
  const total = Math.round(secs);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = n => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function saveAddPastRace() {
  const msg = document.getElementById("past-race-msg");
  const showErr = t => { if (msg) { msg.textContent = t; msg.style.color = "var(--color-danger, #dc2626)"; } };
  if (msg) msg.textContent = "";

  const raceId = document.getElementById("past-race-id")?.value || "";
  const name = document.getElementById("past-race-name")?.value.trim();
  const date = document.getElementById("past-race-date")?.value;
  const type = document.getElementById("past-race-type")?.value;
  const location = document.getElementById("past-race-location")?.value.trim();
  const showFinishTime = !!document.getElementById("past-race-show-time")?.checked;

  if (!name) return showErr("Please enter a race name.");
  if (!date) return showErr("Please enter a race date.");
  const today = getTodayString();
  if (date > today) return showErr("Past races must be dated on or before today.");
  if (!type) return showErr("Please select a race type.");

  let customType = "";
  if (type === "other") {
    customType = document.getElementById("past-race-custom-type")?.value.trim() || "";
    if (!customType) return showErr("Please describe the race.");
  }

  let finishTime = "";
  let segments = null;
  const isTri = _TRI_RACE_TYPES.includes(type);
  // In tri mode, the segment grid and the total-only input share the same
  // container — presence of #past-race-swim tells us which is currently up.
  const inSegmentMode = isTri && !!document.getElementById("past-race-swim");

  if (inSegmentMode) {
    const fields = [
      ["swim", "Swim"],
      ["t1",   "T1"],
      ["bike", "Bike"],
      ["t2",   "T2"],
      ["run",  "Run"],
    ];
    const vals = {};
    let totalSecs = 0;
    let anyEntered = false;
    for (const [key, label] of fields) {
      const raw = document.getElementById(`past-race-${key}`)?.value.trim() || "";
      if (!raw) continue;
      const secs = _parseTimeToSeconds(raw);
      if (secs == null) return showErr(`${label} time format looks off (use mm:ss or h:mm:ss).`);
      vals[key] = raw;
      totalSecs += secs;
      anyEntered = true;
    }
    if (anyEntered) {
      segments = vals;
      finishTime = _formatSecondsToTime(totalSecs);
    } else if (showFinishTime) {
      return showErr("Enter at least one segment time, switch to Total only, or uncheck 'Display time'.");
    }
  } else {
    const timeStr = document.getElementById("past-race-time")?.value.trim();
    if (timeStr) {
      if (_parseTimeToSeconds(timeStr) == null) return showErr("Time format looks off (use h:mm:ss or mm:ss).");
      finishTime = _formatSecondsToTime(_parseTimeToSeconds(timeStr));
    } else if (showFinishTime) {
      return showErr("Enter a finish time or uncheck 'Display time'.");
    }
  }

  const events = loadEvents();
  const existing = raceId ? events.find(e => e.id === raceId) : null;

  const race = {
    id: raceId || Date.now().toString(),
    name,
    type,
    date,
    priority: existing?.priority || "B",
    level: existing?.level || "intermediate",
    isPastRace: true,
    createdAt: existing?.createdAt || new Date().toISOString(),
    ...(location && { location }),
    ...(customType && { customType }),
    ...(finishTime && { finishTime }),
    ...(segments && { segments }),
    showFinishTime,
  };

  const next = events.filter(e => e.id !== race.id);
  next.push(race);
  saveEvents(next);

  document.getElementById("add-past-race-overlay")?.remove();
  renderStats();
}

// Local HTML-escape helper so the trophy-case renderer doesn't depend
// on an imported sanitizer from elsewhere in the app.
function _escapeStatsHtml(str) {
  const d = document.createElement("div");
  d.textContent = str == null ? "" : String(str);
  return d.innerHTML;
}

function buildStatsNutrition(meals) {
  if (typeof isNutritionEnabled === "function" && !isNutritionEnabled()) return "";
  const cutoff  = new Date(); cutoff.setDate(cutoff.getDate()-30);
  const recent  = meals.filter(m => m.date >= localDateStr(cutoff) && m.source !== "generated");
  const tracked = new Set(recent.map(m => m.date)).size;
  if (!tracked) return "";

  const sum = recent.reduce((a,m) => ({
    calories: a.calories+(m.calories||0), protein: a.protein+(m.protein||0),
    carbs:    a.carbs+(m.carbs||0),       fat:     a.fat+(m.fat||0),
  }), {calories:0,protein:0,carbs:0,fat:0});

  const avg = {
    calories: Math.round(sum.calories/tracked), protein: Math.round(sum.protein/tracked),
    carbs:    Math.round(sum.carbs/tracked),    fat:     Math.round(sum.fat/tracked),
  };
  return `
    <section class="card collapsible" id="section-stats-nutrition">
      <div class="card-toggle" onclick="toggleSection('section-stats-nutrition')">
        <h2>Nutrition Averages</h2><span class="card-chevron">▾</span>
      </div>
      <div class="card-body">
        <p class="hint">Daily averages over the last 30 days (${tracked} tracked days).</p>
        <div class="macro-summary">
          <div class="macro-box"><div class="macro-value">${avg.calories}</div><div class="macro-label">Calories</div></div>
          <div class="macro-box"><div class="macro-value">${avg.protein}g</div><div class="macro-label">Protein</div></div>
          <div class="macro-box"><div class="macro-value">${avg.carbs}g</div><div class="macro-label">Carbs</div></div>
          <div class="macro-box"><div class="macro-value">${avg.fat}g</div><div class="macro-label">Fat</div></div>
        </div>
      </div>
    </section>`;
}

/* ─── PR Estimator ─────────────────────────────────────────────────────── */

function buildPREstimator() {
  return `
    <section class="card collapsible is-collapsed" id="section-pr-estimator">
      <div class="card-toggle" onclick="toggleSection('section-pr-estimator')">
        <h2>PR Estimator</h2><span class="card-chevron">▾</span>
      </div>
      <div class="card-body">
        <p class="hint">Estimate your max from a known lift or predict race times from a reference.</p>
        <div class="form-row" style="margin-bottom:12px">
          <label>Estimate Type</label>
          <select id="pre-mode" onchange="preUpdateForm()">
            <option value="strength">Strength (1RM / Rep Max)</option>
            <option value="running">Running (Race Prediction)</option>
          </select>
        </div>
        <div id="pre-form"></div>
        <div id="pre-results"></div>
      </div>
    </section>`;
}

function preUpdateForm() {
  const mode = document.getElementById("pre-mode")?.value || "strength";
  const form = document.getElementById("pre-form");
  const results = document.getElementById("pre-results");
  if (!form) return;
  results.innerHTML = "";

  if (mode === "strength") {
    form.innerHTML = `
      <div class="pre-info-box">
        <span class="pre-info-icon">?</span>
        <span>This works for any exercise — bench, squat, deadlift, etc. The formula uses only weight and reps to estimate your max.</span>
      </div>
      <div class="form-row">
        <label>Weight Lifted</label>
        <input type="number" id="pre-weight" placeholder="e.g. 225" min="1" />
      </div>
      <div class="form-row">
        <label>Reps Completed</label>
        <input type="number" id="pre-reps" placeholder="e.g. 10" min="1" max="30" />
      </div>
      <button class="btn-primary" onclick="preCalcStrength()" style="margin-top:8px">Estimate</button>`;
  } else {
    const isMetric = typeof getMeasurementSystem === "function" && getMeasurementSystem() === "metric";
    form.innerHTML = `
      <div class="form-row">
        <label>Reference Distance</label>
        <select id="pre-ref-dist">
          ${isMetric
            ? `<option value="1.609">1 km</option>
               <option value="5">5K</option>
               <option value="10" selected>10K</option>
               <option value="21.1">Half Marathon</option>
               <option value="42.2">Marathon</option>`
            : `<option value="1.609">1 Mile</option>
               <option value="5">5K</option>
               <option value="10" selected>10K</option>
               <option value="21.1">Half Marathon</option>
               <option value="42.2">Marathon</option>`}
        </select>
      </div>
      <div class="form-row">
        <label>Your Time (mm:ss)</label>
        <input type="text" id="pre-ref-time" placeholder="e.g. 48:30" />
      </div>
      <button class="btn-primary" onclick="preCalcRunning()" style="margin-top:8px">Estimate</button>`;
  }
}

function preCalcStrength() {
  const weight = parseFloat(document.getElementById("pre-weight")?.value);
  const reps   = parseInt(document.getElementById("pre-reps")?.value);
  const out    = document.getElementById("pre-results");
  if (!out || !weight || !reps || reps < 1) { if (out) out.innerHTML = `<p class="hint" style="color:var(--color-danger)">Enter weight and reps.</p>`; return; }

  const isMetric = typeof getMeasurementSystem === "function" && getMeasurementSystem() === "metric";
  const unit = isMetric ? "kg" : "lbs";
  const step = isMetric ? 2 : 5;

  // Epley formula: 1RM = w × (1 + r/30)
  const oneRM = weight * (1 + reps / 30);

  // Estimate rep maxes using inverse Epley: w = 1RM / (1 + r/30)
  const targets = [1, 2, 3, 5, 8, 10, 12, 15, 20];
  const rows = targets.map(r => {
    const est = r === 1 ? oneRM : oneRM / (1 + r / 30);
    const rounded = Math.round(est / step) * step;
    const isInput = (r === reps);
    return `<tr${isInput ? ' style="font-weight:700"' : ""}>
      <td>${r} rep${r > 1 ? "s" : ""}</td>
      <td>${rounded} ${unit}</td>
    </tr>`;
  }).join("");

  out.innerHTML = `
    <div class="section-label" style="margin-top:14px"><span>Estimated Maxes</span></div>
    <table class="exercise-table pre-table">
      <thead><tr><th>Rep Range</th><th>Estimated Weight</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="hint" style="margin-top:8px">Based on the Epley formula. Estimates are most accurate for 1-10 reps.</p>`;
}

function preCalcRunning() {
  const refDistKm = parseFloat(document.getElementById("pre-ref-dist")?.value);
  const timeStr   = (document.getElementById("pre-ref-time")?.value || "").trim();
  const out       = document.getElementById("pre-results");
  if (!out) return;

  const isMetric = typeof getMeasurementSystem === "function" && getMeasurementSystem() === "metric";

  // Parse mm:ss or hh:mm:ss
  const parts = timeStr.split(":").map(Number);
  let refSec = 0;
  if (parts.length === 2) refSec = parts[0] * 60 + parts[1];
  else if (parts.length === 3) refSec = parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (!refDistKm || !refSec || refSec <= 0) { out.innerHTML = `<p class="hint" style="color:var(--color-danger)">Enter a valid distance and time.</p>`; return; }

  // Riegel formula: T2 = T1 × (D2/D1)^1.06  (all distances in km)
  const distances = [
    { label: isMetric ? "1 km" : "1 Mile", km: 1.609 },
    { label: "5K", km: 5 },
    { label: "10K", km: 10 },
    { label: "Half Marathon", km: 21.1 },
    { label: "Marathon", km: 42.2 },
  ];

  const paceUnit = isMetric ? "km" : "mi";
  const rows = distances.map(d => {
    const estSec = refSec * Math.pow(d.km / refDistKm, 1.06);
    const isRef = Math.abs(d.km - refDistKm) < 0.01;
    const paceDist = isMetric ? d.km : (d.km / 1.60934);
    return `<tr${isRef ? ' style="font-weight:700"' : ""}>
      <td>${d.label}</td>
      <td>${_fmtSec(estSec)}</td>
      <td>${_fmtPace(estSec, paceDist)}</td>
    </tr>`;
  }).join("");

  out.innerHTML = `
    <div class="section-label" style="margin-top:14px"><span>Predicted Times</span></div>
    <table class="exercise-table pre-table">
      <thead><tr><th>Distance</th><th>Predicted Time</th><th>Pace / ${paceUnit}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="hint" style="margin-top:8px">Based on the Riegel formula. Best for aerobic distances (5K+).</p>`;
}

function _fmtSec(totalSec) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.round(totalSec % 60);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2,"0")}:${ss}` : `${m}:${ss}`;
}

function _fmtPace(totalSec, miles) {
  const paceSec = totalSec / miles;
  const m = Math.floor(paceSec / 60);
  const s = Math.round(paceSec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/* ─── Duration extraction ──────────────────────────────────────────────── */

function _extractWorkoutMinutes(w) {
  // Directly stored duration (manual cardio log)
  if (w.duration) return parseInt(w.duration) || 0;
  // Generated session attached to a logged workout
  if (w.generatedSession?.duration) return parseInt(w.generatedSession.duration) || 0;
  // Scheduled running session: look up by discipline + load (rotates by weekNumber if variants exist)
  if (w.discipline && w.load) {
    const s = (typeof getSessionTemplate === "function")
      ? getSessionTemplate(w.discipline, w.load, w.weekNumber)
      : ((typeof SESSION_DESCRIPTIONS !== "undefined") ? (SESSION_DESCRIPTIONS[w.discipline] || {})[w.load] : null);
    if (s?.duration) return s.duration;
  }
  return 0;
}

function _fmtMinutes(min) {
  if (!min) return "";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/* ─── Loads scheduled sessions with past dates as "completed" ──────────── */

function loadCompletedSessions() {
  const today  = getTodayString();
  let logged   = [];
  try { logged = JSON.parse(localStorage.getItem("workouts")) || []; } catch {}

  // Past/today only
  const past = logged.filter(w => w.date <= today);

  // Hand-logged workouts (no isCompletion flag) — always counted
  const handLogged = past.filter(w => !w.isCompletion);

  // Dedup key: date + type. If a hand-logged workout exists for a (date, type),
  // any matching isCompletion record is considered a duplicate and skipped.
  const handLoggedKeys = new Set(handLogged.map(w => `${w.date}|${w.type}`));

  // Include completion records (from live tracker or day-detail save form)
  // ONLY when there's no matching hand-logged workout for the same date+type.
  // This preserves live-tracker / scheduled-session completions in stats without
  // double-counting manual logs.
  const standaloneCompletions = past.filter(w =>
    w.isCompletion && !handLoggedKeys.has(`${w.date}|${w.type}`)
  );

  return [...handLogged, ...standaloneCompletions]
    .map(w => ({ id: w.id, date: w.date, type: w.type, minutes: _extractWorkoutMinutes(w) }));
}

/* ─── Plan Consistency ─────────────────────────────────────────────────── */

// One-time cleanup: remove trainingPlan entries whose raceId points to a
// race that's either no longer in localStorage.events or has a date in the
// past. Over time, deleting or completing a race leaves stale plan rows
// around — they don't show up in any UI but do skew stats. Exposed on
// window so the user can run it from devtools when needed.
//
// Usage: `cleanupStaleTrainingPlanEntries()` → logs how many rows removed.
function cleanupStaleTrainingPlanEntries(opts) {
  opts = opts || {};
  const dryRun = !!opts.dryRun;
  const today = (typeof getTodayString === "function") ? getTodayString() : new Date().toISOString().slice(0, 10);
  let events = [];
  let plan = [];
  try { events = JSON.parse(localStorage.getItem("events") || "[]"); } catch {}
  try { plan   = JSON.parse(localStorage.getItem("trainingPlan") || "[]"); } catch {}
  const activeRaceIds = new Set(
    events
      .filter(e => e && e.id && String(e.date || "").slice(0, 10) >= today)
      .map(e => String(e.id))
  );
  const before = plan.length;
  const kept = plan.filter(p => {
    if (!p || !p.raceId) return true; // no race association — keep
    return activeRaceIds.has(String(p.raceId));
  });
  const removed = before - kept.length;
  if (removed > 0 && !dryRun) {
    localStorage.setItem("trainingPlan", JSON.stringify(kept));
    if (typeof DB !== "undefined" && DB.syncKey) DB.syncKey("trainingPlan");
    if (typeof renderCalendar === "function") renderCalendar();
  }
  console.log(`[IronZ] cleanupStaleTrainingPlanEntries: ${dryRun ? "would remove" : "removed"} ${removed} of ${before} entries (kept ${kept.length} tied to upcoming races).`);
  return { before, after: kept.length, removed, activeRaceIds: [...activeRaceIds] };
}
if (typeof window !== "undefined") window.cleanupStaleTrainingPlanEntries = cleanupStaleTrainingPlanEntries;

function buildStatsPlanConsistency() {
  const today = getTodayString();
  let completionMeta = {};
  try { completionMeta = JSON.parse(localStorage.getItem("completedSessions") || "{}"); } catch {}

  let schedule = [];
  try { schedule = JSON.parse(localStorage.getItem("workoutSchedule") || "[]"); } catch {}

  let plan = [];
  try { plan = JSON.parse(localStorage.getItem("trainingPlan") || "[]"); } catch {}

  let logged = [];
  try { logged = JSON.parse(localStorage.getItem("workouts") || "[]"); } catch {}
  const completedSessionIds = new Set();
  logged.forEach(w => {
    if (w.isCompletion && w.completedSessionId) completedSessionIds.add(w.completedSessionId);
  });

  // A session counts in the denominator when it SHOULD have been trained
  // already: date strictly before today, OR (date === today AND completed).
  // Future dates never count. Normalize date fields via slice(0,10) so an
  // ISO timestamp ("2026-04-19T00:00:00Z") compares correctly against the
  // local-date "today" string.
  const _dateKey = (d) => String(d || "").slice(0, 10);

  // Drop sessions that aren't real trainable slots:
  //   - rest-day placeholders (load === "rest" or discipline === "rest")
  //   - scheduled workoutSchedule entries that share a date with a
  //     trainingPlan entry (race plan covers the same day — the race plan
  //     is the source of truth per the unified-plan model, so counting
  //     both double-counts the athlete's workload)
  const planDates = new Set(plan.map(p => _dateKey(p.date)));

  const _isRestEntry = (e) => {
    if (!e) return true;
    if (e.load === "rest") return true;
    if (e.discipline === "rest") return true;
    if (e.type === "rest") return true;
    return false;
  };
  // Coalesce discipline variants into broad type buckets so the breakdown
  // table doesn't fragment into "easy_recovery" / "run" / "running" rows.
  // Run / bike / swim / strength / brick are the real buckets.
  const _normalizeType = (e) => {
    const raw = String(e.discipline || e.type || "general").toLowerCase();
    if (raw === "running" || raw.startsWith("run") || raw === "easy_recovery" || raw === "long_run" || raw === "tempo_threshold") return "run";
    if (raw === "cycling" || raw.startsWith("bike")) return "bike";
    if (raw === "swimming" || raw.startsWith("swim")) return "swim";
    if (raw === "weightlifting" || raw === "bodyweight" || raw === "strength") return "strength";
    if (raw === "brick") return "brick";
    if (raw === "hyrox") return "hyrox";
    return raw;
  };

  const byType = {};
  function ensure(type) { if (!byType[type]) byType[type] = { planned: 0, completed: 0 }; }

  // Diagnostic trace: every counted row is pushed here so the user can
  // inspect window._ironzLastConsistencyTrace in devtools to see exactly
  // which dates got tallied. The inflated-denominator bug is almost always
  // a stale-plan-entry issue — this surfaces them.
  const _trace = [];

  // Build the set of raceIds that are still RELEVANT: race is in the
  // events table AND hasn't finished yet. Plan entries tied to a past or
  // deleted race represent history, not "missed" training — skip them.
  // A user who raced Ironman Austria a year ago shouldn't see those old
  // plan dates counted against their current consistency.
  let events = [];
  try { events = JSON.parse(localStorage.getItem("events") || "[]"); } catch {}
  const activeRaceIds = new Set(
    events
      .filter(e => e && e.id && _dateKey(e.date) >= today)
      .map(e => String(e.id))
  );

  // trainingPlan first — it's the source of truth for race-plan-driven
  // athletes. workoutSchedule dates that overlap get skipped below.
  plan.forEach(p => {
    if (_isRestEntry(p)) return;
    const date = _dateKey(p.date);
    if (!date) return;
    // Skip entries whose race has passed or been deleted.
    if (p.raceId && !activeRaceIds.has(String(p.raceId))) return;
    const sessionId = `session-plan-${p.date}-${p.raceId}`;
    const isCompleted = !!(completionMeta[sessionId] || completedSessionIds.has(sessionId));
    if (date < today || (date === today && isCompleted)) {
      const type = _normalizeType(p);
      ensure(type);
      byType[type].planned++;
      if (isCompleted) byType[type].completed++;
      _trace.push({ source: "trainingPlan", date, type, load: p.load, raceId: p.raceId, phase: p.phase, weekNumber: p.weekNumber, sessionName: p.sessionName, completed: isCompleted });
    }
  });

  schedule.forEach(w => {
    if (_isRestEntry(w)) return;
    const date = _dateKey(w.date);
    if (!date) return;
    // Deduplicate: if the race plan already covers this date, skip the
    // build-plan entry rather than double-count. Pre-unified-plan users
    // can have both collections populated at once.
    if (planDates.has(date)) return;
    const sessionId = `session-sw-${w.id}`;
    const isCompleted = !!(completionMeta[sessionId] || completedSessionIds.has(sessionId));
    if (date < today || (date === today && isCompleted)) {
      const type = _normalizeType(w);
      ensure(type);
      byType[type].planned++;
      if (isCompleted) byType[type].completed++;
      _trace.push({ source: "workoutSchedule", date, type, load: w.load, planId: w.planId, source_tag: w.source, sessionName: w.sessionName, id: w.id, completed: isCompleted });
    }
  });

  // Expose the trace so devtools can inspect exactly which sessions were
  // counted: `window._ironzLastConsistencyTrace.forEach(r => console.log(r))`.
  // A bar of the earliest counted date is an instant "plan has entries from
  // weeks ago" or "workoutSchedule wasn't cleared" signal.
  if (typeof window !== "undefined") {
    window._ironzLastConsistencyTrace = _trace.slice().sort((a, b) => a.date.localeCompare(b.date));
    if (_trace.length > 0) {
      const dates = _trace.map(r => r.date).sort();
      console.log(`[IronZ] plan-consistency counted ${_trace.length} sessions across ${dates[0]} → ${dates[dates.length - 1]}. Inspect window._ironzLastConsistencyTrace for detail.`);
    }
  }

  // Calculate overall
  let totalPlanned = 0, totalCompleted = 0;
  Object.values(byType).forEach(v => { totalPlanned += v.planned; totalCompleted += v.completed; });

  if (totalPlanned === 0) return "";

  const overallPct = Math.round((totalCompleted / totalPlanned) * 100);

  function _grade(pct) {
    if (pct >= 90) return { label: "Excellent", color: "var(--color-success)", bg: "rgba(34, 197, 94, 0.12)" };
    if (pct >= 75) return { label: "Good",      color: "var(--color-cyan)",    bg: "rgba(34, 211, 238, 0.12)" };
    if (pct >= 50) return { label: "Fair",       color: "var(--color-amber)",   bg: "rgba(245, 158, 11, 0.12)" };
    return                { label: "Needs Work", color: "var(--color-danger)",  bg: "rgba(248, 113, 113, 0.12)" };
  }

  const overall = _grade(overallPct);

  const TYPE_META = {
    weightlifting: { label: "Strength",   icon: ICONS.weights },
    bodyweight:    { label: "Bodyweight", icon: ICONS.activity },
    running:       { label: "Running",    icon: ICONS.run },
    cycling:       { label: "Cycling",    icon: ICONS.bike },
    swimming:      { label: "Swimming",   icon: ICONS.swim },
    swim:          { label: "Swimming",   icon: ICONS.swim },
    run:           { label: "Running",    icon: ICONS.run },
    bike:          { label: "Cycling",    icon: ICONS.bike },
    triathlon:     { label: "Triathlon",  icon: ICONS.swim },
    brick:         { label: "Brick",      icon: ICONS.zap },
    stairstepper:  { label: "Stair Stepper", icon: ICONS.run },
    hyrox:         { label: "Hyrox",      icon: ICONS.flame },
    yoga:          { label: "Yoga",       icon: ICONS.yoga || ICONS.activity },
    wellness:      { label: "Wellness",   icon: ICONS.activity },
    general:       { label: "General",    icon: ICONS.activity },
    hiit:          { label: "HIIT",       icon: ICONS.flame },
  };

  const typeRows = Object.entries(byType)
    .filter(([, v]) => v.planned > 0)
    .sort((a, b) => b[1].planned - a[1].planned)
    .map(([type, v]) => {
      const pct = Math.round((v.completed / v.planned) * 100);
      const g = _grade(pct);
      const meta = TYPE_META[type] || { label: type.charAt(0).toUpperCase() + type.slice(1), icon: ICONS.activity };
      return `<div class="consistency-row">
        <span class="consistency-icon">${meta.icon}</span>
        <span class="consistency-label">${meta.label}</span>
        <div class="consistency-bar-wrap">
          <div class="consistency-bar" style="width:${pct}%;background:${g.color}"></div>
        </div>
        <span class="consistency-pct" style="color:${g.color}">${pct}%</span>
        <span class="consistency-count">${v.completed}/${v.planned}</span>
      </div>`;
    }).join("");

  return `
    <section class="card collapsible" id="section-stats-consistency">
      <div class="card-toggle" onclick="toggleSection('section-stats-consistency')">
        <h2>Plan Consistency</h2><span class="card-chevron">▾</span>
      </div>
      <div class="card-body">
        <div class="consistency-overall" style="background:${overall.bg};border-left:4px solid ${overall.color}">
          <div class="consistency-overall-pct" style="color:${overall.color}">${overallPct}%</div>
          <div class="consistency-overall-meta">
            <div class="consistency-overall-label" style="color:${overall.color}">${overall.label}</div>
            <div class="consistency-overall-desc">${totalCompleted} of ${totalPlanned} sessions completed</div>
          </div>
        </div>
        ${typeRows}
      </div>
    </section>`;
}

/* ─── Hydration Stats ─────────────────────────────────────────────────── */

function buildStatsHydration() {
  if (typeof isHydrationEnabled === "function" && !isHydrationEnabled()) return "";

  const log = (typeof getHydrationLog === "function") ? getHydrationLog() : {};
  const bottleSize = (typeof getBottleSize === "function") ? getBottleSize() : 12;
  // Per-day target lookup. Each historical day has its own goalpost
  // (set when that day's session+race context was current and frozen
  // at boot via freezePastHydrationTargets). Without this lookup the
  // stats panel held every day to TODAY's target — a long-run day's
  // 130-oz target would brand every prior rest day as "missed", and
  // a rest day's 80-oz target would inflate every prior long-run day's
  // hit rate. Today still live-computes via getHydrationBreakdownForDate.
  const todayKey = (typeof getTodayString === "function") ? getTodayString() : (new Date()).toISOString().slice(0, 10);
  const _targetOzFor = (d) => {
    if (typeof getHydrationBreakdownForDate === "function") {
      try {
        const b = getHydrationBreakdownForDate(d);
        if (b && b.totalOz) return b.totalOz;
      } catch {}
    }
    if (typeof getHydrationTarget === "function") return getHydrationTarget();
    return 96;
  };
  // Today's target drives the chart-axis scaling + summary card label.
  const targetOz = _targetOzFor(todayKey);

  // Helper: extract bottle count from log entry (supports old number & new object format)
  const _hb = (entry) => (typeof getLogBottles === "function") ? getLogBottles(entry) : (typeof entry === "number" ? entry : (entry && entry.total) || 0);
  // Logged effective oz for a day. Matches the hydration card's
  // displayed "X / Y oz" exactly (per-beverage coefficients applied,
  // mixed bottle sizes summed precisely). Falls back to raw bottle×size
  // only if the helper isn't available.
  const _ozOn = (d) => (typeof getEffectiveOzForDate === "function")
    ? getEffectiveOzForDate(d)
    : _hb(log[d]) * bottleSize;

  const loggedDates = Object.keys(log).filter(d => _hb(log[d]) > 0).sort();
  if (loggedDates.length === 0) {
    return `
      <section class="card collapsible" id="section-stats-hydration">
        <div class="card-toggle" onclick="toggleSection('section-stats-hydration')">
          <h2>Hydration</h2><span class="card-chevron">&#9662;</span>
        </div>
        <div class="card-body">
          <p class="empty-msg">No hydration data logged yet.</p>
        </div>
      </section>`;
  }

  // "Active" range: first logged date through today — includes 0-oz days in average
  const firstLogDate = loggedDates[0];
  const today = getTodayString();
  const activeDays = [];
  for (let d = new Date(firstLogDate + "T12:00:00"); d.toISOString().slice(0, 10) <= today; d.setDate(d.getDate() + 1)) {
    activeDays.push(d.toISOString().slice(0, 10));
  }

  // Round to 2 decimals to kill floating-point artifacts like
  // 115.00000000000001 that come from summing coefficient-adjusted
  // beverages. Integers render as "115" (no trailing .00); values
  // with real fractional content render as "115.75" / "118.5".
  const _roundOz = (n) => {
    const r = Math.round((n || 0) * 100) / 100;
    return r;
  };
  // Total / average: sum effective oz so it matches what the hydration
  // card shows for each day. Summing bottles × size double-discounts
  // beverages with non-1 coefficients.
  const totalOz = _roundOz(activeDays.reduce((s, d) => s + _ozOn(d), 0));
  const avgOzPerDay = Math.round(totalOz / activeDays.length);

  // Days that met target (out of all active days) — per-day goalpost.
  // Compare in oz, not bottles: the previous bottle-based check rounded
  // the target up via Math.ceil, so a day at 147/139 oz read as missed
  // because 5.88 bottles < ceil(139/25)=6, even though oz ≥ target.
  const _metOn = (d) => _ozOn(d) >= _targetOzFor(d);
  const metTargetDays = activeDays.filter(_metOn).length;
  const hitRate = Math.round((metTargetDays / activeDays.length) * 100);

  // Current streak (consecutive days meeting target, ending today or yesterday)
  let currentStreak = 0;
  let checkDate = new Date(today + "T12:00:00");
  const hasToday = _metOn(todayKey);
  if (!hasToday) {
    // Check if yesterday qualifies to start the streak
    checkDate.setDate(checkDate.getDate() - 1);
    const yKey = checkDate.toISOString().slice(0, 10);
    if (!_metOn(yKey)) {
      currentStreak = 0;
    } else {
      // Count backwards from yesterday
      while (true) {
        const key = checkDate.toISOString().slice(0, 10);
        if (_metOn(key)) {
          currentStreak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else break;
      }
    }
  } else {
    // Count backwards from today
    while (true) {
      const key = checkDate.toISOString().slice(0, 10);
      if (_metOn(key)) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else break;
    }
  }

  // Best streak — same per-day goalpost.
  let bestStreak = 0, tempStreak = 0;
  for (const key of activeDays) {
    if (_metOn(key)) {
      tempStreak++;
      if (tempStreak > bestStreak) bestStreak = tempStreak;
    } else {
      tempStreak = 0;
    }
  }

  // Last 7 days bar chart — each bar is normalized to ITS OWN day's
  // hydration target so 100% reads as one consistent line across days
  // that had different goals (e.g. long-run day = ~150 oz target,
  // rest day = ~80 oz target). Without normalization, comparing
  // absolute oz against a single dashed line lies about adherence.
  const last7 = [];
  const dayLabels = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today + "T12:00:00");
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const oz = _roundOz(_ozOn(key));
    const dayTargetOz = _targetOzFor(key) || 1;
    const pctOfTarget = (oz / dayTargetOz) * 100;
    const active = key >= firstLogDate; // day is within active tracking range
    last7.push({ label: dayLabels[d.getDay()], oz, pctOfTarget, met: _metOn(key), active });
  }

  // Visual cap so a 200%+ over-achiever day doesn't squash the rest of
  // the chart. Real value still surfaces in the oz callout above each
  // bar, so capping the bar height doesn't lose information.
  const VIS_CAP = 150;
  const maxPct = Math.max(VIS_CAP, ...last7.map(d => d.pctOfTarget));

  const barChart = last7.map(d => {
    const visualPct = Math.min(d.pctOfTarget, maxPct);
    const heightPct = maxPct > 0 ? Math.round((visualPct / maxPct) * 100) : 0;
    const color = !d.active ? "#555" : d.met ? "var(--color-accent)" : "rgba(129, 140, 248, 0.5)";
    const countLabel = d.active ? `${Math.round(d.oz)} oz` : "—";
    return `<div class="weekly-col">
      <div class="weekly-count" style="${!d.active ? 'opacity:0.4' : ''}">${countLabel}</div>
      <div class="weekly-track">
        <div class="weekly-fill" style="height:${heightPct}%;background:${color}"></div>
      </div>
      <div class="weekly-label" style="${!d.active ? 'opacity:0.4' : ''}">${d.label}</div>
    </div>`;
  }).join("");

  // Dashed line at 100% (= "you hit your goal that day", whatever the
  // goal was). With maxPct=150 this lands at 67% of chart height.
  const targetPct = maxPct > 0 ? Math.round((100 / maxPct) * 100) : 100;

  const boxes = [
    { val: currentStreak, label: "Current Streak", sub: "days hitting target" },
    { val: bestStreak,    label: "Best Streak",    sub: "days hitting target" },
    { val: avgOzPerDay,   label: "Avg / Day",      sub: "oz" },
    { val: hitRate + "%", label: "Goal Hit Rate",   sub: `${metTargetDays} of ${activeDays.length} days` },
  ].map(r => `
    <div class="streak-box">
      <div class="streak-val">${r.val}</div>
      <div class="streak-label">${r.label}</div>
      <div class="streak-sub">${r.sub}</div>
    </div>`).join("");

  return `
    <section class="card collapsible" id="section-stats-hydration">
      <div class="card-toggle" onclick="toggleSection('section-stats-hydration')">
        <h2>Hydration</h2><span class="card-chevron">&#9662;</span>
      </div>
      <div class="card-body">
        <div class="streak-grid">${boxes}</div>
        <div class="section-label"><span>Last 7 Days</span></div>
        <div class="weekly-chart" style="position:relative">
          <div style="position:absolute;left:0;right:0;bottom:${Math.round(targetPct * 72 / 100) + 18}px;border-top:1.5px dashed var(--color-text-muted);opacity:0.4"></div>
          ${barChart}
        </div>
        <div style="text-align:center;font-size:0.7rem;color:var(--color-text-muted);margin-top:4px">
          Dashed line = 100% of that day's goal · bars normalized per-day
        </div>
        <div class="totals-row" style="margin-top:14px">
          <span class="totals-label">Total Logged</span>
          <span class="totals-value">${Math.round(totalOz).toLocaleString()} oz over ${activeDays.length} days</span>
        </div>
      </div>
    </section>`;
}

/* ─── Main render ──────────────────────────────────────────────────────── */

function renderStats() {
  const container = document.getElementById("stats-content");
  if (!container) return;

  const workouts = loadCompletedSessions();
  const events   = loadEvents();
  let   meals    = [];
  try { meals = JSON.parse(localStorage.getItem("meals")) || []; } catch {}

  const streaks   = computeStreaks(workouts);
  const byType    = computeByType(workouts);
  const thisWeek  = getThisWeekCount(workouts);
  const thisMonth = getThisMonthCount(workouts);

  container.innerHTML =
    buildStatsOverview(workouts.length, streaks, thisWeek, thisMonth) +
    buildStatsRatingTrend() +
    buildStatsProgressiveOverload() +
    buildStatsPlanConsistency() +
    buildStatsTotals() +
    buildStatsBreakdown(byType, workouts.length) +
    buildStatsHeatmap(workouts, streaks) +
    buildStatsPRs() +
    buildStatsCompletedRaces(events) +
    buildStatsNutrition(meals) +
    buildStatsHydration() +
    (typeof buildCheckinTrend === "function" ? buildCheckinTrend() : "") +
    buildPREstimator();

  renderSavedPRs();
  preUpdateForm();
}

/* ─── Workout Rating Trend ────────────────────────────────────────────── */

function buildStatsRatingTrend() {
  if (typeof loadWorkoutRatings !== "function") return "";
  const allRatings = loadWorkoutRatings();
  // Build a set of all existing workout IDs to filter out orphaned ratings
  const existingIds = new Set();
  try { (JSON.parse(localStorage.getItem("workouts")) || []).forEach(w => existingIds.add(String(w.id))); } catch {}
  try { (JSON.parse(localStorage.getItem("workoutSchedule")) || []).forEach(w => existingIds.add(String(w.id))); } catch {}
  try { (JSON.parse(localStorage.getItem("trainingPlan")) || []).forEach(w => { if (w.id) existingIds.add(String(w.id)); }); } catch {}
  const entries = Object.entries(allRatings)
    .map(([id, r]) => ({ id, ...r }))
    .filter(r => r.rating && r.date && existingIds.has(String(r.id)))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (entries.length === 0) return "";

  const avg = (entries.reduce((s, r) => s + r.rating, 0) / entries.length).toFixed(1);
  const ratingLabels = ["", "Too Easy", "Easy", "Just Right", "Hard", "Crushed Me"];
  const ratingEmojis = ["", "\u{1F971}", "\u{1F60C}", "\u{1F44C}", "\u{1F4AA}", "\u{1F635}"];

  // Distribution
  const dist = [0, 0, 0, 0, 0, 0];
  entries.forEach(r => dist[r.rating]++);
  const maxCount = Math.max(...dist.slice(1));

  let distHtml = "";
  for (let i = 1; i <= 5; i++) {
    const pct = maxCount > 0 ? (dist[i] / maxCount * 100) : 0;
    distHtml += `
      <div class="rating-dist-row">
        <span class="rating-dist-emoji">${ratingEmojis[i]}</span>
        <div class="rating-dist-bar-track">
          <div class="rating-dist-bar-fill" style="width:${pct}%"></div>
        </div>
        <span class="rating-dist-count">${dist[i]}</span>
      </div>`;
  }

  // Recent trend (last 10)
  const recent = entries.slice(-10);
  let trendHtml = "";
  if (recent.length >= 2) {
    const dots = recent.map((r, i) => {
      const x = (i / (recent.length - 1)) * 100;
      const y = 100 - ((r.rating - 1) / 4) * 100;
      return `${x},${y}`;
    });
    const polyline = dots.join(" ");
    trendHtml = `
      <div class="rating-trend-chart">
        <svg viewBox="-2 -2 104 104" preserveAspectRatio="none" class="rating-trend-svg">
          <polyline points="${polyline}" fill="none" stroke="var(--color-accent)" stroke-width="2" vector-effect="non-scaling-stroke"/>
          ${dots.map((pt, i) => `<circle cx="${pt.split(",")[0]}" cy="${pt.split(",")[1]}" r="3" fill="var(--color-accent)" vector-effect="non-scaling-stroke"/>`).join("")}
        </svg>
        <div class="rating-trend-labels">
          <span>Crushed</span><span>Just Right</span><span>Too Easy</span>
        </div>
      </div>`;
  }

  // Smart alert
  let alertHtml = "";
  if (typeof getRatingSmartAlert === "function") {
    const alert = getRatingSmartAlert();
    if (alert) {
      const alertIcon = alert.type === "easy" ? (typeof ICONS !== "undefined" ? ICONS.zap : "") : (typeof ICONS !== "undefined" ? ICONS.warning : "");
      alertHtml = `<div class="rating-smart-alert rating-alert-${alert.type}">${alertIcon} ${alert.message}</div>`;
    }
  }

  return `
    <div class="stats-card">
      <h3>Workout Feel ${ratingEmojis[Math.round(parseFloat(avg))] || ""}</h3>
      ${alertHtml}
      <div class="rating-stats-summary">
        <div class="rating-avg">
          <span class="rating-avg-number">${avg}</span>
          <span class="rating-avg-label">${ratingLabels[Math.round(parseFloat(avg))] || "avg"}</span>
        </div>
        <span class="rating-total-count">${entries.length} rated</span>
      </div>
      ${distHtml}
      ${trendHtml}
    </div>`;
}

/* ─── Personal Records ─────────────────────────────────────────────────── */

const PR_LABELS = {
  mile:"Mile", "5k":"5K", "10k":"10K", half:"Half Marathon", marathon:"Marathon",
  "oly-swim":"Oly Swim (1500m)","oly-bike":"Oly Bike (40km)","oly-run":"Oly Run (10km)",
  "im-swim":"IM Swim (3.8km)","im-bike":"IM Bike (180km)","im-run":"IM Run (42.2km)",
};

// Canonical distance order: shortest → longest
const PR_ORDER = ["mile","5k","10k","half","marathon","oly-swim","oly-run","oly-bike","im-swim","im-run","im-bike"];

function loadPRs() {
  try { return JSON.parse(localStorage.getItem("personalRecords")) || {}; } catch { return {}; }
}

function savePR() {
  const distance = document.getElementById("pr-distance").value;
  const time     = document.getElementById("pr-time").value.trim();
  if (!time) return;
  const prs = loadPRs();
  prs[distance] = { time, date: getTodayString() };
  localStorage.setItem("personalRecords", JSON.stringify(prs)); if (typeof DB !== 'undefined') DB.syncKey('personalRecords');
  document.getElementById("pr-time").value = "";
  renderSavedPRs();
}

function deletePR(distance) {
  const prs = loadPRs();
  delete prs[distance];
  localStorage.setItem("personalRecords", JSON.stringify(prs)); if (typeof DB !== 'undefined') DB.syncKey('personalRecords');
  renderSavedPRs();
}

function renderSavedPRs() {
  const list = document.getElementById("pr-list");
  if (!list) return;
  const prs     = loadPRs();
  const entries = Object.entries(prs);
  if (!entries.length) {
    list.innerHTML = "";
    return;
  }
  list.innerHTML = entries
    .sort((a, b) => {
      const ai = PR_ORDER.indexOf(a[0]);
      const bi = PR_ORDER.indexOf(b[0]);
      const ao = ai === -1 ? 999 : ai;
      const bo = bi === -1 ? 999 : bi;
      return ao - bo;
    })
    .map(([key, val]) => `
      <div class="pr-row">
        <div class="pr-distance">${PR_LABELS[key] || key}</div>
        <div class="pr-time">${val.time}</div>
        <div class="pr-date">${formatDisplayDate(val.date)}</div>
        <button class="delete-btn" onclick="deletePR('${key}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4c0-1.1.9-2 2-2h4a2 2 0 012 2v2"/><path d="M19 6v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button>
      </div>`).join("");
}

/* ─── Progressive Overload Tracking ───────────────────────────────────── */

function _getAllExerciseHistory() {
  let workouts = [];
  try { workouts = JSON.parse(localStorage.getItem("workouts")) || []; } catch {}

  // Build a map: exerciseName → [{ date, sets, reps, weight, estimated1RM }]
  const history = {};
  workouts
    .filter(w => w.exercises && w.exercises.length)
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach(w => {
      w.exercises.forEach(ex => {
        const name = (ex.name || "").trim().toLowerCase();
        if (!name) return;
        const weightNum = parseFloat(String(ex.weight || "0").replace(/[^\d.]/g, "")) || 0;
        const repsNum = parseInt(String(ex.reps || "0").replace(/[^\d]/g, "")) || 0;
        const setsNum = parseInt(String(ex.sets || "0").replace(/[^\d]/g, "")) || 0;
        if (weightNum <= 0 && repsNum <= 0) return;

        if (!history[name]) history[name] = [];
        // Estimated 1RM via Brzycki formula
        const e1rm = repsNum > 0 && repsNum < 37 && weightNum > 0 ? Math.round(weightNum * (36 / (37 - repsNum))) : 0;
        history[name].push({
          date: w.date,
          sets: setsNum,
          reps: repsNum,
          weight: weightNum,
          e1rm,
          rawWeight: ex.weight || "",
        });
      });
    });
  return history;
}

function _detectPlateaus(history) {
  const plateaus = [];
  // Bodyweight movements have weight === 0 by design — "plateau at 0 lbs"
  // is nonsense for them, and "Try 5 lbs next time" reads as a bug.
  const _isBodyweightLike = (n) => /\b(pull[- ]?up|chin[- ]?up|push[- ]?up|dip|plank|hanging|sit[- ]?up|crunch|burpee|mountain climber|jumping jack|air squat)\b/i.test(n);
  for (const [name, entries] of Object.entries(history)) {
    if (entries.length < 3) continue;
    const recent = entries.slice(-5);
    const last = recent[recent.length - 1];
    // BUGFIX: phantom 0-lb entries (mark-as-complete with weight unfilled,
    // saved-workout templates auto-logged on Finish) were tripping a
    // plateau alert that read "Reverse-grip barbell row, 0 lbs x 10 for
    // 3 sessions, try 5 lbs next time" for exercises the user never did.
    // Skip when the most recent weight is 0 unless this is a recognised
    // bodyweight movement (pull-up etc.) where 0 is the right value.
    if (last.weight <= 0 && !_isBodyweightLike(name)) continue;
    // Check if last 3+ entries have same weight and reps
    let plateauCount = 1;
    for (let i = recent.length - 2; i >= 0; i--) {
      if (recent[i].weight === last.weight &&
          recent[i].reps === last.reps) {
        plateauCount++;
      } else break;
    }
    if (plateauCount >= 3) {
      plateaus.push({
        name,
        displayName: entries[0] ? (name.charAt(0).toUpperCase() + name.slice(1)) : name,
        weight: last.weight,
        reps: last.reps,
        count: plateauCount,
        suggestedWeight: Math.round((last.weight * 1.05) / 5) * 5 || last.weight + 5,
      });
    }
  }
  return plateaus;
}

function _detectPRs(history) {
  const prs = [];
  for (const [name, entries] of Object.entries(history)) {
    if (entries.length < 2) continue;
    const last = entries[entries.length - 1];
    const prev = entries.slice(0, -1);
    const prevMax1RM = Math.max(...prev.map(e => e.e1rm));
    if (last.e1rm > prevMax1RM && last.e1rm > 0) {
      prs.push({
        name,
        displayName: name.charAt(0).toUpperCase() + name.slice(1),
        e1rm: last.e1rm,
        weight: last.weight,
        reps: last.reps,
        date: last.date,
        prevMax: prevMax1RM,
      });
    }
  }
  return prs;
}

function buildStatsProgressiveOverload() {
  const history = _getAllExerciseHistory();
  const exerciseNames = Object.keys(history);
  if (exerciseNames.length === 0) return "";

  const plateaus = _detectPlateaus(history);
  const recentPRs = _detectPRs(history);
  const topExercises = exerciseNames
    .filter(n => history[n].length >= 3)
    .sort((a, b) => history[b].length - history[a].length)
    .slice(0, 4);

  // If there's literally nothing to show (no PRs, no plateaus, not
  // enough history for a progression chart), render nothing at all
  // — previously this emitted a bare "Strength Progression" heading
  // floating above the next card with no content beneath it.
  if (!recentPRs.length && !plateaus.length && !topExercises.length) return "";

  let body = "";

  // Recent PRs
  if (recentPRs.length > 0) {
    body += `<div class="overload-section">
      <div class="overload-section-title">${typeof ICONS !== "undefined" ? ICONS.trophy : ""} Recent PRs</div>`;
    recentPRs.forEach(pr => {
      body += `<div class="overload-pr-row">
        <span class="overload-exercise">${pr.displayName}</span>
        <span class="overload-pr-value">${pr.weight} lbs x ${pr.reps} (est. 1RM: ${pr.e1rm})</span>
        <span class="overload-pr-date">${formatDisplayDate(pr.date)}</span>
      </div>`;
    });
    body += `</div>`;
  }

  // Plateaus
  if (plateaus.length > 0) {
    body += `<div class="overload-section">
      <div class="overload-section-title">${typeof ICONS !== "undefined" ? ICONS.target : ""} Plateau Alerts</div>`;
    plateaus.forEach(p => {
      body += `<div class="overload-plateau-row">
        <div class="overload-exercise">${p.displayName}</div>
        <div class="overload-plateau-detail">${p.weight} lbs x ${p.reps} for ${p.count} sessions</div>
        <div class="overload-suggestion">Try ${p.suggestedWeight} lbs next time</div>
      </div>`;
    });
    body += `</div>`;
  }

  // Top exercises — progression charts (top 4 by number of entries)
  if (topExercises.length > 0) {
    let chartsHtml = "";
    topExercises.forEach(name => {
      const entries = history[name];
      const e1rms = entries.map(e => e.e1rm).filter(v => v > 0);
      if (e1rms.length < 2) return;

      const min1rm = Math.min(...e1rms);
      const max1rm = Math.max(...e1rms);
      const range = max1rm - min1rm || 1;
      const displayName = name.charAt(0).toUpperCase() + name.slice(1);
      const latest = e1rms[e1rms.length - 1];

      const points = e1rms.map((v, i) => {
        const x = (i / (e1rms.length - 1)) * 100;
        const y = 100 - ((v - min1rm) / range) * 80 - 10;
        return `${x},${y}`;
      });

      chartsHtml += `
        <div class="overload-chart-card">
          <div class="overload-chart-title">${displayName}</div>
          <div class="overload-chart-value">${latest} lbs</div>
          <svg viewBox="-2 -2 104 104" preserveAspectRatio="none" class="overload-chart-svg">
            <polyline points="${points.join(" ")}" fill="none" stroke="var(--color-accent)" stroke-width="2" vector-effect="non-scaling-stroke"/>
            ${points.map(pt => `<circle cx="${pt.split(",")[0]}" cy="${pt.split(",")[1]}" r="3" fill="var(--color-accent)" vector-effect="non-scaling-stroke"/>`).join("")}
          </svg>
        </div>`;
    });
    if (chartsHtml) {
      body += `<div class="overload-section">
        <div class="overload-section-title">Estimated 1RM Progression</div>
        <div class="overload-charts">${chartsHtml}</div>
      </div>`;
    }
  }

  // Belt-and-suspenders: if every branch above produced nothing
  // despite the outer guards, bail rather than emit an empty card.
  if (!body) return "";

  return `
    <section class="card collapsible" id="section-stats-strength-progression">
      <div class="card-toggle" onclick="toggleSection('section-stats-strength-progression')">
        <h2>Strength Progression</h2><span class="card-chevron">▾</span>
      </div>
      <div class="card-body">${body}</div>
    </section>`;
}
