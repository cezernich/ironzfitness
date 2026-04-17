// calendar.js — Calendar (week + month views) + day detail panel

let currentYear      = new Date().getFullYear();
let currentMonth     = new Date().getMonth(); // 0-indexed
let selectedDate     = null;
let calendarMode     = "week";               // "week" | "month"
let currentWeekStart = getWeekStart(new Date());
let _dragActive      = false;               // prevents stray selectDay during drag

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];
const DAY_LABELS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const DISCIPLINE_COLORS = {
  swim:         "var(--color-cyan)",
  bike:         "var(--color-teal)",
  run:          "var(--color-amber)",
  brick:        "var(--color-accent)",
  race:         "var(--color-danger)",
  weightlifting:"var(--color-violet)",
  cycling:      "var(--color-teal)",
  running:      "var(--color-amber)",
  swimming:     "var(--color-cyan)",
  triathlon:    "var(--color-cyan)",
  general:      "var(--color-success)",
  hiit:         "var(--color-accent)",
  hyrox:        "var(--color-amber)",
  hyroxStrength:"var(--color-violet)",
  bodyweight:   "var(--color-accent)",
  yoga:         "var(--color-violet)",
  stairstepper: "var(--color-amber)",
  wellness:     "var(--color-success)",
};

// Resolve the card icon/color for a workout record when the type field
// might be a subtemplate alias (e.g. "tempo", "progression") that
// DISCIPLINE_ICONS doesn't know about. Falls back to matching keywords
// in the workout title/notes before giving up with the strength icon —
// so a "Tempo — Progression Run" session still renders with the run
// icon instead of the barbell.
function _resolveDiscipline(w) {
  if (!w) return { icon: ICONS.weights, color: "var(--color-accent)" };
  const key = w.discipline || w.type || "";
  if (DISCIPLINE_ICONS[key]) {
    return { icon: DISCIPLINE_ICONS[key], color: DISCIPLINE_COLORS[key] || "var(--color-accent)" };
  }
  const text = `${w.sessionName || ""} ${w.name || ""} ${w.notes || ""} ${w.generatedSession?.name || ""}`.toLowerCase();
  if (/\b(run|tempo|progression|threshold|speed|vo2|easy.?run|long.?run|brick.?run|hill)\b/.test(text)) {
    return { icon: ICONS.run, color: DISCIPLINE_COLORS.run };
  }
  if (/\b(bike|cycling|ftp|sweet.?spot|trainer|spin)\b/.test(text)) {
    return { icon: ICONS.bike, color: DISCIPLINE_COLORS.bike };
  }
  if (/\b(swim|css|freestyle|pool|stroke|drill)\b/.test(text)) {
    return { icon: ICONS.swim, color: DISCIPLINE_COLORS.swim };
  }
  return { icon: ICONS.weights, color: "var(--color-accent)" };
}

const RESTRICTION_LABELS = {
  injury:     "Injury / Pain",
  sick:       "Sick / Low Energy",
  fatigue:    "Fatigue / Overtraining",
  travel:     "Traveling",
  time:       "Time Limited",
  discipline: "Discipline Unavailable",
  rest:       "Full Rest Day",
};

const RESTRICTION_ICONS = {
  injury:     ICONS.alertCircle,
  sick:       ICONS.thermometer,
  fatigue:    ICONS.warning,
  travel:     ICONS.plane,
  time:       ICONS.clock,
  discipline: ICONS.ban,
  rest:       ICONS.moon,
};

const RESTRICTION_SUGGESTIONS = {
  rest:    "Full rest recommended — skip today's session.",
  injury:  "Reduce intensity or substitute with a low-impact alternative.",
  sick:    "Rest or very easy activity only — recovery is the priority.",
  fatigue: "Deload — fewer sets, lighter weight, lower intensity.",
  travel:  "Hotel-friendly options: bodyweight circuits or an easy run.",
  time:    "Condense to ~30 min — keep key intervals, skip extra sets.",
};

const EQUIPMENT_OPTIONS = [
  { value: "dumbbells", label: "Dumbbells" },
  { value: "barbell",   label: "Barbell & Rack" },
  { value: "cables",    label: "Cables / Machines" },
];

const CABLE_MACHINE_TYPES = [
  "Cable Crossover", "Lat Pulldown", "Seated Row",
  "Chest Fly Machine", "Chest Press Machine",
  "Shoulder Press Machine", "Leg Press",
  "Leg Extension", "Leg Curl", "Hip Abductor/Adductor",
  "Smith Machine", "Functional Trainer",
];

// Populate the cables detail checklist on load
document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("qe-cables-detail");
  if (!container) return;
  container.innerHTML = CABLE_MACHINE_TYPES.map((name, i) =>
    `<label><input type="checkbox" data-machine="${name}" id="qe-machine-${i}" />${name}</label>`
  ).join("");
});

function _equipmentLabel(restriction) {
  if (!restriction) return "";
  const available = restriction.available || [];
  const base = available.length === 0 ? "Bodyweight only" : available.map(v => {
    const label = (EQUIPMENT_OPTIONS.find(o => o.value === v) || {}).label || v;
    if (v === "dumbbells" && restriction.dumbbellMaxWeight) return `${label} (up to ${restriction.dumbbellMaxWeight}lb)`;
    if (v === "cables" && restriction.cablesMachineTypes && restriction.cablesMachineTypes.length) {
      return `${label} (${restriction.cablesMachineTypes.join(", ")})`;
    }
    return label;
  }).join(", ");
  return restriction.permanent ? `${base} · Permanent` : base;
}

// ─── Week helpers ─────────────────────────────────────────────────────────────

function getWeekStart(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // shift back to Monday
  d.setDate(d.getDate() + diff);
  return d;
}

function getWeekDates(weekStart) {
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    dates.push(d);
  }
  return dates;
}

function formatWeekLabel(weekStart) {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const sStr = weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const eStr = weekEnd.getMonth() === weekStart.getMonth()
    ? weekEnd.toLocaleDateString("en-US", { day: "numeric" })
    : weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${sStr} – ${eStr}, ${weekEnd.getFullYear()}`;
}

// ─── Main dispatch ────────────────────────────────────────────────────────────

function renderCalendar() {
  const label       = document.getElementById("calendar-month-label");
  const zoomBtn     = document.getElementById("cal-zoom-btn");
  const thisWeekBtn = document.getElementById("cal-this-week-btn");
  if (!label) return;

  // New .cal-toggle button keeps its SVG and just toggles .active in
  // month mode — don't set textContent or we'd wipe the inline SVG.
  if (calendarMode === "week") {
    if (zoomBtn) zoomBtn.classList.remove("active");
    label.textContent = formatWeekLabel(currentWeekStart);
    renderWeekView();
    renderWeekOverview();
  } else {
    if (zoomBtn) zoomBtn.classList.add("active");
    label.textContent = `${MONTH_NAMES[currentMonth]} ${currentYear}`;
    renderMonthView();
    renderWeekOverview(); // clears the bar in month mode
  }

  // Show "This Week" / today button only when the current week isn't
  // already in view (week mode) or the current month isn't in view
  // (month mode). The new SVG button has no text, so visibility toggle
  // is the only thing that needs maintaining.
  if (thisWeekBtn) {
    let visible;
    if (calendarMode === "week") {
      const todayWeekStart = getWeekStart(new Date());
      visible = currentWeekStart.getTime() !== todayWeekStart.getTime();
    } else {
      const today = new Date();
      visible = !(currentYear === today.getFullYear() && currentMonth === today.getMonth());
    }
    thisWeekBtn.style.display = visible ? "" : "none";
  }
}

function goToThisWeek() {
  const today = new Date();
  if (calendarMode === "week") {
    currentWeekStart = getWeekStart(today);
  } else {
    currentYear = today.getFullYear();
    currentMonth = today.getMonth();
  }
  // Selecting today makes the carousel center on it so the redesigned
  // week view highlights the correct card on return.
  selectedDate = today.toISOString().slice(0, 10);
  renderCalendar();
}

function toggleCalendarMode() {
  calendarMode = calendarMode === "week" ? "month" : "week";
  if (calendarMode === "week") {
    const anchor = selectedDate ? new Date(selectedDate + "T00:00:00") : new Date();
    currentWeekStart = getWeekStart(anchor);
  }
  renderCalendar();
}

// ─── Navigation (mode-aware) ──────────────────────────────────────────────────

// Public helper for cross-script jump-to-a-specific-week navigation.
// External callers (e.g. OnboardingV2's "Tweak this week in calendar"
// path) can't reassign calendar.js's `let currentWeekStart` via
// `window.currentWeekStart = ...` — that only creates a window property
// and doesn't touch the module-scoped `let` binding the calendar reads
// from. This setter mutates the real binding, switches to week mode,
// centers the target date, and triggers a re-render.
function jumpCalendarToWeek(dateStr) {
  if (!dateStr) return;
  const target = new Date(dateStr + "T00:00:00");
  if (isNaN(target.getTime())) return;
  currentWeekStart = getWeekStart(target);
  calendarMode = "week";
  selectedDate = dateStr;
  renderCalendar();
  if (typeof renderDayDetail === "function") renderDayDetail(dateStr);
}

function calPrev() {
  if (calendarMode === "week") {
    currentWeekStart = new Date(currentWeekStart);
    currentWeekStart.setDate(currentWeekStart.getDate() - 7);
  } else {
    currentMonth--;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
  }
  renderCalendar();
}

function calNext() {
  if (calendarMode === "week") {
    currentWeekStart = new Date(currentWeekStart);
    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
  } else {
    currentMonth++;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
  }
  renderCalendar();
}

// Legacy aliases
function prevMonth() { calPrev(); }
function nextMonth() { calNext(); }

// ─── Weekly overview bar ──────────────────────────────────────────────────────

function renderWeekOverview() {
  const el = document.getElementById("week-overview-bar");
  if (!el || calendarMode !== "week") { if (el) el.innerHTML = ""; return; }

  const weekDates = getWeekDates(currentWeekStart).map(d => d.toISOString().slice(0, 10));
  let totalMin = 0, totalKm = 0;
  const bySportKm = {};  // sport → total km for the week
  const byType = {};     // type → session count

  weekDates.forEach(dateStr => {
    const t = getDayTotals(dateStr);
    totalMin += t.totalMin;
    totalKm  += t.totalKm;
    for (const [sport, km] of Object.entries(t.sportKm || {})) {
      bySportKm[sport] = (bySportKm[sport] || 0) + km;
    }
    const data = getDataForDate(dateStr);
    const sessionRemoved = data.restriction && data.restriction.action === "remove";
    if (!sessionRemoved) {
      const canonType = (t) => {
        const s = String(t || "").toLowerCase();
        if (s === "swimming") return "swim";
        if (s === "cycling") return "bike";
        if (s === "running") return "run";
        return s || "general";
      };
      const addType = (type) => { const k = canonType(type); byType[k] = (byType[k] || 0) + 1; };
      if (data.planEntry) addType(data.planEntry.discipline || "run");
      data.scheduledWorkouts.forEach(w => addType(w.discipline || w.type));
      data.loggedWorkouts.forEach(w => addType(w.type));
    }
  });

  if (totalMin === 0 && totalKm === 0 && Object.keys(byType).length === 0) { el.innerHTML = ""; return; }

  const unit = typeof getDistanceUnit === "function" ? getDistanceUnit() : "mi";

  let timeStr = "";
  if (totalMin >= 60) {
    const h = Math.floor(totalMin / 60), m = Math.round(totalMin % 60);
    timeStr = m > 0 ? `${h}h ${m}m` : `${h}h`;
  } else if (totalMin > 0) {
    timeStr = `${Math.round(totalMin)}m`;
  }

  const SPORT_ICON_MAP = { run: ICONS.run, bike: ICONS.bike, swim: ICONS.swim };

  const distItems = Object.entries(bySportKm).map(([sport, km]) => {
    const icon = SPORT_ICON_MAP[sport] || ICONS.activity;
    const ds = unit === "km" ? `${km.toFixed(1)} km` : `${(km / 1.60934).toFixed(1)} mi`;
    return `<span class="week-overview-time">${icon} ${ds} est.</span>`;
  });
  if (distItems.length === 0 && totalKm > 0) {
    const ds = unit === "km" ? `${totalKm.toFixed(1)} km` : `${(totalKm / 1.60934).toFixed(1)} mi`;
    distItems.push(`<span class="week-overview-time">${ICONS.activity} ${ds} est.</span>`);
  }

  const TYPE_ICON_MAP = {
    run: ICONS.run, running: ICONS.run,
    swim: ICONS.swim, swimming: ICONS.swim,
    bike: ICONS.bike, cycling: ICONS.bike,
    weightlifting: ICONS.weights,
    triathlon: ICONS.swim, brick: ICONS.zap,
    general: ICONS.activity, hiit: ICONS.flame, bodyweight: ICONS.activity, yoga: ICONS.yoga,
    stairstepper: ICONS.steps,
    hyroxStrength: ICONS.weights,
    wellness: ICONS.droplet, sauna: ICONS.droplet,
  };

  const pills = Object.entries(byType).map(([type, count]) => {
    const icon  = TYPE_ICON_MAP[type] || ICONS.activity;
    const color = DISCIPLINE_COLORS[type] || "var(--color-accent)";
    return `<span class="week-overview-pill" style="color:${color}">${icon} ${count}</span>`;
  }).join("");

  el.innerHTML = `
    <div class="week-overview-bar">
      <div class="week-overview-left">
        <span class="week-overview-label">This week</span>
      </div>
      <div class="week-overview-right">
        ${timeStr ? `<span class="week-overview-time">${ICONS.clock} ${timeStr} est.</span>` : ""}
        ${distItems.join("")}
        ${pills}
      </div>
    </div>`;
}

// ─── Week view ────────────────────────────────────────────────────────────────

// ─── Redesign helpers: map existing app state to the new visual tokens ─
// These keep the data layer untouched — getDataForDate, _resolveDiscipline,
// hasAnyCompletedSession, load labels, etc. still do all the work below.

// Map a discipline/type string to the 4 CSS classes used by the new
// .wc workout-circle and .md-dot / .s-dot styles (run / swim / bike /
// str). Everything that isn't a pure endurance sport falls to str so
// strength, HIIT, circuit, hyrox, bodyweight all share a red palette.
// Covers the specific run-session-library types produced by the Add
// Running Session flow (long_run, tempo_threshold, track_workout,
// speed_work, hills, easy_recovery, endurance, fun_social) so the
// center card actually renders a run icon for those — they come
// through workoutSchedule as `type: "long_run"` with no discipline.
function _calV2DiscClass(discOrType) {
  const s = String(discOrType || "").toLowerCase();
  if (s === "run" || s === "running") return "run";
  if (/^(long_run|tempo_threshold|track_workout|speed_work|hills|easy_recovery|endurance|fun_social)$/.test(s)) return "run";
  if (s === "swim" || s === "swimming") return "swim";
  if (s === "bike" || s === "cycling") return "bike";
  if (s === "brick") return "bike";
  if (s === "race") return "race";
  if (s === "wellness" || s === "sauna") return "wellness";
  return "str";
}

// Map an effective load string ("easy"|"moderate"|"hard"|"long"|"race")
// to the new intensity-ring class on .wc and the dot-color class on
// .s-dot / .md-dot.
function _calV2LoadToRing(load) {
  const s = String(load || "").toLowerCase();
  if (s === "easy" || s === "recovery" || s === "low") return "il";
  if (s === "moderate" || s === "medium" || s === "mod") return "im";
  if (s === "hard" || s === "high" || s === "race") return "ih";
  if (s === "long" || s === "endurance") return "ie";
  return "";
}
function _calV2LoadToDot(load) {
  const s = String(load || "").toLowerCase();
  if (s === "easy" || s === "recovery" || s === "low") return "c-low";
  if (s === "moderate" || s === "medium" || s === "mod") return "c-med";
  if (s === "hard" || s === "high" || s === "race") return "c-high";
  if (s === "long" || s === "endurance") return "c-end";
  return "c-med";
}

// Workout-circle icons reuse the app's canonical ICONS sprite so the
// runner / dumbbell / wheels / waves match what the rest of the app
// (Add Session modal, quick entry, stats) already uses. Resolving
// lazily from the global ICONS object lets this file be declared
// before icons.js loads without caring about script order.
function _calV2IconFor(discCls) {
  const I = (typeof ICONS === "object" && ICONS) || {};
  switch (discCls) {
    case "run":  return I.run  || "";
    case "swim": return I.swim || "";
    case "bike": return I.bike || "";
    case "race": return I.flag || "";
    case "wellness": return I.droplet || I.activity || "";
    case "str":
    default:     return I.weights || I.zap || "";
  }
}
const _CAL_V2_CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

// Collect an array of normalized session descriptors for a date, each
// with the visual tokens the new skin needs. This is the ONLY new data
// wrangling — everything below it feeds off the existing getDataForDate.
// "Discipline unavailable" restriction filter. A day restriction with
// an explicit `disciplines` array means "skip any session of these
// disciplines on this day" without killing the whole day. Used by
// week-view collection + day-detail render so a "no swim today"
// restriction leaves the bike and run sessions intact.
function _calV2IsSessionDisciplineRestricted(session, restriction) {
  if (!session || !restriction) return false;
  if (!Array.isArray(restriction.disciplines) || restriction.disciplines.length === 0) return false;
  const raw = String(session.discipline || session.type || "").toLowerCase();
  return restriction.disciplines.some(d => {
    const r = String(d).toLowerCase();
    if (r === raw) return true;
    if (r === "swim" && (raw === "swimming")) return true;
    if (r === "bike" && (raw === "cycling" || raw === "brick")) return true;
    if (r === "run"  && (raw === "running")) return true;
    if (r === "strength" && (raw === "weightlifting" || raw === "hyrox")) return true;
    // Add-Running-Session enriched types all resolve to run
    if (r === "run" && /^(long_run|tempo_threshold|track_workout|speed_work|hills|easy_recovery|endurance|fun_social)$/.test(raw)) return true;
    return false;
  });
}

// Rest-flag detector: threshold-week plans (and some other flows)
// emit plan entries with load:"rest" / discipline:"rest" / type:"rest"
// as placeholders for a rest day. These aren't real sessions, so
// they shouldn't render as workout circles or intensity dots — a
// day with only a rest entry should just show "REST" like an empty
// day, not a strength icon.
function _calV2IsRestEntry(e) {
  if (!e) return false;
  const load = String(e.load || "").toLowerCase();
  const disc = String(e.discipline || "").toLowerCase();
  const type = String(e.type || "").toLowerCase();
  const name = String(e.sessionName || e.name || "").toLowerCase();
  return load === "rest" || disc === "rest" || type === "rest" || /^\s*rest\s*$/.test(name);
}

function _calV2CollectSessions(dateStr, data) {
  const r = data.restriction;
  // Full-day remove: action === "remove" AND no disciplines list.
  // With a disciplines list present, the restriction is partial —
  // we filter individual sessions instead of blanking the whole day.
  const fullRemove = r && r.action === "remove" && !Array.isArray(r.disciplines);
  const p = data.planEntry;
  const sw = data.scheduledWorkouts || [];
  const out = [];

  if (data.event && !p) {
    out.push({ discCls: "race", loadLabel: "race", name: data.event.name || "Race day" });
  }
  if (p && !fullRemove && !_calV2IsRestEntry(p) && !_calV2IsSessionDisciplineRestricted(p, r)) {
    const effectLoad = getEffectiveLoad(p.load, data.restriction);
    out.push({
      discCls: _calV2DiscClass(p.discipline),
      loadLabel: effectLoad,
      name: capitalize(p.discipline),
    });
  }
  if (!fullRemove) {
    sw.forEach(w => {
      if (_calV2IsRestEntry(w)) return;
      if (_calV2IsSessionDisciplineRestricted(w, r)) return;
      out.push({
        discCls: _calV2DiscClass(w.discipline || w.type),
        loadLabel: w.load || w.intensity || "moderate",
        name: w.sessionName || _wTypeLabel(w.type) || capitalize(w.discipline || w.type || ""),
      });
    });
  }
  (data.loggedWorkouts || []).forEach(w => {
    if (_calV2IsRestEntry(w)) return;
    if (_calV2IsSessionDisciplineRestricted(w, r)) return;
    out.push({
      discCls: _calV2DiscClass(w.type),
      loadLabel: w.load || "moderate",
      name: (w.generatedSession && w.generatedSession.name) || _wTypeLabel(w.type) || "Logged",
    });
  });

  return out;
}

function renderWeekView() {
  const grid = document.getElementById("calendar-grid");
  if (!grid) return;
  grid.className = "calendar-grid";

  const todayStr  = getTodayString();
  const weekDates = getWeekDates(currentWeekStart);

  // Center card = selectedDate if it falls within this week, else today
  // if today is in this week, else NO center. When browsing a week
  // that doesn't contain today or the user's last-selected date, all
  // 7 days render as equal side cards — the user hasn't expressed
  // intent about any of them yet, so auto-centering Mon was misleading
  // (looked like Mon was "selected" when it wasn't).
  const weekDateStrs = weekDates.map(d => d.toISOString().slice(0, 10));
  let centerStr = null;
  if (selectedDate && weekDateStrs.includes(selectedDate)) centerStr = selectedDate;
  else if (weekDateStrs.includes(todayStr)) centerStr = todayStr;

  const cards = weekDates.map(d => {
    const dateStr = d.toISOString().slice(0, 10);
    try {
      return _calV2BuildDayCard(dateStr, d, todayStr, centerStr === dateStr);
    } catch (e) {
      console.error("[calendar] buildWeekCell (v2) failed for", dateStr, e);
      return `<div class="dc s" onclick="selectDay('${dateStr}')"><span class="s-lb">${DAY_LABELS[d.getDay()].slice(0,3)}</span><span class="s-nm">${d.getDate()}</span></div>`;
    }
  }).join("");

  grid.innerHTML = `<div class="car-w"><div class="car">${cards}</div></div>`;

  // Wire click-and-drag swipe on desktop so users can grab-drag left/right
  // to step through weeks — without this, mouse users have to click the
  // arrow buttons since overflow-x scroll isn't mouse-draggable by
  // default. Mobile touch gestures still use the native scroll-snap.
  _calV2WireCarouselSwipe();
  _calV2CenterCurrentCard();
}

function _calV2CenterCurrentCard() {
  const car = document.querySelector("#calendar-grid .car");
  if (!car) return;
  const center = car.querySelector(".dc.c") || car.querySelector(".dc.s.selected") || car.querySelector(".dc.s.is-today");
  if (!center) return;
  // Defer to next frame so layout has settled before we read offsets.
  requestAnimationFrame(() => {
    const target = center.offsetLeft + center.offsetWidth / 2 - car.clientWidth / 2;
    const max = car.scrollWidth - car.clientWidth;
    // iOS Safari snaps the initial scrollLeft write back to 0 when
    // scroll-snap-type is `mandatory`. Disable snap, write, restore.
    const prev = car.style.scrollSnapType;
    car.style.scrollSnapType = "none";
    car.scrollLeft = Math.max(0, Math.min(max, target));
    // Force a reflow so the non-snapping scroll position is committed
    // before we re-enable snap on the next frame.
    void car.offsetWidth;
    requestAnimationFrame(() => { car.style.scrollSnapType = prev; });
  });
}

function _calV2WireCarouselSwipe() {
  const wrap = document.querySelector("#calendar-grid .car-w");
  if (!wrap) return;
  const THRESHOLD = 60; // px; past this, we navigate a week

  let startX = 0;
  let dx = 0;
  let active = false;
  // When a real drag completes, suppress the synthetic click that
  // follows so day-card onclick=selectDay() doesn't fire on whatever
  // card the pointer happened to be over. Plain taps (no drag) leave
  // this flag false and the card's onclick runs normally.
  let suppressClick = false;

  wrap.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0) return;
    active = true;
    startX = ev.clientX;
    dx = 0;
    // Intentionally NOT calling setPointerCapture — capturing the
    // pointer redirects the click to the wrap element and day-card
    // onclick handlers never fire, which is why the first pass
    // broke day selection entirely.
  });
  wrap.addEventListener("pointermove", (ev) => {
    if (!active) return;
    dx = ev.clientX - startX;
    if (Math.abs(dx) > 6) wrap.classList.add("is-dragging");
  });
  const end = () => {
    if (!active) return;
    active = false;
    const moved = dx;
    dx = 0;
    wrap.classList.remove("is-dragging");
    if (Math.abs(moved) >= THRESHOLD) {
      suppressClick = true;
      if (moved > 0) calPrev();
      else calNext();
    }
  };
  wrap.addEventListener("pointerup", end);
  wrap.addEventListener("pointercancel", end);
  wrap.addEventListener("pointerleave", end);
  // Capture-phase click blocker — only eats the click when a drag
  // just ended. Any other click (a tap on a day card) passes through.
  wrap.addEventListener("click", (ev) => {
    if (suppressClick) {
      suppressClick = false;
      ev.stopPropagation();
      ev.preventDefault();
    }
  }, true);
}

// Kept for back-compat with any in-file references — the v2 design
// builds day cards via _calV2BuildDayCard below instead.
function buildWeekCell(dateStr, dateObj, todayStr) {
  return _calV2BuildDayCard(dateStr, dateObj, todayStr, dateStr === (selectedDate || todayStr));
}

function _calV2BuildDayCard(dateStr, dateObj, todayStr, isCenter) {
  const data       = getDataForDate(dateStr);
  const isToday    = dateStr === todayStr;
  const isSelected = dateStr === selectedDate;
  const sessionRemoved = data.restriction && data.restriction.action === "remove";
  const completed = hasAnyCompletedSession(dateStr);

  const sessions = _calV2CollectSessions(dateStr, data);

  const dowLong = DAY_LABELS[dateObj.getDay()];
  const dowShort = dowLong.slice(0, 3);
  const dayNum = dateObj.getDate();

  // Drop handlers mirror the old week-cell — the whole card is a drop
  // target so drag-and-drop between days still works.
  const dragAttrs =
    `ondragover="onCellDragOver(event,'${dateStr}')" ` +
    `ondragleave="onCellDragLeave(event)" ` +
    `ondrop="onCellDrop(event,'${dateStr}')"`;

  if (isCenter) {
    // Big center card: full day label, number, workout circles with
    // intensity rings, optional TODAY pill, and total-time / rest
    // footer line.
    let pill = "";
    if (isToday) pill = `<span class="c-pill">Today</span>`;
    else if (isSelected) pill = `<span class="c-pill">Selected</span>`;

    let body = "";
    if (sessionRemoved) {
      body = `<div class="c-rest">${ICONS.ban} Removed</div>`;
    } else if (sessions.length === 0) {
      body = `<div class="c-rest">Rest</div>`;
    } else {
      // Cap at 4 circles to keep the card from overflowing
      const show = sessions.slice(0, 4);
      body = `<div class="wo-cir">` + show.map(s => {
        const ring = _calV2LoadToRing(s.loadLabel);
        const svg = _calV2IconFor(s.discCls);
        return `<span class="wc ${s.discCls}${ring ? " " + ring : ""}" title="${_escapeHtml(s.name)}">${svg}</span>`;
      }).join("") + `</div>`;
    }

    // Total estimated time for the day, reusing the existing helper
    let timeStr = "";
    try {
      const t = getDayTotals(dateStr);
      if (t && t.totalMin > 0) {
        const h = Math.floor(t.totalMin / 60), m = Math.round(t.totalMin % 60);
        timeStr = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
      }
    } catch {}

    const classes = `dc c${sessionRemoved ? " cal-removed" : ""}`;
    return `
      <div class="${classes}"
        onclick="selectDay('${dateStr}')"
        ondblclick="openQuickEntry('${dateStr}')"
        ${dragAttrs}>
        <div class="c-top">
          <span class="c-dl">${_escapeHtml(dowLong)}</span>
          ${pill}
        </div>
        <div class="c-num">${dayNum}</div>
        ${body}
        ${timeStr ? `<div class="c-time">${timeStr} est.</div>` : ""}
      </div>`;
  }

  // Compact side card: weekday label, day number, stack of (intensity
  // color bar + discipline icon) rows — one per session — with an
  // optional Rest label and completion checkmark. The discipline
  // icon under the bar makes what's actually scheduled discoverable
  // without having to tap each day.
  let sidebody = "";
  if (sessionRemoved) {
    sidebody = `<div class="s-rest">OFF</div>`;
  } else if (sessions.length === 0) {
    sidebody = `<div class="s-rest">REST</div>`;
  } else {
    const show = sessions.slice(0, 3);
    sidebody = `<div class="s-dots">` + show.map(s => {
      const icon = _calV2IconFor(s.discCls);
      const title = `${s.name || s.discCls} · ${s.loadLabel || ""}`.trim();
      return `
        <div class="s-sess s-sess--${s.discCls}" title="${_escapeHtml(title)}">
          <span class="s-dot ${_calV2LoadToDot(s.loadLabel)}"></span>
          <span class="s-ico">${icon}</span>
        </div>`;
    }).join("") + `</div>`;
  }

  const check = completed ? `<div class="s-check">${_CAL_V2_CHECK_SVG}</div>` : "";
  // Mark the side card that corresponds to today so users can see
  // where today sits even when they've selected a different day.
  const classes = `dc s${isSelected ? " selected" : ""}${isToday ? " is-today" : ""}${sessionRemoved ? " cal-removed" : ""}`;

  return `
    <div class="${classes}"
      onclick="selectDay('${dateStr}')"
      ondblclick="openQuickEntry('${dateStr}')"
      ${dragAttrs}>
      <span class="s-lb">${dowShort}</span>
      <span class="s-nm">${dayNum}</span>
      ${sidebody}
      ${check}
    </div>`;
}

// ─── Month view ───────────────────────────────────────────────────────────────

function renderMonthView() {
  const grid = document.getElementById("calendar-grid");
  if (!grid) return;
  grid.className = "calendar-grid";

  const firstDay    = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const todayStr    = getTodayString();

  const dowRow = DAY_LABELS.map(d => `<span>${d.slice(0,3).toUpperCase()}</span>`).join("");

  let cells = "";
  for (let i = 0; i < firstDay; i++) {
    cells += `<div class="md other-month"></div>`;
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = formatDateStr(currentYear, currentMonth, d);
    try {
      cells += buildDayCell(dateStr, d, todayStr);
    } catch (e) {
      console.error("[calendar] buildDayCell (v2) failed for", dateStr, e);
      cells += `<div class="md"><span class="md-num">${d}</span></div>`;
    }
  }

  grid.innerHTML = `
    <div class="month-grid">
      <div class="month-dow">${dowRow}</div>
      <div class="month-days">${cells}</div>
    </div>`;
}

function formatDateStr(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function buildDayCell(dateStr, dayNum, todayStr) {
  const data       = getDataForDate(dateStr);
  const isToday    = dateStr === todayStr;
  const isSelected = dateStr === selectedDate;
  const removed    = data.restriction && data.restriction.action === "remove";
  const completed  = hasAnyCompletedSession(dateStr);

  const sessions = _calV2CollectSessions(dateStr, data);

  let classes = "md";
  if (isToday)    classes += " today";
  if (isSelected) classes += " selected";
  if (removed)    classes += " cal-removed";

  let body = "";
  if (removed) {
    body = `<div class="md-rest">OFF</div>`;
  } else if (sessions.length === 0) {
    body = `<div class="md-rest">REST</div>`;
  } else {
    const show = sessions.slice(0, 4);
    body = `<div class="md-dots">` + show.map(s =>
      `<span class="md-dot ${_calV2LoadToDot(s.loadLabel)}"></span>`
    ).join("") + `</div>`;
  }

  const check = completed ? `<div class="md-check">${_CAL_V2_CHECK_SVG}</div>` : "";

  return `
    <div class="${classes}"
      onclick="selectDay('${dateStr}')"
      ondblclick="openQuickEntry('${dateStr}')"
      ondragover="onCellDragOver(event,'${dateStr}')"
      ondragleave="onCellDragLeave(event)"
      ondrop="onCellDrop(event,'${dateStr}')">
      <span class="md-num">${dayNum}</span>
      ${body}
      ${check}
    </div>`;
}

// ─── Data aggregation ─────────────────────────────────────────────────────────

function getDataForDate(dateStr) {
  const plan      = loadTrainingPlan();
  const planEntry = plan.find(e => e.date === dateStr) || null;

  let scheduledWorkouts = [];
  try { scheduledWorkouts = (JSON.parse(localStorage.getItem("workoutSchedule")) || []).filter(w => w.date === dateStr && !/^rest$/i.test((w.sessionName || "").trim())); } catch {}

  let loggedWorkouts = [];
  try { loggedWorkouts = (JSON.parse(localStorage.getItem("workouts")) || []).filter(w => w.date === dateStr && !w.isCompletion); } catch {}

  let loggedMeals = [];
  try { loggedMeals = (JSON.parse(localStorage.getItem("meals")) || []).filter(m => m.date === dateStr); } catch {}

  let event = null;
  try { event = (JSON.parse(localStorage.getItem("events")) || []).find(e => e.date === dateStr) || null; } catch {}

  let restriction = null;
  try { restriction = (JSON.parse(localStorage.getItem("dayRestrictions")) || {})[dateStr] || null; } catch {}

  let equipmentRestriction = null;
  try { const _er = JSON.parse(localStorage.getItem("equipmentRestrictions")) || {}; equipmentRestriction = _er[dateStr] || _er["permanent"] || null; } catch {}

  return { planEntry, scheduledWorkouts, loggedWorkouts, loggedMeals, event, restriction, equipmentRestriction };
}

// ─── Day selection ────────────────────────────────────────────────────────────

function selectDay(dateStr) {
  _dragActive = false; // Always reset drag state
  selectedDate = dateStr;
  renderCalendar();
  renderDayDetail(dateStr);
}

// ─── Scheduled workout CRUD ───────────────────────────────────────────────────

function _cleanupCompletionRecord(sessionId) {
  try {
    const meta = JSON.parse(localStorage.getItem("completedSessions") || "{}");
    const entry = meta[sessionId];
    if (entry) {
      delete meta[sessionId];
      localStorage.setItem("completedSessions", JSON.stringify(meta)); if (typeof DB !== 'undefined') DB.syncKey('completedSessions');
      // Remove the isCompletion workout record
      let workouts = JSON.parse(localStorage.getItem("workouts") || "[]");
      workouts = workouts.filter(w => String(w.id) !== String(entry.workoutId));
      localStorage.setItem("workouts", JSON.stringify(workouts)); if (typeof DB !== 'undefined') DB.syncWorkouts();
    }
  } catch {}
}

function deleteScheduledWorkout(id, dateStr) {
  if (!confirm("Remove this session from your plan?")) return;
  let schedule = [];
  try { schedule = JSON.parse(localStorage.getItem("workoutSchedule")) || []; } catch {}
  schedule = schedule.filter(w => String(w.id) !== String(id));
  localStorage.setItem("workoutSchedule", JSON.stringify(schedule)); if (typeof DB !== 'undefined') DB.syncSchedule();
  _cleanupCompletionRecord(`session-sw-${id}`);
  try { const r = JSON.parse(localStorage.getItem("workoutRatings") || "{}"); if (r[String(id)]) { delete r[String(id)]; localStorage.setItem("workoutRatings", JSON.stringify(r)); if (typeof DB !== 'undefined') DB.syncKey('workoutRatings'); } } catch {}
  renderCalendar();
  if (typeof selectedDate !== "undefined" && selectedDate) renderDayDetail(selectedDate);
  if (typeof renderStats === "function") renderStats();
}

function deletePlanEntry(raceId, discipline, dateStr) {
  if (!confirm("Remove this session from your training plan?")) return;
  const plan = loadTrainingPlan().filter(e => !(e.date === dateStr && e.raceId === raceId && e.discipline === discipline));
  saveTrainingPlanData(plan);
  _cleanupCompletionRecord(`session-plan-${dateStr}-${raceId}`);
  renderCalendar();
  if (typeof selectedDate !== "undefined" && selectedDate) renderDayDetail(selectedDate);
  if (typeof renderStats === "function") renderStats();
}

// Inline exercise editor for scheduled strength sessions
function buildScheduledEditPanel(cardId, workoutId) {
  return `<div class="session-move-panel" id="swedit-${cardId}">
    <div id="swedit-rows-${cardId}"></div>
    <button class="btn-secondary" style="width:100%;margin-top:6px" onclick="swEditAddRow('${cardId}')">+ Add exercise</button>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button class="btn-primary" style="flex:1" onclick="swEditSave('${cardId}','${workoutId}')">Save</button>
      <button class="btn-secondary" style="flex:1" onclick="toggleSwEdit('${cardId}')">Cancel</button>
    </div>
  </div>`;
}

function toggleSwEdit(cardId) {
  const panel = document.getElementById(`swedit-${cardId}`);
  if (!panel) return;
  const opening = !panel.classList.contains("is-open");
  panel.classList.toggle("is-open");
  if (opening) {
    const card = document.getElementById(cardId);
    if (card && card.classList.contains("is-collapsed")) card.classList.remove("is-collapsed");
  }
}

function swEditPopulate(cardId, exercises) {
  const container = document.getElementById(`swedit-rows-${cardId}`);
  if (!container) return;
  container.innerHTML = "";
  _swEditRowCount[cardId] = 0;
  (exercises || []).forEach((ex, i) => swEditAddRow(cardId, ex));
}

let _swEditRowCount = {};
function swEditAddRow(cardId, ex) {
  if (!_swEditRowCount[cardId]) _swEditRowCount[cardId] = 0;
  const i = _swEditRowCount[cardId]++;
  const container = document.getElementById(`swedit-rows-${cardId}`);
  if (!container) return;
  const div = document.createElement("div");
  div.className = "qe-manual-row";
  div.id = `swedit-row-${cardId}-${i}`;
  div.innerHTML = `
    <div style="flex:3"><input type="text" id="swe-name-${cardId}-${i}" value="${(ex && ex.name) || ""}" placeholder="Exercise name" /></div>
    <div><label style="font-size:0.75rem;color:var(--color-text-muted)">Sets</label><input type="number" id="swe-sets-${cardId}-${i}" value="${(ex && ex.sets) || 3}" min="1" max="20" style="width:54px" /></div>
    <div><label style="font-size:0.75rem;color:var(--color-text-muted)">Reps</label><input type="text" id="swe-reps-${cardId}-${i}" value="${(ex && ex.reps) || ""}" placeholder="e.g. 10" style="width:70px" /></div>
    <div><label style="font-size:0.75rem;color:var(--color-text-muted)">Weight</label><input type="text" id="swe-weight-${cardId}-${i}" value="${(ex && ex.weight) || ""}" placeholder="lbs / BW" style="width:90px" /></div>
    <button class="remove-exercise-btn" onclick="document.getElementById('swedit-row-${cardId}-${i}').remove()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4c0-1.1.9-2 2-2h4a2 2 0 012 2v2"/><path d="M19 6v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button>`;
  container.appendChild(div);
}

function swEditSave(cardId, workoutId) {
  const exercises = [];
  document.querySelectorAll(`[id^="swedit-row-${cardId}-"]`).forEach(row => {
    const idx = row.id.replace(`swedit-row-${cardId}-`, "");
    const name = document.getElementById(`swe-name-${cardId}-${idx}`)?.value.trim();
    if (!name) return;
    exercises.push({
      name,
      sets:   document.getElementById(`swe-sets-${cardId}-${idx}`)?.value   || "3",
      reps:   document.getElementById(`swe-reps-${cardId}-${idx}`)?.value   || "",
      weight: document.getElementById(`swe-weight-${cardId}-${idx}`)?.value || "",
    });
  });
  let schedule = [];
  try { schedule = JSON.parse(localStorage.getItem("workoutSchedule")) || []; } catch {}
  schedule = schedule.map(w => String(w.id) === String(workoutId) ? { ...w, exercises } : w);
  localStorage.setItem("workoutSchedule", JSON.stringify(schedule)); if (typeof DB !== 'undefined') DB.syncSchedule();
  if (typeof selectedDate !== "undefined" && selectedDate) renderDayDetail(selectedDate);
}

// ─── Move / Duplicate session ─────────────────────────────────────────────────

function buildSessionMovePanel(cardId, sourceType, sourceId, dateStr) {
  return `
    <div class="session-move-panel" id="movepanel-${cardId}">
      <label>Select date</label>
      <input type="date" id="movedate-${cardId}" value="${dateStr}" />
      <div class="session-move-actions">
        <button class="btn-secondary" onclick="doMoveSession('${cardId}','${sourceType}','${sourceId}','${dateStr}')">Move</button>
        <button class="btn-primary"   onclick="doDuplicateSession('${cardId}','${sourceType}','${sourceId}','${dateStr}')">Duplicate</button>
      </div>
    </div>`;
}

function toggleMovePanel(cardId) {
  const panel = document.getElementById(`movepanel-${cardId}`);
  if (panel) panel.classList.toggle("is-open");
  // ensure card is expanded
  const card = document.getElementById(cardId);
  if (card && card.classList.contains("is-collapsed")) {
    card.classList.remove("is-collapsed");
  }
}

// ─── Move / Duplicate popup dialog ─────────────────────────────────────────
//
// Replaces the inline movepanel-${cardId} panel when the user picks
// "Move / Duplicate" from a card's overflow menu. The inline panel was
// easy to miss visually (it just expanded inside the collapsed card
// body), so we now open a centered modal instead. The dialog reuses
// the rating-modal-overlay convention (fixed, fade-in via .visible).

function openMoveDialog(cardId, sourceType, sourceId, origDate) {
  // Close any overflow menu that might still be open.
  try { if (typeof closeOverflowMenu === "function") closeOverflowMenu(); } catch {}

  let overlay = document.getElementById("move-session-modal-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "move-session-modal-overlay";
    overlay.className = "move-session-modal-overlay";
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeMoveDialog();
    });
    document.body.appendChild(overlay);
  }
  const safeDate = origDate || getTodayString();
  overlay.innerHTML = `
    <div class="move-session-modal" role="dialog" aria-modal="true" aria-label="Move or duplicate session">
      <div class="move-session-modal-title">Move or duplicate session</div>
      <label class="move-session-modal-label" for="movedate-dialog">New date</label>
      <input type="date" id="movedate-dialog" class="move-session-modal-date" value="${safeDate}" />
      <div class="move-session-modal-actions">
        <button type="button" class="btn-secondary" onclick="closeMoveDialog()">Cancel</button>
        <button type="button" class="btn-secondary" onclick="_doMoveFromDialog('${cardId}','${sourceType}','${sourceId}','${safeDate}')">Move</button>
        <button type="button" class="btn-primary"   onclick="_doDuplicateFromDialog('${cardId}','${sourceType}','${sourceId}','${safeDate}')">Duplicate</button>
      </div>
    </div>
  `;
  // Force a reflow before adding .visible so the CSS transition runs.
  void overlay.offsetWidth;
  overlay.classList.add("visible");
}

function closeMoveDialog() {
  const overlay = document.getElementById("move-session-modal-overlay");
  if (!overlay) return;
  overlay.classList.remove("visible");
  // Match the 200ms fade-out before removing from the DOM.
  setTimeout(() => { const el = document.getElementById("move-session-modal-overlay"); if (el) el.remove(); }, 220);
}

function _doMoveFromDialog(cardId, sourceType, sourceId, origDate) {
  const newDate = document.getElementById("movedate-dialog")?.value;
  if (!newDate) return;
  doMoveSession(cardId, sourceType, sourceId, origDate, newDate);
  closeMoveDialog();
}

function _doDuplicateFromDialog(cardId, sourceType, sourceId, origDate) {
  const newDate = document.getElementById("movedate-dialog")?.value;
  if (!newDate) return;
  doDuplicateSession(cardId, sourceType, sourceId, origDate, newDate);
  closeMoveDialog();
}

// Optional newDateOverride lets the move-session popup dialog pass its
// own date input value without colliding with the inline panel's
// `movedate-${cardId}` input id.
function doMoveSession(cardId, sourceType, sourceId, _origDate, newDateOverride) {
  const newDate = newDateOverride || document.getElementById(`movedate-${cardId}`)?.value;
  if (!newDate) return;
  if (sourceType === "logged") {
    let workouts = [];
    try { workouts = JSON.parse(localStorage.getItem("workouts")) || []; } catch {}
    workouts = workouts.map(w => String(w.id) === String(sourceId) ? { ...w, date: newDate } : w);
    localStorage.setItem("workouts", JSON.stringify(workouts)); if (typeof DB !== 'undefined') DB.syncWorkouts();
  } else if (sourceType === "scheduled") {
    let schedule = [];
    try { schedule = JSON.parse(localStorage.getItem("workoutSchedule")) || []; } catch {}
    schedule = schedule.map(w => String(w.id) === String(sourceId) ? { ...w, date: newDate } : w);
    localStorage.setItem("workoutSchedule", JSON.stringify(schedule)); if (typeof DB !== 'undefined') DB.syncSchedule();
  }
  renderCalendar();
  if (typeof selectedDate !== "undefined" && selectedDate) renderDayDetail(selectedDate);
  if (typeof renderWorkoutHistory === "function") renderWorkoutHistory();
}

function doDuplicateSession(cardId, sourceType, sourceId, _origDate, newDateOverride) {
  const newDate = newDateOverride || document.getElementById(`movedate-${cardId}`)?.value;
  if (!newDate) return;
  if (sourceType === "logged") {
    let workouts = [];
    try { workouts = JSON.parse(localStorage.getItem("workouts")) || []; } catch {}
    const orig = workouts.find(w => String(w.id) === String(sourceId));
    if (orig) {
      workouts.unshift({ ...orig, id: generateId(), date: newDate, completedSessionId: undefined, isCompletion: undefined });
      localStorage.setItem("workouts", JSON.stringify(workouts)); if (typeof DB !== 'undefined') DB.syncWorkouts();
    }
  } else if (sourceType === "scheduled") {
    let schedule = [];
    try { schedule = JSON.parse(localStorage.getItem("workoutSchedule")) || []; } catch {}
    const orig = schedule.find(w => String(w.id) === String(sourceId));
    if (orig) {
      schedule.push({ ...orig, id: generateId(), date: newDate });
      localStorage.setItem("workoutSchedule", JSON.stringify(schedule)); if (typeof DB !== 'undefined') DB.syncSchedule();
    }
  }
  renderCalendar();
  if (typeof selectedDate !== "undefined" && selectedDate) renderDayDetail(selectedDate);
  if (typeof renderWorkoutHistory === "function") renderWorkoutHistory();
}

// ─── Logged workout session card ─────────────────────────────────────────────

function buildLoggedWorkoutCard(w, dateStr, restriction) {
  const { icon, color } = _resolveDiscipline(w);
  const cardId  = `session-log-${w.id}`;
  const _logComplete = isSessionComplete(cardId);
  const _logCompleteCls = _logComplete ? " session-card--completed" : "";

  // ── Circuit workout (CrossFit-style) ──────────────────────────────────────
  // Uses the standard session-card shell so it matches weightlifting /
  // running / swim cards — header row with name + subtitle + action
  // buttons, light theme, and the same Mark as Complete flow. The
  // circuit-specific strip + step tree renders inside the card body via
  // CircuitCard.renderBody().
  if (w.type === "circuit" && w.circuit && typeof window !== "undefined" && window.CircuitCard && window.CircuitCard.renderBody) {
    const circuitForRender = { ...w.circuit, id: w.id, circuit_result: w.circuit_result };
    const bodyHtml = window.CircuitCard.renderBody(circuitForRender);

    // Subtitle: "Circuit · For Time" / "Circuit · AMRAP · 20 min" / "Circuit"
    const _cGoal = w.circuit.goal || "standard";
    const _cGoalValue = w.circuit.goal_value;
    const _cGoalLabel = _cGoal === "for_time" ? "For Time"
                      : _cGoal === "amrap"    ? (_cGoalValue ? `AMRAP · ${_cGoalValue} min` : "AMRAP")
                      : "";
    const _cSubtitle = _cGoalLabel ? `Circuit · ${_cGoalLabel}` : "Circuit";

    // Duration badge: prefer explicit completion time, then rounds+reps,
    // then the session duration target.
    let _cBadge = "";
    if (w.circuit_result && w.circuit_result.time_sec != null && window.CircuitWorkout && window.CircuitWorkout.formatTime) {
      _cBadge = `<span class="session-duration-badge">${window.CircuitWorkout.formatTime(w.circuit_result.time_sec)}</span>`;
    } else if (w.circuit_result && w.circuit_result.rounds != null) {
      const _extra = w.circuit_result.reps ? ` + ${w.circuit_result.reps}` : "";
      _cBadge = `<span class="session-duration-badge">${w.circuit_result.rounds} Rds${_extra}</span>`;
    } else if (w.duration) {
      _cBadge = `<span class="session-duration-badge">${w.duration} min</span>`;
    }

    const _cCompletion = buildCompletionSection(cardId, w.type, null, dateStr, w.duration || null);
    const _cMovePanel  = buildSessionMovePanel(cardId, "logged", w.id, dateStr);
    const _cUndoBtn    = _buildUndoHeaderBtn(cardId, dateStr);
    const _cSessionName = w.circuit.name || "Circuit";
    const _cOverflow   = _buildOverflowMenu(cardId,
      _ovflEditItem(w.id) +
      _ovflMoveItem(cardId, "logged", w.id, dateStr) +
      _ovflShareItem(w) +
      _ovflDeleteItem(`deleteWorkout('${w.id}');renderDayDetail('${dateStr}')`));

    return `
      <div class="session-card collapsible is-collapsed${_logCompleteCls}" id="${cardId}">
        <div class="session-card-header session-card-toggle" onclick="toggleSection('${cardId}')">
          <span class="session-icon" style="color:${color}">${icon}</span>
          <div class="session-meta">
            <div class="session-name">${escHtml(_cSessionName)}</div>
            <div class="session-phase">${escHtml(_cSubtitle)}</div>
          </div>
          <div class="session-header-right">
            ${_cBadge}${_cUndoBtn}${_cOverflow}<span class="card-chevron">▾</span>
          </div>
        </div>
        <div class="card-body">
          ${bodyHtml}
          ${_cMovePanel}
          ${_cCompletion}
        </div>
      </div>`;
  }

  if (w.aiSession) {
    const s = w.aiSession;
    // Map effort label → zone CSS class (supports both old Easy/Moderate/Hard and new Z1-Z6)
    const effortToZone = {
      RW: "rw", Z1: "z1", Z2: "z2", Z3: "z3", Z4: "z4", Z5: "z5", Z6: "z6",
      Easy: "z2", Moderate: "z3", Hard: "z4", Max: "z5", T1: "z-transition",
    };
    const intervals = _expandRepeatGroups(s.intervals || []);
    // Parse a duration string like "5 min", "15s", "30 sec", "2 minutes".
    // Defaults to minutes when the unit is missing. Bare "Ns" / "N s"
    // counts as seconds — without this, "15s" rest reads as 15 minutes
    // and a swim with 8 inter-rep rests inflates by ~100 min.
    const parseDur = str => {
      const t = String(str || "").toLowerCase().trim();
      const m = t.match(/([\d.]+)\s*([a-z]*)/);
      if (!m) return 1;
      const v = parseFloat(m[1]);
      const unit = m[2] || "";
      if (/sec/.test(unit) || unit === "s") return v / 60;
      return v;
    };
    // Estimate minutes from a distance string + zone, using user pace if available.
    const _isSwimWorkout = (w.type === "swim" || w.type === "swimming");
    const _distToMin = (str, zone) => {
      const s = String(str || "").toLowerCase();
      if (!/mi|km|m\b|yd/i.test(s) || /min/.test(s)) return null; // not a distance
      const v = parseFloat(s.match(/([\d.]+)/)?.[1] || 0);
      if (!v) return null;
      const isMi = /mi/i.test(s);
      const isKm = /km/i.test(s);
      const distKm = isMi ? v * 1.60934 : isKm ? v : v / 1000;
      // Swim is ~3× slower per km than running; use swim-specific paces
      // so a 75m drill reads as ~1.5 min, not ~28 sec.
      const paceMap = _isSwimWorkout
        ? { RW: 32, Z1: 28, Z2: 22, Z3: 19, Z4: 17, Z5: 15, Z6: 13 }
        : { RW: 8,  Z1: 7,  Z2: 6.2, Z3: 5.5, Z4: 5, Z5: 4.5, Z6: 4 };
      // Try user zones for more accurate pace
      try {
        const tz = JSON.parse(localStorage.getItem("trainingZones") || "{}");
        if (_isSwimWorkout) {
          const cssRaw = tz.swimming?.css;
          const cssMatch = String(cssRaw || "").match(/(\d+):(\d+)/);
          if (cssMatch) {
            const cssSec = parseInt(cssMatch[1]) * 60 + parseInt(cssMatch[2]);
            // Per-100m pace by zone, anchored to user's CSS.
            const cssOffset = { RW: 25, Z1: 18, Z2: 12, Z3: 5, Z4: 0, Z5: -3, Z6: -6 };
            const offset = cssOffset[zone] != null ? cssOffset[zone] : 12;
            const sec_per_100m = cssSec + offset;
            return (v / 100) * (sec_per_100m / 60); // v = meters
          }
        } else {
          const rz = tz.running || {};
          if (rz.easyPaceMin && zone === "Z2") {
            const userPace = parseFloat(rz.easyPaceMin) + (parseFloat(rz.easyPaceSec || 0) / 60);
            if (userPace > 0) return distKm * userPace / 1.60934 * (isMi ? 1 : 1); // pace is min/mi
          }
        }
      } catch {}
      const pace = paceMap[zone] || (_isSwimWorkout ? 22 : 5.5);
      return distKm * pace;
    };

    // Expand intervals with reps into alternating work/rest segments for the strip
    const allSegs = [];
    intervals.forEach(iv => {
      let reps     = iv.reps || 1;
      let _dur = iv.duration;
      // Fix legacy ladder data
      if (_dur === "ladder" || (reps > 1 && !/\d/.test(_dur))) {
        reps = 1;
        _dur = iv.duration_min ? `${iv.duration_min} min` : "15 min";
      }
      // Legacy running data: old exports sometimes stored a segment's
      // duration as the TOTAL across reps, so we'd extract a per-rep
      // distance from the details text or divide by reps. New-style
      // structured intervals (cycling variants, swim steps, etc.) have
      // a proper per-rep duration and a separate restDuration — never
      // touch those. Gate by workout type AND the absence of restDuration
      // so we don't corrupt the new format.
      const _isLegacyRun = (w.type === "running" || w.type === "run") && !iv.restDuration;
      if (_isLegacyRun && reps > 1 && /\d+\s*min/.test(_dur)) {
        const dm = (iv.details || "").match(/(\d+)\s*[x×]\s*(\d+)\s*m\b/i);
        if (dm) { _dur = `${dm[2]}m`; }
        else { const t = parseFloat(_dur); if (t > 0) _dur = `${Math.round(t / reps)} min`; }
      }
      const mainDur  = _distToMin(_dur, iv.effort) || parseDur(_dur);
      const restDur  = iv.restDuration ? parseDur(iv.restDuration) : 0;
      const mainCls  = effortToZone[iv.effort] || "z2";
      const restCls  = iv.restEffort ? (effortToZone[iv.restEffort] || "z2") : "z-rest";
      for (let i = 0; i < reps; i++) {
        allSegs.push({ dur: mainDur, cls: mainCls, effort: iv.effort, name: iv.name });
        if (i < reps - 1 && restDur > 0) {
          allSegs.push({ dur: restDur, cls: restCls, effort: iv.restEffort || "Z2", name: "Recovery" });
        }
      }
    });

    const totalDur = allSegs.reduce((sum, seg) => sum + seg.dur, 0) || 1;
    const stripSegs = allSegs.map(seg => {
      const pct    = (seg.dur / totalDur * 100).toFixed(2);
      const zNum   = String(seg.effort || "").replace(/[Zz]/, "");
      const zLabel = zNum ? _getZoneLabel(w.type, zNum) : "";
      const tip    = `${seg.name || seg.effort}${zLabel ? ` · ${zLabel}` : ""}`;
      return `<div class="intensity-seg ${seg.cls}" style="width:${pct}%" title="${tip}"></div>`;
    }).join("");
    const strip = stripSegs ? `<div class="session-intensity-strip" onclick="event.stopPropagation();toggleSection('${cardId}')">${stripSegs}</div>` : "";

    const totalDurMin = Math.round(totalDur) || null;
    const isReduced   = restriction && restriction.action === "reduce";
    const displayDur  = (totalDurMin && isReduced) ? getRestrictedDuration(totalDurMin, "moderate", restriction) : totalDurMin;
    const movePanel = buildSessionMovePanel(cardId, "logged", w.id, dateStr);
    const _aiCompletion = buildCompletionSection(cardId, w.type, null, dateStr, displayDur);
    const _restrictNote = isReduced ? `<div class="restriction-session-note" style="margin-bottom:8px">${ICONS.lightbulb} Reduce intensity and duration per your restriction</div>` : "";
    const _aiOverflow = _buildOverflowMenu(cardId,
      _ovflEditItem(w.id) +
      _ovflMoveItem(cardId, "logged", w.id, dateStr) +
      _ovflShareItem(w) +
      _ovflDeleteItem(`deleteWorkout('${w.id}');renderDayDetail('${dateStr}')`));
    return `
      <div class="session-card collapsible is-collapsed${_logCompleteCls}" id="${cardId}">
        <div class="session-card-header session-card-toggle" onclick="toggleSection('${cardId}')">
          <span class="session-icon" style="color:${color}">${icon}</span>
          <div class="session-meta">
            <div class="session-name">${s.title || _wTypeLabel(w.type)}${_logComplete ? ` <span class="session-complete-indicator">${ICONS.check}</span>` : ""}</div>
            <div class="session-phase">${_logComplete ? "Completed" : "Logged"} · ${_wTypeLabel(w.type)}</div>
          </div>
          <div class="session-header-right">
            ${(() => {
              const actual = _getCompletionDuration(cardId);
              if (actual) return `<span class="session-duration-badge">${_fmtBadgeMin(actual)} min</span>`;
              return displayDur ? `<span class="session-duration-badge">${isReduced ? "⬇ " : ""}${displayDur} min</span>` : "";
            })()}
            ${_buildUndoHeaderBtn(cardId, dateStr)}${_aiOverflow}
            <span class="card-chevron">▾</span>
          </div>
        </div>
        ${strip}
        <div class="card-body">
          ${_restrictNote}
          ${(
            // Swim with canonical step tree → Garmin-style card.
            (w.type === "swim" || w.type === "swimming") && Array.isArray(s.steps) && s.steps.length && typeof SwimCardRenderer !== "undefined"
              ? SwimCardRenderer.render(s)
              : (buildAiIntervalsList(s, w.type) || '<p style="color:var(--color-text-muted);font-style:italic;margin:0">No intervals logged</p>')
          )}
          ${movePanel}
          ${_aiCompletion}
        </div>
      </div>`;
  }

  if (w.generatedSession && typeof w.generatedSession === "object") {
    const s = w.generatedSession;
    const _genCompletion = buildCompletionSection(cardId, w.type, null, dateStr, s.duration || null, s.steps);
    const _genOverflow = _buildOverflowMenu(cardId,
      _ovflEditItem(w.id) +
      _ovflShareItem(w) +
      _ovflDeleteItem(`deleteWorkout('${w.id}');renderDayDetail('${dateStr}')`));
    return `
      <div class="session-card collapsible is-collapsed${_logCompleteCls}" id="${cardId}">
        <div class="session-card-header session-card-toggle" onclick="toggleSection('${cardId}')">
          <span class="session-icon" style="color:${color}">${icon}</span>
          <div class="session-meta">
            <div class="session-name">${s.name || _wTypeLabel(w.type)}${_logComplete ? ` <span class="session-complete-indicator">${ICONS.check}</span>` : ""}</div>
            <div class="session-phase">${_logComplete ? "Completed · " : "Planned · "}${_wTypeLabel(w.type)}</div>
          </div>
          <div class="session-header-right">
            <span class="session-duration-badge">${_fmtBadgeMin(_getCompletionDuration(cardId) || s.duration)} min</span>
            ${_buildUndoHeaderBtn(cardId, dateStr)}${_genOverflow}
            <span class="card-chevron">▾</span>
          </div>
        </div>
        ${buildIntensityStrip(s, cardId, w.type)}
        <div class="card-body">${buildStepsList(s, w.type)}${typeof renderFuelingPlanHTML === "function" ? renderFuelingPlanHTML(s.duration, s.name, { load: w.load || s.load, discipline: w.discipline || w.type }) : ""}${_genCompletion}</div>
      </div>`;
  }

  if (w.exercises && w.exercises.length > 0) {
    let hiitHeader = "";
    if (w.hiitMeta) {
      const fmtLabels = { circuit: "Circuit", tabata: "Tabata", emom: "EMOM", amrap: "AMRAP", "for-time": "For Time" };
      const m = w.hiitMeta;
      hiitHeader = `<div class="qe-hiit-summary">${fmtLabels[m.format] || m.format || "HIIT"}`;
      if (m.rounds > 1) hiitHeader += ` &mdash; ${m.rounds} rounds`;
      if (m.restBetweenRounds && m.restBetweenRounds !== "0s") hiitHeader += `, ${m.restBetweenRounds} rest between rounds`;
      hiitHeader += `</div>`;
    }
    const _logCompEx = isSessionComplete(cardId) ? _getCompletionExercises(cardId) : null;
    const _isHyroxEx = w.type === "hyrox" || w.isHyrox;
    const _compRec = _isHyroxEx ? _getCompletionRecord(cardId) : null;
    const _hyroxSplit = _compRec?.hyroxData ? _buildHyroxSplitSummary(_compRec.hyroxData) : "";
    let _displayEx = _logCompEx || w.exercises;
    // Equipment restriction also applies to logged-workout / plan-
    // created weightlifting cards. buildLoggedWorkoutCard doesn't
    // receive the full `data` object, so we read equipmentRestrictions
    // directly from localStorage (same pattern as getDataForDate).
    let _logEqRestriction = null;
    try { const _er = JSON.parse(localStorage.getItem("equipmentRestrictions") || "{}"); _logEqRestriction = _er[dateStr] || _er["permanent"] || null; } catch {}
    if (!_logCompEx && _logEqRestriction && w.type === "weightlifting" && typeof getEquipmentAdjustedExercises === "function") {
      const _nameLc = String(w.notes || w.name || "").toLowerCase();
      const _nameFocus =
        /push/.test(_nameLc) ? "push" :
        /pull/.test(_nameLc) ? "pull" :
        /leg/.test(_nameLc)  ? "legs" :
        /upper/.test(_nameLc) ? "upper" :
        /lower/.test(_nameLc) ? "lower" :
        /chest|bench|press/.test(_nameLc) ? "push" :
        /back|row/.test(_nameLc) ? "pull" :
        "full";
      const _focus = w.strengthFocus || w.focus ||
        (String(w.id).match(/weightlifting-(\w+)-b/)?.[1]) ||
        _nameFocus;
      _displayEx = getEquipmentAdjustedExercises(_displayEx, _focus, w.level || "intermediate", _logEqRestriction);
    }
    const exTable    = hiitHeader + _hyroxSplit + buildExerciseTableHTML(_displayEx, { hiit: w.type === "hiit" || !!w.hiitMeta, hyrox: _isHyroxEx });
    const _completion = buildCompletionSection(cardId, w.type, _logCompEx || w.exercises, dateStr, w.duration || null);
    const movePanel = buildSessionMovePanel(cardId, "logged", w.id, dateStr);
    const _exOverflow = _buildOverflowMenu(cardId,
      _ovflEditItem(w.id) +
      _ovflMoveItem(cardId, "logged", w.id, dateStr) +
      _ovflShareItem(w) +
      _ovflDeleteItem(`deleteWorkout('${w.id}');renderDayDetail('${dateStr}')`));
    const _exDurationBadge = w.duration
      ? `<span class="session-duration-badge">${_fmtBadgeMin(_getCompletionDuration(cardId) || w.duration)} min</span>`
      : "";
    return `
      <div class="session-card collapsible is-collapsed${_logCompleteCls}" id="${cardId}">
        <div class="session-card-header session-card-toggle" onclick="toggleSection('${cardId}')">
          <span class="session-icon" style="color:${color}">${icon}</span>
          <div class="session-meta">
            <div class="session-name">${w.fromSaved || _wTypeLabel(w.type)}${_logComplete ? ` <span class="session-complete-indicator">${ICONS.check}</span>` : ""}</div>
            <div class="session-phase">${_logComplete ? "Completed" : (w.fromSaved ? "Logged · " + _wTypeLabel(w.type) : "Planned")}${(!w.fromSaved && w.notes) ? " · " + w.notes : ""}</div>
          </div>
          <div class="session-header-right">
            ${_exDurationBadge}${_buildUndoHeaderBtn(cardId, dateStr)}${_exOverflow}
            <span class="card-chevron">▾</span>
          </div>
        </div>
        ${w.generatedSession && w.generatedSession.steps ? buildIntensityStrip(w.generatedSession, cardId, w.type) : ""}
        <div class="card-body">
          ${exTable}
          ${movePanel}
          ${_completion}
        </div>
      </div>`;
  }

  // Minimal card (no exercises, no generated session)
  const _minCompletion = buildCompletionSection(cardId, w.type, null, dateStr, w.duration || null);
  const _minOverflow = _buildOverflowMenu(cardId,
    _ovflEditItem(w.id) +
    _ovflShareItem(w) +
    _ovflDeleteItem(`deleteWorkout('${w.id}');renderDayDetail('${dateStr}')`));
  return `
    <div class="session-card collapsible is-collapsed${_logCompleteCls}" id="${cardId}">
      <div class="session-card-header session-card-toggle" onclick="toggleSection('${cardId}')">
        <span class="session-icon" style="color:${color}">${icon}</span>
        <div class="session-meta">
          <div class="session-name">${w.fromSaved || _wTypeLabel(w.type)}</div>
          ${w.fromSaved ? `<div class="session-phase">Logged · ${_wTypeLabel(w.type)}</div>` : (w.notes ? `<div class="session-phase">${escHtml(w.notes)}</div>` : "")}
        </div>
        <div class="session-header-right">${_buildUndoHeaderBtn(cardId, dateStr)}${_minOverflow}<span class="card-chevron">▾</span></div>
      </div>
      <div class="card-body">${_minCompletion}</div>
    </div>`;
}

// ─── Session rendering helpers (TriDot-style) ────────────────────────────────

const SESSION_TYPE_LABELS = { warmup: "WARMUP", main: "MAIN SET", cooldown: "COOLDOWN" };

function _getZoneLabel(sport, zoneNum) {
  try {
    const all = JSON.parse(localStorage.getItem("trainingZones")) || {};
    if (!all.running) {
      const old = JSON.parse(localStorage.getItem("runningZones"));
      if (old) all.running = old;
    }
    const key = sport === "bike" || sport === "cycling" || sport === "brick" ? "biking"
              : sport === "swim" || sport === "swimming" ? "swimming"
              : "running";
    const zData = ((all[key] || {}).zones || {})[`z${zoneNum}`];
    return zData ? (zData.paceRange || zData.wattRange || "") : "";
  } catch { return ""; }
}

/**
 * Expand repeat groups in an intervals array. Consecutive intervals that
 * share the same `repeatGroup` letter are collected and repeated
 * `groupSets` times (default 1). Non-grouped intervals pass through.
 */
function _expandRepeatGroups(intervals) {
  if (!intervals || !intervals.length) return intervals;
  // Fast path: skip if no interval uses repeatGroup
  if (!intervals.some(iv => iv.repeatGroup)) return intervals;
  const out = [];
  let i = 0;
  while (i < intervals.length) {
    const iv = intervals[i];
    if (iv.repeatGroup) {
      const gid = iv.repeatGroup;
      const group = [];
      while (i < intervals.length && intervals[i].repeatGroup === gid) {
        group.push(intervals[i]);
        i++;
      }
      const sets = group[0].groupSets || 1;
      for (let r = 0; r < sets; r++) {
        group.forEach(g => out.push(g));
      }
    } else {
      out.push(iv);
      i++;
    }
  }
  return out;
}

function buildIntensityStrip(session, cardId, discipline) {
  const _isExerciseStep = (step, disc) => {
    if (step.exercise) return true;
    if (!disc || (!disc.startsWith("hyrox") && disc !== "hyroxStrength")) return false;
    const l = (step.label || "").toLowerCase();
    return /station|circuit|strength|lifting|sled|wall ball|farmer|sandbag|skierg|row(?:ing)?.*wall|burpee|goblet|squat|deadlift|pull-up|lunge|plank|push-up|bench|press/.test(l);
  };
  // Expand steps with reps into alternating work/rest segments
  const segments = [];
  session.steps.forEach(step => {
    const ex = _isExerciseStep(step, discipline);
    const isT1 = step.note === "T1";
    if (step.reps && step.rest != null) {
      for (let i = 0; i < step.reps; i++) {
        segments.push({ duration: step.duration, zone: step.zone, exercise: ex });
        if (i < step.reps - 1) segments.push({ duration: step.rest, zone: 1, isRest: true });
      }
    } else {
      segments.push({ duration: step.duration, zone: step.zone, exercise: ex, isTransition: isT1 });
    }
  });

  const total = segments.reduce((s, seg) => s + seg.duration, 0);
  const bars  = segments.map(seg => {
    const pct = (seg.duration / total * 100).toFixed(2);
    const cls = seg.isTransition ? "z-transition"
              : seg.isRest ? "z-rest"
              : `z${seg.zone}${seg.exercise ? " exercise" : ""}`;
    let tip = seg.isTransition ? "Transition"
            : seg.isRest ? "Rest"
            : (seg.exercise ? "Exercise" : `Z${seg.zone}`);
    if (!seg.isRest && !seg.isTransition && discipline) {
      const label = _getZoneLabel(discipline, seg.zone);
      if (label) tip += `: ${label}`;
    }
    return `<div class="intensity-seg ${cls}" style="width:${pct}%" title="${tip}"></div>`;
  }).join("");

  // Overlay fueling markers on the strip
  let fuelMarkers = "";
  if (total >= 60 && typeof generateFuelingPlan === "function" && typeof isFuelingEnabled === "function" && isFuelingEnabled()) {
    const plan = generateFuelingPlan(total);
    if (plan && plan.items && plan.items.length > 0) {
      fuelMarkers = plan.items.map((item, i) => {
        const leftPct = (item.minute / total * 100).toFixed(2);
        return `<div class="fuel-tick" style="left:${leftPct}%" title="${item.source.name} #${i + 1} at min ${item.minute} (${item.carbs}g)"><svg class="fuel-drop" viewBox="0 0 24 28" width="18" height="22"><path d="M12 2C12 2 4 12 4 17a8 8 0 0 0 16 0c0-5-8-15-8-15z" fill="var(--color-accent)" stroke="none"/><text x="12" y="20" text-anchor="middle" fill="#fff" font-size="9" font-weight="700">F${i + 1}</text></svg></div>`;
      }).join("");
    }
  }

  return `<div class="session-intensity-strip" onclick="event.stopPropagation(); toggleSection('${cardId}')" style="position:relative">${bars}${fuelMarkers}</div>`;
}

/**
 * Returns a copy of session with all step durations scaled to match targetDuration.
 * Used to apply progressive run durations stored on plan entries.
 */
function scaleSessionDuration(session, targetDuration) {
  if (!targetDuration || !session || session.duration === targetDuration) return session;
  const scale = targetDuration / session.duration;
  return {
    ...session,
    duration: targetDuration,
    steps: session.steps.map(s => ({
      ...s,
      duration: Math.max(1, Math.round(s.duration * scale)),
      ...(s.rest != null ? { rest: Math.max(1, Math.round(s.rest * scale)) } : {}),
    })),
  };
}

function buildStepsList(session, discipline) {
  // Load zones for the relevant sport from the unified trainingZones key
  let zones = null;
  try {
    const all = JSON.parse(localStorage.getItem("trainingZones")) || {};
    // Migrate legacy runningZones if needed
    if (!all.running) {
      const old = JSON.parse(localStorage.getItem("runningZones"));
      if (old) all.running = old;
    }
    const sport = discipline === "bike" || discipline === "cycling" || discipline === "brick" ? "biking"
                : discipline === "swim" || discipline === "swimming" ? "swimming"
                : discipline === "run"  || discipline === "running" ? "running"
                : null;
    if (sport) zones = (all[sport] || {}).zones || null;
  } catch {}

  // For brick sessions, infer bike-vs-run discipline from position around the
  // T1 transition marker so each step can be tagged with a colored chip.
  const isBrick = discipline === "brick";
  let _seenT1 = false;
  return session.steps.map(step => {
    const isT1      = step.note === "T1";
    const typeLabel = isT1 ? "TRANSITION" : (SESSION_TYPE_LABELS[step.type] || (step.type ? step.type.toUpperCase() : "SET"));
    let brickDisc = null;
    if (isBrick && !isT1) {
      brickDisc = _seenT1 ? "run" : "bike";
    }
    if (isT1) _seenT1 = true;
    let durationText;
    if (step.reps) {
      durationText = `${step.reps} × ${step.duration} min`;
      if (step.rest) durationText += ` (${step.rest} min rest)`;
    } else {
      durationText = isT1 ? "~3 min" : `${step.duration} min`;
    }
    // For brick run segments, show pace from the running zones rather than
    // the bike-watts label that the outer `zones` lookup returns.
    let zData = zones ? zones[`z${step.zone}`] : null;
    if (brickDisc === "run") {
      try {
        const all = JSON.parse(localStorage.getItem("trainingZones")) || {};
        const runZones = (all.running || {}).zones || null;
        if (runZones && runZones[`z${step.zone}`]) zData = runZones[`z${step.zone}`];
      } catch {}
    }
    const zoneLabel = zData ? (zData.paceRange || zData.wattRange || null) : null;
    const stepCls = isT1 ? "session-step--transition" : `session-step--z${step.zone}`;
    const discTag = brickDisc
      ? `<span class="seg-disc-tag seg-disc-${brickDisc}">${brickDisc === "bike" ? "Bike" : "Run"}</span> `
      : "";
    return `
      <div class="session-step ${stepCls}">
        <div class="session-step-meta">
          <span class="session-step-type">${discTag}${typeLabel}</span>
          ${!isT1 ? `<span class="session-step-zone">Z${step.zone}${zoneLabel ? `<span class="session-step-pace">${zoneLabel}</span>` : ""}</span>` : ""}
          <span class="session-step-duration">${durationText}</span>
        </div>
        <div class="session-step-label">${step.label}</div>
      </div>`;
  }).join("");
}

// Renders AI session intervals using the same session-step structure as buildStepsList
function buildAiIntervalsList(session, type) {
  const effortToZone = {
    RW: 0, Z1: 1, Z2: 2, Z3: 3, Z4: 4, Z5: 5, Z6: 6,
    Easy: 2, Moderate: 3, Hard: 4, Max: 5,
  };
  let allZones = null;
  try {
    allZones = JSON.parse(localStorage.getItem("trainingZones")) || {};
    if (!allZones.running) { const old = JSON.parse(localStorage.getItem("runningZones")); if (old) allZones.running = old; }
    // Backfill Z6 pace if missing
    if (allZones.running && allZones.running.zones && !allZones.running.zones.z6 && allZones.running.vdot) {
      const vdot = allZones.running.vdot;
      const a = 0.000104, b = 0.182258;
      const velAt = (p) => { const c = -(4.60 + p * vdot); return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a); };
      const toPace = (vel) => 1609.344 / vel;
      const fmt = (mp) => { let m = Math.floor(mp); let s = Math.round((mp - m) * 60); if (s >= 60) { m++; s -= 60; } return `${m}:${s < 10 ? "0" : ""}${s}`; };
      const vFast = velAt(1.30), vSlow = velAt(1.15);
      allZones.running.zones.z6 = { paceRange: `${fmt(toPace(vFast))}–${fmt(toPace(vSlow))} /mi` };
      localStorage.setItem("trainingZones", JSON.stringify(allZones));
    }
  } catch {}

  function _getIntervalZones(ivSport) {
    if (!allZones) return null;
    // Walking and rowing don't borrow running pace zones. A walker
    // shouldn't see "Z2 7:01/mi" and a rower should see /500m splits,
    // not /mi. Returning null means the renderer shows just the
    // zone tag (e.g., "Z2") with no numeric pace.
    if (type === "walking" || ivSport === "walking") return null;
    if (type === "rowing"  || ivSport === "rowing" || ivSport === "row") return null;
    const key = ivSport === "bike" || ivSport === "cycling" ? "biking"
              : ivSport === "run" || ivSport === "running" ? "running"
              : ivSport === "swim" || ivSport === "swimming" ? "swimming"
              : type === "bike" || type === "cycling" || type === "brick" ? "biking"
              : type === "swim" || type === "swimming" ? "swimming"
              : "running";
    return (allZones[key] || {}).zones || null;
  }

  const ivs = session.intervals || [];

  // Group consecutive intervals with the same repeatGroup into blocks
  const blocks = [];
  let bi = 0;
  while (bi < ivs.length) {
    const iv = ivs[bi];
    if (iv.repeatGroup) {
      const gid = iv.repeatGroup;
      const group = [];
      while (bi < ivs.length && ivs[bi].repeatGroup === gid) { group.push(ivs[bi]); bi++; }
      blocks.push({ repeat: true, sets: group[0].groupSets || 1, items: group });
    } else {
      blocks.push({ repeat: false, items: [iv] });
      bi++;
    }
  }

  function _renderIv(iv) {
    const isTransition = iv.effort === "T1";
    const isRestWalk   = iv.effort === "RW";
    const zone  = (isTransition || isRestWalk) ? null : (effortToZone[iv.effort] || 2);
    const zones = _getIntervalZones(iv.sport);
    const zData = zone && zones ? zones[`z${zone}`] : null;
    const zoneLabel = zData ? (zData.paceRange || zData.wattRange || null) : null;
    let reps  = iv.reps || 1;
    let perRepDur = iv.duration;
    // Fix legacy ladder data: "ladder" is not a per-rep duration — show as single set
    if (perRepDur === "ladder" || (reps > 1 && !/\d/.test(perRepDur))) {
      reps = 1;
      // Try to extract total duration from details (e.g., "Ladder 1600m / 1200m / ...")
      perRepDur = "";
    }
    // Legacy running data: older exports stored segment duration as TOTAL
    // across reps; we'd extract a per-rep distance or divide by reps. New
    // structured intervals (cycling variants, swim steps, etc.) have a
    // proper per-rep duration AND a separate restDuration — never rewrite
    // those. Gate by workout type and the absence of restDuration so the
    // fix only fires where the legacy assumption actually holds.
    const _isLegacyRun = (type === "running" || type === "run") && !iv.restDuration;
    if (_isLegacyRun && reps > 1 && /\d+\s*min/.test(perRepDur)) {
      const distMatch = (iv.details || "").match(/(\d+)\s*[x×]\s*(\d+)\s*m\b/i);
      if (distMatch) {
        perRepDur = `${distMatch[2]}m`;
      } else {
        // Divide total by reps as fallback
        const totalMin = parseFloat(perRepDur);
        if (totalMin > 0) {
          perRepDur = `${Math.round(totalMin / reps)} min`;
        }
      }
    }
    let durText = reps > 1 ? `${reps} × ${perRepDur}` : (perRepDur || iv.duration);
    if (reps > 1 && iv.restDuration) durText += ` (${iv.restDuration} rest)`;
    const nameLow   = (iv.name || "").toLowerCase();
    const sportTag  = iv.sport ? `<span class="qe-brick-sport qe-brick-${iv.sport}">${iv.sport === "bike" ? "Bike" : "Run"}</span> ` : "";

    // Effective name: if the segment is labeled as "interval(s)" but has
    // no actual repeat structure (reps <= 1 and no restDuration), the
    // label is stale — a continuous Z3 block is tempo, not intervals.
    // Rename it from the effort zone instead. Preserves existing logged
    // workouts that were generated before the swim generator fix.
    let effectiveName = iv.name || "";
    const hasRepeatStructure = (iv.reps && iv.reps > 1)
                            || !!iv.restDuration
                            || !!iv.repeatGroup;
    if (/interval/i.test(effectiveName) && !hasRepeatStructure) {
      const zoneNames = {
        Z1: "Easy", Z2: "Aerobic", Z3: "Tempo", Z4: "Threshold",
        Z5: "VO2max", Z6: "Sprint",
      };
      effectiveName = zoneNames[iv.effort] || effectiveName;
    }
    const effectiveNameLow = effectiveName.toLowerCase();

    const typeLabel = isTransition ? "TRANSITION"
                    : /warm/i.test(nameLow) ? "WARMUP"
                    : /cool/i.test(nameLow) ? "COOLDOWN"
                    : /recov/i.test(effectiveNameLow) ? "RECOVERY"
                    : effectiveName ? effectiveName.toUpperCase() : "INTERVAL";
    const stepCls   = isTransition ? "session-step--transition" : isRestWalk ? "session-step--rw" : `session-step--z${zone}`;
    const zoneBadge = isTransition ? "T1" : isRestWalk ? "RW" : `Z${zone}${zoneLabel ? `<span class="session-step-pace">${zoneLabel}</span>` : ""}`;
    // Top row: name on left, duration on right. Zone badge moves to its
    // own row underneath so it isn't squeezed between name and duration.
    return `
      <div class="session-step ${stepCls}">
        <div class="session-step-meta">
          <span class="session-step-type">${sportTag}${typeLabel}</span>
          <span class="session-step-duration">${durText}</span>
        </div>
        <div class="session-step-zone-row"><span class="session-step-zone">${zoneBadge}</span></div>
        ${iv.details ? `<div class="session-step-label">${escHtml(iv.details)}</div>` : ""}
      </div>`;
  }

  return blocks.map(block => {
    if (block.repeat && block.sets > 1) {
      const inner = block.items.map(_renderIv).join("");
      return `<div class="session-repeat-block">
        <div class="session-repeat-label">${block.sets}× Repeat</div>
        ${inner}
      </div>`;
    }
    return block.items.map(_renderIv).join("");
  }).join("");
}

// ─── Workout completion ───────────────────────────────────────────────────────

const DISCIPLINE_TO_WORKOUT_TYPE = {
  swim: "triathlon", bike: "cycling", run: "running", brick: "triathlon", race: "triathlon",
  weightlifting: "weightlifting", cycling: "cycling", running: "running",
  triathlon: "triathlon", general: "general", yoga: "general",
  stairstepper: "stairstepper",
  hyrox: "hyrox",
  hyroxStrength: "hyrox",
};

// In-memory map of exercises for each completion form (populated during renderDayDetail)
const _completionExerciseMap = {};

function loadCompletionMeta() {
  try { return JSON.parse(localStorage.getItem("completedSessions")) || {}; } catch { return {}; }
}


function isSessionComplete(sessionId) {
  return !!loadCompletionMeta()[sessionId];
}

function _getCompletionExercises(sessionId) {
  try {
    const workouts = JSON.parse(localStorage.getItem("workouts")) || [];
    const rec = workouts.find(w => w.isCompletion && w.completedSessionId === sessionId);
    return rec && rec.exercises && rec.exercises.length > 0 ? rec.exercises : null;
  } catch { return null; }
}

function _getCompletionRecord(sessionId) {
  try {
    const workouts = JSON.parse(localStorage.getItem("workouts")) || [];
    return workouts.find(w => w.isCompletion && w.completedSessionId === sessionId) || null;
  } catch { return null; }
}

function _buildHyroxSplitSummary(hd) {
  if (!hd) return "";
  const _fmtMs = ms => {
    const sec = Math.floor((ms || 0) / 1000);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h > 0 ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${m}:${String(s).padStart(2,"0")}`;
  };
  return `
    <div style="display:flex;gap:10px;margin:8px 0 10px">
      <div style="flex:1;text-align:center;padding:6px 8px;border-radius:6px;background:rgba(59,130,246,0.1)">
        <div style="font-size:0.7rem;opacity:0.7">Running</div>
        <div style="font-weight:700;font-variant-numeric:tabular-nums">${_fmtMs(hd.totalRunMs)}</div>
      </div>
      <div style="flex:1;text-align:center;padding:6px 8px;border-radius:6px;background:rgba(245,158,11,0.1)">
        <div style="font-size:0.7rem;opacity:0.7">Stations</div>
        <div style="font-weight:700;font-variant-numeric:tabular-nums">${_fmtMs(hd.totalStationMs)}</div>
      </div>
      <div style="flex:1;text-align:center;padding:6px 8px;border-radius:6px;background:rgba(34,197,94,0.1)">
        <div style="font-size:0.7rem;opacity:0.7">Total</div>
        <div style="font-weight:700;font-variant-numeric:tabular-nums">${_fmtMs(hd.totalMs)}</div>
      </div>
    </div>`;
}

function hasAnyCompletedSession(dateStr) {
  if (dateStr > getTodayString()) return false;
  try {
    const workouts = JSON.parse(localStorage.getItem("workouts")) || [];
    // Only count explicit completion receipts (isCompletion === true is
    // what the Mark as Complete flow sets) and Strava imports (externally
    // logged activity, always authoritative). The bare `completed: true`
    // flag is too loose — some legacy code paths set it on scheduled
    // workouts before they're actually finished, which made the calendar
    // green-tint a day where nothing had been done.
    const hasWorkoutCompletion = workouts.some(w =>
      w.date === dateStr && (w.isCompletion === true || w.source === "strava")
    );
    if (hasWorkoutCompletion) return true;
    // Secondary source of truth: the Mark as Complete flow also writes
    // a metadata entry into completedSessions keyed by session id. If
    // the entry's date matches, the day was actually completed.
    const meta = JSON.parse(localStorage.getItem("completedSessions") || "{}");
    for (const sid in meta) {
      const entry = meta[sid];
      if (entry && entry.date === dateStr) return true;
    }
    return false;
  } catch { return false; }
}

function undoSessionCompletion(sessionId, dateStr) {
  // Remove from completedSessions
  const meta = loadCompletionMeta();
  const entry = meta[sessionId];
  delete meta[sessionId];
  localStorage.setItem("completedSessions", JSON.stringify(meta)); if (typeof DB !== 'undefined') DB.syncKey('completedSessions');

  // Remove the matching isCompletion workout record
  if (entry?.workoutId) {
    let workouts = [];
    try { workouts = JSON.parse(localStorage.getItem("workouts")) || []; } catch {}
    workouts = workouts.filter(w => String(w.id) !== String(entry.workoutId));
    localStorage.setItem("workouts", JSON.stringify(workouts)); if (typeof DB !== 'undefined') DB.syncWorkouts();

    // Clean up associated rating
    if (typeof loadWorkoutRatings === "function") {
      const ratings = loadWorkoutRatings();
      delete ratings[String(entry.workoutId)];
      localStorage.setItem("workoutRatings", JSON.stringify(ratings)); if (typeof DB !== 'undefined') DB.syncKey('workoutRatings');
    }
  }

  renderCalendar();
  if (typeof selectedDate !== "undefined" && selectedDate) renderDayDetail(selectedDate);
  if (typeof renderWorkoutHistory === "function") renderWorkoutHistory();
}

// ─── Overflow menu (Edit / Move / Delete) ────────────────────────────────
//
// Cards used to cram a duration badge, undo, move, share, edit, delete and
// chevron all in the same header row — six interactive elements on one
// line. We now hoist Edit / Move / Delete into a •••-triggered popover so
// the header row has only: duration badge, share, overflow, chevron (plus
// undo when the session is complete).
//
// Share stays visible because share.js's document-level delegator runs in
// capture phase and calls stopPropagation — there's no reliable way to
// auto-close the overflow menu when share is triggered from inside it.
// Leaving share as its own small icon button is the least-hacky option.

let _openOverflowMenuId = null;
let _overflowCloseHandler = null;

function closeOverflowMenu() {
  if (_openOverflowMenuId) {
    const el = document.getElementById(_openOverflowMenuId);
    if (el) el.hidden = true;
    _openOverflowMenuId = null;
  }
  if (_overflowCloseHandler) {
    document.removeEventListener("click", _overflowCloseHandler);
    _overflowCloseHandler = null;
  }
}

function toggleOverflowMenu(e, menuId) {
  if (e && e.stopPropagation) e.stopPropagation();
  // Opening a different menu → close the current one first.
  if (_openOverflowMenuId && _openOverflowMenuId !== menuId) closeOverflowMenu();
  const el = document.getElementById(menuId);
  if (!el) return;
  const willOpen = el.hidden;
  if (!willOpen) { closeOverflowMenu(); return; }
  el.hidden = false;
  _openOverflowMenuId = menuId;
  // Click-outside to dismiss. Registered async so the click that opened
  // the menu doesn't immediately trigger the outside handler.
  setTimeout(() => {
    _overflowCloseHandler = (evt) => {
      if (!el.contains(evt.target)) closeOverflowMenu();
    };
    document.addEventListener("click", _overflowCloseHandler);
  }, 0);
}

// Builds the •••-button + hidden popover wrapper. innerHtml is the menu
// items already stringified by the caller.
function _buildOverflowMenu(cardId, innerHtml) {
  if (!innerHtml || !innerHtml.trim()) return "";
  const menuId = `ovflow-${cardId}`;
  return `<div class="overflow-menu-wrap">
    <button class="overflow-menu-btn" title="More actions" aria-label="More actions" onclick="toggleOverflowMenu(event,'${menuId}')">⋯</button>
    <div class="overflow-menu" id="${menuId}" hidden>${innerHtml}</div>
  </div>`;
}

// Menu-item builders. Each returns a <button> with a consistent label.
// stopPropagation is required so the parent .session-card-toggle onclick
// doesn't collapse/expand the card when the user picks an action.
function _ovflEditItem(workoutId) {
  return `<button class="ovflow-item" onclick="event.stopPropagation();closeOverflowMenu();openEditWorkout('${workoutId}')">Edit</button>`;
}
function _ovflMoveItem(cardId, sourceType, sourceId, origDate) {
  return `<button class="ovflow-item" onclick="event.stopPropagation();closeOverflowMenu();openMoveDialog('${cardId}','${sourceType}','${sourceId}','${origDate}')">Move / Duplicate</button>`;
}
// Delete takes a raw onclick expression because callers vary between
// deleteWorkout(id), deleteScheduledWorkout(id, dateStr), etc., and some
// also need to re-render the day detail inline.
function _ovflDeleteItem(onclickExpr) {
  return `<button class="ovflow-item ovflow-item--danger" onclick="event.stopPropagation();closeOverflowMenu();${onclickExpr}">Delete</button>`;
}
// Share item — stashes the workout entry in _calShareFallbackCache and
// returns a menu item that, on click, closes the overflow menu and then
// invokes the share action sheet directly via _invokeShareFromOverflow.
// We cannot route this through share.js's document-level delegator —
// that handler runs in the capture phase and calls stopPropagation,
// which would prevent our onclick from firing and leave the overflow
// menu stuck open behind the share sheet.
function _ovflShareItem(entry) {
  if (!entry) return "";
  try {
    const cacheKey = "cal" + (++_calShareSeq);
    _calShareFallbackCache[cacheKey] = entry;
    if (typeof window !== "undefined") window.__calShareFallbackCache = _calShareFallbackCache;
    return `<button class="ovflow-item" onclick="event.stopPropagation();closeOverflowMenu();_invokeShareFromOverflow('${cacheKey}')">Share</button>`;
  } catch (e) {
    console.warn("[IronZ] share overflow item render skipped:", e.message);
    return "";
  }
}

// Direct share invocation — reads the entry from the calendar's local
// fallback cache and calls window.ShareActionSheet.open (or native share
// on touch devices), replicating what share.js's delegator does without
// going through the delegator itself.
if (typeof window !== "undefined") {
  window._invokeShareFromOverflow = function (cacheKey) {
    const entry = (window.__calShareFallbackCache || {})[cacheKey];
    if (!entry) { console.warn("[IronZ] overflow share: entry not found for", cacheKey); return; }
    const source = "calendar";
    const preferNative = !!(navigator.share && "ontouchstart" in window);
    if (preferNative && typeof window.shareWorkoutLinkDirect === "function") {
      window.shareWorkoutLinkDirect(entry, source, "native");
      return;
    }
    if (window.ShareActionSheet && window.ShareActionSheet.open) {
      window.ShareActionSheet.open(entry, source);
    } else if (typeof window.shareWorkoutLinkDirect === "function") {
      window.shareWorkoutLinkDirect(entry, source, "clipboard");
    }
  };
}

// Returns header-level undo button shown in collapsed view when session is complete
function _buildUndoHeaderBtn(sessionId, dateStr) {
  if (!isSessionComplete(sessionId)) return "";
  return `<button class="undo-complete-btn-header" title="Undo completion" onclick="event.stopPropagation();undoSessionCompletion('${sessionId}','${dateStr}')">↩ Undo</button>`;
}

// ─── Share button (delegates to share.js) ──────────────────────────────────
//
// Icon-only button that opens the share action sheet. The click is handled
// by a document-level delegator in share.js (via [data-share-key]), so the
// inline onclick attribute is unnecessary — this helper just emits the
// button markup. The button HTML is generated INLINE here so rendering
// never silently fails because of a missing share.js symbol — we only
// need the entry-cache helper, and even that falls back to a local cache.
const _calShareSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>';
let _calShareSeq = 0;
const _calShareFallbackCache = {};

function _buildShareBtnFromEntry(entry) {
  try {
    if (!entry) return "";
    // Preferred: go through share.js's cache so the delegator there
    // can resolve the click. Fall back to a local cache + window.__calShare
    // lookup if share.js isn't loaded for any reason — the button always
    // renders, and the click still works as long as share.js is eventually
    // loaded (it is, via index.html).
    let cacheKey = null;
    if (typeof window !== "undefined" && typeof window.stashShareEntry === "function") {
      cacheKey = window.stashShareEntry(entry);
    }
    if (!cacheKey) {
      cacheKey = "cal" + (++_calShareSeq);
      _calShareFallbackCache[cacheKey] = entry;
      // Attach the fallback cache to window so share.js's delegator
      // (registered in a different script) can still resolve it.
      if (typeof window !== "undefined") {
        window.__calShareFallbackCache = _calShareFallbackCache;
      }
    }
    return '<button type="button" class="share-icon-btn" title="Share" aria-label="Share workout"'
         + ' data-share-key="' + cacheKey + '" data-share-source="calendar">'
         + _calShareSvg
         + '</button>';
  } catch (e) {
    console.warn("[IronZ] share button render skipped:", e.message);
    return "";
  }
}

/** Returns the completed duration for a session, if available */
function _getCompletionDuration(sessionId) {
  try {
    const _m = loadCompletionMeta()[sessionId];
    if (_m?.workoutId) {
      const _w = (JSON.parse(localStorage.getItem("workouts") || "[]")).find(w => w.id === _m.workoutId);
      if (_w?.duration) return _w.duration;
    }
  } catch {}
  return null;
}

// Duration badges show whole minutes. mm:ss completion input can land at
// values like 26.2333 (= 26 min 14 sec) which looks broken in the badge.
function _fmtBadgeMin(v) {
  if (v == null || v === "") return "";
  const n = typeof v === "number" ? v : parseFloat(v);
  if (!isFinite(n)) return String(v);
  return String(Math.round(n));
}

const _ENDURANCE_TYPES = new Set(["running", "cycling", "swimming", "triathlon", "stairstepper"]);

// Running / cycling / swimming workouts come in with sub-type keys like
// "tempo_threshold" or "speed_work" or "swim_css_intervals". Resolve those
// to the parent discipline so the completion form's Distance field (and
// the pace-sanity-check) actually fire.
function _resolveEnduranceType(type) {
  const t = String(type || "").toLowerCase();
  if (_ENDURANCE_TYPES.has(t)) return t;
  const RUN_SUBS = new Set([
    "easy_recovery", "endurance", "long_run", "tempo_threshold",
    "track_workout", "speed_work", "hills", "fun_social",
    "recovery_run", "base_run", "progression_run", "run",
  ]);
  if (RUN_SUBS.has(t)) return "running";
  const BIKE_SUBS = new Set([
    "bike_endurance", "bike_tempo", "bike_threshold", "bike_intervals",
    "bike_vo2", "bike_recovery", "bike_long", "bike_sweetspot", "bike",
  ]);
  if (BIKE_SUBS.has(t)) return "cycling";
  if (t.startsWith("swim")) return "swimming";
  return t;
}

// Build the Distance input for the completion form. Swim uses meters or
// yards (not miles/km), with a unit toggle defaulting to the user's pool
// size setting. All other endurance types use the global mi/km setting.
function _buildDistanceField(sessionId, type, globalUnit) {
  if (type === "swimming") {
    let defaultUnit = "m";
    try {
      if (typeof SwimWorkout !== "undefined" && SwimWorkout.getUserPoolSize) {
        defaultUnit = SwimWorkout.getUserPoolSize().unit || "m";
      }
    } catch {}
    const mSel = defaultUnit === "m" ? " selected" : "";
    const ydSel = defaultUnit === "yd" ? " selected" : "";
    const placeholder = defaultUnit === "yd" ? "e.g. 1500" : "e.g. 1400";
    return `
      <div class="completion-dur-row">
        <label class="completion-field-label">Distance</label>
        <div style="display:flex;gap:8px;align-items:center">
          <input type="number" id="cdist-${sessionId}" class="completion-dur-input"
            placeholder="${placeholder}" min="0" step="10" style="flex:1" />
          <select id="cdistunit-${sessionId}" class="completion-unit-select">
            <option value="m"${mSel}>m</option>
            <option value="yd"${ydSel}>yd</option>
          </select>
        </div>
      </div>`;
  }
  return `
    <div class="completion-dur-row">
      <label class="completion-field-label">Distance (${globalUnit})</label>
      <input type="number" id="cdist-${sessionId}" class="completion-dur-input"
        placeholder="e.g. 3.1" min="0" step="0.1" />
    </div>`;
}

function buildCompletionSection(sessionId, type, exercises, dateStr, suggestedDuration, steps) {
  // No completion UI for future dates
  if (dateStr > getTodayString()) return "";

  if (isSessionComplete(sessionId)) {
    // Pull duration/distance from the completion workout record
    let _compSummary = "";
    try {
      const _cMeta = loadCompletionMeta()[sessionId];
      if (_cMeta?.workoutId) {
        const _cW = (JSON.parse(localStorage.getItem("workouts") || "[]")).find(w => w.id === _cMeta.workoutId);
        if (_cW) {
          const _parts = [];
          if (_cW.duration) _parts.push(`${_cW.duration} min`);
          if (_cW.distance) {
            // Swim records carry their own distance_unit (m or yd); other
            // sports use the global mi/km setting.
            const _u = _cW.distance_unit
              || (typeof getDistanceUnit === "function" ? getDistanceUnit() : "mi");
            _parts.push(`${_cW.distance} ${_u}`);
          }
          if (_parts.length) _compSummary = ` · ${_parts.join(" · ")}`;
        }
      }
    } catch {}
    // Check for rating and share on the completion workout
    let _ratingHtml = "";
    let _shareBtn = "";
    try {
      const _cMeta2 = loadCompletionMeta()[sessionId];
      if (_cMeta2?.workoutId) {
        _ratingHtml = buildRatingDisplay(String(_cMeta2.workoutId));
        if (typeof buildShareButton === "function") _shareBtn = buildShareButton(String(_cMeta2.workoutId), dateStr);
      }
    } catch {}
    return `<div class="session-completed-badge">
      ${ICONS.check} Completed${_compSummary}
      ${_ratingHtml}
      ${_shareBtn}
      <button class="undo-complete-btn" onclick="undoSessionCompletion('${sessionId}','${dateStr}')">Undo</button>
    </div>`;
  }

  // Store exercises so saveSessionCompletion can access them by sessionId
  _completionExerciseMap[sessionId] = exercises || [];

  const hasExercises = !!(exercises && exercises.length > 0);
  let formBody = "";

  if (hasExercises) {
    const rows = exercises.map((ex, i) => {
      // For sets: extract leading number (e.g. "3 sets" → 3, "3-4" → 3)
      const setsVal = ex.sets ? (String(ex.sets).match(/^\d+/) || ["3"])[0] : "3";
      // For reps: if setDetails exist (pyramid), show range; otherwise use base value
      let repsVal = ex.reps ? String(ex.reps).split(/[-–]/)[0].trim() : "";
      if (ex.setDetails && ex.setDetails.length) {
        const rNums = ex.setDetails.map(sd => parseInt(sd.reps)).filter(n => !isNaN(n));
        if (rNums.length) {
          const rMin = Math.min(...rNums), rMax = Math.max(...rNums);
          repsVal = rMin === rMax ? String(rMin) : `${rMin}-${rMax}`;
        }
      }
      // For weight: extract total numeric weight, or keep descriptive text
      let weightVal = String(ex.weight || "").trim();
      // If setDetails exist, show weight range
      if (ex.setDetails && ex.setDetails.length) {
        const wNums = ex.setDetails.map(sd => { const m = String(sd.weight||"").match(/([\d.]+)/); return m ? parseFloat(m[1]) : NaN; }).filter(n => !isNaN(n));
        if (wNums.length) {
          const wMin = Math.min(...wNums), wMax = Math.max(...wNums);
          const unit = String(ex.setDetails[0].weight||"").replace(/[\d.]+/, "").trim() || "lbs";
          weightVal = wMin === wMax ? `${wMin}` : `${wMin}-${wMax}`;
        }
      }
      if (/bodyweight/i.test(weightVal)) {
        weightVal = "BW";
      } else if (/bar\s*\+\s*([\d.]+)/i.test(weightVal)) {
        const m = weightVal.match(/bar\s*\+\s*([\d.]+)/i);
        weightVal = String(Math.round((45 + parseFloat(m[1])) / 5) * 5);
      } else if (/^([\d.]+)\s*[x×]\s*([\d.]+)/i.test(weightVal)) {
        const m = weightVal.match(/^([\d.]+)\s*[x×]\s*([\d.]+)/i);
        weightVal = String(Math.round(parseFloat(m[2]) / 5) * 5);
      } else {
        const wNum = weightVal.match(/^[\d.]+/);
        if (wNum) weightVal = String(Math.round(parseFloat(wNum[0]) / 5) * 5);
      }
      return `
      <div class="completion-ex-row" id="cex-row-${sessionId}-${i}">
        <span class="completion-ex-name">${escHtml(ex.name)}</span>
        <input class="qe-edit-sets" type="text" inputmode="numeric" id="cex-sets-${sessionId}-${i}"
          value="${setsVal}" onchange="cexCollapseSets('${sessionId}',${i})" />
        <span class="completion-x">×</span>
        <input class="qe-edit-reps" id="cex-reps-${sessionId}-${i}"
          value="${repsVal}" placeholder="reps" />
        <input class="qe-weight-input" id="cex-weight-${sessionId}-${i}"
          value="${weightVal}" placeholder="lbs / BW" />
      </div>
      <div class="completion-expand-wrap" id="cex-expand-wrap-${sessionId}-${i}">
        <button class="completion-expand-btn" onclick="cexExpandSets('${sessionId}',${i})">Log per set</button>
        <div class="completion-set-details" id="cex-details-${sessionId}-${i}" style="display:none"></div>
      </div>`;
    }).join("");
    const _unit = typeof getDistanceUnit === "function" ? getDistanceUnit() : "mi";
    const _resolvedType = _resolveEnduranceType(type);
    const _distBlock = _ENDURANCE_TYPES.has(_resolvedType) ? _buildDistanceField(sessionId, _resolvedType, _unit) : "";
    formBody = `
      <div class="completion-ex-header">
        <span></span><span>Sets</span><span></span><span>Reps</span><span>Weight</span>
      </div>
      ${rows}
      <div class="completion-dur-row" style="margin-top:10px">
        <label class="completion-field-label">Duration</label>
        ${_buildDurationMinSecField(sessionId, suggestedDuration)}
      </div>
      ${_distBlock}
      ${type === "cycling" ? `<div class="completion-dur-row">
        <label class="completion-field-label">Avg Power (watts) <span class="optional-tag">optional</span></label>
        <input type="number" id="cwatts-${sessionId}" class="completion-dur-input"
          placeholder="e.g. 205" min="0" max="2000" />
      </div>` : ""}
      <textarea id="cnotes-${sessionId}" class="completion-notes"
        placeholder="Notes (optional)"></textarea>`;
  } else {
    const _cUnit = typeof getDistanceUnit === "function" ? getDistanceUnit() : "mi";
    const _cResolvedType = _resolveEnduranceType(type);
    const _cDistBlock = _ENDURANCE_TYPES.has(_cResolvedType) ? _buildDistanceField(sessionId, _cResolvedType, _cUnit) : "";
    formBody = `
      <div class="completion-cardio-fields">
        <div class="completion-dur-row">
          <label class="completion-field-label">Duration</label>
          ${_buildDurationMinSecField(sessionId, suggestedDuration)}
        </div>
        ${_cDistBlock}
        ${type === "cycling" ? `<div class="completion-dur-row">
          <label class="completion-field-label">Avg Power (watts) <span class="optional-tag">optional</span></label>
          <input type="number" id="cwatts-${sessionId}" class="completion-dur-input"
            placeholder="e.g. 205" min="0" max="2000" />
        </div>` : ""}
        <textarea id="cnotes-${sessionId}" class="completion-notes"
          placeholder="Notes (optional)"></textarea>
      </div>`;
  }

  // Live Tracker button
  const _liveBtn = typeof buildLiveTrackerButton === "function"
    ? buildLiveTrackerButton(sessionId, type, dateStr, steps || null, exercises || null)
    : "";

  return `
    <div class="session-complete-section">
      <div class="session-complete-btns">
        ${_liveBtn}
        <button class="btn-complete-toggle" id="cbtn-${sessionId}"
          onclick="toggleCompletionForm('${sessionId}')">${ICONS.check} Mark as Complete</button>
      </div>
      <div class="completion-form" id="cform-${sessionId}" style="display:none">
        ${formBody}
        <button class="btn-complete-save"
          onclick="saveSessionCompletion('${sessionId}','${type}','${dateStr}',${hasExercises})">
          Save
        </button>
      </div>
    </div>`;
}

function toggleCompletionForm(sessionId) {
  const form = document.getElementById(`cform-${sessionId}`);
  const btn  = document.getElementById(`cbtn-${sessionId}`);
  if (!form) return;
  const opening = form.style.display === "none";
  form.style.display = opening ? "" : "none";
  if (btn) btn.innerHTML = opening
    ? `${ICONS.ban} Cancel`
    : `${ICONS.check} Mark as Complete`;
}

// ── Per-set expansion for completion form ────────────────────────────────────

function cexExpandSets(sessionId, exIdx) {
  const setsInput  = document.getElementById(`cex-sets-${sessionId}-${exIdx}`);
  const repsInput  = document.getElementById(`cex-reps-${sessionId}-${exIdx}`);
  const weightInput = document.getElementById(`cex-weight-${sessionId}-${exIdx}`);
  const detailsEl  = document.getElementById(`cex-details-${sessionId}-${exIdx}`);
  const btnEl      = detailsEl?.previousElementSibling || detailsEl?.parentElement?.querySelector(".completion-expand-btn");
  if (!detailsEl) return;

  const numSets = parseInt(setsInput?.value) || 3;
  const reps    = repsInput?.value || "";
  const weight  = weightInput?.value || "";

  // Hide the summary row's sets/reps/weight inputs (keep name visible)
  const row = document.getElementById(`cex-row-${sessionId}-${exIdx}`);
  if (row) {
    row.querySelectorAll("input, .completion-x").forEach(el => el.style.display = "none");
  }

  // Check for existing setDetails (pyramid) on the exercise
  const exData = (_completionExerciseMap[sessionId] || [])[exIdx];
  const setDetails = exData?.setDetails || null;

  let html = `<div class="completion-set-header">
    <span></span><span>Reps</span><span>Weight</span>
  </div>`;
  for (let s = 0; s < numSets; s++) {
    const sd = setDetails && setDetails[s];
    const setReps = sd ? sd.reps : reps;
    const setWeight = sd ? sd.weight : weight;
    html += `<div class="completion-set-row">
      <span class="completion-set-label">Set ${s + 1}</span>
      <input class="qe-edit-reps" id="cex-sd-reps-${sessionId}-${exIdx}-${s}" value="${setReps}" placeholder="reps" />
      <input class="qe-weight-input" id="cex-sd-wt-${sessionId}-${exIdx}-${s}" value="${setWeight}" placeholder="lbs" />
    </div>`;
  }
  html += `<button class="completion-collapse-btn" onclick="cexCollapseSets('${sessionId}',${exIdx})">Collapse</button>`;
  detailsEl.innerHTML = html;
  detailsEl.style.display = "";
  if (btnEl?.classList.contains("completion-expand-btn")) btnEl.style.display = "none";
}

function cexCollapseSets(sessionId, exIdx) {
  const detailsEl = document.getElementById(`cex-details-${sessionId}-${exIdx}`);
  const btnEl     = detailsEl?.parentElement?.querySelector(".completion-expand-btn");
  if (detailsEl) { detailsEl.style.display = "none"; detailsEl.innerHTML = ""; }
  if (btnEl) btnEl.style.display = "";

  // Restore summary row inputs
  const row = document.getElementById(`cex-row-${sessionId}-${exIdx}`);
  if (row) {
    row.querySelectorAll("input, .completion-x").forEach(el => el.style.display = "");
  }
}

function _cexReadSetDetails(sessionId, exIdx) {
  // Returns setDetails array if expanded, or null if collapsed
  const detailsEl = document.getElementById(`cex-details-${sessionId}-${exIdx}`);
  if (!detailsEl || detailsEl.style.display === "none" || !detailsEl.innerHTML) return null;

  const setsInput = document.getElementById(`cex-sets-${sessionId}-${exIdx}`);
  const numSets = parseInt(setsInput?.value) || 3;
  const details = [];
  for (let s = 0; s < numSets; s++) {
    details.push({
      reps:   document.getElementById(`cex-sd-reps-${sessionId}-${exIdx}-${s}`)?.value || "",
      weight: document.getElementById(`cex-sd-wt-${sessionId}-${exIdx}-${s}`)?.value   || "",
    });
  }
  // Only return if at least one set differs from the others
  const allSame = details.every(d => d.reps === details[0].reps && d.weight === details[0].weight);
  return allSame ? null : details;
}

/**
 * Parse duration input that supports mm:ss (e.g. "19:42") or plain minutes (e.g. "45").
 * Returns total minutes as a decimal number, or NaN if invalid.
 */
function _parseDurationInput(val) {
  const s = String(val || "").trim();
  if (!s) return NaN;
  // mm:ss format
  const mmss = s.match(/^(\d+):(\d{1,2})$/);
  if (mmss) {
    return parseInt(mmss[1], 10) + parseInt(mmss[2], 10) / 60;
  }
  // Plain number (minutes)
  return parseFloat(s);
}

function _buildDurationMinSecField(sessionId, suggestedDuration) {
  const total = suggestedDuration != null && suggestedDuration !== ""
    ? _parseDurationInput(suggestedDuration) : NaN;
  let minVal = "", secVal = "";
  if (!isNaN(total) && total > 0) {
    const m = Math.floor(total);
    const s = Math.round((total - m) * 60);
    if (s === 60) { minVal = String(m + 1); secVal = ""; }
    else { minVal = String(m); secVal = s > 0 ? String(s) : ""; }
  }
  return `<div class="completion-dur-minsec">
      <input type="number" id="cdur-min-${sessionId}" class="completion-dur-input"
        placeholder="min" min="0" step="1" inputmode="numeric" value="${minVal}" />
      <span class="completion-dur-sep">:</span>
      <input type="number" id="cdur-sec-${sessionId}" class="completion-dur-input"
        placeholder="sec" min="0" max="59" step="1" inputmode="numeric" value="${secVal}" />
    </div>`;
}

function _readDurationMinSec(sessionId) {
  const minRaw = document.getElementById(`cdur-min-${sessionId}`)?.value || "";
  const secRaw = document.getElementById(`cdur-sec-${sessionId}`)?.value || "";
  const m = parseInt(minRaw, 10);
  const s = parseInt(secRaw, 10);
  const mins = isNaN(m) ? 0 : m;
  const secs = isNaN(s) ? 0 : s;
  const total = mins + secs / 60;
  return total > 0 ? total : NaN;
}

/**
 * Format minutes as mm:ss for display (e.g. 19.7 → "19:42")
 */
function _formatDuration(minutes) {
  if (!minutes || isNaN(minutes)) return "";
  const min = Math.floor(minutes);
  const sec = Math.round((minutes - min) * 60);
  if (sec === 0) return String(min);
  return `${min}:${String(sec).padStart(2, "0")}`;
}

let _lastCompletionSaveTime = 0;
function saveSessionCompletion(sessionId, type, dateStr, hasExercises) {
  const now = Date.now();
  if (now - _lastCompletionSaveTime < 2000) return;
  _lastCompletionSaveTime = now;
  // Don't save again if already completed
  if (isSessionComplete(sessionId)) return;
  const notes    = (document.getElementById(`cnotes-${sessionId}`)?.value || "").trim();
  const _parsedDur = _readDurationMinSec(sessionId);
  let duration = (!isNaN(_parsedDur) && _parsedDur > 0) ? String(_parsedDur) : "";
  const distance = document.getElementById(`cdist-${sessionId}`)?.value || "";
  // Swim uses its own unit toggle (m / yd); other endurance types use the
  // global mi/km setting.
  const swimDistUnit = type === "swimming"
    ? (document.getElementById(`cdistunit-${sessionId}`)?.value || "m")
    : null;

  // Pace sanity check for endurance types (sport-specific thresholds)
  const _paceType = _resolveEnduranceType(type);
  if (duration && distance && _ENDURANCE_TYPES.has(_paceType)) {
    const durMin = parseFloat(duration);
    const distVal = parseFloat(distance);
    if (durMin > 0 && distVal > 0) {
      const unit = typeof getDistanceUnit === "function" ? getDistanceUnit() : "mi";
      const distMi = unit === "km" ? distVal / 1.60934 : distVal;
      let paceWarning = null;

      if (_paceType === "cycling") {
        const mph = (distMi / durMin) * 60;
        if (mph > 45) paceWarning = `That's ${mph.toFixed(1)} mph — extremely fast for cycling. Did you enter correctly?`;
        else if (mph < 3) paceWarning = `That's ${mph.toFixed(1)} mph — very slow for cycling. Did you enter correctly?`;
      } else if (_paceType === "swimming") {
        // Swim always enters in m or yd — convert to meters for the per-100m check.
        const distM = swimDistUnit === "yd" ? distVal * 0.9144 : distVal;
        const per100m = durMin / (distM / 100);
        if (per100m < 0.5) paceWarning = `That's a ${Math.floor(per100m)}:${String(Math.round((per100m % 1) * 60)).padStart(2, "0")}/100m pace — faster than any world record. Did you enter correctly?`;
      } else {
        // Running / triathlon — original check
        const distKm = unit === "mi" ? distVal * 1.60934 : distVal;
        const paceMinPerKm = durMin / distKm;
        if (paceMinPerKm < 2.8) {
          const paceStr = `${Math.floor(paceMinPerKm)}:${String(Math.round((paceMinPerKm % 1) * 60)).padStart(2, "0")}/${unit}`;
          paceWarning = `That's a ${paceStr} pace — faster than any world record. Did you enter the duration correctly?`;
        }
      }

      if (paceWarning && !confirm(paceWarning)) {
        _lastCompletionSaveTime = 0;
        return;
      }
    }
  }

  let exercises = [];
  if (hasExercises) {
    ((_completionExerciseMap[sessionId]) || []).forEach((ex, i) => {
      const entry = {
        name:   ex.name,
        sets:   parseInt(document.getElementById(`cex-sets-${sessionId}-${i}`)?.value)   || ex.sets,
        reps:   document.getElementById(`cex-reps-${sessionId}-${i}`)?.value             || ex.reps   || "",
        weight: document.getElementById(`cex-weight-${sessionId}-${i}`)?.value           || ex.weight || "",
      };
      const setDetails = _cexReadSetDetails(sessionId, i);
      if (setDetails) {
        entry.setDetails = setDetails;
        // Update main line reps/weight to show range from per-set values
        const rNums = setDetails.map(sd => parseInt(sd.reps)).filter(n => !isNaN(n));
        const wNums = setDetails.map(sd => { const m = String(sd.weight||"").match(/([\d.]+)/); return m ? parseFloat(m[1]) : NaN; }).filter(n => !isNaN(n));
        if (rNums.length) {
          const rMin = Math.min(...rNums), rMax = Math.max(...rNums);
          entry.reps = rMin === rMax ? String(rMin) : `${rMin}-${rMax}`;
        }
        if (wNums.length) {
          const wMin = Math.min(...wNums), wMax = Math.max(...wNums);
          const unit = String(setDetails[0].weight||"").replace(/[\d.]+/, "").trim() || "lbs";
          entry.weight = wMin === wMax ? `${wMin} ${unit}` : `${wMin}-${wMax} ${unit}`;
        }
      }
      exercises.push(entry);
    });
  }

  // Look up session name AND fallback duration from the correct source.
  // sessionId is a card id in one of three formats:
  //   session-sw-<id>      → look up in workoutSchedule by stripped id
  //   session-plan-<date>-<raceId>  → look up in trainingPlan by composite key
  //   session-log-<id>     → look up in workouts by stripped id
  // The previous implementation compared `s.id === sessionId` which never
  // matched because s.id is the raw id and sessionId is the card id, so
  // the name lookup always returned "" and the Strava upload used the
  // "IronZ workout" fallback. It also never filled in the duration, so
  // an empty form submission sent 30 min to Strava (the _stravaElapsedSeconds
  // default).
  let sessionName = "";
  let fallbackDuration = null;
  // The source schedule/plan/logged entry — we pull forward its structured
  // body (aiSession, phases, hiitMeta, generatedSession) onto the completion
  // record so downstream consumers (Strava share prompt, workout history card)
  // can render the original phase breakdown instead of a bare name + duration.
  let _sourceEntry = null;
  try {
    if (sessionId.startsWith("session-sw-")) {
      const rawId = sessionId.slice("session-sw-".length);
      const _sched = JSON.parse(localStorage.getItem("workoutSchedule") || "[]");
      const _sw = _sched.find(s => String(s.id) === rawId);
      if (_sw) {
        sessionName = _sw.sessionName || "";
        fallbackDuration = _sw.duration || null;
        _sourceEntry = _sw;
      }
    } else if (sessionId.startsWith("session-plan-")) {
      // Format: session-plan-<YYYY-MM-DD>-<raceId>
      const rest = sessionId.slice("session-plan-".length);
      const dashIdx = rest.indexOf("-", 11); // skip past date (YYYY-MM-DD has 10 chars)
      const planDate = dashIdx > 0 ? rest.slice(0, dashIdx) : rest;
      const raceId   = dashIdx > 0 ? rest.slice(dashIdx + 1) : "";
      const _plan = typeof loadTrainingPlan === "function" ? loadTrainingPlan() : [];
      const _pe = _plan.find(p => p.date === planDate && String(p.raceId) === raceId);
      if (_pe) {
        sessionName = _pe.sessionName || "";
        // Prefer the explicit duration on the plan entry, else look up the
        // session library's canonical duration for this discipline+load.
        if (_pe.duration) {
          fallbackDuration = _pe.duration;
        } else if (typeof SESSION_DESCRIPTIONS !== "undefined" && SESSION_DESCRIPTIONS[_pe.discipline]) {
          const _ld = SESSION_DESCRIPTIONS[_pe.discipline][_pe.load];
          if (_ld && _ld.duration) fallbackDuration = _ld.duration;
        }
        _sourceEntry = _pe;
      }
    } else if (sessionId.startsWith("session-log-")) {
      const rawId = sessionId.slice("session-log-".length);
      const _logged = JSON.parse(localStorage.getItem("workouts") || "[]");
      const _lw = _logged.find(w => String(w.id) === rawId);
      if (_lw) {
        sessionName = _lw.name || _lw.sessionName || "";
        fallbackDuration = _lw.duration || null;
        _sourceEntry = _lw;
      }
    }
  } catch (e) {
    console.warn("[IronZ] session name/duration lookup failed:", e);
  }

  // Final fallback for the name so the Strava upload never posts as
  // the generic "IronZ workout" fallback.
  if (!sessionName) {
    sessionName = (typeof _wTypeLabel === "function" ? _wTypeLabel(type) : type) + " Session";
  }

  // If the user left the duration field empty, use the looked-up value
  // so Strava gets the planned duration (or at worst the scheduled
  // workout's saved duration) rather than the 30-min hard default.
  if (!duration && fallbackDuration) {
    // fallbackDuration might be a number like 60 or a string like
    // "60 min" — coerce to a plain minutes number.
    const fallbackNum = parseFloat(String(fallbackDuration));
    if (!isNaN(fallbackNum) && fallbackNum > 0) {
      duration = String(fallbackNum);
    }
  }

  // Save to workout history
  let workouts = [];
  try { workouts = JSON.parse(localStorage.getItem("workouts")) || []; } catch {}
  const workoutId = Date.now();
  // Watts for cycling
  const wattsVal = parseInt(document.getElementById(`cwatts-${sessionId}`)?.value) || null;

  // Cardio distance unit: swim uses m/yd (from swimDistUnit), everything
  // else follows the user's distance preference (mi/km). Tagging the unit
  // lets the Strava description builder render "4.3 mi" instead of a bare
  // number mis-read as meters.
  const _cardioDistUnit = swimDistUnit
    || ((type === "running" || type === "cycling" || type === "walking" || type === "hiking" || type === "rowing")
        ? (typeof getDistanceUnit === "function" ? getDistanceUnit() : "mi")
        : null);

  // Pull forward the structured body from the source schedule/plan/log entry
  // so the Strava share prompt has phase breakdowns to render.
  const _carryForward = _sourceEntry ? {
    ...(_sourceEntry.aiSession      && { aiSession:       _sourceEntry.aiSession }),
    ...(_sourceEntry.generatedSession && { generatedSession: _sourceEntry.generatedSession }),
    ...(_sourceEntry.phases         && { phases:          _sourceEntry.phases }),
    ...(_sourceEntry.hiitMeta       && { hiitMeta:        _sourceEntry.hiitMeta }),
    ...(_sourceEntry.steps          && { steps:           _sourceEntry.steps }),
    ...(_sourceEntry.total_distance_m && { total_distance_m: _sourceEntry.total_distance_m }),
    ...(_sourceEntry.pool_size_m    && { pool_size_m:     _sourceEntry.pool_size_m }),
    ...(_sourceEntry.pool_unit      && { pool_unit:       _sourceEntry.pool_unit }),
  } : {};

  const completedWorkout = {
    id:                 workoutId,
    date:               dateStr,
    name:               sessionName,
    type,
    notes:              notes || (duration ? `${_formatDuration(parseFloat(duration))} min` : ""),
    exercises:          exercises.length ? exercises : undefined,
    duration:           duration || null,
    distance:           distance || null,
    ...(_cardioDistUnit && distance ? { distance_unit: _cardioDistUnit } : {}),
    ...(wattsVal && { avgWatts: wattsVal }),
    ..._carryForward,
    completedSessionId: sessionId,
    completedAt:        new Date().toISOString(),
    isCompletion:       true,
  };
  workouts.unshift(completedWorkout);
  localStorage.setItem("workouts", JSON.stringify(workouts)); if (typeof DB !== 'undefined') DB.syncWorkouts();
  if (typeof trackWorkoutLogged === "function") trackWorkoutLogged({ type, date: dateStr, source: "session_complete" });

  // Push-to-Strava: auto-share silently OR prompt the user, per the
  // Section 1 spec. Short-circuits if not connected / no write scope.
  if (typeof promptStravaShareIfEligible === "function") {
    promptStravaShareIfEligible(completedWorkout);
  }

  // Mark session as completed
  const meta = loadCompletionMeta();
  meta[sessionId] = { workoutId, completedAt: new Date().toISOString() };
  localStorage.setItem("completedSessions", JSON.stringify(meta)); if (typeof DB !== 'undefined') DB.syncKey('completedSessions');

  // Refresh views
  renderCalendar();
  renderDayDetail(dateStr);
  if (typeof renderWorkoutHistory === "function") renderWorkoutHistory();
  if (typeof renderStats          === "function") renderStats();

  // Collapse the card after save and mark header with checkmark
  setTimeout(() => {
    const card = document.getElementById(sessionId);
    if (card) {
      if (!card.classList.contains("is-collapsed")) card.classList.add("is-collapsed");
      const nameEl = card.querySelector(".session-name");
      if (nameEl && !nameEl.querySelector(".session-complete-indicator")) {
        nameEl.insertAdjacentHTML("beforeend", `<span class="session-complete-indicator">${ICONS.check}</span>`);
      }
    }
  }, 0);

  // Show rating modal after completion
  setTimeout(() => showRatingModal(String(workoutId), dateStr), 400);

  // Threshold-week post-test modal — if this completed session was a fitness test,
  // immediately surface the result entry modal so zones get refreshed.
  // Added 2026-04-09 (PHILOSOPHY_UPDATE_2026-04-09_threshold_weeks).
  try {
    const _plan2 = typeof loadTrainingPlan === "function" ? loadTrainingPlan() : [];
    const _entry = _plan2.find(p => {
      const cid = `plan-${p.date}-${p.raceId}-${p.discipline}`;
      return cid === sessionId;
    });
    if (_entry && _entry.isThresholdTest && window.PostTestModal) {
      setTimeout(() => window.PostTestModal.maybeOpenForCompletedWorkout(_entry), 800);
    }
  } catch (e) {
    console.warn("[IronZ] post-test modal trigger failed:", e.message);
  }

  // Show stretch suggestion after completion
  if (typeof renderStretchSuggestion === "function") {
    const stretchContainer = document.getElementById(`stretch-${sessionId}`);
    if (!stretchContainer) {
      const card = document.getElementById(sessionId);
      if (card) {
        const div = document.createElement("div");
        div.id = `stretch-${sessionId}`;
        card.appendChild(div);
        renderStretchSuggestion({ type, exercises }, div);
      }
    }
  }
}

// ─── Day totals helpers ───────────────────────────────────────────────────────

function _parseDurMin(str) {
  const s = String(str || "").toLowerCase();
  const m = s.match(/([\d.]+)/);
  if (!m) return 0;
  const v = parseFloat(m[1]);
  return /sec/.test(s) ? v / 60 : v;
}

// Estimate minutes for a weightlifting session from its exercises array.
// Calibrated to match real-world session times: a typical 4-exercise push
// day with 3–4 working sets runs 40–55 min including warmup sets, walking
// to stations, and between-set recovery. The old heuristic of 3 min per
// exercise reported 12 min for the same workout.
//
// Per working set we budget 45s under the bar + the prescribed rest.
// We add 1.5 "warmup" sets per exercise (the ramp to working weight) and
// a 2-minute setup allowance per exercise for walking between stations,
// chalking up, loading plates, etc.
function _estimateStrengthSessionMin(exercises) {
  if (!Array.isArray(exercises) || !exercises.length) return 0;
  const WORK_SEC = 45;
  const SETUP_SEC = 120;
  const WARMUP_SET_BOOST = 1.5;
  let totalSec = 0;
  exercises.forEach(ex => {
    const workingSets = Math.max(1, parseInt(ex.sets, 10) || 3);
    // rest is usually a string like "90s" or "2 min" — parse to seconds
    let restSec = 90;
    const r = String(ex.rest || "").toLowerCase();
    const m = r.match(/([\d.]+)/);
    if (m) {
      const v = parseFloat(m[1]);
      restSec = /min/.test(r) ? v * 60 : v;
    }
    const effectiveSets = workingSets + WARMUP_SET_BOOST;
    const perEx = effectiveSets * WORK_SEC + (effectiveSets - 1) * restSec + SETUP_SEC;
    totalSec += perEx;
  });
  return Math.round(totalSec / 60);
}

function _parseDistKm(str) {
  const s = String(str || "");
  const val = parseFloat(s.match(/[\d.]+/)?.[0] || 0);
  if (!val) return 0;
  if (/\bkm\b/i.test(s))          return val;
  if (/\bmi(?:les?)?\b/i.test(s)) return val * 1.60934;   // "mi", "mile", "miles" — NOT "min"
  if (/\byd\b/i.test(s))          return val * 0.0009144;
  if (/\bm\b/.test(s))            return val / 1000;      // standalone "m" = meters
  return 0;
}

/**
 * Estimates distance in km for a time-based running interval using stored zone paces.
 * Returns 0 if zones aren't set or sport isn't running.
 */
function _estimateRunKm(effortKey, durationMin) {
  try {
    const all = JSON.parse(localStorage.getItem("trainingZones")) || {};
    if (!all.running) {
      const old = JSON.parse(localStorage.getItem("runningZones"));
      if (old) all.running = old;
    }
    const zones = (all.running || {}).zones;
    if (!zones) return 0;
    const zNum  = String(effortKey || "").replace(/[Zz]/, "");
    const zData = zones[`z${zNum}`];
    if (!zData?.paceRange) return 0;
    // paceRange format: "7:30–8:15 /mi" (fast–slow)
    const m = zData.paceRange.match(/(\d+):(\d+)[^0-9]+(\d+):(\d+)/);
    if (!m) return 0;
    const fast = parseInt(m[1]) + parseInt(m[2]) / 60;
    const slow = parseInt(m[3]) + parseInt(m[4]) / 60;
    const midPace = (fast + slow) / 2;  // min/mile
    const miles = durationMin / midPace;
    return miles * 1.60934;
  } catch { return 0; }
}

function getDayTotals(dateStr) {
  const data = getDataForDate(dateStr);
  const restriction = data.restriction;
  const sessionRemoved = restriction && restriction.action === "remove";
  let totalMin = 0, totalKm = 0;
  const sportKm = {};   // { run, bike, swim } → km
  const _addKm = (sport, km) => {
    if (km <= 0) return;
    const key = (sport === "running" || sport === "run") ? "run"
              : (sport === "bike" || sport === "cycling" || sport === "brick") ? "bike"
              : (sport === "swim" || sport === "swimming") ? "swim" : null;
    if (key) sportKm[key] = (sportKm[key] || 0) + km;
    totalKm += km;
  };
  if (sessionRemoved) return { totalMin, totalKm, sportKm };

  if (data.planEntry) {
    const p = data.planEntry;
    // If the user marked this plan session complete with an actual
    // duration, that wins over the original estimate — same rule as
    // scheduledWorkouts below.
    const planCardId = `session-plan-${dateStr}-${p.raceId}`;
    const actual = _parseDurMin(String(_getCompletionDuration(planCardId) || ""));
    if (actual > 0) {
      totalMin += actual;
    } else {
      const effectLoad    = getEffectiveLoad(p.load, restriction);
      const targetDur     = getRestrictedDuration(p.duration, p.load, restriction);
      const rawSession    = (SESSION_DESCRIPTIONS[p.discipline] || {})[effectLoad]
                         || (SESSION_DESCRIPTIONS[p.discipline] || {})[p.load];
      const scaledSession = rawSession ? scaleSessionDuration(rawSession, targetDur) : rawSession;
      if (scaledSession?.duration) totalMin += _parseDurMin(scaledSession.duration);
      else if (targetDur)          totalMin += _parseDurMin(targetDur);
    }
  }

  data.scheduledWorkouts.forEach(w => {
    // Actual logged duration (from completion) wins over any estimate.
    // scheduled workouts use session id `session-sw-${w.id}`.
    const actual = _parseDurMin(String(_getCompletionDuration(`session-sw-${w.id}`) || ""));
    if (actual > 0) { totalMin += actual; return; }

    if (w.duration) {
      const explicit = _parseDurMin(String(w.duration));
      if (explicit > 0) { totalMin += explicit; return; }
    }
    if (w.discipline && w.load) {
      const session = (SESSION_DESCRIPTIONS[w.discipline] || {})[w.load];
      if (session?.duration) { totalMin += _parseDurMin(session.duration); return; }
    }
    if (w.exercises && w.exercises.length > 0) {
      totalMin += _estimateStrengthSessionMin(w.exercises);
    }
  });

  data.loggedWorkouts.forEach(w => {
    const sport = w.type || "";
    const isRun = sport === "running" || sport === "run";
    let sessionMin = 0;
    let sessionKm = 0;
    // Completion duration (from Mark-Complete) wins over the original
    // logged duration, matching what the session-card badge displays.
    // Without this, a 90-min logged session completed in 37 min still
    // contributed 90 min to the day total.
    const completionDur = _parseDurMin(String(_getCompletionDuration(`session-log-${w.id}`) || ""));

    if (w.aiSession?.intervals) {
      _expandRepeatGroups(w.aiSession.intervals).forEach(iv => {
        const reps       = iv.reps || 1;
        const mainDur    = _parseDurMin(String(iv.duration || ""));
        const restDur    = iv.restDuration ? _parseDurMin(String(iv.restDuration)) : 0;
        const mainDistKm = _parseDistKm(String(iv.duration || ""));

        sessionMin += mainDur * reps + restDur * Math.max(0, reps - 1);

        if (mainDistKm > 0) {
          sessionKm += mainDistKm * reps;
        } else if (isRun) {
          const mainKm = _estimateRunKm(iv.effort, mainDur);
          if (mainKm > 0) {
            sessionKm += mainKm * reps;
            if (iv.restEffort && restDur > 0) {
              sessionKm += _estimateRunKm(iv.restEffort, restDur) * Math.max(0, reps - 1);
            }
          }
        }
      });

      // Sanity check: cap estimated distance based on session time
      // Max ~12 km/hr (5:00/km) for any session — prevents inflated estimates
      if (sessionKm > 0 && sessionMin > 0) {
        const maxKm = (sessionMin / 60) * 12;
        if (sessionKm > maxKm) sessionKm = maxKm;
      }
    } else if (w.generatedSession?.duration) {
      sessionMin = _parseDurMin(w.generatedSession.duration);
    } else if (w.duration) {
      sessionMin = _parseDurMin(String(w.duration));
    } else if (Array.isArray(w.exercises) && w.exercises.length > 0) {
      // Weightlifting / bodyweight logged with no explicit duration —
      // estimate from the exercise list instead of reporting 0.
      sessionMin = _estimateStrengthSessionMin(w.exercises);
    }

    totalMin += (completionDur > 0 ? completionDur : sessionMin);
    if (sessionKm > 0) _addKm(sport, sessionKm);
  });

  return { totalMin, totalKm, sportKm };
}

// ─── Day detail panel ─────────────────────────────────────────────────────────

const _WORKOUT_TYPE_LABELS = { hiit: "HIIT", hyrox: "Hyrox", weightlifting: "Weightlifting", running: "Running", cycling: "Cycling", swimming: "Swimming", yoga: "Yoga", general: "General Fitness", bodyweight: "Bodyweight", brick: "Brick (Bike + Run)", wellness: "Wellness", track_workout: "Track · Running", tempo_threshold: "Tempo · Running", speed_work: "Speed · Running", hills: "Hills · Running", long_run: "Long Run", endurance: "Endurance Run", easy_recovery: "Easy / Recovery", fun_social: "Fun Run" };
function _wTypeLabel(type) { return _WORKOUT_TYPE_LABELS[type] || capitalize(type); }

/**
 * Unified Today Dashboard — quick-glance card showing workout + nutrition + hydration
 * in one place with quick-action buttons. Only shown for today.
 */
function buildTodayDashboard(dateStr, data, nutrition) {
  const allSessions = (data.planEntry ? 1 : 0) + data.scheduledWorkouts.length;
  const loggedCount = data.loggedWorkouts.length;
  const completedCount = (() => {
    let count = 0;
    if (data.planEntry) {
      const cardId = `session-plan-${dateStr}-${data.planEntry.raceId}`;
      if (isSessionComplete(cardId)) count++;
    }
    data.scheduledWorkouts.forEach(w => {
      if (isSessionComplete(`session-sw-${w.id}`)) count++;
    });
    data.loggedWorkouts.forEach(w => {
      if (w.fromSaved || isSessionComplete(`session-log-${w.id}`)) count++;
    });
    return count;
  })();

  const isRestDay = allSessions === 0 && loggedCount === 0;
  const sessionRemoved = data.restriction && data.restriction.action === "remove";

  // Workout status
  let workoutHtml = "";
  if (sessionRemoved) {
    workoutHtml = `<div class="td-pill td-pill--rest">${ICONS.moon} Rest day (restriction active)</div>`;
  } else if (isRestDay) {
    workoutHtml = `<div class="td-pill td-pill--rest">${ICONS.moon} Rest day — focus on recovery</div>`;
  } else {
    const totalSessions = allSessions + loggedCount;
    const sessionNames = [];
    if (data.planEntry) sessionNames.push(data.planEntry.sessionName);
    data.scheduledWorkouts.forEach(w => sessionNames.push(w.sessionName));
    const label = sessionNames.slice(0, 2).join(", ") + (sessionNames.length > 2 ? ` +${sessionNames.length - 2} more` : "");
    const allDone = completedCount >= totalSessions && totalSessions > 0;
    workoutHtml = `<div class="td-pill ${allDone ? "td-pill--done" : "td-pill--active"}">
      ${allDone ? ICONS.check : ICONS.weights} ${allDone ? "All sessions complete!" : label}
      <span class="td-pill-count">${completedCount}/${totalSessions}</span>
    </div>`;
  }

  // Nutrition status (if enabled)
  let nutritionHtml = "";
  if (typeof isNutritionEnabled === "function" && isNutritionEnabled()) {
    let loggedMeals = [];
    try { loggedMeals = (JSON.parse(localStorage.getItem("meals")) || []).filter(m => m.date === dateStr); } catch {}
    const eaten = loggedMeals.reduce((sum, m) => sum + (m.calories || 0), 0);
    const proteinEaten = loggedMeals.reduce((sum, m) => sum + (m.protein || 0), 0);
    const calPct = nutrition.calories > 0 ? Math.min(Math.round(eaten / nutrition.calories * 100), 100) : 0;
    const protPct = nutrition.protein > 0 ? Math.min(Math.round(proteinEaten / nutrition.protein * 100), 100) : 0;

    nutritionHtml = `
      <div class="td-section">
        <div class="td-section-header">
          <span class="td-section-label">${ICONS.utensils} Nutrition</span>
          <span class="td-section-stat">${Math.round(eaten)} / ${nutrition.calories} cal</span>
        </div>
        <div class="td-progress-row">
          <div class="td-progress-track"><div class="td-progress-fill" style="width:${calPct}%"></div></div>
        </div>
        <div class="td-mini-stats">
          <span>Protein: ${Math.round(proteinEaten)}/${nutrition.protein}g (${protPct}%)</span>
        </div>
      </div>`;
  }

  // Hydration status (if enabled)
  let hydrationHtml = "";
  if (typeof isHydrationEnabled === "function" && isHydrationEnabled()) {
    const breakdown = typeof getHydrationBreakdownForDate === "function" ? getHydrationBreakdownForDate(dateStr) : { totalOz: 96 };
    const targetOz = breakdown.totalOz;
    const bottleSize = typeof getBottleSize === "function" ? getBottleSize() : 12;
    const dayData = typeof getHydrationForDate === "function" ? getHydrationForDate(dateStr) : { total: 0 };
    const bottles = dayData.total;
    const effectiveOz = typeof getEffectiveOzForDate === "function" ? getEffectiveOzForDate(dateStr) : bottles * bottleSize;
    const pct = targetOz > 0 ? Math.min(Math.round(effectiveOz / targetOz * 100), 100) : 0;
    hydrationHtml = `
      <div class="td-section">
        <div class="td-section-header">
          <span class="td-section-label">${ICONS.droplet} Hydration</span>
          <span class="td-section-stat">${effectiveOz} / ${targetOz} oz</span>
        </div>
        <div class="td-progress-row">
          <div class="td-progress-track td-progress-track--water"><div class="td-progress-fill td-progress-fill--water" style="width:${pct}%"></div></div>
        </div>
      </div>`;
  }

  // Quick actions
  const actions = [];
  if (!isRestDay && !sessionRemoved) {
    actions.push(`<button class="td-action-btn" onclick="document.querySelector('#day-detail-content .session-card')?.scrollIntoView({behavior:'smooth'})">${ICONS.weights} Workouts</button>`);
  }
  if (typeof isNutritionEnabled === "function" && isNutritionEnabled()) {
    actions.push(`<button class="td-action-btn" onclick="showTab('nutrition')">${ICONS.utensils || "&#127860;"} Log Meal</button>`);
  }
  if (typeof isHydrationEnabled === "function" && isHydrationEnabled()) {
    actions.push(`<button class="td-action-btn" onclick="if(typeof setHydrationDate==='function') setHydrationDate('${dateStr}'); if(typeof logWater==='function') logWater()">${ICONS.droplet} Log Water</button>`);
  }

  return `
    <div class="today-dashboard">
      ${workoutHtml}
      ${nutritionHtml}
      ${hydrationHtml}
      ${actions.length ? `<div class="td-actions">${actions.join("")}</div>` : ""}
    </div>`;
}

// ── Daily Progress Rings ──────────────────────────────────────────────────────

function renderDailyRings() {
  const container = document.getElementById("daily-rings");
  if (!container) return;

  const dateStr = typeof selectedDate !== "undefined" && selectedDate ? selectedDate : getTodayString();
  const data = getDataForDate(dateStr);

  // Workout ring
  const allSessions = (data.planEntry ? 1 : 0) + data.scheduledWorkouts.length;
  const loggedCount = data.loggedWorkouts.length;
  let completedCount = 0;
  if (data.planEntry && isSessionComplete(`session-plan-${dateStr}-${data.planEntry.raceId}`)) completedCount++;
  data.scheduledWorkouts.forEach(w => { if (isSessionComplete(`session-sw-${w.id}`)) completedCount++; });
  data.loggedWorkouts.forEach(w => { if (w.fromSaved || isSessionComplete(`session-log-${w.id}`)) completedCount++; });
  const totalSessions = allSessions + loggedCount;
  const isRestDay = totalSessions === 0 || (data.restriction && data.restriction.action === "remove");
  const workoutPct = isRestDay ? 1 : (totalSessions > 0 ? Math.min(completedCount / totalSessions, 1) : 0);
  const workoutLabel = isRestDay ? "Rest" : `${completedCount}/${totalSessions}`;

  // Nutrition ring
  const nutritionEnabled = typeof isNutritionEnabled === "function" && isNutritionEnabled();
  let calPct = 0, calLabel = "";
  if (nutritionEnabled) {
    const nutrition = typeof getDailyNutritionTarget === "function" ? getDailyNutritionTarget(dateStr) : { calories: 2200 };
    let meals = [];
    try { meals = (JSON.parse(localStorage.getItem("meals")) || []).filter(m => m.date === dateStr); } catch {}
    const eaten = meals.reduce((s, m) => s + (m.calories || 0), 0);
    calPct = nutrition.calories > 0 ? Math.min(eaten / nutrition.calories, 1) : 0;
    calLabel = `${Math.round(eaten / (nutrition.calories || 1) * 100)}%`;
  }

  // Hydration ring
  const hydrationEnabled = typeof isHydrationEnabled === "function" && isHydrationEnabled();
  let hydPct = 0, hydLabel = "";
  if (hydrationEnabled) {
    const breakdown = typeof getHydrationBreakdownForDate === "function" ? getHydrationBreakdownForDate(dateStr) : { totalOz: 96 };
    const targetOz = breakdown.totalOz;
    const effectiveOz = typeof getEffectiveOzForDate === "function" ? getEffectiveOzForDate(dateStr) : 0;
    hydPct = targetOz > 0 ? Math.min(effectiveOz / targetOz, 1) : 0;
    hydLabel = `${Math.round(hydPct * 100)}%`;
  }

  const ringSize = 72;
  const stroke = 6;
  const r = (ringSize - stroke) / 2;
  const circ = 2 * Math.PI * r;

  function buildRing(pct, color, label, title, enabled) {
    if (!enabled) return "";
    const done = pct >= 1;
    const offset = circ * (1 - pct);
    const ringColor = done ? "var(--color-success, #22c55e)" : color;
    const center = done
      ? `<text x="50%" y="52%" text-anchor="middle" dominant-baseline="central" fill="var(--color-success, #22c55e)" font-size="22" font-weight="700">✓</text>`
      : `<text x="50%" y="48%" text-anchor="middle" dominant-baseline="central" fill="var(--color-text)" font-size="14" font-weight="700">${label}</text>`;
    // Track uses its own CSS variable (--ring-track, defined per
    // theme) so the dim-but-visible track doesn't disappear on
    // pure-black or iron-navy backgrounds. The old version used
    // --color-border @ 0.3 opacity which evaluated to ~0.027 alpha
    // on blackout — effectively invisible.
    return `
      <div class="dr-ring-wrap">
        <svg width="${ringSize}" height="${ringSize}" viewBox="0 0 ${ringSize} ${ringSize}">
          <circle cx="${ringSize/2}" cy="${ringSize/2}" r="${r}" fill="none" stroke="var(--ring-track)" stroke-width="${stroke}" />
          <circle cx="${ringSize/2}" cy="${ringSize/2}" r="${r}" fill="none" stroke="${ringColor}" stroke-width="${stroke}"
            stroke-dasharray="${circ}" stroke-dashoffset="${offset}" stroke-linecap="round"
            transform="rotate(-90 ${ringSize/2} ${ringSize/2})" style="transition:stroke-dashoffset 0.4s ease" />
          ${center}
        </svg>
        <span class="dr-ring-label">${title}</span>
      </div>`;
  }

  container.innerHTML = `<div class="dr-rings-row">
    ${buildRing(workoutPct, "var(--color-text)", workoutLabel, isRestDay ? "Rest Day" : "Workouts", true)}
    ${buildRing(calPct, "var(--color-accent, #6366f1)", calLabel, "Nutrition", nutritionEnabled)}
    ${buildRing(hydPct, "#3b82f6", hydLabel, "Hydration", hydrationEnabled)}
  </div>`;
}

async function renderDayDetail(dateStr) {
  const content = document.getElementById("day-detail-content");
  if (!content) return;

  try {
    // Pre-hydrate shared workouts: fetch exercises from training_sessions
    // for any workoutSchedule entry that has a UUID variant_id but no aiSession.
    const data = getDataForDate(dateStr);
    const _uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const needFetch = data.scheduledWorkouts.filter(w =>
      !w.aiSession && !w.discipline && w.variant_id && _uuidRe.test(w.variant_id)
    );
    if (needFetch.length && window.supabaseClient) {
      try {
        const ids = [...new Set(needFetch.map(w => w.variant_id))];
        const { data: tsRows } = await window.supabaseClient
          .from("training_sessions")
          .select("id, session_name, exercises")
          .in("id", ids);
        if (tsRows) {
          const cache = {};
          tsRows.forEach(row => {
            let ex = row.exercises || [];
            if (typeof ex === "string") { try { ex = JSON.parse(ex); } catch { ex = []; } }
            if (ex.length) {
              cache[row.id] = ex.map(e => ({
                name: e.name || "Interval",
                duration: e.duration || "",
                effort: e.intensity || e.effort || "Z2",
                details: e.details || "",
                reps: e.reps || null,
                repeatGroup: e.repeatGroup || e.supersetGroup || null,
                groupSets: e.groupSets || null,
              }));
            }
          });
          needFetch.forEach(w => {
            if (cache[w.variant_id]) {
              w.aiSession = { title: w.sessionName, intervals: cache[w.variant_id] };
            }
          });
        }
      } catch (e) { console.warn("[IronZ] shared exercise hydration failed:", e); }
    }

    return _renderDayDetailInner(dateStr, content, data);
  } catch (e) {
    console.error("renderDayDetail crashed for", dateStr, e);
    content.innerHTML = `<div class="day-detail-date">${dateStr}</div><p style="color:var(--color-text-muted)">Error rendering day detail. Check console.</p>`;
  }
}

function _renderDayDetailInner(dateStr, content, preloadedData) {
  const data        = preloadedData || getDataForDate(dateStr);
  const displayDate = formatDisplayDate(dateStr);
  const isToday     = dateStr === getTodayString();
  const nutrition   = getDailyNutritionTarget(dateStr);

  let adjustments = {};
  try { adjustments = JSON.parse(localStorage.getItem("nutritionAdjustments")) || {}; } catch {}
  const isAdjusted = !!adjustments[dateStr];

  // Compute totals up front so we can show them inline with the date header
  const _totals = getDayTotals(dateStr);
  const _unit   = typeof getDistanceUnit === "function" ? getDistanceUnit() : "mi";
  const _SPORT_ICONS = { run: ICONS.run, bike: ICONS.bike, swim: ICONS.swim };
  let _timeStr = "";
  if (_totals.totalMin >= 60) {
    const h = Math.floor(_totals.totalMin / 60), m = Math.round(_totals.totalMin % 60);
    _timeStr = m > 0 ? `${h}h ${m}m` : `${h}h`;
  } else if (_totals.totalMin > 0) {
    _timeStr = `${Math.round(_totals.totalMin)}m`;
  }
  const _distItems = [];
  if (Object.keys(_totals.sportKm).length > 0) {
    for (const [sport, km] of Object.entries(_totals.sportKm)) {
      const icon = _SPORT_ICONS[sport] || ICONS.activity;
      const ds = _unit === "km" ? `${km.toFixed(1)} km` : `${(km / 1.60934).toFixed(1)} mi`;
      _distItems.push(`<span class="day-totals-item">${icon} ${ds}</span>`);
    }
  } else if (_totals.totalKm > 0) {
    const ds = _unit === "km" ? `${_totals.totalKm.toFixed(1)} km` : `${(_totals.totalKm / 1.60934).toFixed(1)} mi`;
    _distItems.push(`<span class="day-totals-item">${ICONS.activity} ${ds}</span>`);
  }
  const _totalsHtml = (_timeStr || _distItems.length > 0) ? `
    <div class="day-totals-inline">
      ${_timeStr ? `<span class="day-totals-item">${ICONS.clock} ${_timeStr}</span>` : ""}
      ${_distItems.join("")}
    </div>` : "";

  let html = `<div class="day-detail-date-row">
    <div class="day-detail-date">${isToday ? "Today · " : ""}${displayDate}</div>
    ${_totalsHtml}
  </div>`;

  // ── Threshold week banner ────────────────────────────────────────────────
  // Added 2026-04-09 (PHILOSOPHY_UPDATE_2026-04-09_threshold_weeks).
  try {
    const _planForBanner = typeof loadTrainingPlan === "function" ? loadTrainingPlan() : [];
    const _twDay = _planForBanner.find(p => p.date === dateStr && p.isThresholdWeek);
    if (_twDay) {
      const _testDay = _planForBanner.find(p => p.isThresholdWeek && p.isThresholdTest && (function () {
        // Same week as dateStr (Mon..Sun)
        const TW = window.ThresholdWeekScheduler;
        if (!TW) return false;
        const a = TW.toDateStr(TW.mondayOf(dateStr));
        const b = TW.toDateStr(TW.mondayOf(p.date));
        return a === b;
      })());
      const _testDateLabel = _testDay ? formatDisplayDate(_testDay.date) : "Day 4 of this week";
      const _cadenceUsed = (function () {
        try {
          const ud = JSON.parse(localStorage.getItem("user_data") || "{}");
          const pf = JSON.parse(localStorage.getItem("profile") || "{}");
          return Number(ud.threshold_week_cadence_override || pf.threshold_week_cadence_override) || 6;
        } catch { return 6; }
      })();
      html += `
        <div class="threshold-week-banner">
          <div class="threshold-week-banner-title">THRESHOLD WEEK — Reset &amp; Test</div>
          <div class="threshold-week-banner-body">
            Volume is down ~35%. ${_testDay ? `Test on <b>${_testDateLabel}</b>.` : "One test this week."}
            The result will update your training zones for the next ${_cadenceUsed} weeks.
          </div>
        </div>`;
    }
  } catch (e) {
    console.warn("[IronZ] threshold-week banner render failed:", e.message);
  }

  // ── Today-only widgets (wrapped individually so one failure doesn't block the render)
  if (isToday) {
    try { if (typeof buildAdherencePrompt === "function" && !isAdherenceDismissedToday()) html += buildAdherencePrompt(); } catch (e) { console.error("adherence prompt error:", e); }
    try { if (typeof buildCoachingInsights === "function") html += buildCoachingInsights(); } catch (e) { console.error("coaching insights error:", e); }
    try {
      if (typeof getRatingSmartAlert === "function") {
        const _rAlert = getRatingSmartAlert();
        if (_rAlert) {
          const _rIcon = _rAlert.type === "easy" ? ICONS.zap : ICONS.warning;
          html += `<div class="rating-smart-alert rating-alert-${_rAlert.type}">${_rIcon} ${_rAlert.message}</div>`;
        }
      }
    } catch (e) { console.error("rating alert error:", e); }
    try { if (typeof buildGoalsSummaryForHome === "function") html += buildGoalsSummaryForHome(); } catch (e) { console.error("goals summary error:", e); }
  }

  // ── Rest day intelligence banner ──────────────────────────────────────────
  try {
    if ((isToday || dateStr === localDateStr((() => { const t = new Date(); t.setDate(t.getDate() + 1); return t; })())) && typeof buildRestDayBanner === "function") {
      html += buildRestDayBanner(dateStr);
    }
  } catch (e) { console.error("rest day banner error:", e); }

  // ── Restriction banner ────────────────────────────────────────────────────
  if (data.restriction) {
    const r     = data.restriction;
    const label = RESTRICTION_LABELS[r.type] || r.type;
    const icon  = RESTRICTION_ICONS[r.type]  || ICONS.warning;
    const isRestType = r.type === "rest";
    html += `
      <div class="restriction-banner${isRestType ? " restriction-banner--rest" : ""}">
        <div class="restriction-banner-content">
          <span class="restriction-icon">${icon}</span>
          <div>
            <div class="restriction-label">${label}</div>
            ${r.note ? `<div class="restriction-note">${r.note}</div>` : ""}
          </div>
        </div>
        <button class="restriction-remove-btn" onclick="removeRestriction('${dateStr}')">Remove</button>
      </div>`;
  }

  // ── Equipment restriction banner ─────────────────────────────────────────
  if (data.equipmentRestriction) {
    const eqLabel    = _equipmentLabel(data.equipmentRestriction);
    const eqNote     = data.equipmentRestriction.note;
    const removeKey  = data.equipmentRestriction.permanent ? "permanent" : dateStr;
    html += `
      <div class="equipment-banner">
        <div class="restriction-banner-content">
          <span class="restriction-icon">${ICONS.weights}</span>
          <div>
            <div class="restriction-label">Equipment: ${eqLabel}</div>
            ${eqNote ? `<div class="restriction-note">${eqNote}</div>` : ""}
          </div>
        </div>
        <button class="restriction-remove-btn" onclick="removeEquipmentRestriction('${removeKey}')">Remove</button>
      </div>`;
  }

  // ── All sessions (race plan + generated plan + manually added) ───────────
  // A full-day restriction has action === "remove" AND no explicit
  // `disciplines` list. With disciplines present, the restriction is
  // partial — we filter specific sessions out by discipline instead
  // of blanking the entire day.
  const sessionRemoved = data.restriction && data.restriction.action === "remove" && !Array.isArray(data.restriction.disciplines);
  // Threshold weeks (and a few other flows) emit rest-day plan
  // entries with load:"rest". Those are placeholders for "no training
  // today" — don't render a session card for them and don't count
  // them toward allSessionsCount, otherwise the day detail shows a
  // strength-icon card labeled "Rest" on every threshold rest day.
  const planEntryIsRest = data.planEntry && _calV2IsRestEntry(data.planEntry);
  const planEntryIsDiscRestricted = data.planEntry && _calV2IsSessionDisciplineRestricted(data.planEntry, data.restriction);
  const effectivePlanEntry = (planEntryIsRest || planEntryIsDiscRestricted) ? null : data.planEntry;
  const nonRestScheduled = data.scheduledWorkouts.filter(w =>
    !_calV2IsRestEntry(w) && !_calV2IsSessionDisciplineRestricted(w, data.restriction)
  );
  const allSessionsCount = (effectivePlanEntry ? 1 : 0) + nonRestScheduled.length + data.loggedWorkouts.length;

  if (sessionRemoved && allSessionsCount > 0) {
    const rLabel = RESTRICTION_LABELS[data.restriction.type] || data.restriction.type;
    html += `<div class="restriction-removed-notice">${ICONS.ban} Session removed — ${rLabel}</div>`;
  } else if (data.event) {
    html += `
      <div class="session-card race-day-card">
        <div class="session-card-header">
          <span class="session-icon">${ICONS.flag}</span>
          <div class="session-meta">
            <div class="session-name">RACE DAY — ${data.event.name}</div>
            <div class="session-phase">${(RACE_CONFIGS[data.event.type] || {}).label || data.event.type}</div>
          </div>
        </div>
      </div>`;
  } else {
    // Race-plan session
    if (effectivePlanEntry) {
      const p           = effectivePlanEntry;
      const icon        = DISCIPLINE_ICONS[p.discipline] || ICONS.weights;
      const color       = DISCIPLINE_COLORS[p.discipline] || "var(--color-accent)";
      const cardId      = `session-plan-${dateStr}-${p.raceId}`;
      const effectLoad     = getEffectiveLoad(p.load, data.restriction);
      const targetDuration = getRestrictedDuration(p.duration, p.load, data.restriction);
      const isReduced      = effectLoad !== p.load || targetDuration !== p.duration;
      // Use edited overrides if present on the plan entry, otherwise fall back to SESSION_DESCRIPTIONS
      let rawSession;
      if (p.aiSession) {
        // Plan entry was edited — build a session object from the saved intervals
        const _ivs = p.aiSession.intervals || [];
        const _steps = _ivs.map((iv, idx) => {
          let zone = iv.effort || "Z2";
          if (typeof zone === 'string' && zone.startsWith("Z")) zone = parseInt(zone.slice(1)) || 2;
          const type = iv.type || (idx === 0 ? "warmup" : idx === _ivs.length - 1 ? "cooldown" : "main");
          const step = { type, label: iv.name, duration: parseInt(iv.duration) || 0, zone };
          if (iv.reps && iv.reps > 1) { step.reps = iv.reps; }
          if (iv.restDuration) { step.rest = parseInt(iv.restDuration) || 0; }
          return step;
        });
        const _totalMin = _steps.reduce((s, st) => s + (st.duration * (st.reps || 1)) + ((st.rest || 0) * Math.max(0, (st.reps || 1) - 1)), 0);
        rawSession = {
          name: p.aiSession.title || p.sessionName,
          duration: targetDuration || p.duration || _totalMin,
          steps: _steps,
        };
      } else {
        rawSession = (SESSION_DESCRIPTIONS[p.discipline] || {})[effectLoad]
                     || (SESSION_DESCRIPTIONS[p.discipline] || {})[p.load];
      }
      const session = rawSession && !p.aiSession ? scaleSessionDuration(rawSession, targetDuration) : rawSession;
      const intensLabel = getIntensityLabel(effectLoad);
      const intensClass = getIntensityClass(effectLoad);

      const _planCompType = DISCIPLINE_TO_WORKOUT_TYPE[p.discipline] || "general";
      const _planSugDur   = session?.duration || null;
      const _planCompletion = buildCompletionSection(cardId, _planCompType, null, dateStr, _planSugDur, session?.steps);
      const _planIsComplete    = isSessionComplete(cardId);
      const _planDoneIndicator = _planIsComplete ? ` <span class="session-complete-indicator">${ICONS.check}</span>` : "";
      const _planUndoBtn       = _buildUndoHeaderBtn(cardId, dateStr);
      const _planEditItem = `<button class="ovflow-item" onclick="event.stopPropagation();closeOverflowMenu();openEditPlanSession('${dateStr}','${p.raceId}','${p.discipline}','${p.load}')">Edit</button>`;
      const _planOverflow = _buildOverflowMenu(cardId,
        _planEditItem +
        _ovflShareItem(p) +
        _ovflDeleteItem(`deletePlanEntry('${p.raceId}','${p.discipline}','${dateStr}')`));
      if (session) {
        html += `
          <div class="session-card collapsible${_planIsComplete ? " session-card--completed is-collapsed" : ""}" id="${cardId}">
            <div class="session-card-header session-card-toggle" onclick="toggleSection('${cardId}')">
              <span class="session-icon" style="color:${color}">${icon}</span>
              <div class="session-meta">
                <div class="session-name">${p.sessionName}${_planDoneIndicator}</div>
                <div class="session-phase">${p.phase} · Week ${p.weekNumber}</div>
              </div>
              <div class="session-header-right">
                <span class="session-duration-badge">${_fmtBadgeMin(_getCompletionDuration(cardId) || session.duration)} min</span>
                <span class="intensity-badge ${intensClass}">${isReduced ? "⬇ " : ""}${intensLabel}</span>
                ${_planUndoBtn}${_planOverflow}
                <span class="card-chevron">▾</span>
              </div>
            </div>
            ${buildIntensityStrip(session, cardId, p.discipline)}
            <div class="card-body">${buildStepsList(session, p.discipline)}${typeof renderFuelingPlanHTML === "function" ? renderFuelingPlanHTML(session.duration, session.name, { load: effectLoad, discipline: p.discipline }) : ""}${buildWorkoutExplanation(session, dateStr, p.discipline, effectLoad, p.sessionName, p)}${_planCompletion}</div>
          </div>`;
      } else {
        html += `
          <div class="session-card collapsible${_planIsComplete ? " session-card--completed is-collapsed" : ""}" id="${cardId}">
            <div class="session-card-header session-card-toggle" onclick="toggleSection('${cardId}')">
              <span class="session-icon" style="color:${color}">${icon}</span>
              <div class="session-meta">
                <div class="session-name">${p.sessionName}${_planDoneIndicator}</div>
                <div class="session-phase">${p.phase} · Week ${p.weekNumber}</div>
              </div>
              <div class="session-header-right">
                <span class="intensity-badge ${intensClass}">${isReduced ? "⬇ " : ""}${intensLabel}</span>
                ${_planUndoBtn}${_planOverflow}
                <span class="card-chevron">▾</span>
              </div>
            </div>
            <div class="card-body"><p class="session-details">${p.details || ""}</p>${buildWorkoutExplanation(null, dateStr, p.discipline, effectLoad, p.sessionName, p)}${_planCompletion}</div>
          </div>`;
      }
    }

    // Generated plan sessions — skip rest-day placeholders so they
    // don't render as "Rest" strength-icon cards. nonRestScheduled is
    // already filtered via _calV2IsRestEntry above.
    nonRestScheduled.forEach(w => {
      const { icon, color } = _resolveDiscipline(w);
      const cardId = `session-sw-${w.id}`;

      // Rich rendering for sessions with discipline + load (running philosophy)
      if (w.discipline && w.load) {
        const effectLoad     = getEffectiveLoad(w.load, data.restriction);
        const session        = (SESSION_DESCRIPTIONS[w.discipline] || {})[effectLoad];
        const intensLabel    = getIntensityLabel(effectLoad);
        const intensClass    = getIntensityClass(effectLoad);
        if (session) {
          const targetDuration = getRestrictedDuration(session.duration, w.load, data.restriction);
          const isReduced      = effectLoad !== w.load || targetDuration !== session.duration;
          const _swCompletion = buildCompletionSection(cardId, DISCIPLINE_TO_WORKOUT_TYPE[w.discipline] || "running", null, dateStr, targetDuration, session?.steps);
          const _swMovePanel = buildSessionMovePanel(cardId, "scheduled", w.id, dateStr);
          const _swIsComplete    = isSessionComplete(cardId);
          const _swDoneIndicator = _swIsComplete ? ` <span class="session-complete-indicator">${ICONS.check}</span>` : "";
          const _swUndoBtn       = _buildUndoHeaderBtn(cardId, dateStr);
          const _swUserAddedCls = w.source === "user_added" ? " session-card--user-added" : "";
          const _swEditItem = `<button class="ovflow-item" onclick="event.stopPropagation();closeOverflowMenu();openEditScheduledWorkout('${w.id}')">Edit</button>`;
          const _swOverflow = _buildOverflowMenu(cardId,
            _swEditItem +
            _ovflMoveItem(cardId, "scheduled", w.id, dateStr) +
            _ovflShareItem(w) +
            _ovflDeleteItem(`deleteScheduledWorkout('${w.id}','${dateStr}')`));
          const _bRacePill = w.isBRace
            ? ` <span class="b-race-pill b-race-pill--day">B RACE</span>`
            : (w.bRaceWindow ? ` <span class="b-race-pill b-race-pill--window">B RACE WINDOW</span>` : "");
          html += `
            <div class="session-card collapsible${_swIsComplete ? " session-card--completed is-collapsed" : ""}${_swUserAddedCls}${w.isBRace ? " session-card--b-race" : w.bRaceWindow ? " session-card--b-window" : ""}" id="${cardId}">
              <div class="session-card-header session-card-toggle" onclick="toggleSection('${cardId}')">
                <span class="session-icon" style="color:${color}">${icon}</span>
                <div class="session-meta">
                  <div class="session-name">${w.sessionName}${_bRacePill}${_swDoneIndicator}</div>
                  <div class="session-phase">${({ run: "Running", bike: "Cycling", swim: "Swimming", brick: "Brick" })[w.discipline] || capitalize(w.discipline || "")}</div>
                </div>
                <div class="session-header-right">
                  <span class="session-duration-badge">${_fmtBadgeMin(_getCompletionDuration(cardId) || targetDuration)} min</span>
                  <span class="intensity-badge ${intensClass}">${isReduced ? "⬇ " : ""}${intensLabel}</span>
                  ${_swUndoBtn}${_swOverflow}
                  <span class="card-chevron">▾</span>
                </div>
              </div>
              ${buildIntensityStrip(session, cardId, w.discipline)}
              <div class="card-body">${buildStepsList(session, w.discipline)}${typeof renderFuelingPlanHTML === "function" ? renderFuelingPlanHTML(session.duration, session.name, { load: w.load || effectLoad, discipline: w.discipline }) : ""}${buildWorkoutExplanation(session, dateStr, w.discipline, effectLoad, w.sessionName, w)}${_swMovePanel}${_swCompletion}</div>
            </div>`;
          return;
        }
      }

      // Generic rendering for weightlifting, cycling, yoga, etc.
      let body = "";
      if (w.exercises && w.exercises.length > 0) {
        // If session is completed, show only the exercises that were actually done
        const _compExercises = isSessionComplete(cardId) ? _getCompletionExercises(cardId) : null;
        let displayExercises = _compExercises || w.exercises;
        if (!_compExercises && data.equipmentRestriction && w.type === "weightlifting" && typeof getEquipmentAdjustedExercises === "function") {
          // Derive the strength focus (push/pull/legs/upper/lower/full)
          // from whatever the session exposes. Legacy cards used the
          // `weightlifting-<focus>-b` id pattern; onboarding-v2 builds
          // ids like `ob-v2-<ts>-<idx>` with no focus in them, so the
          // old id-regex fell through to null and the filter never
          // ran — equipment restriction silently ignored. Now we pull
          // focus from w.strengthFocus, w.focus, or parse the session
          // name as a last resort, then always run the equipment
          // filter regardless.
          const _nameLc = String(w.sessionName || "").toLowerCase();
          const _nameFocus =
            /push/.test(_nameLc) ? "push" :
            /pull/.test(_nameLc) ? "pull" :
            /leg/.test(_nameLc)  ? "legs" :
            /upper/.test(_nameLc) ? "upper" :
            /lower/.test(_nameLc) ? "lower" :
            "full";
          const focus = w.strengthFocus || w.focus ||
            (String(w.id).match(/weightlifting-(\w+)-b/)?.[1]) ||
            _nameFocus;
          displayExercises = getEquipmentAdjustedExercises(w.exercises, focus, w.level || "intermediate", data.equipmentRestriction);
        }
        if (!_compExercises && data.restriction && data.restriction.action === "reduce" && displayExercises) {
          displayExercises = getRestrictedExercises(displayExercises, data.restriction);
        }
        let _swHiitHeader = "";
        if (w.hiitMeta) {
          const _fmtLabels = { circuit: "Circuit", tabata: "Tabata", emom: "EMOM", amrap: "AMRAP", "for-time": "For Time" };
          const _m = w.hiitMeta;
          _swHiitHeader = `<div class="qe-hiit-summary">${_fmtLabels[_m.format] || _m.format || "HIIT"}`;
          if (_m.rounds > 1) _swHiitHeader += ` &mdash; ${_m.rounds} rounds`;
          if (_m.restBetweenRounds && _m.restBetweenRounds !== "0s") _swHiitHeader += `, ${_m.restBetweenRounds} rest between rounds`;
          _swHiitHeader += `</div>`;
        }
        const _liftRestricted = data.restriction && data.restriction.action === "reduce" && displayExercises;
        let _liftRestrictNote = "";
        if (_liftRestricted) {
          const _hasSubstitutions = data.restriction.type === "injury" && data.restriction.note && displayExercises !== w.exercises;
          const _restrictMsg = _hasSubstitutions
            ? `${ICONS.lightbulb} Substituted exercises per your injury restriction`
            : `${ICONS.lightbulb} Reduced sets & weight per your ${data.restriction.type || ""} restriction`;
          _liftRestrictNote = `<div class="restriction-session-note" style="margin-bottom:8px">${_restrictMsg}</div>`;
        }
        const _swIsHyrox = w.type === "hyrox" || w.isHyrox;
        const _swCompRec = _swIsHyrox ? _getCompletionRecord(cardId) : null;
        const _swHyroxSplit = _swCompRec?.hyroxData ? _buildHyroxSplitSummary(_swCompRec.hyroxData) : "";
        body = _liftRestrictNote + _swHiitHeader + _swHyroxSplit + buildExerciseTableHTML(displayExercises, { hiit: w.type === "hiit" || !!w.hiitMeta, hyrox: _swIsHyrox });
      } else if (w.details) {
        body = `<p class="session-details">${w.details}</p>`;
      }

      // Build zone strip + interval body for imported sessions with aiSession intervals
      let _swGenStrip = "";
      let _swGenDurMin = w.duration || null;
      if (w.aiSession && w.aiSession.intervals && w.aiSession.intervals.length) {
        const _effortToZone = { RW:"rw",Z1:"z1",Z2:"z2",Z3:"z3",Z4:"z4",Z5:"z5",Z6:"z6", Easy:"z2",Moderate:"z3",Hard:"z4",Max:"z5",T1:"z-transition" };
        const _paceMap = { RW:8, Z1:7, Z2:6.2, Z3:5.5, Z4:5, Z5:4.5, Z6:4 };
        const _parseDur = (str, effort) => {
          const s = String(str||"").toLowerCase().trim();
          const n = s.match(/([\d.]+)/); if(!n) return 1;
          const v = parseFloat(n[1]);
          if (/sec/.test(s)) return v / 60;
          if (/km/.test(s)) return v * (_paceMap[effort]||5.5);
          if (/mi/.test(s) && !/min/.test(s)) return v * 1.60934 * (_paceMap[effort]||5.5);
          if (/\d+m$/.test(s)) return (v / 1000) * (_paceMap[effort]||5.5);
          return v;
        };
        const _allSegs = [];
        // Parse rest text ("90 sec rest", "2 min rest") out of details
        // strings when the interval doesn't have an explicit
        // restDuration field. This is the fallback for AI-generated
        // workouts where Claude put the rest in free text.
        function _extractRestFromDetails(details) {
          const s = String(details || "");
          const patterns = [
            /(\d+)\s*(?:sec|seconds|s)\b[^,.]*?\brest\b/i,
            /(\d+)\s*(?:min|minutes|m)\b[^,.]*?\brest\b/i,
            /\brest\b[^,.]*?(\d+)\s*(?:sec|seconds|s)\b/i,
            /\brest\b[^,.]*?(\d+)\s*(?:min|minutes|m)\b/i,
          ];
          for (const pat of patterns) {
            const m = s.match(pat);
            if (m) {
              const val = parseInt(m[1], 10);
              if (val > 0) {
                const isMin = /min|minutes|\bm\b/i.test(m[0]) && !/sec|seconds|\bs\b/i.test(m[0]);
                return isMin ? `${val} min` : `${val}s`;
              }
            }
          }
          return null;
        }

        // Classify so we know whether to insert a trailing rest between
        // adjacent segments (rests only appear between "work" segments,
        // not after a warmup block).
        function _isWarmupOrCooldown(iv) {
          const n = String(iv.name || "").toLowerCase();
          return /warm|cool|recovery/.test(n);
        }

        const _expanded = _expandRepeatGroups(w.aiSession.intervals);
        _expanded.forEach((iv, ivIdx) => {
          let reps = iv.reps || 1;
          let _ivDur = iv.duration;
          // Fix legacy ladder data: "ladder" is not a per-rep duration
          if (_ivDur === "ladder" || (reps > 1 && !/\d/.test(_ivDur))) {
            reps = 1;
            _ivDur = iv.duration_min ? `${iv.duration_min} min` : "15 min";
          }
          // Legacy running data: see the matching gate in the logged-card
          // intensity-strip builder — only apply to running without a
          // restDuration. Structured cycling/swim intervals have proper
          // per-rep durations we must not rewrite.
          const _isLegacyRunSched = (w.type === "running" || w.type === "run") && !iv.restDuration;
          if (_isLegacyRunSched && reps > 1 && /\d+\s*min/.test(_ivDur)) {
            const dm = (iv.details || "").match(/(\d+)\s*[x×]\s*(\d+)\s*m\b/i);
            if (dm) { _ivDur = `${dm[2]}m`; }
            else { const t = parseFloat(_ivDur); if (t > 0) _ivDur = `${Math.round(t / reps)} min`; }
          }
          const mainDur = _parseDur(_ivDur, iv.effort);
          // Prefer restDuration field; fall back to parsing it from the
          // details text so AI-generated intervals that described rest
          // in free text still render gaps in the strip.
          const restStr = iv.restDuration || _extractRestFromDetails(iv.details);
          const restDur = restStr ? _parseDur(restStr, iv.restEffort) : 0;
          const mainCls = _effortToZone[iv.effort] || "z2";
          const restCls = iv.restEffort ? (_effortToZone[iv.restEffort] || "z2") : "z-rest";
          for (let i = 0; i < reps; i++) {
            _allSegs.push({ dur: mainDur, cls: mainCls, effort: iv.effort, name: iv.name });
            if (i < reps - 1 && restDur > 0) {
              _allSegs.push({ dur: restDur, cls: restCls, effort: iv.restEffort || "Z2", name: "Recovery" });
            }
          }
          // Between-interval rest: only when there's a rest on this
          // segment AND the NEXT segment is also a work block (not a
          // cooldown — no point showing a gap before the cooldown).
          const next = _expanded[ivIdx + 1];
          if (restDur > 0 && next && !_isWarmupOrCooldown(next) && !_isWarmupOrCooldown(iv)) {
            _allSegs.push({ dur: restDur, cls: restCls, effort: iv.restEffort || "Z2", name: "Rest" });
          }
        });
        const _totalDur = _allSegs.reduce((sum, seg) => sum + seg.dur, 0) || 1;
        _swGenDurMin = Math.round(_totalDur) || _swGenDurMin;
        const _stripSegs = _allSegs.map(seg => {
          const pct = (seg.dur / _totalDur * 100).toFixed(2);
          const zNum = String(seg.effort || "").replace(/[Zz]/, "");
          const zLabel = zNum ? _getZoneLabel(w.type, zNum) : "";
          const tip = `${seg.name || seg.effort}${zLabel ? ` \u00b7 ${zLabel}` : ""}`;
          return `<div class="intensity-seg ${seg.cls}" style="width:${pct}%" title="${tip}"></div>`;
        }).join("");
        if (_stripSegs) _swGenStrip = `<div class="session-intensity-strip" onclick="event.stopPropagation();toggleSection('${cardId}')">${_stripSegs}</div>`;
        if (!body) {
          // Swim: if the session has the canonical step tree, render the
          // Garmin-style swim card. Falls through to the flat interval
          // list when steps are missing (legacy workouts).
          if ((w.type === "swim" || w.discipline === "swim") && w.aiSession && Array.isArray(w.aiSession.steps) && w.aiSession.steps.length && typeof SwimCardRenderer !== "undefined") {
            body = SwimCardRenderer.render(w.aiSession);
          } else {
            body = buildAiIntervalsList(w.aiSession, w.type) || '';
          }
        }
      }

      const _swGenCompletion = buildCompletionSection(cardId, w.type, w.exercises || null, dateStr, _swGenDurMin);
      const _swGenMovePanel  = buildSessionMovePanel(cardId, "scheduled", w.id, dateStr);
      const _swGenEditPanel  = "";
      const _swGenCompleted  = isSessionComplete(cardId);
      const _swGenDoneInd    = _swGenCompleted ? ` <span class="session-complete-indicator">${ICONS.check}</span>` : "";
      const _swGenUndoBtn    = _buildUndoHeaderBtn(cardId, dateStr);
      const _swGenUserAddedCls = w.source === "user_added" ? " session-card--user-added" : "";
      const _swGenEditItem = `<button class="ovflow-item" onclick="event.stopPropagation();closeOverflowMenu();openEditScheduledWorkout('${w.id}')">Edit</button>`;
      const _swGenOverflow = _buildOverflowMenu(cardId,
        _swGenEditItem +
        _ovflMoveItem(cardId, "scheduled", w.id, dateStr) +
        _ovflShareItem(w) +
        _ovflDeleteItem(`deleteScheduledWorkout('${w.id}','${dateStr}')`));
      html += `
        <div class="session-card collapsible${_swGenCompleted ? " session-card--completed is-collapsed" : ""}${_swGenUserAddedCls}" id="${cardId}">
          <div class="session-card-header session-card-toggle" onclick="toggleSection('${cardId}')">
            <span class="session-icon" style="color:${color}">${icon}</span>
            <div class="session-meta">
              <div class="session-name">${w.sessionName}${_swGenDoneInd}</div>
              <div class="session-phase">${_wTypeLabel(w.type)}</div>
            </div>
            <div class="session-header-right">${(_getCompletionDuration(cardId) || _swGenDurMin) ? `<span class="session-duration-badge">${_fmtBadgeMin(_getCompletionDuration(cardId) || _swGenDurMin)} min</span>` : ""}${_swGenUndoBtn}${_swGenOverflow}<span class="card-chevron">▾</span></div>
          </div>
          ${_swGenStrip}
          <div class="card-body">${body}${typeof renderFuelingPlanHTML === "function" ? renderFuelingPlanHTML(w.duration || _swGenDurMin, w.sessionName, { load: w.load || "moderate", discipline: w.discipline || w.type }) : ""}${buildWorkoutExplanation(null, dateStr, w.discipline || w.type, w.load || "moderate", w.sessionName, w)}${_swGenEditPanel}${_swGenMovePanel}${_swGenCompletion}</div>
        </div>`;
    });

    // Manually-added sessions (same position as everything else)
    data.loggedWorkouts.forEach(w => {
      html += buildLoggedWorkoutCard(w, dateStr, data.restriction);
    });

    // Rest day — only if truly nothing planned
    if (allSessionsCount === 0) {
      html += `<div class="rest-day-badge">${ICONS.moon} Rest Day</div>`;
    }
  }

  // Restriction suggestion note (only for "reduce", not "remove")
  if (data.restriction && data.restriction.action !== "remove" && allSessionsCount > 0) {
    const suggestion = RESTRICTION_SUGGESTIONS[data.restriction.type];
    if (suggestion) {
      html += `<div class="restriction-session-note">${ICONS.lightbulb} ${suggestion}</div>`;
    }
  }

  // ── Safety warning (today only) ─────────────────────────────────────────────
  try { if (isToday && typeof renderSafetyWarning === "function") html += renderSafetyWarning(); } catch (e) { console.error("safety warning error:", e); }

  // ── Nutrition sections (hidden when nutrition tracking is disabled) ────────
  if (typeof isNutritionEnabled === "function" && isNutritionEnabled()) {
    const nutritionTitle = isToday ? "Nutrition Targets Today" : "Nutrition Targets";
    html += `
      <div class="nutrition-target-section">
        <div class="section-label">
          <span>${nutritionTitle}</span>
          <button class="nutrition-reset-btn" id="nutrition-reset-btn-${dateStr}"
            onclick="resetNutritionTargets('${dateStr}')"
            style="${isAdjusted ? '' : 'display:none'}">↺ Reset to plan</button>
        </div>
        <p class="nutrition-hint">Tap a target to adjust it with a slider.</p>
        <div class="macro-summary">
          ${buildMacroBox("calories", "Calories", nutrition.calories, dateStr, 1200, 5000,  50, "")}
          ${buildMacroBox("protein",  "Protein",  nutrition.protein,  dateStr,   50,  300,   5, "g")}
          ${buildMacroBox("carbs",    "Carbs",    nutrition.carbs,    dateStr,   50,  600,  10, "g")}
          ${buildMacroBox("fat",      "Fat",      nutrition.fat,      dateStr,   20,  200,   5, "g")}
        </div>
      </div>`;

    if (data.loggedMeals.length > 0) {
      html += `<div class="section-label"><span>Nutrition Progress</span></div>
        <div id="nutrition-progress-bars-${dateStr}"></div>`;
    }

    html += `
      <div class="section-label"><span>Suggested Meals</span></div>
      <div id="meal-plan-${dateStr}"></div>
      ${typeof getAIDisclaimer === "function" ? getAIDisclaimer() : ""}`;
  }

  content.innerHTML = html;
  // Share icon click handlers auto-attach via the MutationObserver in
  // share.js — no per-render wiring needed here.
  if (typeof isNutritionEnabled === "function" && isNutritionEnabled()) {
    renderMealPlan(dateStr);
    renderNutritionProgressBars(dateStr);
  }
  // Render NL input for today
  if (isToday && typeof renderNLInput === "function") renderNLInput(dateStr);
  // Update daily progress rings
  renderDailyRings();
}

// ─── Nutrition progress bars (updates with sliders) ──────────────────────────

function renderNutritionProgressBars(dateStr) {
  const container = document.getElementById(`nutrition-progress-bars-${dateStr}`);
  if (!container) return;

  let loggedMeals = [];
  try { loggedMeals = (JSON.parse(localStorage.getItem("meals")) || []).filter(m => m.date === dateStr); } catch {}
  if (!loggedMeals.length) return;

  const nutrition = getDailyNutritionTarget(dateStr);
  const totals    = loggedMeals.reduce((acc, m) => ({
    calories: acc.calories + (m.calories || 0),
    protein:  acc.protein  + (m.protein  || 0),
    carbs:    acc.carbs    + (m.carbs    || 0),
    fat:      acc.fat      + (m.fat      || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  const macros = [
    { label: "Calories", unit: "",  consumed: totals.calories, target: nutrition.calories },
    { label: "Protein",  unit: "g", consumed: totals.protein,  target: nutrition.protein  },
    { label: "Carbs",    unit: "g", consumed: totals.carbs,    target: nutrition.carbs    },
    { label: "Fat",      unit: "g", consumed: totals.fat,      target: nutrition.fat      },
  ];

  let html = `<div class="nutrition-progress">`;
  macros.forEach(({ label, unit, consumed, target }) => {
    const rawPct = target > 0 ? Math.round(consumed / target * 100) : 0;
    const pct    = Math.min(rawPct, 100);
    const color  = rawPct > 120 ? "var(--color-danger)"
                 : rawPct >= 85 ? "var(--color-success)"
                 : "var(--color-accent)";
    html += `
      <div class="nutrition-progress-row">
        <div class="nutrition-progress-header">
          <span class="nutrition-progress-name">${label}</span>
          <span class="nutrition-progress-values">${Math.round(consumed)}${unit} <span class="nutrition-progress-sep">/ ${Math.round(target)}${unit}</span></span>
        </div>
        <div class="nutrition-progress-track">
          <div class="nutrition-progress-fill" style="width:${pct}%;background:${color}"></div>
        </div>
      </div>`;
  });
  html += `<div class="nutrition-meal-list">`;
  loggedMeals.forEach(m => {
    html += `
      <div class="nutrition-meal-item">
        <span class="nutrition-meal-name">${escHtml(m.name)}</span>
        <span class="nutrition-meal-cals">${Math.round(m.calories || 0)} cal</span>
      </div>`;
  });
  html += `</div></div>`;
  container.innerHTML = html;
}

// ─── Meal plan renderer (called on load + after every slider adjustment) ──────

function getEffectiveLoad(load, restriction) {
  if (!restriction) return load;
  if (restriction.action === "remove") return "rest";
  if (restriction.action !== "reduce") return load;
  switch (restriction.type) {
    case "rest":    return "rest";
    case "injury":
    case "sick":    return (load === "hard" || load === "long" || load === "moderate") ? "easy" : load;
    case "fatigue": return (load === "hard" || load === "long") ? "moderate" : (load === "moderate" ? "easy" : load);
    case "time":    return (load === "hard" || load === "long") ? "moderate" : load;
    default:        return load;
  }
}

/** Returns a shortened duration when a "reduce" restriction is active. */
function getRestrictedDuration(duration, originalLoad, restriction) {
  if (!duration || !restriction || restriction.action !== "reduce") return duration;
  const multipliers = { long: 0.60, hard: 0.65, moderate: 0.70, strides: 0.75, easy: 0.65 };
  return Math.max(15, Math.round(duration * (multipliers[originalLoad] || 0.70)));
}

/**
 * Knee-friendly substitutions for exercises that stress the knee joint.
 * Maps a regex pattern to a replacement exercise object.
 */
const INJURY_SUBSTITUTIONS = {
  knee: [
    { pattern: /squat/i,            sub: { name: "Glute Bridge",        sets: 3, reps: 12, weight: "Bodyweight" } },
    { pattern: /lunge/i,            sub: { name: "Hip Hinge",           sets: 3, reps: 12, weight: "Bodyweight" } },
    { pattern: /leg press/i,        sub: { name: "Hip Thrust",          sets: 3, reps: 10, weight: "Moderate" } },
    { pattern: /leg extension/i,    sub: { name: "Straight Leg Raise",  sets: 3, reps: 12, weight: "Bodyweight" } },
    { pattern: /box jump/i,         sub: { name: "Step-ups (low box)",  sets: 3, reps: 10, weight: "Bodyweight" } },
    { pattern: /jump squat/i,       sub: { name: "Glute Bridge",        sets: 3, reps: 12, weight: "Bodyweight" } },
  ],
  shoulder: [
    { pattern: /overhead press|ohp|military press/i, sub: { name: "Landmine Press",     sets: 3, reps: 10, weight: "Moderate" } },
    { pattern: /lateral raise/i,                     sub: { name: "Front Raise",         sets: 3, reps: 12, weight: "Light" } },
    { pattern: /upright row/i,                       sub: { name: "Face Pull",           sets: 3, reps: 15, weight: "Light cable" } },
  ],
  back: [
    { pattern: /deadlift/i, sub: { name: "Hip Thrust",   sets: 3, reps: 10, weight: "Moderate" } },
    { pattern: /row/i,      sub: { name: "Lat Pulldown",  sets: 3, reps: 10, weight: "Moderate" } },
  ],
  wrist: [
    { pattern: /push.?up/i,   sub: { name: "Chest Press Machine", sets: 3, reps: 10, weight: "Moderate" } },
    { pattern: /pull.?up/i,   sub: { name: "Lat Pulldown",        sets: 3, reps: 10, weight: "Moderate" } },
    { pattern: /curl/i,       sub: { name: "Cable Curl",           sets: 3, reps: 12, weight: "Light" } },
  ],
};

/** Detects which body area an injury restriction targets based on the note text. */
function _detectInjuryArea(note) {
  if (!note) return null;
  const n = note.toLowerCase();
  if (/knee|acl|mcl|meniscus|patella/i.test(n)) return "knee";
  if (/shoulder|rotator|delt/i.test(n)) return "shoulder";
  if (/back|spine|lumbar|disc/i.test(n)) return "back";
  if (/wrist|hand|carpal/i.test(n)) return "wrist";
  return null;
}

/** Checks if a specific exercise is called out in the restriction note. */
function _isExerciseCalledOut(exerciseName, note) {
  if (!note || !exerciseName) return false;
  const n = note.toLowerCase();
  const name = exerciseName.toLowerCase();
  // Check for explicit mention of the exercise name (or key word from it)
  const words = name.split(/\s+/).filter(w => w.length > 3);
  return words.some(w => n.includes(w));
}

/** Returns exercises with reduced sets/weight for fatigue/injury/sick restrictions.
 *  For injury restrictions, also substitutes exercises mentioned in the note or
 *  exercises that stress the injured body area. */
function getRestrictedExercises(exercises, restriction) {
  if (!restriction || restriction.action !== "reduce" || !exercises) return exercises;
  const t = restriction.type;
  if (t === "time") return exercises; // time only affects duration, not load

  // For injury restrictions, substitute exercises that target the injured area
  let result = exercises;
  if (t === "injury" && restriction.note) {
    const area = _detectInjuryArea(restriction.note);
    const subs = area ? (INJURY_SUBSTITUTIONS[area] || []) : [];
    const usedSubNames = new Set();

    result = exercises.map(ex => {
      const name = ex.name || "";
      // Check if this exercise is explicitly called out in the note
      const calledOut = _isExerciseCalledOut(name, restriction.note);
      // Check if this exercise matches an area-based substitution pattern
      const areaSub = subs.find(s => s.pattern.test(name));

      if (calledOut || areaSub) {
        if (areaSub && !usedSubNames.has(areaSub.sub.name)) {
          usedSubNames.add(areaSub.sub.name);
          return { ...areaSub.sub, _substituted: true };
        }
        // If called out but no area sub, or sub already used — remove
        return null;
      }
      return ex;
    }).filter(Boolean);
  }

  // Apply general intensity reduction
  const weightMult = (t === "injury" || t === "sick") ? 0.75 : 0.85;
  const repsCap    = (t === "injury" || t === "sick") ? 8 : null;
  return result.map(ex => {
    if (ex._substituted) { const { _substituted, ...clean } = ex; return clean; }
    const sets = Math.max(1, (parseInt(ex.sets) || 3) - 1);
    let reps = ex.reps;
    if (repsCap && parseInt(reps) > repsCap) reps = String(repsCap);
    let weight = ex.weight || "";
    const wMatch = weight.match(/([\d.]+)/);
    if (wMatch) {
      const reduced = Math.round(parseFloat(wMatch[1]) * weightMult);
      weight = weight.replace(wMatch[1], reduced);
    }
    return { ...ex, sets: String(sets), reps, weight };
  });
}

// ─── Transparency layer — "Why this?" explanations ──────────────────────────
//
// Generates 2–3 contextual sentences explaining why a given workout is on
// today's plan. Pulls from:
//   - The entry's source (plan / manual / saved / community / shared)
//   - Training phase + week from the plan metadata
//   - Yesterday's and tomorrow's workouts to explain placement
//   - This week's sessions for strength split rationale
//   - The user's goal / level from the profile
//
// Everything is computed locally — no API calls. Caches the generated text
// on the button's dataset so re-expand doesn't regenerate.
function buildWorkoutExplanation(session, dateStr, discipline, load, sessionName, entry) {
  let rationale;
  try {
    rationale = _generateWorkoutRationale(dateStr, discipline, load, sessionName, entry);
  } catch (e) {
    console.warn("[IronZ] rationale generation failed", e);
    rationale = "";
  }
  if (!rationale) return "";

  // Unique ID for this card's "Why this?" panel. We don't use random IDs —
  // the ID is stable based on date + discipline + sessionName so a re-render
  // matches the same element and the collapse/expand state can persist.
  const rawKey = [dateStr, discipline || "", sessionName || "", load || ""].join("-");
  const id = "why-" + rawKey.replace(/\W+/g, "-").slice(0, 60);
  return `
    <button class="transparency-toggle" data-why-target="${id}">
      ${ICONS.lightbulb} Why this workout? <span class="chevron-why">&#9662;</span>
    </button>
    <div class="transparency-section" id="${id}">
      <p>${rationale}</p>
    </div>`;
}

function _generateWorkoutRationale(dateStr, discipline, load, sessionName, entry) {
  // Figure out where this workout came from. Priority: explicit source flag
  // → community → saved → manually added → plan-generated.
  const source = _detectWorkoutSource(entry);

  // Only AI- and plan-generated workouts get a "Why this workout?" — the
  // user didn't ask us to generate a manual or library entry, so we
  // shouldn't tell them why it's there. An entry counts as AI-generated
  // when it carries an aiSession blob or an explicit ai_generated flag,
  // even if it came in via a saved/custom source.
  const isAiGenerated = !!(entry && (entry.aiSession || entry.why_text || entry.ai_generated || entry.source === "ai_generated"));

  if (source === "manual")    return "";
  if (source === "community") return "";
  if (source === "shared")    return "";
  if (source === "saved" && !isAiGenerated) return "";

  // Defensive: if the entry doesn't carry any plan-generated signal
  // (phase / weekNumber / raceId) AND isn't an AI session, treat it
  // as a user-built custom session regardless of how its source flag
  // is tagged. The custom-plan and quick-entry flows have written
  // various combinations of source values over time; this catch-all
  // keeps "Why this workout?" from showing up on a session the user
  // literally typed into the app themselves.
  const hasPlanSignal = !!(entry && (entry.phase || entry.weekNumber || entry.raceId || entry.planId));
  if (!isAiGenerated && !hasPlanSignal) return "";

  // AI-generated / plan-scheduled — build contextual rationale
  const parts = [];

  // Part 1 — training phase / week context (if available)
  if (entry && entry.phase) {
    const phase = _escEsc(entry.phase);
    if (entry.weekNumber) {
      parts.push(`You're in the ${phase} phase, week ${entry.weekNumber} of your plan.`);
    } else {
      parts.push(`You're in the ${phase} phase of your plan.`);
    }
  }

  // Part 2 — load-specific sentence, tailored to yesterday/tomorrow
  const dayMs = 86400000;
  const d = new Date(dateStr + "T12:00:00");
  const yesterdayStr = new Date(d.getTime() - dayMs).toISOString().slice(0, 10);
  const tomorrowStr  = new Date(d.getTime() + dayMs).toISOString().slice(0, 10);
  const neighbors = _neighborWorkouts(yesterdayStr, tomorrowStr);

  const loadKey = String(load || "").toLowerCase();
  if (loadKey === "rest" || discipline === "rest") {
    parts.push("This is a recovery day. Rest is when adaptation happens — today's lack of stress is what makes tomorrow's session effective.");
  } else if (loadKey === "easy" || loadKey === "recovery") {
    if (neighbors.y && (neighbors.y.load === "hard" || neighbors.y.load === "long")) {
      const yDisc = _discLabel(neighbors.y.discipline || neighbors.y.type);
      parts.push(`Yesterday's ${yDisc} was high intensity, so today stays easy to let your body adapt without piling on stress.`);
    } else {
      parts.push("Easy effort today — aerobic base work that builds fitness without adding fatigue.");
    }
  } else if (loadKey === "hard" || loadKey === "race") {
    parts.push("High-intensity session today. This is the one that actually makes you fitter — surrounded by easier days so you can go all in.");
  } else if (loadKey === "long") {
    parts.push("Long endurance session. Builds the durability and aerobic capacity that race day demands.");
  } else if (loadKey === "moderate") {
    parts.push("Steady, controlled effort. Moderate days are where most of your fitness gets built.");
  }

  // Part 3 — strength split / weekly balance, or tomorrow preview
  const isStrength = discipline === "weightlifting" || discipline === "bodyweight" || discipline === "hiit";
  if (isStrength) {
    const split = _strengthWeekContext(dateStr, entry);
    if (split) parts.push(split);
  } else if (neighbors.t && (neighbors.t.load === "hard" || neighbors.t.load === "long")) {
    parts.push(`Tomorrow's ${_discLabel(neighbors.t.discipline || neighbors.t.type)} is a hard effort, so today is programmed to stay controlled.`);
  }

  // Trim to 2–3 sentences max
  return parts.slice(0, 3).join(" ");
}

// Classify the origin of a workout entry.
function _detectWorkoutSource(entry) {
  if (!entry) return "plan";
  if (entry.source === "user_added" && !entry.saved_workout_id && !entry.variant_id) return "manual";
  if (entry.communityId || entry.community_id) return "community";
  if (entry.shared_from_inbox_id || entry._sharedFromInboxId || entry.sender_display_name) return "shared";
  if (entry.saved_workout_id || entry.source === "custom") return "saved";
  if (entry.fromSaved) return "manual"; // logged workout that was started from a template
  return "plan";
}

// Look up yesterday / tomorrow entries from plan or workoutSchedule.
function _neighborWorkouts(yesterdayStr, tomorrowStr) {
  let schedule = [];
  try { schedule = JSON.parse(localStorage.getItem("workoutSchedule")) || []; } catch {}
  const plan = typeof loadTrainingPlan === "function" ? loadTrainingPlan() : [];
  const y = plan.find(e => e.date === yesterdayStr) || schedule.find(s => s.date === yesterdayStr);
  const t = plan.find(e => e.date === tomorrowStr)  || schedule.find(s => s.date === tomorrowStr);
  return { y, t };
}

// Count this week's strength sessions by muscle focus / type for the split rationale.
function _strengthWeekContext(dateStr, entry) {
  try {
    const d = new Date(dateStr + "T12:00:00");
    const dow = d.getDay(); // 0 = Sun
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - ((dow + 6) % 7)); // Monday
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
    const wsStr = weekStart.toISOString().slice(0, 10);
    const weStr = weekEnd.toISOString().slice(0, 10);

    const logged = JSON.parse(localStorage.getItem("workouts") || "[]")
      .filter(w => !w.isCompletion && w.date >= wsStr && w.date <= weStr && (w.type === "weightlifting" || w.type === "bodyweight" || w.type === "hiit"));
    const scheduled = JSON.parse(localStorage.getItem("workoutSchedule") || "[]")
      .filter(w => w.date >= wsStr && w.date <= weStr && (w.type === "weightlifting" || w.type === "bodyweight" || w.type === "hiit"));
    const count = logged.length + scheduled.length;

    // Try to detect a muscle focus from the session name
    const name = String((entry && entry.sessionName) || "").toLowerCase();
    const muscleFocus =
      /\bpush\b|\bchest\b|\bbench/.test(name) ? "push muscles"
      : /\bpull\b|\bback\b|\blat/.test(name) ? "pull muscles"
      : /\bleg\b|\bquad\b|\bhamstring\b|\bsquat/.test(name) ? "legs"
      : /\bcore\b|\babs\b/.test(name) ? "core"
      : /\bfull.?body\b|\btotal.?body\b/.test(name) ? "full body"
      : null;

    if (muscleFocus) {
      if (count >= 3) {
        return `This is your ${_ordinal(count)} strength session this week — today's focus is ${muscleFocus} to keep your weekly split balanced.`;
      }
      return `Today's focus is ${muscleFocus}, balancing the rest of this week's strength work.`;
    }
    if (count >= 3) {
      return `This is your ${_ordinal(count)} strength session this week.`;
    }
    return "";
  } catch { return ""; }
}

function _discLabel(disc) {
  const map = {
    run: "run", running: "run",
    bike: "ride", cycling: "ride",
    swim: "swim", swimming: "swim",
    brick: "brick session",
    weightlifting: "strength session",
    bodyweight: "bodyweight workout",
    hiit: "HIIT session",
    yoga: "yoga session",
  };
  return map[disc] || "session";
}

function _ordinal(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function _escEsc(v) {
  return String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]));
}

function _formatShortDate(iso) {
  try {
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch { return iso; }
}

// Document-level delegator for "Why this workout?" toggles. Single listener
// handles every instance across every card renderer — matches the pattern
// used for share buttons and per-set toggles. Prevents the parent card
// header's onclick="toggleSection(...)" from firing.
if (typeof document !== "undefined" && !document.__whyToggleWired) {
  document.__whyToggleWired = true;
  document.addEventListener("click", function (e) {
    const btn = e.target && e.target.closest && e.target.closest(".transparency-toggle[data-why-target]");
    if (!btn) return;
    e.stopPropagation();
    e.preventDefault();
    const targetId = btn.getAttribute("data-why-target");
    const panel = targetId && document.getElementById(targetId);
    if (!panel) return;
    btn.classList.toggle("is-open");
    panel.classList.toggle("is-open");
  });
}

function buildMealExplanation(dateStr, nutrition) {
  let profile = {};
  let foodPrefs = {};
  try { profile = JSON.parse(localStorage.getItem("profile")) || {}; } catch {}
  try { foodPrefs = JSON.parse(localStorage.getItem("foodPreferences")) || {}; } catch {}

  const proteinTarget = nutrition.protein || 0;

  // Determine today's workout type
  let workoutType = "";
  const _mePlanEntry = typeof loadTrainingPlan === "function" ? loadTrainingPlan().find(e => e.date === dateStr) : null;
  let _meSchedule = [];
  try { _meSchedule = JSON.parse(localStorage.getItem("workoutSchedule")) || []; } catch {}
  const _meTodaySessions = _meSchedule.filter(s => s.date === dateStr);

  if (_mePlanEntry) {
    workoutType = _mePlanEntry.discipline || _mePlanEntry.load || "";
  } else if (_meTodaySessions.length > 0) {
    workoutType = _meTodaySessions[0].type || _meTodaySessions[0].discipline || "";
  }

  const parts = [];
  if (proteinTarget > 0) parts.push(`your protein target of ${proteinTarget}g`);
  const likes = (foodPrefs.likes || []).filter(f => f);
  if (likes.length > 0) parts.push(`preference for ${likes.slice(0, 3).map(f => escHtml(f)).join(", ")}`);
  const dislikes = (foodPrefs.dislikes || []).filter(f => f).map(f => typeof f === "string" ? f : (f.name || ""));
  if (dislikes.length > 0) parts.push(`avoiding ${dislikes.slice(0, 3).map(f => escHtml(f)).join(", ")}`);
  // Show dietary restrictions
  try {
    const ob = JSON.parse(localStorage.getItem("onboardingData")) || {};
    const diet = (ob.dietaryRestrictions || []).filter(d => d && d !== "none");
    if (diet.length > 0) parts.push(`${diet.join(", ")} diet`);
  } catch {}
  if (workoutType) {
    const wLabel = ({ run: "running", bike: "cycling", swim: "swimming", weightlifting: "strength", yoga: "yoga", hiit: "HIIT", rest: "rest day" })[workoutType] || workoutType;
    parts.push(`today's ${wLabel} session`);
  } else {
    parts.push("today being a rest day");
  }

  if (parts.length === 0) return "";
  return `<div class="meal-transparency-note">${ICONS.lightbulb} Based on ${parts.join(", ")}.</div>`;
}

function _getWeekMealPlanForDate(dateStr) {
  // Check if the Week Meal Planner has a plan, and return the day's meals if so
  try {
    const plan = JSON.parse(localStorage.getItem("currentWeekMealPlan"));
    if (!plan || !plan.days || !plan.days.length) return null;
    const dow = new Date(dateStr + "T00:00:00").getDay(); // 0=Sun..6=Sat
    // MP_DAY_LABELS order: Mon(0), Tue(1), Wed(2), Thu(3), Fri(4), Sat(5), Sun(6)
    const mpIdx = dow === 0 ? 6 : dow - 1;
    const day = plan.days[mpIdx];
    if (!day || !day.meals) return null;
    return day;
  } catch { return null; }
}

function renderMealPlan(dateStr) {
  const container = document.getElementById(`meal-plan-${dateStr}`);
  if (!container) return;

  // If Week Meal Planner has a plan, use it — scale if sliders have been adjusted since generation
  const weekMealDay = _getWeekMealPlanForDate(dateStr);
  if (weekMealDay && weekMealDay.meals.length > 0) {
    const slotLabels = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" };

    // Check if sliders override the targets for this date
    let sliderAdj = null;
    try { sliderAdj = (JSON.parse(localStorage.getItem("nutritionAdjustments")) || {})[dateStr]; } catch {}
    const planCals = weekMealDay.meals.reduce((s, m) => s + m.calories, 0);
    const ratio = (sliderAdj && sliderAdj.calories && planCals > 0) ? sliderAdj.calories / planCals : 1;
    const meals = ratio === 1 ? weekMealDay.meals : weekMealDay.meals.map(m => ({
      ...m,
      calories: Math.round(m.calories * ratio),
      protein:  Math.round(m.protein * ratio),
      carbs:    Math.round(m.carbs * ratio),
      fat:      Math.round(m.fat * ratio),
    }));
    const totalCals = meals.reduce((s, m) => s + m.calories, 0);
    const _loadLabels = { rest: "Rest Day", light: "Light Activity", strength: "Strength Day", "endurance-easy": "Easy Cardio", "endurance-hard": "Hard / Long Session" };
    const loadNote = weekMealDay.load ? `<div class="meal-plan-load-note">${_loadLabels[weekMealDay.load] || ""}</div>` : "";
    let html = `<div class="meal-plan-preview">
      <div class="meal-plan-preview-header">Meal Plan — ${totalCals} cal total</div>
      ${loadNote}`;
    meals.forEach(m => {
      const slot = slotLabels[m.slot] || m.slot;
      html += `
        <div class="meal-plan-row">
          <div class="meal-plan-slot">${slot}</div>
          <div class="meal-plan-name">${typeof filterAIClaims === "function" ? filterAIClaims(m.name) : m.name}</div>
          <div class="meal-plan-macros">${m.calories} cal · ${m.protein}g P · ${m.carbs}g C · ${m.fat}g F</div>
        </div>`;
    });
    html += `</div>`;
    container.innerHTML = html;
    return;
  }

  const nutrition   = getDailyNutritionTarget(dateStr);
  const planEntry   = loadTrainingPlan().find(e => e.date === dateStr);
  const baseLoad    = planEntry ? planEntry.load : "rest";
  let   restriction = null;
  try { restriction = (JSON.parse(localStorage.getItem("dayRestrictions")) || {})[dateStr] || null; } catch {}
  const load = getEffectiveLoad(baseLoad, restriction);

  // Determine workout type for macro targeting
  let _mealWorkoutType = "";
  if (planEntry) {
    _mealWorkoutType = planEntry.discipline || "";
  } else {
    try {
      const _mealSched = JSON.parse(localStorage.getItem("workoutSchedule")) || [];
      const _mealToday = _mealSched.find(s => s.date === dateStr);
      if (_mealToday) _mealWorkoutType = _mealToday.type || _mealToday.discipline || "";
    } catch {}
  }

  const meals     = generateDayMeals(nutrition, load, dateStr, _mealWorkoutType);
  const totalCals = meals.reduce((s, m) => s + m.calories, 0);

  const _mealExplanation = buildMealExplanation(dateStr, nutrition);
  let html = `<div class="meal-plan-preview">
    <div class="meal-plan-preview-header">Suggested Plan — ${totalCals} cal total</div>
    ${_mealExplanation}`;
  meals.forEach(m => {
    html += `
      <div class="meal-plan-row">
        <div class="meal-plan-slot">${m.slot}</div>
        <div class="meal-plan-name">${typeof filterAIClaims === "function" ? filterAIClaims(m.name) : m.name}</div>
        <div class="meal-plan-macros">${m.calories} cal · ${m.protein}g P · ${m.carbs}g C · ${m.fat}g F</div>
      </div>`;
  });
  html += `</div>`;
  container.innerHTML = html;
}

let _mealRefreshTimer = null;

// ─── Macro box + slider ───────────────────────────────────────────────────────

function buildMacroBox(key, label, value, dateStr, min, max, step, suffix) {
  return `
    <div class="macro-box macro-box--interactive" onclick="toggleMacroSlider('${key}')">
      <div class="macro-value" id="nt-${key}">${value}${suffix}</div>
      <div class="macro-label">${label}</div>
      <div class="macro-slider-wrap" id="slider-wrap-${key}">
        <input type="range" class="macro-slider"
          min="${min}" max="${max}" step="${step}" value="${value}"
          oninput="handleMacroSlider(event,'${dateStr}','${key}','${suffix}')"
          onclick="event.stopPropagation()" />
        <div class="macro-slider-range">
          <span>${min}${suffix}</span><span>${max}${suffix}</span>
        </div>
      </div>
    </div>`;
}

function toggleMacroSlider(key) {
  const wrap = document.getElementById(`slider-wrap-${key}`);
  if (!wrap) return;
  const isOpen = wrap.classList.contains("is-open");
  // Close all open sliders
  document.querySelectorAll(".macro-slider-wrap.is-open")
    .forEach(el => el.classList.remove("is-open"));
  // Open this one if it wasn't already open
  if (!isOpen) wrap.classList.add("is-open");
}

function handleMacroSlider(event, dateStr, key, suffix) {
  const value     = parseInt(event.target.value);
  const displayEl = document.getElementById(`nt-${key}`);
  if (displayEl) displayEl.textContent = `${value}${suffix}`;

  // Safety check — warn if calories set below floor
  if (key === "calories" && typeof checkCalorieFloor === "function") {
    const warning = checkCalorieFloor(value);
    let warnEl = document.getElementById("calorie-floor-warning");
    if (warning) {
      if (!warnEl) {
        warnEl = document.createElement("div");
        warnEl.id = "calorie-floor-warning";
        warnEl.className = "safety-floor-warning";
        const sliderParent = event.target.closest(".macro-box");
        if (sliderParent) sliderParent.appendChild(warnEl);
      }
      warnEl.innerHTML = `${ICONS.warning} ${warning.message}`;
      warnEl.style.display = "";
    } else if (warnEl) {
      warnEl.style.display = "none";
    }
  }

  saveNutritionAdjustment(dateStr, key, value);

  // Show reset button as soon as any value diverges from the plan
  const resetBtn = document.getElementById(`nutrition-reset-btn-${dateStr}`);
  if (resetBtn) {
    const base     = getBaseNutritionTarget(dateStr);
    const adjusted = getDailyNutritionTarget(dateStr);
    const differs  = base.calories !== adjusted.calories || base.protein !== adjusted.protein
                  || base.carbs    !== adjusted.carbs    || base.fat     !== adjusted.fat;
    resetBtn.style.display = differs ? "" : "none";
  }

  // Debounce both meal plan and progress bars refresh
  clearTimeout(_mealRefreshTimer);
  _mealRefreshTimer = setTimeout(() => {
    renderMealPlan(dateStr);
    renderNutritionProgressBars(dateStr);
  }, 250);
}

function saveNutritionAdjustment(dateStr, key, value) {
  let adjustments = {};
  try { adjustments = JSON.parse(localStorage.getItem("nutritionAdjustments")) || {}; } catch {}
  if (!adjustments[dateStr]) {
    adjustments[dateStr] = { ...getBaseNutritionTarget(dateStr) };
  }
  adjustments[dateStr][key] = value;
  localStorage.setItem("nutritionAdjustments", JSON.stringify(adjustments)); if (typeof DB !== 'undefined') DB.syncKey('nutritionAdjustments');
}

function resetNutritionTargets(dateStr) {
  let adjustments = {};
  try { adjustments = JSON.parse(localStorage.getItem("nutritionAdjustments")) || {}; } catch {}
  delete adjustments[dateStr];
  localStorage.setItem("nutritionAdjustments", JSON.stringify(adjustments)); if (typeof DB !== 'undefined') DB.syncKey('nutritionAdjustments');
  renderDayDetail(dateStr); // re-renders targets and refreshes meal plan
}

// ─── Meal generation ──────────────────────────────────────────────────────────

function handleGenerateMeals(dateStr) {
  const nutrition = getDailyNutritionTarget(dateStr);
  const planEntry = loadTrainingPlan().find(e => e.date === dateStr);
  const load      = planEntry ? planEntry.load : "rest";
  let _genWorkoutType = planEntry ? (planEntry.discipline || "") : "";
  if (!_genWorkoutType) {
    try {
      const _gs = JSON.parse(localStorage.getItem("workoutSchedule")) || [];
      const _gt = _gs.find(s => s.date === dateStr);
      if (_gt) _genWorkoutType = _gt.type || _gt.discipline || "";
    } catch {}
  }
  const meals     = generateDayMeals(nutrition, load, dateStr, _genWorkoutType);
  const previewEl = document.getElementById(`meal-preview-${dateStr}`);
  if (!previewEl) return;

  const totalCals = meals.reduce((s, m) => s + m.calories, 0);
  let html = `
    <div class="meal-plan-preview">
      <div class="meal-plan-preview-header">Generated Meal Plan — ${totalCals} cal total</div>`;
  meals.forEach(m => {
    html += `
      <div class="meal-plan-row">
        <div class="meal-plan-slot">${m.slot}</div>
        <div class="meal-plan-name">${typeof filterAIClaims === "function" ? filterAIClaims(m.name) : m.name}</div>
        <div class="meal-plan-macros">${m.calories} cal · ${m.protein}g P · ${m.carbs}g C · ${m.fat}g F</div>
      </div>`;
  });
  html += `</div>`;
  previewEl.innerHTML = html;
}

function savePlanMeals(dateStr, meals) {
  let all = [];
  try { all = JSON.parse(localStorage.getItem("meals")) || []; } catch {}
  all = all.filter(m => !(m.date === dateStr && m.source === "generated"));
  meals.forEach(m => {
    all.push({
      id:       generateId("meal"),
      date:     dateStr,
      name:     `${m.slot}: ${m.name}`,
      calories: m.calories,
      protein:  m.protein,
      carbs:    m.carbs,
      fat:      m.fat,
      source:   "generated",
    });
  });
  localStorage.setItem("meals", JSON.stringify(all)); if (typeof DB !== 'undefined') DB.syncKey('meals');
  if (typeof renderNutritionHistory === "function") renderNutritionHistory();
  if (typeof renderTodaysSummary   === "function") renderTodaysSummary();
  renderDayDetail(dateStr);
  renderCalendar();
}

// ─── Zone helpers ─────────────────────────────────────────────────────────────

function loadToZone(load) {
  return { rest: 1, easy: 2, moderate: 3, hard: 4, long: 2, race: 5 }[load] || 2;
}

function getZoneText(load) {
  return { rest: "Rest", easy: "Z1–2", moderate: "Z2–3", hard: "Z3–4", long: "Z2 Long", race: "Race" }[load] || "Z2";
}

function getIntensityLabel(load) {
  return { rest: "Rest", easy: "Low", moderate: "Medium", hard: "High", long: "Endurance", race: "Race" }[load] || "";
}

function getIntensityClass(load) {
  return { easy: "intensity-low", moderate: "intensity-med", hard: "intensity-high", long: "intensity-long", race: "intensity-race" }[load] || "intensity-low";
}

// ─── Drag and Drop ────────────────────────────────────────────────────────────

function onSessionDragStart(event) {
  _dragActive = true;
  // Safety: auto-reset after 5 seconds in case dragend never fires
  setTimeout(() => { _dragActive = false; }, 5000);
  const el         = event.currentTarget;
  const dragType   = el.dataset.dragType;
  const sourceDate = el.dataset.dragSource;

  let payload;
  if (dragType === "scheduled") {
    payload = { id: el.dataset.dragId, sourceDate };
  } else if (dragType === "plan") {
    payload = { sourceDate, raceId: el.dataset.dragRaceid, discipline: el.dataset.dragDiscipline };
  } else if (dragType === "logged") {
    payload = { id: el.dataset.dragId, sourceDate };
  } else {
    event.preventDefault();
    return;
  }

  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", JSON.stringify({ type: dragType, payload }));
  // Defer adding class so the drag ghost shows the normal appearance
  setTimeout(() => el.classList.add("dragging"), 0);
}

function onSessionDragEnd(event) {
  _dragActive = false;
  event.currentTarget.classList.remove("dragging");
  document.querySelectorAll(".week-cell.drag-over").forEach(el => el.classList.remove("drag-over"));
}

function onCellDragOver(event, dateStr) {
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  event.currentTarget.classList.add("drag-over");
}

function onCellDragLeave(event) {
  // Only remove highlight when leaving the cell entirely, not when crossing child elements
  if (!event.currentTarget.contains(event.relatedTarget)) {
    event.currentTarget.classList.remove("drag-over");
  }
}

function onCellDrop(event, targetDate) {
  _dragActive = false;
  event.preventDefault();
  event.currentTarget.classList.remove("drag-over");

  let dragData;
  try { dragData = JSON.parse(event.dataTransfer.getData("text/plain")); }
  catch { return; }
  if (!dragData || !dragData.payload) return;

  const sourceDate = dragData.payload.sourceDate;
  if (sourceDate === targetDate) return;

  if (dragData.type === "scheduled") {
    const schedule = loadWorkoutSchedule();
    const idx = schedule.findIndex(e => String(e.id) === String(dragData.payload.id) && e.date === sourceDate);
    if (idx === -1) return;
    const entry  = { ...schedule[idx], date: targetDate };
    if (typeof entry.id === "string") entry.id = entry.id.replace(sourceDate, targetDate);
    schedule.splice(idx, 1, entry);
    localStorage.setItem("workoutSchedule", JSON.stringify(schedule)); if (typeof DB !== 'undefined') DB.syncSchedule();

  } else if (dragData.type === "plan") {
    const plan = loadTrainingPlan();
    const idx  = plan.findIndex(e =>
      e.date === sourceDate &&
      e.raceId === dragData.payload.raceId &&
      e.discipline === dragData.payload.discipline
    );
    if (idx === -1) return;
    plan[idx] = { ...plan[idx], date: targetDate };
    saveTrainingPlanData(plan);

  } else if (dragData.type === "logged") {
    let workouts = [];
    try { workouts = JSON.parse(localStorage.getItem("workouts")) || []; } catch {}
    const idx = workouts.findIndex(w => String(w.id) === String(dragData.payload.id));
    if (idx === -1) return;
    workouts[idx] = { ...workouts[idx], date: targetDate };
    localStorage.setItem("workouts", JSON.stringify(workouts)); if (typeof DB !== 'undefined') DB.syncWorkouts();
  }

  renderCalendar();
  // Refresh day detail if either affected day is currently open
  if (selectedDate === sourceDate || selectedDate === targetDate) {
    renderDayDetail(selectedDate);
  }
}

// ─── Quick Entry Modal ────────────────────────────────────────────────────────

let _qeDateStr = null;

function updateQERestrictionWarning(dateStr) {
  const warn = document.getElementById("qe-restriction-warning");
  if (!warn) return;
  let restrictions = {};
  try { restrictions = JSON.parse(localStorage.getItem("dayRestrictions")) || {}; } catch {}
  const r = restrictions[dateStr];
  if (r && r.action === "remove") {
    const label = RESTRICTION_LABELS[r.type] || r.type;
    warn.style.display = "";
    warn.innerHTML = `${ICONS.ban} <strong>${label}</strong> restriction — session removed on this day. Adding a workout will lift the restriction.`;
  } else if (r) {
    const label = RESTRICTION_LABELS[r.type] || r.type;
    warn.style.display = "";
    warn.innerHTML = `${ICONS.warning} <strong>${label}</strong> restriction is active on this day.`;
  } else {
    warn.style.display = "none";
  }
}

// ── Quick Entry Wizard state ──────────────────────────────────────────────────
let _qeSelectedType        = null;
let _qeSelectedMuscles     = new Set();
let _qeManualRowCount      = 0;
let _qeManualDragId        = null;
let _qeManualSsCount       = 0;
// _qeManualSsMode and _qeManualSsDragId removed — superset now triggered by drop zone
let _qeCardioRowCount      = 0;
let _qeWizardStep          = 0;
let _qeGeneratedExercises  = [];
let _qeGeneratedCardioData = null;

// ── openQuickEntry ────────────────────────────────────────────────────────────
function openQuickEntry(dateStr) {
  _qeDateStr            = dateStr;
  _qeSelectedType       = null;
  _qeSelectedMuscles    = new Set();
  _qeGeneratedExercises = [];

  // Clear any previously selected muscle buttons
  document.querySelectorAll(".qe-muscle-btn.selected").forEach(btn => btn.classList.remove("selected"));
  // Reset equipment step
  ["qe-equip-dumbbells", "qe-equip-barbell", "qe-equip-cables"].forEach(id => {
    const el = document.getElementById(id); if (el) el.checked = false;
  });
  const _dbWt = document.getElementById("qe-dumbbell-max-weight"); if (_dbWt) _dbWt.value = "";
  const _dbWtRow = document.getElementById("qe-dumbbell-weight-row"); if (_dbWtRow) _dbWtRow.style.display = "none";
  const _cablesDetail = document.getElementById("qe-cables-detail"); if (_cablesDetail) { _cablesDetail.style.display = "none"; _cablesDetail.querySelectorAll("input[type=checkbox]").forEach(c => c.checked = false); }
  const _perm = document.getElementById("qe-equip-permanent"); if (_perm) _perm.checked = false;
  const _permDateRow = document.getElementById("qe-equip-date-row"); if (_permDateRow) { _permDateRow.style.opacity = ""; _permDateRow.style.pointerEvents = ""; }
  const _eqEnd = document.getElementById("qe-equip-end-date"); if (_eqEnd) { _eqEnd.disabled = false; }
  const eqEndDate = document.getElementById("qe-equip-end-date"); if (eqEndDate) eqEndDate.value = "";
  const eqNote = document.getElementById("qe-equip-note"); if (eqNote) eqNote.value = "";
  const eqMsg = document.getElementById("qe-equipment-msg"); if (eqMsg) eqMsg.textContent = "";
  // Reset Ask IronZ panel
  const askPanel = document.getElementById("qe-ask-ironz-panel");
  if (askPanel) { askPanel.style.display = "none"; }
  const askInput = document.getElementById("qe-ask-ironz-input");
  if (askInput) { askInput.value = ""; }
  const askCount = document.getElementById("qe-ask-ironz-count");
  if (askCount) { askCount.textContent = "150 left"; }

  const overlay = document.getElementById("quick-entry-overlay");
  if (!overlay) return;

  const defaultDate = dateStr || getTodayString();
  document.getElementById("qe-date").value = defaultDate;
  updateQERestrictionWarning(defaultDate);

  qeShowStep(0, null);
  overlay.classList.add("is-open");
}

// Open Quick Entry and jump straight to the cardio manual interval editor
// for the given type (running / cycling / swimming). Used by
// AddRunningSessionFlow's "Add Manually" button to hand off to the full
// interval-row editor without going through the type picker again.
function openQuickEntryCardioManual(dateStr, type) {
  // Swim gets a dedicated Garmin-style pool-workout builder, not the flat
  // interval editor used for run/bike/generic cardio.
  if (type === "swim" && typeof SwimBuilderModal !== "undefined") {
    SwimBuilderModal.open(dateStr);
    return;
  }
  openQuickEntry(dateStr);
  _qeSelectedType = type || "running";
  qeInitCardioRows();
  qeShowStep(2, "cardio-manual");
}

function closeQuickEntry() {
  const overlay = document.getElementById("quick-entry-overlay");
  if (overlay) overlay.classList.remove("is-open");
  _qeDateStr = null;
  _stopLoadingMessages();
}

// ── Fun loading messages ──────────────────────────────────────────────────────
const _LOADING_MESSAGES = [
  "Building your workout…",
  "Warming up the engine…",
  "Calculating intervals…",
  "Dialing in the zones…",
  "Picking the perfect exercises…",
  "Almost there…",
  "Fine-tuning your plan…",
  "Lacing up…",
];
function _getLoadingIcons() {
  const icons = [];
  if (typeof ICONS !== "undefined") {
    if (ICONS.bike) icons.push(ICONS.bike);
    if (ICONS.run) icons.push(ICONS.run);
    if (ICONS.swim) icons.push(ICONS.swim);
    if (ICONS.weights) icons.push(ICONS.weights);
  }
  return icons;
}
let _loadingMsgInterval = null;
let _loadingIconInterval = null;
function _startLoadingMessages() {
  const msgEl = document.querySelector(".qe-loading-msg");
  const spinnerEl = document.querySelector(".qe-spinner");
  let msgIdx = 0;
  let iconIdx = 0;
  if (msgEl) {
    msgEl.textContent = _LOADING_MESSAGES[0];
    _loadingMsgInterval = setInterval(() => {
      msgIdx = (msgIdx + 1) % _LOADING_MESSAGES.length;
      msgEl.textContent = _LOADING_MESSAGES[msgIdx];
    }, 2500);
  }
  const icons = _getLoadingIcons();
  if (spinnerEl && icons.length > 0) {
    spinnerEl.innerHTML = icons[0];
    _loadingIconInterval = setInterval(() => {
      iconIdx = (iconIdx + 1) % icons.length;
      spinnerEl.innerHTML = icons[iconIdx];
    }, 1500);
  }
}
function _stopLoadingMessages() {
  if (_loadingMsgInterval) { clearInterval(_loadingMsgInterval); _loadingMsgInterval = null; }
  if (_loadingIconInterval) { clearInterval(_loadingIconInterval); _loadingIconInterval = null; }
}

// ── Wizard step navigation ────────────────────────────────────────────────────
function qeShowStep(step, subType) {
  _qeWizardStep = step;

  document.querySelectorAll(".qe-step").forEach(el => { el.style.display = "none"; });

  document.querySelectorAll(".qe-dot").forEach((d, i) => d.classList.toggle("active", i === step));

  const backBtn = document.getElementById("qe-back-btn");
  if (backBtn) backBtn.style.display = step === 0 ? "none" : "";

  const titles = {
    strength: "Strength Session", running: "Running Session",
    cycling: "Cycling Session",   swim: "Swimming Session",
    hiit: "HIIT Session",         brick: "Brick Session",
    yoga: "Yoga Session",         mobility: "Mobility Session",
    walking: "Walking Session",   rowing: "Rowing Session",
    sport: "Sport Session",
    hyrox: "Hyrox Session",
    sauna: "Sauna / Steam",
    restriction: "Rest / Restriction",
  };
  const titleEl = document.getElementById("qe-wizard-title");
  if (titleEl) titleEl.textContent = (subType && titles[subType]) || "Add Session";

  if (step === 0) {
    document.getElementById("qe-step-0").style.display = "";
  } else if (step === 1) {
    if (subType === "strength")          {
      document.getElementById("qe-step-1-strength").style.display = "";
      // Strength threshold refresh banner (SPEC_strength_level_v1 §4).
      const sSlot = document.getElementById("qe-strength-reminder-slot");
      if (sSlot && typeof ThresholdReminders !== "undefined") {
        sSlot.innerHTML = ThresholdReminders.buildBannerHtml("strength");
      }
    }
    else if (subType === "hiit")         document.getElementById("qe-step-1-hiit").style.display        = "";
    else if (subType === "hyrox")        { document.getElementById("qe-step-1-hyrox").style.display     = ""; _initHyroxBuilder(); }
    else if (subType === "sauna")        document.getElementById("qe-step-1-sauna").style.display       = "";
    else if (subType === "restriction")  document.getElementById("qe-step-1-restriction").style.display = "";
    else if (subType === "equipment")    document.getElementById("qe-step-1-equipment").style.display   = "";
    else {
      document.getElementById("qe-step-1-cardio").style.display = "";
      const isBrick = _qeSelectedType === "brick";
      document.getElementById("qe-duration-single").style.display = isBrick ? "none" : "";
      document.getElementById("qe-duration-brick").style.display  = isBrick ? ""     : "none";
      // Sport-specific session-type rows — show only for swim and cycling
      // per SPEC_cardio_add_session_v1.md §1.1-1.2. Running has its own
      // flow via AddRunningSessionFlow and never lands here.
      const isSwim = _qeSelectedType === "swim";
      const isBike = _qeSelectedType === "cycling";
      const swimRow = document.getElementById("qe-swim-session-type-row");
      const bikeRow = document.getElementById("qe-bike-session-type-row");
      const poolRow = document.getElementById("qe-swim-pool-row");
      if (swimRow) swimRow.style.display = isSwim ? "" : "none";
      if (bikeRow) bikeRow.style.display = isBike ? "" : "none";
      if (poolRow) poolRow.style.display = isSwim ? "" : "none";
      // Hide intensity dropdown for cycling — the session type already
      // encodes intensity (Recovery Spin ≠ VO2 Intervals). Swim keeps it.
      const intensityRow = document.getElementById("qe-activity-intensity")?.closest(".form-row");
      if (intensityRow) intensityRow.style.display = isBike ? "none" : "";
      // Load the user's saved pool size into the selector.
      if (isSwim && typeof SwimWorkout !== "undefined" && SwimWorkout.getUserPoolSize) {
        const poolSel = document.getElementById("qe-swim-pool");
        if (poolSel) poolSel.value = SwimWorkout.getUserPoolSize().value || "25m";
      }
      // Threshold refresh banner (SPEC §3.4). Renders for the active sport
      // when the user's threshold is >90 days old. Dismissable for 14 days.
      const reminderSlot = document.getElementById("qe-threshold-reminder-slot");
      if (reminderSlot && typeof ThresholdReminders !== "undefined") {
        const sportKey = isSwim ? "swim" : isBike ? "cycling" : null;
        reminderSlot.innerHTML = sportKey ? ThresholdReminders.buildBannerHtml(sportKey) : "";
      }
    }
  } else if (step === 2) {
    if (subType === "generated" || subType === "cardio-generated") {
      document.getElementById("qe-step-2-generated").style.display = "";
    } else if (subType === "cardio-manual") {
      document.getElementById("qe-step-2-cardio-manual").style.display = "";
      qeInitCardioRows();
    } else {
      document.getElementById("qe-step-2-manual").style.display = "";
      qeInitManualRows();
    }
  }
}

// ── Hyrox Builder ────────────────────────────────────────────────────────────

// Default weights are Men's Open division. Users can edit in the builder.
// Men's Open: Sled Push 152kg/335lb, Sled Pull 103kg/227lb, Farmer 2x24kg/53lb, Sandbag 20kg/44lb, Wall Ball 6kg/14lb
// Women's Open: Sled Push 103kg/227lb, Sled Pull 78kg/172lb, Farmer 2x16kg/35lb, Sandbag 10kg/22lb, Wall Ball 4kg/9lb
// Exposed as a window global so Build a Plan Manual can re-use the same
// station set (Phase 5, UNIFIED_BUILDER_SPEC.md).
const HYROX_STATIONS = [
  { id: "ski",               name: "SkiErg",              defaultDistance: "1000",  unit: "m",    defaultWeight: "" },
  { id: "sled-push",         name: "Sled Push",           defaultDistance: "50",    unit: "m",    defaultWeight: "335" },
  { id: "sled-pull",         name: "Sled Pull",           defaultDistance: "50",    unit: "m",    defaultWeight: "227" },
  { id: "burpee-broad-jump", name: "Burpee Broad Jump",   defaultDistance: "80",    unit: "m",    defaultWeight: "" },
  { id: "row",               name: "Rowing",              defaultDistance: "1000",  unit: "m",    defaultWeight: "" },
  { id: "farmer-carry",      name: "Farmer Carry",        defaultDistance: "200",   unit: "m",    defaultWeight: "53 per hand" },
  { id: "sandbag-lunges",    name: "Sandbag Lunges",      defaultDistance: "100",   unit: "m",    defaultWeight: "44" },
  { id: "wall-balls",        name: "Wall Balls",          defaultDistance: "75",    unit: "reps", defaultWeight: "14" },
];
if (typeof window !== "undefined") window.HYROX_STATIONS = HYROX_STATIONS;

let _hyroxRunDist = "0.5";
let _hyroxRunUnit = "mi";

function _initHyroxBuilder() {
  const listEl = document.getElementById("hyrox-station-list");
  if (!listEl) return;
  listEl.innerHTML = HYROX_STATIONS.map(s => `
    <label class="hyrox-station-row">
      <input type="checkbox" class="hyrox-station-cb" data-station="${s.id}" checked />
      <span class="hyrox-station-name">${escHtml(s.name)}</span>
      <input type="text" class="hyrox-station-dist" data-station="${s.id}" value="${s.defaultDistance}" style="width:60px" />
      <span class="hyrox-station-unit">${s.unit}</span>
      ${s.defaultWeight ? `<span style="margin-left:4px">@</span><input type="text" class="hyrox-station-wt" data-station="${s.id}" value="${s.defaultWeight}" style="width:80px" /><span>lb</span>` : ""}
    </label>
  `).join("");
}

function setHyroxRunDist(btn) {
  document.querySelectorAll(".hyrox-dist-btn").forEach(b => b.classList.remove("is-active"));
  btn.classList.add("is-active");
  const customInput = document.getElementById("hyrox-custom-dist");
  if (customInput) customInput.value = "";
  const val = btn.dataset.dist;
  if (val === "1.0k") {
    _hyroxRunDist = "1.0";
    _hyroxRunUnit = "km";
  } else {
    _hyroxRunDist = val;
    _hyroxRunUnit = "mi";
  }
}

function setHyroxCustomDist(input) {
  const val = input.value.trim();
  if (!val) return;
  document.querySelectorAll(".hyrox-dist-btn").forEach(b => b.classList.remove("is-active"));
  // Parse unit: if ends with "km" or "k", use km
  if (val.toLowerCase().endsWith("km") || val.toLowerCase().endsWith("k")) {
    _hyroxRunDist = parseFloat(val) || "1.0";
    _hyroxRunUnit = "km";
  } else {
    _hyroxRunDist = parseFloat(val.replace(/mi$/i, "")) || "0.5";
    _hyroxRunUnit = "mi";
  }
}

function saveHyroxWorkout() {
  const msg = document.getElementById("hyrox-save-msg");
  const dateStr = _qeDateStr;
  if (!dateStr) { if (msg) msg.textContent = "No date selected."; return; }

  const checked = document.querySelectorAll(".hyrox-station-cb:checked");
  if (checked.length === 0) { if (msg) { msg.style.color = "var(--color-danger)"; msg.textContent = "Select at least one station."; } return; }

  const exercises = [];
  let stationIndex = 0;
  checked.forEach(cb => {
    const stationId = cb.dataset.station;
    const station = HYROX_STATIONS.find(s => s.id === stationId);
    if (!station) return;
    stationIndex++;
    // Run before station
    exercises.push({
      name: `Run ${stationIndex}`,
      sets: "1",
      reps: `${_hyroxRunDist} ${_hyroxRunUnit}`,
      weight: "",
    });
    // Station
    const distInput = document.querySelector(`.hyrox-station-dist[data-station="${stationId}"]`);
    const wtInput = document.querySelector(`.hyrox-station-wt[data-station="${stationId}"]`);
    const dist = distInput?.value || station.defaultDistance;
    const wt = wtInput?.value || station.defaultWeight || "";
    exercises.push({
      name: station.name,
      sets: "1",
      reps: `${dist} ${station.unit}`,
      weight: wt ? `${wt} lb` : "",
    });
  });
  // Final run
  exercises.push({
    name: `Run ${stationIndex + 1}`,
    sets: "1",
    reps: `${_hyroxRunDist} ${_hyroxRunUnit}`,
    weight: "",
  });

  const workoutName = document.getElementById("hyrox-workout-name")?.value.trim() || "Hyrox Workout";

  // Save as workout
  let workouts = [];
  try { workouts = JSON.parse(localStorage.getItem("workouts")) || []; } catch {}
  workouts.unshift({
    id: Date.now(),
    date: dateStr,
    name: workoutName,
    type: "hyrox",
    notes: "",
    exercises,
    isHyrox: true,
  });
  localStorage.setItem("workouts", JSON.stringify(workouts)); if (typeof DB !== 'undefined') DB.syncWorkouts();

  if (msg) { msg.style.color = "var(--color-success)"; msg.textContent = "Hyrox workout saved!"; }
  renderCalendar();
  if (typeof renderDayDetail === "function") renderDayDetail(dateStr);
  setTimeout(() => closeQuickEntry(), 700);
}

// ── Sauna / Steam Session ────────────────────────────────────────────────────

function saveSaunaSession() {
  const msg = document.getElementById("sauna-save-msg");
  const dateStr = _qeDateStr;
  if (!dateStr) { if (msg) msg.textContent = "No date selected."; return; }

  const duration = parseInt(document.getElementById("sauna-duration")?.value);
  if (!duration || duration < 1) { if (msg) { msg.style.color = "var(--color-danger)"; msg.textContent = "Please enter duration."; } return; }

  const saunaType = document.getElementById("sauna-type")?.value || "dry-sauna";
  const temp = document.getElementById("sauna-temp")?.value || "";
  const notes = document.getElementById("sauna-notes")?.value.trim() || "";

  const typeLabels = { "dry-sauna": "Dry Sauna", "infrared-sauna": "Infrared Sauna", "steam-room": "Steam Room" };

  let workouts = [];
  try { workouts = JSON.parse(localStorage.getItem("workouts")) || []; } catch {}
  workouts.unshift({
    id: Date.now(),
    date: dateStr,
    name: typeLabels[saunaType] || "Sauna",
    type: "wellness",
    subType: saunaType,
    duration: String(duration),
    temperature: temp ? parseInt(temp) : null,
    notes: notes || `${typeLabels[saunaType]} · ${duration} min`,
    isSauna: true,
  });
  localStorage.setItem("workouts", JSON.stringify(workouts)); if (typeof DB !== 'undefined') DB.syncWorkouts();

  // Adjust hydration target: ~1.5 oz per minute of heat exposure
  if (typeof adjustHydrationForSauna === "function") {
    adjustHydrationForSauna(dateStr, duration);
  }

  if (msg) { msg.style.color = "var(--color-success)"; msg.textContent = "Session saved!"; }
  renderCalendar();
  if (typeof renderDayDetail === "function") renderDayDetail(dateStr);
  setTimeout(() => closeQuickEntry(), 700);
}

function toggleMoreTypes(btn, panelId) {
  const panel = document.getElementById(panelId || "qe-more-types");
  if (!panel) return;
  const showing = panel.style.display !== "none";
  panel.style.display = showing ? "none" : "";
  const arrow = btn.querySelector(".qe-more-arrow");
  if (arrow) arrow.style.transform = showing ? "" : "rotate(180deg)";
}

function qeSelectType(type) {
  _qeSelectedType = type;
  // Running goes through the new structured 8-type generator (Phase 2 spec).
  // The legacy intervals/phases form is replaced by AddRunningSessionFlow.
  if (type === "running" && typeof window !== "undefined" && window.AddRunningSessionFlow) {
    const dateStr = document.getElementById("qe-date")?.value || _qeDateStr || new Date().toISOString().slice(0, 10);
    closeQuickEntry();
    window.AddRunningSessionFlow.open(dateStr);
    return;
  }
  // Circuit workouts (CrossFit-style: For Time / AMRAP / Standard). Uses its
  // own entry → preview → save flow with a bespoke data model.
  if (type === "circuit" && typeof window !== "undefined" && window.CircuitBuilder) {
    const dateStr = document.getElementById("qe-date")?.value || _qeDateStr || new Date().toISOString().slice(0, 10);
    closeQuickEntry();
    window.CircuitBuilder.openEntryFlow(dateStr);
    return;
  }
  if (type === "strength")        qeShowStep(1, "strength");
  else if (type === "yoga")       qeShowStep(1, "strength"); // yoga uses exercise rows like Build a Plan
  else if (type === "bodyweight") qeShowStep(2, "manual");   // skip muscle picker, go straight to manual entry
  else if (type === "restriction") qeShowStep(1, "restriction");
  else if (type === "equipment")  qeShowStep(1, "equipment");
  else                            qeShowStep(1, type);
}

function qeShowAskIronZ() {
  const panel = document.getElementById("qe-ask-ironz-panel");
  const btn   = document.querySelector(".qe-type-card--ask-ironz");
  if (!panel) return;
  const isOpen = panel.style.display !== "none";
  panel.style.display = isOpen ? "none" : "";
  if (!isOpen) {
    document.getElementById("qe-ask-ironz-input")?.focus();
    if (btn) btn.classList.toggle("is-active", true);
  } else {
    if (btn) btn.classList.toggle("is-active", false);
  }
}

// ── Ask IronZ interval normalization ────────────────────────────────────────
//
// The AI generator is unreliable about:
//   (a) assigning distinct zones per phase — it often returns every
//       interval at the same effort like "Easy" or "Z2", then describes
//       the actual intensity in the free-text `details` field.
//   (b) including restDuration — it describes rest in details like
//       "90 sec rest" or "2 min rest" instead of populating the field.
//
// This helper post-processes the AI response to:
//   1. Infer the correct zone from the phase name + details when the AI
//      returned a flat/default value
//   2. Extract restDuration from the details text when missing
// Both fixes are idempotent — if the AI ALREADY returned a distinct
// zone or a populated restDuration, we leave it alone.

function _normalizeAiIntervals(intervals) {
  if (!Array.isArray(intervals)) return [];

  // First pass: detect whether the AI returned a flat zone profile
  // (every segment the same effort). If so, we'll reassign from context.
  const effortValues = intervals.map(iv => String(iv.effort || "").toUpperCase());
  const uniqueEfforts = new Set(effortValues.filter(Boolean));
  const allSameEffort = uniqueEfforts.size <= 1;

  function _zoneFromContext(iv, idx, total) {
    const name = String(iv.name || "").toLowerCase();
    const details = String(iv.details || "").toLowerCase();
    const combined = name + " " + details;

    // Warmup / cooldown → Z1
    if (/warm.?up|warmup/i.test(name) || /cool.?down|cooldown/i.test(name)) return "Z1";
    // First/last segment without a clear name → likely warm/cool
    if (idx === 0 && /easy|recovery|warm/.test(combined)) return "Z1";
    if (idx === total - 1 && /easy|recovery|cool|breathing/.test(combined)) return "Z1";

    // Sprint / max effort → Z5
    if (/sprint|max effort|all.?out|100%/i.test(combined)) return "Z5";
    // Hard intervals / ~85%+ → Z4
    if (/\b([89]\d|100)%\b/.test(combined)) return "Z4";
    if (/hard interval|threshold|race pace|hard effort/i.test(combined)) return "Z4";
    // Tempo → Z3
    if (/tempo|sweet spot|comfortably hard|moderate.?hard/i.test(combined)) return "Z3";
    // Recovery between intervals
    if (/recover|rest/i.test(name)) return "Z1";
    // Steady / aerobic → Z2
    if (/steady|aerobic|endurance|moderate/i.test(combined)) return "Z2";

    // Unknown — preserve what the AI gave us (might be a legitimate Z-label)
    return null;
  }

  function _extractRestDuration(details) {
    const s = String(details || "");
    // Match "90 sec rest", "90s rest", "2 min rest", "2:00 rest", etc.
    const patterns = [
      /(\d+)\s*(?:sec|seconds|s)\b[^,.]*?\brest\b/i,
      /(\d+)\s*(?:min|minutes|m)\b[^,.]*?\brest\b/i,
      /\brest\b[^,.]*?(\d+)\s*(?:sec|seconds|s)\b/i,
      /\brest\b[^,.]*?(\d+)\s*(?:min|minutes|m)\b/i,
    ];
    for (const pat of patterns) {
      const m = s.match(pat);
      if (m) {
        const val = parseInt(m[1], 10);
        if (val > 0) {
          const isMin = /min|minutes|\bm\b/i.test(m[0]) && !/sec|seconds|\bs\b/i.test(m[0]);
          return isMin ? `${val} min` : `${val}s`;
        }
      }
    }
    return null;
  }

  return intervals.map((iv, idx) => {
    const out = { ...iv };

    // Zone inference: only override when the AI was flat OR the given
    // value is a generic non-zone word like "Easy"/"Moderate"/"Hard".
    // If the AI returned a specific Z-notation that varies across
    // segments, we trust it.
    const givenEffort = String(out.effort || "").toUpperCase();
    const isZNotation = /^Z[1-6]$/.test(givenEffort);
    const shouldOverride = allSameEffort || !isZNotation;
    if (shouldOverride) {
      const inferred = _zoneFromContext(out, idx, intervals.length);
      if (inferred) out.effort = inferred;
      else if (!isZNotation) {
        // Map generic English labels to zones so the pace-range lookup
        // downstream doesn't default everything to Z2.
        const labelMap = { EASY: "Z1", RECOVERY: "Z1", AEROBIC: "Z2",
          MODERATE: "Z2", STEADY: "Z2", TEMPO: "Z3", THRESHOLD: "Z4",
          HARD: "Z4", "VO2": "Z5", VO2MAX: "Z5", MAX: "Z5", SPRINT: "Z5" };
        if (labelMap[givenEffort]) out.effort = labelMap[givenEffort];
      }
    }

    // restDuration: extract from details text if not already set and
    // we can find a pattern in the description.
    if (!out.restDuration && out.details) {
      const extracted = _extractRestDuration(out.details);
      if (extracted) out.restDuration = extracted;
    }

    return out;
  });
}

async function qeSubmitAskIronZ() {
  const input = document.getElementById("qe-ask-ironz-input");
  const prompt = (input?.value || "").trim();
  if (!prompt) return;

  qeShowStep(2, "generated");
  const loadingEl = document.getElementById("qe-ai-loading");
  const resultEl  = document.getElementById("qe-ai-result");
  loadingEl.style.display = "";
  _startLoadingMessages();
  resultEl.innerHTML = "";

  try {
    let profile = {};
    try { profile = JSON.parse(localStorage.getItem("profile")) || {}; } catch {}
    let strengthRefs = null;
    try {
      const allZones = JSON.parse(localStorage.getItem("trainingZones")) || {};
      strengthRefs = allZones.strength || null;
    } catch {}

    const profileCtx = profile.weight
      ? `Athlete: ${profile.weight} lbs${profile.gender ? `, ${profile.gender}` : ""}.`
      : "";

    const liftLabels = { bench: "Bench Press", squat: "Back Squat", deadlift: "Deadlift", ohp: "Overhead Press", row: "Barbell Row" };
    const typeLabels = { "1rm": "1-rep max", "5rm": "5-rep max", "10rm": "10-rep max" };
    let refCtx = "";
    if (strengthRefs) {
      const lines = Object.entries(liftLabels)
        .filter(([k]) => strengthRefs[k]?.weight)
        .map(([k, label]) => `${label}: ${strengthRefs[k].weight} lbs (${typeLabels[strengthRefs[k].type] || strengthRefs[k].type})`);
      if (lines.length) refCtx = ` Reference lifts (use to set weights): ${lines.join(", ")}.`;
    }
    let avoidCtx = "";
    try {
      const prefs = JSON.parse(localStorage.getItem("trainingPreferences") || "{}");
      const avoided = prefs.avoidedExercises || [];
      if (avoided.length) avoidCtx = ` NEVER include these exercises: ${avoided.join(", ")}.`;
    } catch {}

    const data = await callAI({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1200,
      messages: [{
        role: "user",
        content: `You are a personal trainer. The athlete says: "${prompt}". ${profileCtx}${refCtx}${avoidCtx}

Determine the workout type and generate an appropriate session.

Return ONLY valid JSON, no markdown:
For strength/HIIT/general workouts:
{"type":"strength","title":"Workout Name","exercises":[{"name":"Exercise","sets":3,"reps":10,"rest":"60s","weight":"135 lbs"}]}

For running/cycling/swim/cardio workouts:
{"type":"cardio","sport":"running","title":"Run Name","intervals":[{"name":"Phase","duration":"10 min","effort":"Z2","details":"Aerobic pace","restDuration":"90s"}]}

CARDIO INTERVAL RULES — every phase MUST have an explicit zone in the "effort" field:
- Z1: Recovery / very easy (warmup, cooldown, easy recovery phases)
- Z2: Aerobic / steady endurance pace
- Z3: Tempo / threshold lower end
- Z4: Hard intervals / threshold / ~85% effort / "hard" phases
- Z5: VO2max / sprint / max effort
DO NOT put every phase at the same zone. Warmup+cooldown are Z1, steady blocks are Z2, tempo is Z3, hard intervals are Z4, sprints are Z5.

For swim interval sets, "effort":"Z4" for hard intervals at ~85% effort.
For hard/tempo/sprint intervals that have rest between reps, include a "restDuration" field in the interval object (e.g. "90s", "2 min", "30s"). Warmup/cooldown/steady phases don't need restDuration.

SWIM-SPECIFIC: For swim workouts, every main/tempo/interval phase MUST use structured sets in the details field — concrete sets × distance @ pace with rest, not a narrative like "swim tempo for 13 min". Examples of correct details:
- "8 × 100m @ CSS pace (1:30/100m) w/ 15s rest"
- "6 × 200m @ CSS w/ 20s rest"
- "10 × 50m sprint (CSS-5s) w/ 30s rest"
- "Ladder 50/100/150/200/150/100/50m all @ CSS w/ 15s rest"
- "4 × 400m @ CSS broken every 100m w/ 10s rest inside each 400"
Also populate the reps, distance, and restDuration fields on interval objects (e.g. "reps": 6, "duration": "200m", "restDuration": "20s").

Use "Bodyweight" for bodyweight exercises. Strength exercises must have specific weights in lbs rounded to the nearest 5 (e.g. 135, 185 — NEVER 137, 267). Use reference lifts if provided. Include 5-8 exercises or 3-5 intervals.`
      }]
    });

    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    const cleaned = text.replace(/```json|```/g, "").trim();
    const workout = JSON.parse(cleaned);
    loadingEl.style.display = "none"; _stopLoadingMessages();

    if (workout.type === "cardio") {
      // Cardio — reuse the cardio-generated display.
      // Normalize the intervals first: the AI often returns every
      // segment at the same effort (all "Z2" or all "Easy") and
      // describes rest periods in free-text details instead of the
      // restDuration field. Post-process to fix both.
      const _normalizedIntervals = _normalizeAiIntervals(workout.intervals || []);
      _qeGeneratedCardioData = { title: workout.title, intervals: _normalizedIntervals, sport: workout.sport || "running" };
      _qeSelectedType = workout.sport || "running";
      const effortColors = { Easy: "#22c55e", Moderate: "#f59e0b", Hard: "#f97316", Max: "#ef4444" };
      const intervalsHtml = (workout.intervals || []).map(iv => {
        const c = effortColors[iv.effort] || "#64748b";
        return `<div class="qe-cardio-interval">
          <div class="qe-cardio-interval-header">
            <span class="qe-cardio-phase">${escHtml(iv.name)}</span>
            <span class="qe-cardio-meta">${escHtml(iv.duration)} · <span style="color:${c}">${escHtml(iv.effort)}</span></span>
          </div>
          ${iv.details ? `<div class="qe-cardio-details">${escHtml(iv.details)}</div>` : ""}
        </div>`;
      }).join("");
      resultEl.innerHTML = `<div class="qe-generated-workout">
        <div class="qe-generated-title">${ICONS.sparkles} ${escHtml(workout.title)}</div>
        ${intervalsHtml}
      </div>`;
      const btnRow = document.createElement("div");
      btnRow.style.cssText = "display:flex;gap:10px;margin-top:12px";
      btnRow.innerHTML = `<button class="btn-primary" style="flex:1" onclick="qeSaveGeneratedCardio()">Save Session</button>`;
      resultEl.appendChild(btnRow);
    } else {
      // Strength/HIIT — use existing strength display
      // Personalize weights from the athlete's reference lifts. The AI
      // often hallucinated low weights — _personalizeWeights scales them
      // based on actual bench/squat/deadlift/ohp/row from trainingZones.
      _qeGeneratedExercises = typeof _personalizeWeights === "function"
        ? _personalizeWeights((workout.exercises || []).map(ex => ({ ...ex, weight: _roundExWeight(ex.weight) })))
        : (workout.exercises || []).map(ex => ({ ...ex, weight: _roundExWeight(ex.weight) }));
      _qeEditingExerciseIndex = null;
      _qeSelectedType = "strength";
      resultEl.innerHTML = `<div class="qe-generated-workout">
        <div class="qe-generated-title">${ICONS.sparkles} ${workout.title || "Your Workout"}</div>
        <div class="form-row" style="margin-bottom:10px">
          <label for="qe-workout-name">Workout Name (optional)</label>
          <input type="text" id="qe-workout-name" value="${(workout.title || "").replace(/"/g,"&quot;")}" placeholder="e.g. Leg Day" />
        </div>
        <div class="qe-exercise-header"><span></span><span>Sets × Reps</span><span>Weight</span><span></span></div>
        <div id="qe-exercise-list"></div>
      </div>`;
      _qeRenderExerciseList();
      const btnRow = document.createElement("div");
      btnRow.style.cssText = "display:flex;gap:10px;margin-top:12px";
      btnRow.innerHTML = `<button class="btn-primary" style="flex:1" onclick="qeSaveGeneratedStrength()">Save Session</button>`;
      resultEl.appendChild(btnRow);
    }

    // Add follow-up Ask IronZ input for modifying the workout
    _qeAppendModifyInput(resultEl);

  } catch (err) {
    loadingEl.style.display = "none"; _stopLoadingMessages();
    resultEl.innerHTML = `<div class="qe-ai-error">${ICONS.warning} Could not generate workout. ${err.message || "Try again."}<br><br>
      <button class="btn-secondary" onclick="qeShowStep(0,null)">← Go back</button>
    </div>`;
  }
}

// ── Ask IronZ: follow-up modification input ──────────────────────────────────
function _qeAppendModifyInput(container) {
  const wrap = document.createElement("div");
  wrap.id = "qe-modify-panel";
  wrap.style.cssText = "margin-top:16px;border-top:1px solid var(--color-border);padding-top:12px";
  wrap.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span class="logo-mark" style="font-size:0.9rem"><svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></span>
      <span style="font-weight:600;font-size:0.85rem">Modify with IronZ</span>
    </div>
    <div style="display:flex;gap:8px">
      <input type="text" id="qe-modify-input" placeholder="e.g. increase bench press by 10 lbs" style="flex:1;font-size:0.85rem" />
      <button class="btn-primary" style="padding:8px 14px;white-space:nowrap" onclick="qeSubmitModify()">Go</button>
    </div>
    <div id="qe-modify-status" style="font-size:0.8rem;color:var(--color-text-muted);margin-top:6px;display:none"></div>`;
  container.appendChild(wrap);

  // Enter key submits
  wrap.querySelector("#qe-modify-input").addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); qeSubmitModify(); }
  });
}

async function qeSubmitModify() {
  const input = document.getElementById("qe-modify-input");
  const prompt = (input?.value || "").trim();
  if (!prompt) return;

  const statusEl = document.getElementById("qe-modify-status");
  statusEl.style.display = "";
  statusEl.textContent = "Thinking...";
  statusEl.style.color = "var(--color-text-muted)";
  input.disabled = true;

  try {
    // Build current workout context
    let workoutCtx;
    if (_qeSelectedType === "strength" || _qeSelectedType === "manual") {
      workoutCtx = {
        type: "strength",
        title: document.getElementById("qe-workout-name")?.value || "",
        exercises: _qeGeneratedExercises.map(ex => ({
          name: ex.name, sets: ex.sets, reps: ex.reps, weight: ex.weight, rest: ex.rest
        }))
      };
    } else if (_qeGeneratedCardioData) {
      workoutCtx = {
        type: "cardio",
        title: _qeGeneratedCardioData.title,
        sport: _qeSelectedType === "swim" ? "swim" : _qeGeneratedCardioData.sport,
        intervals: _qeGeneratedCardioData.intervals,
      };
      // For swim workouts, include the canonical step tree + pool size so
      // the model can edit it in place.
      if (_qeSelectedType === "swim") {
        workoutCtx.pool_size_m = _qeGeneratedCardioData.pool_size_m;
        workoutCtx.pool_unit = _qeGeneratedCardioData.pool_unit;
        workoutCtx.total_distance_m = _qeGeneratedCardioData.total_distance_m;
        workoutCtx.steps = _qeGeneratedCardioData.steps;
      }
    }

    // Swim-specific schema guidance for Ask IronZ: tell the model how to
    // return a replacement step tree. Only attached when we're modifying
    // a swim workout.
    const swimSchemaHint = (_qeSelectedType === "swim") ? {
      swim_workout_schema: {
        instructions: "This is a pool swim workout. When the user asks to modify it, return a ```action``` block with a `set_swim_workout` action whose `steps` array replaces the current steps. Every interval step MUST include distance_m rounded to whole pool lengths (pool_size_m = " + (_qeGeneratedCardioData?.pool_size_m || 25) + " m). Rest steps use duration_sec. Repeat blocks wrap children with a count. Strokes: freestyle, backstroke, breaststroke, butterfly, im, choice.",
        example_action: {
          actions: [{
            action: "set_swim_workout",
            workout: {
              title: "CSS Intervals",
              steps: [
                { kind: "interval", name: "Warm Up", distance_m: 400, stroke: "freestyle", pace_target: "easy" },
                { kind: "rest", duration_sec: 20 },
                { kind: "repeat", count: 8, children: [
                  { kind: "interval", name: "Main", distance_m: 100, stroke: "freestyle", pace_target: "CSS" },
                  { kind: "rest", duration_sec: 15 },
                ]},
                { kind: "interval", name: "Cool Down", distance_m: 200, stroke: "choice", pace_target: "easy" },
              ],
            },
          }],
        },
      },
    } : null;

    const data = await callAskIronZ({
      question: prompt,
      context: {
        current_workout: workoutCtx,
        ...(swimSchemaHint || {}),
      },
    });

    const answer = data.answer || "";

    // Parse action block from response
    const actionMatch = answer.match(/```action\s*([\s\S]*?)```/);
    let actionsApplied = false;

    if (actionMatch) {
      try {
        const parsed = JSON.parse(actionMatch[1].trim());
        const actions = parsed.actions || [];
        actionsApplied = _qeApplyWorkoutActions(actions);
      } catch (e) {
        console.warn("Failed to parse action block:", e);
      }
    }

    // Show confirmation text (strip the action block)
    const displayText = answer.replace(/```action[\s\S]*?```/, "").trim();
    if (displayText) {
      statusEl.style.color = "var(--color-success, #22c55e)";
      statusEl.textContent = displayText;
    } else if (actionsApplied) {
      statusEl.style.color = "var(--color-success, #22c55e)";
      statusEl.textContent = "Done.";
    }

    input.value = "";
  } catch (err) {
    statusEl.style.color = "var(--color-error, #ef4444)";
    statusEl.textContent = err.message || "Failed. Try again.";
  } finally {
    input.disabled = false;
    input.focus();
  }
}

function _qeApplyWorkoutActions(actions) {
  let applied = false;
  for (const act of actions) {
    switch (act.action) {
      case "update_exercise": {
        const idx = _qeFindExercise(act.target);
        if (idx === -1) break;
        const ex = _qeGeneratedExercises[idx];
        if (act.updates.weight != null) ex.weight = _roundExWeight(String(act.updates.weight));
        if (act.updates.sets != null) ex.sets = act.updates.sets;
        if (act.updates.reps != null) ex.reps = String(act.updates.reps);
        if (act.updates.rest != null) ex.rest = act.updates.rest;
        if (act.updates.name != null) ex.name = act.updates.name;
        applied = true;
        break;
      }
      case "swap_exercise": {
        const idx = _qeFindExercise(act.target);
        if (idx === -1) break;
        const repl = act.replacement;
        _qeGeneratedExercises[idx] = {
          name: repl.name,
          sets: repl.sets || _qeGeneratedExercises[idx].sets,
          reps: repl.reps || _qeGeneratedExercises[idx].reps,
          weight: _roundExWeight(String(repl.weight || "Bodyweight")),
          rest: repl.rest || _qeGeneratedExercises[idx].rest
        };
        applied = true;
        break;
      }
      case "add_exercise": {
        const newEx = {
          name: act.exercise.name,
          sets: act.exercise.sets || 3,
          reps: act.exercise.reps || "10",
          weight: _roundExWeight(String(act.exercise.weight || "Bodyweight")),
          rest: act.exercise.rest || "60s"
        };
        _qeGeneratedExercises.push(newEx);
        applied = true;
        break;
      }
      case "remove_exercise": {
        const idx = _qeFindExercise(act.target);
        if (idx === -1) break;
        _qeGeneratedExercises.splice(idx, 1);
        applied = true;
        break;
      }
      case "update_cardio_interval": {
        if (!_qeGeneratedCardioData) break;
        const iv = _qeGeneratedCardioData.intervals.find(i =>
          i.name.toLowerCase().includes(act.target.toLowerCase())
        );
        if (!iv) break;
        if (act.updates.duration != null) iv.duration = act.updates.duration;
        if (act.updates.effort != null) iv.effort = act.updates.effort;
        if (act.updates.details != null) iv.details = act.updates.details;
        applied = true;
        break;
      }
      case "set_swim_workout": {
        // Replace the entire swim workout with a canonical steps tree
        // returned by the AI. We normalize through SwimWorkout to drop
        // unknown fields and coerce invalid strokes.
        if (!_qeGeneratedCardioData || typeof SwimWorkout === "undefined") break;
        const normalized = SwimWorkout.normalizeWorkout(act.workout || {});
        if (!normalized.steps.length) break;
        _qeGeneratedCardioData.title = normalized.title || _qeGeneratedCardioData.title;
        _qeGeneratedCardioData.steps = normalized.steps;
        _qeGeneratedCardioData.pool_size_m = normalized.pool_size_m;
        _qeGeneratedCardioData.pool_unit = normalized.pool_unit;
        _qeGeneratedCardioData.total_distance_m = normalized.total_distance_m;
        applied = true;
        break;
      }
    }
  }

  // Re-render the workout display
  if (applied) {
    if (_qeSelectedType === "strength" || _qeSelectedType === "manual") {
      _qeRenderExerciseList();
    } else if (_qeGeneratedCardioData) {
      _qeRerenderCardio();
    }
  }
  return applied;
}

function _qeFindExercise(target) {
  if (!target) return -1;
  const t = target.toLowerCase();
  // Exact match first
  let idx = _qeGeneratedExercises.findIndex(ex => ex.name.toLowerCase() === t);
  if (idx !== -1) return idx;
  // Partial match
  idx = _qeGeneratedExercises.findIndex(ex => ex.name.toLowerCase().includes(t));
  if (idx !== -1) return idx;
  // Reverse partial (target contains exercise name)
  idx = _qeGeneratedExercises.findIndex(ex => t.includes(ex.name.toLowerCase()));
  return idx;
}

function _qeRerenderCardio() {
  const resultEl = document.getElementById("qe-ai-result");
  if (!resultEl || !_qeGeneratedCardioData) return;
  // Swim with canonical step tree → Garmin-style card.
  let innerHtml;
  if (_qeSelectedType === "swim" && Array.isArray(_qeGeneratedCardioData.steps) && _qeGeneratedCardioData.steps.length && typeof SwimCardRenderer !== "undefined") {
    innerHtml = `<div class="qe-generated-workout">${SwimCardRenderer.render(_qeGeneratedCardioData)}</div>`;
  } else {
    const effortColors = { Easy: "#22c55e", Moderate: "#f59e0b", Hard: "#f97316", Max: "#ef4444" };
    const intervalsHtml = (_qeGeneratedCardioData.intervals || []).map(iv => {
      const c = effortColors[iv.effort] || "#64748b";
      return `<div class="qe-cardio-interval">
        <div class="qe-cardio-interval-header">
          <span class="qe-cardio-phase">${escHtml(iv.name)}</span>
          <span class="qe-cardio-meta">${escHtml(iv.duration)} · <span style="color:${c}">${escHtml(iv.effort)}</span></span>
        </div>
        ${iv.details ? `<div class="qe-cardio-details">${escHtml(iv.details)}</div>` : ""}
      </div>`;
    }).join("");
    innerHtml = `<div class="qe-generated-workout">
      <div class="qe-generated-title">${ICONS.sparkles} ${escHtml(_qeGeneratedCardioData.title)}</div>
      ${intervalsHtml}
    </div>`;
  }
  resultEl.innerHTML = innerHtml;
  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display:flex;gap:10px;margin-top:12px";
  btnRow.innerHTML = `<button class="btn-primary" style="flex:1" onclick="qeSaveGeneratedCardio()">Save Session</button>`;
  resultEl.appendChild(btnRow);
  _qeAppendModifyInput(resultEl);
}

function qeWizardBack() {
  _qeSelectedMuscles = new Set();
  document.querySelectorAll(".qe-muscle-btn.selected").forEach(btn => btn.classList.remove("selected"));
  if (_qeWizardStep === "library") {
    qeShowStep(0, null);
  } else if (_qeWizardStep === 2 && _qeSelectedType === "strength") {
    qeShowStep(1, _qeSelectedType);
  } else {
    qeShowStep(0, null);
  }
}

// ── Library picker (Saved / Community) ────────────────────────────────────────
let _qeLibActiveTab = "saved";
let _qeLibCommunityFilter = "All";

function qeShowLibrary() {
  _qeLibActiveTab = "saved";
  _qeLibCommunityFilter = "All";

  document.querySelectorAll(".qe-step").forEach(el => { el.style.display = "none"; });
  document.getElementById("qe-step-library").style.display = "";

  const titleEl = document.getElementById("qe-wizard-title");
  if (titleEl) titleEl.textContent = "Choose from Library";

  const backBtn = document.getElementById("qe-back-btn");
  if (backBtn) backBtn.style.display = "";

  document.querySelectorAll(".qe-dot").forEach(d => d.classList.remove("active"));

  _qeWizardStep = "library";

  qeLibTab("saved");
}

function qeLibTab(tab) {
  _qeLibActiveTab = tab;
  document.getElementById("qe-lib-tab-saved").classList.toggle("active", tab === "saved");
  document.getElementById("qe-lib-tab-community").classList.toggle("active", tab === "community");

  if (tab === "saved") {
    _renderLibSaved();
  } else {
    _qeLibCommunityFilter = "All";
    _renderLibCommunity();
  }
}

function _renderLibSaved() {
  const list = document.getElementById("qe-library-list");
  if (!list) return;

  const saved = loadSavedWorkouts();
  if (saved.length === 0) {
    list.innerHTML = `<div class="qe-lib-empty">No saved workouts yet.<br>Save workouts from your history or the Community tab.</div>`;
    return;
  }

  list.innerHTML = saved.map(sw => {
    const typeLabel = capitalize(sw.type || "Workout");
    let preview = "";
    if (sw.exercises && sw.exercises.length) {
      preview = sw.exercises.slice(0, 3).map(e => escHtml(e.name)).join(", ");
      if (sw.exercises.length > 3) preview += ` +${sw.exercises.length - 3} more`;
    } else if (sw.segments && sw.segments.length) {
      preview = sw.segments.slice(0, 3).map(s => escHtml(s.name + " " + s.duration)).join(", ");
      if (sw.segments.length > 3) preview += ` +${sw.segments.length - 3} more`;
    }
    return `<div class="qe-lib-card" onclick="_qeLibPreviewWorkout('saved','${sw.id}')">
      <div class="qe-lib-card-top">
        <div>
          <div class="qe-lib-card-name">${escHtml(sw.name || typeLabel)}</div>
          <div class="qe-lib-card-meta">${escHtml(typeLabel)}${sw.notes ? " &middot; " + escHtml(sw.notes.slice(0, 40)) : ""}</div>
        </div>
        <button class="qe-lib-add-btn" onclick="event.stopPropagation(); qeLibAddWorkout('saved','${sw.id}')">Add</button>
      </div>
      ${preview ? `<div class="qe-lib-card-exercises">${preview}</div>` : ""}
    </div>`;
  }).join("");
}

function _renderLibCommunity() {
  const list = document.getElementById("qe-library-list");
  if (!list) return;

  const all = typeof _commGetAll === "function" ? _commGetAll() : (typeof COMMUNITY_WORKOUTS !== "undefined" ? COMMUNITY_WORKOUTS : []);
  if (all.length === 0) {
    list.innerHTML = `<div class="qe-lib-empty">No community workouts available.</div>`;
    return;
  }

  const categories = ["All", ...Array.from(new Set(all.map(w => w.category)))];
  const filtered = _qeLibCommunityFilter === "All" ? all : all.filter(w => w.category === _qeLibCommunityFilter);

  let filterHtml = `<div class="qe-lib-filter-row">${categories.map(c =>
    `<button class="qe-lib-filter-btn${c === _qeLibCommunityFilter ? " active" : ""}" onclick="_qeLibFilterComm('${c}')">${escHtml(c)}</button>`
  ).join("")}</div>`;

  let cardsHtml = filtered.map(w => {
    const diffLabel = w.difficulty || "";
    let preview = "";
    if (w.exercises && w.exercises.length) {
      preview = w.exercises.slice(0, 3).map(e => escHtml(e.name)).join(", ");
      if (w.exercises.length > 3) preview += ` +${w.exercises.length - 3} more`;
    } else if (w.segments && w.segments.length) {
      preview = w.segments.slice(0, 3).map(s => escHtml(s.name + " " + s.duration)).join(", ");
      if (w.segments.length > 3) preview += ` +${w.segments.length - 3} more`;
    }
    return `<div class="qe-lib-card" onclick="_qeLibPreviewWorkout('community','${w.id}')">
      <div class="qe-lib-card-top">
        <div>
          <div class="qe-lib-card-name">${escHtml(w.name)}</div>
          <div class="qe-lib-card-meta">${escHtml(w.author || "")}${diffLabel ? " &middot; " + escHtml(diffLabel) : ""}${w.category ? " &middot; " + escHtml(w.category) : ""}</div>
        </div>
        <button class="qe-lib-add-btn" onclick="event.stopPropagation(); qeLibAddWorkout('community','${w.id}')">Add</button>
      </div>
      ${preview ? `<div class="qe-lib-card-exercises">${preview}</div>` : ""}
    </div>`;
  }).join("");

  if (filtered.length === 0) cardsHtml = `<div class="qe-lib-empty">No workouts in this category.</div>`;

  list.innerHTML = filterHtml + cardsHtml;
}

function _qeLibFilterComm(cat) {
  _qeLibCommunityFilter = cat;
  _renderLibCommunity();
}

function _qeLibPreviewWorkout(source, id) {
  // Toggle expand — for now just add directly
  qeLibAddWorkout(source, id);
}

function qeLibAddWorkout(source, id) {
  const dateStr = document.getElementById("qe-date")?.value || _qeDateStr;
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    alert("Please select a valid date.");
    return;
  }

  let workout = null;

  if (source === "saved") {
    workout = loadSavedWorkouts().find(s => s.id === id);
  } else {
    const all = typeof _commGetAll === "function" ? _commGetAll() : (typeof COMMUNITY_WORKOUTS !== "undefined" ? COMMUNITY_WORKOUTS : []);
    workout = all.find(w => w.id === id);
  }

  if (!workout) return;

  const workouts = loadWorkouts();
  const entry = {
    id:        generateId("workout"),
    date:      dateStr,
    type:      workout.type,
    notes:     workout.name || workout.notes || "",
    exercises: workout.exercises ? JSON.parse(JSON.stringify(workout.exercises)) : [],
    fromSaved: workout.name,
  };
  if (workout.segments)  entry.segments  = JSON.parse(JSON.stringify(workout.segments));
  if (workout.aiSession) entry.aiSession = { ...workout.aiSession, title: workout.name || workout.aiSession.title };
  if (workout.generatedSession) entry.generatedSession = { ...workout.generatedSession, name: workout.name || workout.generatedSession.name };
  if (workout.duration)  entry.duration  = workout.duration;
  if (workout.hiitMeta)  entry.hiitMeta  = JSON.parse(JSON.stringify(workout.hiitMeta));

  workouts.unshift(entry);
  localStorage.setItem("workouts", JSON.stringify(workouts));
  if (typeof DB !== "undefined") DB.syncWorkouts();

  closeQuickEntry();
  renderCalendar();
  if (typeof renderDayDetail === "function" && typeof selectedDate !== "undefined") renderDayDetail(selectedDate);
}

// ── Muscle toggle ─────────────────────────────────────────────────────────────
function qeToggleMuscle(btn) {
  const m = btn.dataset.muscle;
  if (_qeSelectedMuscles.has(m)) {
    _qeSelectedMuscles.delete(m);
    btn.classList.remove("selected");
  } else {
    _qeSelectedMuscles.add(m);
    btn.classList.add("selected");
  }
}

// ── Manual strength entry ─────────────────────────────────────────────────────
function qeGoManual() { qeShowStep(2, "manual"); }

// ── Local muscle-to-movement-pattern mapping for deterministic generation ─────
const _MUSCLE_TO_PATTERNS = {
  chest:      ['horizontal_push'],
  back:       ['horizontal_pull', 'vertical_pull'],
  shoulders:  ['vertical_push'],
  biceps:     ['isolation_arms'],
  triceps:    ['isolation_arms'],
  quads:      ['squat'],
  hamstrings: ['hinge'],
  glutes:     ['hinge', 'squat', 'isolation_legs'],
  core:       ['core'],
  calves:     ['isolation_legs'],
  'full body': ['squat', 'hinge', 'horizontal_push', 'horizontal_pull', 'core'],
};

// Arm muscle filter for isolation_arms pattern
const _MUSCLE_ARM_FILTER = { biceps: 'biceps', triceps: 'triceps' };

/**
 * Estimate working weight for an exercise from reference lifts.
 * Uses strength training zones (bench, squat, deadlift, ohp, row) to scale.
 */
function _estimateWeight(exercise, repRange, profile) {
  let refs = null;
  try {
    const zones = JSON.parse(localStorage.getItem("trainingZones")) || {};
    refs = zones.strength || null;
  } catch {}
  if (!refs) return "Bodyweight";

  // Some "isolation_arms" exercises don't take added load by their nature —
  // bodyweight dips and chair-style dips should stay BW even when the user
  // has reference lifts on file. Curls and skull crushers fall through to
  // the calculator below.
  const exName = String(exercise.name || "").toLowerCase();
  if (/^tricep dip|^bench dip|chair dip|diamond push|^dip$/.test(exName)) {
    return "Bodyweight";
  }

  // Map exercise movement patterns to reference lifts. Previously
  // isolation_arms / isolation_legs / core had no entry, so every curl,
  // extension, calf raise, and core exercise short-circuited to
  // "Bodyweight" regardless of the user's actual lifts. Curls and
  // extensions scale off bench 1RM; isolation legs scale off squat.
  const patternToRef = {
    horizontal_push: 'bench',
    squat: 'squat',
    hinge: 'deadlift',
    vertical_push: 'ohp',
    horizontal_pull: 'row',
    vertical_pull: 'row',
    isolation_arms: 'bench',
    isolation_legs: 'squat',
  };

  const refKey = patternToRef[exercise.movement_pattern];
  if (!refKey || !refs[refKey] || !refs[refKey].weight) return "Bodyweight";

  const refWeight = parseFloat(refs[refKey].weight);
  const refType = refs[refKey].type || '1rm';
  if (!refWeight || isNaN(refWeight)) return "Bodyweight";

  // Convert reference to estimated 1RM
  const refToMultiplier = { '1rm': 1, '5rm': 1.15, '10rm': 1.3 };
  const est1RM = refWeight * (refToMultiplier[refType] || 1);

  // Rep-based percentage of 1RM
  const midReps = Math.round((repRange.min + repRange.max) / 2);
  let pct;
  if (midReps <= 3) pct = 0.9;
  else if (midReps <= 5) pct = 0.85;
  else if (midReps <= 8) pct = 0.75;
  else if (midReps <= 12) pct = 0.65;
  else pct = 0.55;

  // For secondary/accessory exercises (tier 2/3), scale down further
  if (exercise.tier === 2) pct *= 0.85;
  else if (exercise.tier === 3) pct *= 0.7;

  // Isolation work is a small fraction of the compound it's referenced
  // against. Curls (biceps) sit ~25–30% of bench at 10 reps, skull
  // crushers ~30–35%. Calves and glute-isolation work ~30% of squat.
  // Apply an extra scale on top of the tier multiplier.
  if (exercise.movement_pattern === 'isolation_arms') {
    // Extensions (skull crusher, kickback, pushdown) are slightly heavier
    // than curls relative to bench; bump their factor a touch.
    const isExt = /skull|tricep|extension|kickback|pushdown/i.test(exName);
    pct *= isExt ? 0.40 : 0.32;
  } else if (exercise.movement_pattern === 'isolation_legs') {
    pct *= 0.30;
  }

  const weight = Math.round((est1RM * pct) / 5) * 5;
  if (weight <= 0) return "Bodyweight";

  // Dumbbell exercises display per-dumbbell load, not the summed total —
  // a "Dumbbell Bench Press @ 150 lbs" reads as "grab 150 lb dumbbells"
  // and is dangerously misleading. Halve the total and append "ea".
  // Single-side variants (one-arm row, suitcase carry) keep the full
  // load on the working hand, so they skip the halving.
  const isDumbbell = (Array.isArray(exercise.equipment_required)
                      && exercise.equipment_required.includes("dumbbell"))
                  || /\bdumbbell\b|\bdb\b/i.test(exName);
  const isSingleSide = /single.?arm|one.?arm|single.?dumbbell|suitcase/i.test(exName);
  if (isDumbbell && !isSingleSide) {
    const perDb = Math.round((weight / 2) / 5) * 5;
    return perDb > 0 ? perDb + " lbs ea" : "Bodyweight";
  }
  return weight + " lbs";
}

/**
 * Select exercises from the local library for given muscle groups.
 * Returns exercise objects with prescription and weight estimates.
 */
function _localSelectForMuscles(muscleSet, level, duration, equipmentAccess) {
  const lib = exerciseLibrary;
  if (!lib || lib.length === 0) return [];

  let profile = {};
  try { profile = JSON.parse(localStorage.getItem("profile")) || {}; } catch {}
  const classification = {
    level: level || 'intermediate',
    equipmentAccess: equipmentAccess || 'full_gym',
    primaryGoal: profile.goal ? _mapGoalForClassification(profile.goal) : 'general_health',
    sessionDuration: _mapDuration(duration),
  };

  // Determine which movement patterns to target
  const targetPatterns = new Set();
  const muscles = [...muscleSet];
  for (const m of muscles) {
    const patterns = _MUSCLE_TO_PATTERNS[m] || [];
    patterns.forEach(p => targetPatterns.add(p));
  }

  // Get avoided exercises
  let avoided = [];
  try {
    const prefs = JSON.parse(localStorage.getItem("trainingPreferences") || "{}");
    avoided = (prefs.avoidedExercises || []).map(n => n.toLowerCase());
  } catch {}

  const available = filterAvailableExercises(lib, profile, classification);
  const filtered = available.filter(ex => {
    if (avoided.some(a => ex.name.toLowerCase().includes(a))) return false;
    return targetPatterns.has(ex.movement_pattern);
  });

  // Determine how many exercises based on duration
  const durMin = parseInt(duration) || 45;
  let maxEx = durMin <= 30 ? 4 : durMin <= 45 ? 6 : durMin <= 60 ? 7 : 8;

  // Pick exercises using tier-based selection
  const preferredTiers = level === 'beginner' ? [2, 3] : [1, 2];
  const selected = [];
  const usedPatterns = new Set();

  // First pass: one exercise per muscle group (not just per pattern)
  // This ensures biceps AND triceps each get at least one exercise even though both use isolation_arms
  for (const m of muscles) {
    if (selected.length >= maxEx) break;
    const armFilter = _MUSCLE_ARM_FILTER[m] || null;
    const patterns = _MUSCLE_TO_PATTERNS[m] || [];
    for (const pattern of patterns) {
      if (selected.length >= maxEx) break;
      const candidates = filtered.filter(ex => {
        if (ex.movement_pattern !== pattern) return false;
        if (armFilter && ex.muscle_groups && ex.muscle_groups.indexOf(armFilter) === -1) return false;
        return !selected.some(s => s.id === ex.id);
      });
      const pick = selectByTier(candidates, preferredTiers, []);
      if (pick) {
        selected.push(pick);
        usedPatterns.add(pattern);
        break;
      }
    }
  }

  // Second pass: keep filling with more exercises per muscle until maxEx
  let fillRound = 0;
  while (selected.length < maxEx && fillRound < 5) {
    fillRound++;
    let addedAny = false;
    for (const m of muscles) {
      if (selected.length >= maxEx) break;
      const armFilter = _MUSCLE_ARM_FILTER[m] || null;
      const patterns = _MUSCLE_TO_PATTERNS[m] || [];
      for (const pattern of patterns) {
        if (selected.length >= maxEx) break;
        const candidates = filtered.filter(ex => {
          if (ex.movement_pattern !== pattern) return false;
          if (armFilter && ex.muscle_groups && ex.muscle_groups.indexOf(armFilter) === -1) return false;
          return !selected.some(s => s.id === ex.id);
        });
        const pick = selectByTier(candidates, preferredTiers, selected.map(s => s.id));
        if (pick) { selected.push(pick); addedAny = true; break; }
      }
    }
    if (!addedAny) break;
  }

  // Build exercise prescriptions with weight estimates
  const modules = _getActiveModules(classification);
  return selected.map(ex => {
    const prescription = buildExerciseSet(ex, classification, modules);
    const repRange = { min: prescription.rep_min || 8, max: prescription.rep_max || 12 };
    // Estimate weight — only show "Bodyweight" for genuinely bodyweight exercises
    const hasEquip = ex.equipment_required && ex.equipment_required.length > 0;
    const looksWeighted = /bar|dumbbell|cable|machine|ez|kettlebell|smith|curl|press|fly|skull|extension|pushdown|pulldown|row/i.test(ex.name);
    const weight = (hasEquip || looksWeighted)
      ? (_estimateWeight(ex, repRange, profile) || "—")
      : "Bodyweight";
    return {
      name: ex.name,
      sets: prescription.sets || 3,
      reps: prescription.rep_max || 10,
      rest: prescription.rest_seconds ? prescription.rest_seconds + "s" : "60s",
      weight: _roundExWeight(weight) || "Bodyweight",
      _exerciseId: ex.id,
    };
  });
}

function _mapGoalForClassification(goal) {
  const map = { 'Build Muscle': 'muscle_gain', 'Lose Weight': 'fat_loss', 'Get Stronger': 'performance',
    'Improve Endurance': 'performance', 'General Fitness': 'general_health', 'Train for Race': 'performance' };
  return map[goal] || goal || 'general_health';
}

function _mapDuration(dur) {
  const d = parseInt(dur) || 45;
  if (d <= 30) return '15-30';
  if (d <= 45) return '30-45';
  if (d <= 60) return '45-60';
  return '60+';
}

async function qeGenerateHIIT() {
  const format    = document.getElementById("qe-hiit-format")?.value || "circuit";
  const focus     = document.getElementById("qe-hiit-focus")?.value || "full body";
  const intensity = document.getElementById("qe-hiit-intensity")?.value || "moderate";
  const duration  = document.getElementById("qe-hiit-duration")?.value || "20";
  const equipment = document.getElementById("qe-hiit-equipment")?.value || "none";

  qeShowStep(2, "generated");
  const loadingEl = document.getElementById("qe-ai-loading");
  const resultEl  = document.getElementById("qe-ai-result");
  loadingEl.style.display = "";
  resultEl.innerHTML = "";

  try {
    // Ensure exercise library is loaded
    if (!exerciseLibrary || exerciseLibrary.length === 0) {
      await loadExerciseLibrary();
    }

    let profile = {};
    try { profile = JSON.parse(localStorage.getItem("profile")) || {}; } catch {}
    const level = profile.fitnessLevel || "intermediate";

    // Map equipment select values to exercise-selector equipment access
    const equipMap = { none: 'none', dumbbells: 'dumbbells', kettlebell: 'kettlebell', 'full-gym': 'full_gym' };
    const equipAccess = equipMap[equipment] || 'full_gym';

    // Map focus to muscle groups
    const focusToMuscles = {
      'full body': ['chest', 'back', 'quads', 'core'],
      'upper body': ['chest', 'back', 'shoulders'],
      'lower body': ['quads', 'hamstrings', 'glutes'],
      'core': ['core'],
    };
    const muscleSet = new Set(focusToMuscles[focus] || focusToMuscles['full body']);

    // Build classification for exercise selection
    const classification = {
      level: level,
      equipmentAccess: equipAccess,
      primaryGoal: 'fat_loss',
      sessionDuration: _mapDuration(duration),
    };

    // Get avoided exercises
    let avoided = [];
    try {
      const prefs = JSON.parse(localStorage.getItem("trainingPreferences") || "{}");
      avoided = (prefs.avoidedExercises || []).map(n => n.toLowerCase());
    } catch {}

    // Select HIIT-appropriate exercises from library
    const targetPatterns = new Set();
    for (const m of muscleSet) {
      (_MUSCLE_TO_PATTERNS[m] || []).forEach(p => targetPatterns.add(p));
    }

    const available = filterAvailableExercises(exerciseLibrary, profile, classification);
    const filtered = available.filter(ex => {
      if (avoided.some(a => ex.name.toLowerCase().includes(a))) return false;
      return targetPatterns.has(ex.movement_pattern);
    });

    // For HIIT, prefer tier 2-3 (more accessible movements)
    const preferredTiers = [2, 3];
    const durMin = parseInt(duration) || 20;
    const numEx = Math.min(Math.max(4, Math.floor(durMin / 4)), 8);

    const selected = [];
    const patternArr = [...targetPatterns];
    for (let i = 0; i < numEx; i++) {
      const pattern = patternArr[i % patternArr.length];
      const candidates = filtered.filter(ex => {
        if (ex.movement_pattern !== pattern) return false;
        return !selected.some(s => s.id === ex.id);
      });
      const pick = selectByTier(candidates, preferredTiers, selected.map(s => s.id));
      if (pick) selected.push(pick);
    }

    // Build HIIT structure based on format
    const intensityConfig = {
      light:    { workSec: 40, restSec: 30, restBetween: 90, reps: 10 },
      moderate: { workSec: 40, restSec: 20, restBetween: 60, reps: 12 },
      intense:  { workSec: 30, restSec: 15, restBetween: 45, reps: 15 },
      max:      { workSec: 20, restSec: 10, restBetween: 30, reps: 20 },
    };
    const cfg = intensityConfig[intensity] || intensityConfig.moderate;

    let calcRounds, workTime, restTime, restBetweenRounds;
    const actualNumEx = selected.length || 1;

    if (format === "tabata") {
      workTime = "20s"; restTime = "10s";
      calcRounds = Math.max(1, Math.floor(durMin / (actualNumEx * 0.5)));
      restBetweenRounds = "60s";
    } else if (format === "emom") {
      workTime = ""; restTime = "";
      calcRounds = Math.max(1, Math.floor(durMin / actualNumEx));
      restBetweenRounds = "0s";
    } else if (format === "amrap") {
      workTime = ""; restTime = "";
      calcRounds = 1;
      restBetweenRounds = "0s";
    } else {
      // circuit
      workTime = cfg.workSec + "s"; restTime = cfg.restSec + "s";
      const restMin = cfg.restBetween / 60;
      calcRounds = Math.max(1, Math.floor(durMin / (actualNumEx * ((cfg.workSec + cfg.restSec) / 60) + restMin)));
      restBetweenRounds = cfg.restBetween + "s";
    }

    const hiitTitle = `${focus.charAt(0).toUpperCase() + focus.slice(1)} ${format.toUpperCase()} — ${durMin} min`;

    // Build exercise objects
    const exercises = selected.map(ex => ({
      name: ex.name,
      sets: 1,
      reps: format === "tabata" ? "20 sec" : format === "emom" ? String(Math.max(6, cfg.reps - 4)) : String(cfg.reps),
      rest: format === "amrap" ? "0s" : cfg.restSec + "s",
      weight: "Bodyweight",
    }));

    loadingEl.style.display = "none"; _stopLoadingMessages();

    const fmt = format;

    // Build header summary
    const fmtLabels = { circuit: "Circuit", tabata: "Tabata", emom: "EMOM", amrap: "AMRAP" };
    let summaryHtml = `<div class="qe-hiit-summary">
      <strong>${fmtLabels[fmt] || fmt}</strong> &mdash; ${durMin} min`;
    if (fmt === "amrap") {
      summaryHtml += ` (as many rounds as possible)`;
    } else {
      summaryHtml += `, ${calcRounds} round${calcRounds !== 1 ? "s" : ""} of ${actualNumEx} exercises`;
    }
    if (fmt === "tabata") summaryHtml += ` (${workTime} on / ${restTime} off)`;
    else if (fmt !== "amrap" && restBetweenRounds && restBetweenRounds !== "0s") summaryHtml += `, ${restBetweenRounds} rest between rounds`;
    summaryHtml += `</div>`;

    // Store exercises — sets = calcRounds so user sees total sets needed
    _qeGeneratedExercises = exercises.map(ex => ({
      ...ex,
      sets: fmt === "amrap" ? 1 : calcRounds,
      rest: ex.rest || "20s",
      weight: _roundExWeight(ex.weight) || "Bodyweight",
    }));

    // Render full structure: summary + name + exercise list
    resultEl.innerHTML = `<div class="qe-generated-workout">
      ${summaryHtml}
      <div class="form-row" style="margin-bottom:10px">
        <label for="qe-workout-name">Workout Name (optional)</label>
        <input type="text" id="qe-workout-name" value="${hiitTitle.replace(/"/g,"&quot;")}" placeholder="e.g. Full Body HIIT" />
      </div>
      <div class="qe-exercise-header">
        <span></span><span>Sets × Reps</span><span>Weight</span><span></span>
      </div>
      <div id="qe-exercise-list"></div>
    </div>`;

    _qeRenderExerciseList();

    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;gap:10px;margin-top:12px";
    btnRow.innerHTML = `
      <button class="btn-primary"   style="flex:1" onclick="qeSaveGeneratedStrength()">Save Session</button>
      <button class="btn-secondary" style="flex:1" onclick="qeGenerateHIIT()">Regenerate</button>`;
    resultEl.appendChild(btnRow);

  } catch (err) {
    loadingEl.style.display = "none"; _stopLoadingMessages();
    resultEl.innerHTML = `<div class="qe-ai-error">Error: ${err.message}</div>`;
  }
}

async function qeGenerateStrength() {
  if (_qeSelectedMuscles.size === 0) {
    alert("Please select at least one muscle group.");
    return;
  }

  // Strength level dropdown was removed per SPEC_strength_level_v1 §2.
  // Derive from 1RM data (squat/bench/deadlift relative to bodyweight)
  // via SportLevels.getSportLevel("strength"); falls back to "intermediate"
  // when no 1RM data has been entered.
  const level = (typeof SportLevels !== "undefined" && SportLevels.getSportLevel)
    ? SportLevels.getSportLevel("strength")
    : "intermediate";
  const duration = document.getElementById("qe-strength-duration").value;
  const muscles  = [..._qeSelectedMuscles].join(", ");

  qeShowStep(2, "generated");

  const loadingEl = document.getElementById("qe-ai-loading");
  const resultEl  = document.getElementById("qe-ai-result");
  loadingEl.style.display = "";
  resultEl.innerHTML = "";

  try {
    // Ensure exercise library is loaded
    if (!exerciseLibrary || exerciseLibrary.length === 0) {
      await loadExerciseLibrary();
    }

    // Use local exercise selector — no API call
    const exercises = _localSelectForMuscles(_qeSelectedMuscles, level, duration, 'full_gym');
    if (exercises.length === 0) {
      throw new Error("No exercises found for the selected muscle groups.");
    }

    const title = `${muscles} — ${duration} min`;

    _qeGeneratedExercises = exercises.map(ex => ({ ...ex, weight: _roundExWeight(ex.weight) }));
    _qeEditingExerciseIndex = null;
    loadingEl.style.display = "none"; _stopLoadingMessages();

    resultEl.innerHTML = `<div class="qe-generated-workout">
      <div class="qe-generated-title">${ICONS.sparkles} ${title}</div>
      <div class="form-row" style="margin-bottom:10px">
        <label for="qe-workout-name">Workout Name (optional)</label>
        <input type="text" id="qe-workout-name" value="${title.replace(/"/g,"&quot;")}" placeholder="e.g. Push Day A" />
      </div>
      <div class="qe-exercise-header">
        <span></span><span>Sets × Reps</span><span>Weight</span><span></span>
      </div>
      <div id="qe-exercise-list"></div>
    </div>`;

    _qeRenderExerciseList();

    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;gap:10px;margin-top:12px";
    btnRow.innerHTML = `
      <button class="btn-primary"   style="flex:1" onclick="qeSaveGeneratedStrength()">Save Session</button>
      <button class="btn-secondary" style="flex:1" onclick="qeGenerateStrength()">Regenerate All</button>`;
    resultEl.appendChild(btnRow);

  } catch (err) {
    loadingEl.style.display = "none"; _stopLoadingMessages();
    resultEl.innerHTML = `<div class="qe-ai-error">
      ${ICONS.warning} Could not generate workout. ${err.message || "Try again."}<br><br>
      <button class="btn-secondary" onclick="qeGoManual()">Add manually instead</button>
    </div>`;
  }
}

function qeSaveGeneratedStrength() {
  const dateStr = document.getElementById("qe-date").value;
  if (!dateStr) return;
  const muscles  = [..._qeSelectedMuscles].join(", ");
  const nameEl   = document.getElementById("qe-workout-name");
  const label    = (nameEl?.value || "").trim() || "Strength Session";
  // Read any weight edits the user made before saving
  const exercises = _qeGeneratedExercises.map((ex, i) => ({
    ...ex,
    weight: document.getElementById(`qe-weight-${i}`)?.value || ex.weight || "",
  }));
  // Carry the requested session duration from step 1 into the saved
  // entry so the session card shows the target time ("45 min") the
  // user asked for. Previously this was dropped at save time.
  const durEl = document.getElementById("qe-strength-duration");
  const duration = durEl && durEl.value ? parseInt(durEl.value, 10) || null : null;
  _qeSaveStrengthWorkout(dateStr, label, muscles, exercises, null, duration);
}

// ── Per-exercise editing helpers ──────────────────────────────────────────────

let _qeEditingExerciseIndex = null;

function _roundExWeight(w) {
  const s = String(w || "").trim();
  if (!s || /bodyweight|bw/i.test(s)) return s;
  const m = s.match(/^([\d.]+)\s*(.*)/);
  if (!m) return s;
  const rounded = Math.round(parseFloat(m[1]) / 5) * 5;
  return rounded + (m[2] ? " " + m[2] : "");
}
let _qeDragIndex    = null;
let _qeDragSuperset = false;

function _qeRenderExerciseList() {
  const listEl = document.getElementById("qe-exercise-list");
  if (!listEl) return;

  // Group exercises into superset groups and singles
  const rendered = [];
  let i = 0;
  while (i < _qeGeneratedExercises.length) {
    const ex = _qeGeneratedExercises[i];
    if (ex.supersetId) {
      // Collect all consecutive exercises in this superset group
      const groupId = ex.supersetId;
      const groupIndices = [];
      let j = i;
      while (j < _qeGeneratedExercises.length && _qeGeneratedExercises[j].supersetId === groupId) {
        groupIndices.push(j);
        j++;
      }
      const sharedSets = _qeGeneratedExercises[groupIndices[0]].sets || 3;
      const groupItems = groupIndices.map(idx => _renderExerciseRow(idx, true)).join("");
      rendered.push(`
        <div class="qe-superset-group" data-group="${groupId}">
          <div class="qe-superset-label">Superset <span class="qe-ss-sets-wrap"><input type="number" class="qe-ss-sets-input" min="1" max="20" value="${sharedSets}" onchange="qeUpdateSupersetSets('${groupId}', this.value)" /> sets</span><button class="qe-unsuperset-btn" onclick="qeUnsuperset('${groupId}')">Remove</button></div>
          ${groupItems}
        </div>`);
      i = j;
    } else {
      rendered.push(_renderExerciseRow(i, false));
      i++;
    }
  }
  listEl.innerHTML = rendered.join("");
  // Attach touch drag to generated exercise items for mobile
  _qeAttachTouchDrag(listEl);
}

function _qeAttachTouchDrag(listEl) {
  const items = listEl.querySelectorAll(".qe-exercise-item[draggable]");
  items.forEach(el => {
    // Extract the exercise index from the ondragstart attribute
    const match = el.getAttribute("ondragstart")?.match(/qeDragStart\(event,(\d+)\)/);
    if (!match) return;
    TouchDrag.attach(el, listEl, {
      hintClasses: ["drag-insert-above", "drag-insert-below", "drag-ss-target"],
      rowSelector: ".qe-exercise-item[draggable]",
      handleSelector: ".drag-handle",
      onDrop(dragEl, targetEl, clientY) {
        const dragMatch = dragEl.getAttribute("ondragstart")?.match(/qeDragStart\(event,(\d+)\)/);
        const dropMatch = targetEl.getAttribute("ondragstart")?.match(/qeDragStart\(event,(\d+)\)/) ||
                          targetEl.getAttribute("ondrop")?.match(/qeDrop\(event,(\d+)\)/);
        if (!dragMatch || !dropMatch) return;
        const dragIdx = parseInt(dragMatch[1]);
        const targetIdx = parseInt(dropMatch[1]);
        // Simulate drop event
        _qeDragIndex = dragIdx;
        const rect = targetEl.getBoundingClientRect();
        const fakeEvent = {
          preventDefault() {},
          currentTarget: targetEl,
          clientY: clientY,
        };
        qeDrop(fakeEvent, targetIdx);
      }
    });
  });
}

function _renderExerciseRow(i, inSuperset) {
  const ex = _qeGeneratedExercises[i];
  if (i === _qeEditingExerciseIndex) {
    return `<div class="qe-exercise-item qe-edit-row" draggable="true" ondragstart="qeDragStart(event,${i})">
      <span class="drag-handle" title="Drag to reorder">⠿</span>
      <input class="qe-edit-name" id="qe-edit-name-${i}" value="${escHtml(ex.name)}" placeholder="Exercise name" />
      <div class="qe-edit-detail">
        ${inSuperset ? "" : `<input class="qe-edit-sets" id="qe-edit-sets-${i}" type="number" min="1" max="20" value="${escHtml(ex.sets)}" /><span>×</span>`}
        <input class="qe-edit-reps" id="qe-edit-reps-${i}" value="${escHtml(ex.reps)}" placeholder="reps" />
      </div>
      <input class="qe-weight-input" id="qe-weight-${i}" type="text" value="${escHtml(_roundExWeight(ex.weight) || '')}" placeholder="lbs / BW" />
      <div class="qe-exercise-actions">
        <button class="qe-edit-confirm" onclick="qeCommitEditExercise(${i})">Done</button>
      </div>
    </div>`;
  }
  return `<div class="qe-exercise-item" draggable="true"
    ondragstart="qeDragStart(event,${i})"
    ondragover="qeDragOver(event,${i})"
    ondragleave="qeDragLeave(event)"
    ondrop="qeDrop(event,${i})">
    <span class="drag-handle" title="Drag to reorder">⠿</span>
    <div class="qe-exercise-name">${escHtml(ex.name)}<div class="qe-exercise-sub">${escHtml(ex.rest)} rest</div></div>
    <div class="qe-exercise-detail">${inSuperset ? "" : escHtml(ex.sets) + "×"}${escHtml(ex.reps)}</div>
    <input class="qe-weight-input" id="qe-weight-${i}" type="text" value="${escHtml(_roundExWeight(ex.weight) || '')}" placeholder="lbs / BW" />
    <div class="qe-exercise-actions">
      <button class="qe-ex-btn regen" title="Regenerate" onclick="qeRegenExercise(${i})">${ICONS.refreshCw}</button>
      <button class="qe-ex-btn" title="Edit" onclick="qeEditExercise(${i})">${ICONS.pencil}</button>
      <button class="qe-ex-btn remove" title="Remove" onclick="qeRemoveExercise(${i})">${ICONS.trash}</button>
    </div>
  </div>`;
}

function qeDragStart(e, i) {
  _qeDragIndex = i;
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", String(i));
  e.currentTarget.classList.add("drag-active");
}

function qeDragOver(e, i) {
  if (_qeDragIndex === null || _qeDragIndex === i) return;
  e.preventDefault();
  const el   = e.currentTarget;
  const rect = el.getBoundingClientRect();
  const pct  = (e.clientY - rect.top) / rect.height;
  el.classList.remove("drag-insert-above", "drag-insert-below", "drag-ss-target");
  if (pct > 0.3 && pct < 0.7) {
    el.classList.add("drag-ss-target");
  } else {
    el.classList.add(pct <= 0.3 ? "drag-insert-above" : "drag-insert-below");
  }
}

function qeDragLeave(e) {
  e.currentTarget.classList.remove("drag-insert-above", "drag-insert-below", "drag-ss-target");
}

function qeDrop(e, targetIdx) {
  e.preventDefault();
  document.querySelectorAll(".qe-exercise-item").forEach(el => el.classList.remove("drag-insert-above", "drag-insert-below", "drag-ss-target", "drag-active"));
  if (_qeDragIndex === null || _qeDragIndex === targetIdx) { _qeDragIndex = null; return; }

  const rect = e.currentTarget.getBoundingClientRect();
  const pct  = (e.clientY - rect.top) / rect.height;
  const isSuperset = pct > 0.3 && pct < 0.7;
  const insertAbove = pct <= 0.3;

  // Save current weights before restructuring
  _qeGeneratedExercises.forEach((ex, j) => {
    const w = document.getElementById(`qe-weight-${j}`);
    if (w) ex.weight = w.value;
  });

  const dragged = _qeGeneratedExercises[_qeDragIndex];
  const target  = _qeGeneratedExercises[targetIdx];

  if (isSuperset) {
    // Superset: group the two exercises
    if (dragged.supersetId && dragged.supersetId !== target.supersetId) delete dragged.supersetId;
    if (target.supersetId) {
      dragged.supersetId = target.supersetId;
      const groupSets = _qeGeneratedExercises.find(e => e.supersetId === target.supersetId && e !== dragged)?.sets || target.sets;
      dragged.sets = groupSets;
    } else {
      const gid = `ss-${Date.now()}`;
      dragged.supersetId = gid;
      target.supersetId  = gid;
      dragged.sets = target.sets;
    }
  }

  // Reorder: move dragged relative to target
  const arr = [..._qeGeneratedExercises];
  arr.splice(_qeDragIndex, 1);
  const newTargetIdx = arr.indexOf(target);
  arr.splice(insertAbove ? newTargetIdx : newTargetIdx + 1, 0, dragged);
  _qeGeneratedExercises = arr;

  _qeDragIndex = null;
  _qeDragSuperset = false;
  _qeEditingExerciseIndex = null;
  _qeRenderExerciseList();
}

function qeUpdateSupersetSets(groupId, value) {
  const sets = parseInt(value) || 1;
  _qeGeneratedExercises.forEach(ex => {
    if (ex.supersetId === groupId) ex.sets = sets;
  });
}

function qeUnsuperset(groupId) {
  _qeGeneratedExercises.forEach(ex => {
    if (ex.supersetId === groupId) delete ex.supersetId;
  });
  _qeRenderExerciseList();
}

function qeEditExercise(i) {
  // Save any weight edits in the current list before switching mode
  _qeGeneratedExercises.forEach((ex, j) => {
    const w = document.getElementById(`qe-weight-${j}`);
    if (w) ex.weight = w.value;
  });
  _qeEditingExerciseIndex = i;
  _qeRenderExerciseList();
}

function qeCommitEditExercise(i) {
  const name = document.getElementById(`qe-edit-name-${i}`)?.value.trim();
  const sets = document.getElementById(`qe-edit-sets-${i}`)?.value;
  const reps = document.getElementById(`qe-edit-reps-${i}`)?.value.trim();
  const weight = document.getElementById(`qe-weight-${i}`)?.value;
  if (name) _qeGeneratedExercises[i] = { ..._qeGeneratedExercises[i], name, sets: parseInt(sets) || _qeGeneratedExercises[i].sets, reps, weight };
  _qeEditingExerciseIndex = null;
  _qeRenderExerciseList();
}

function qeRemoveExercise(i) {
  // Persist any weight edits before removing
  _qeGeneratedExercises.forEach((ex, j) => {
    const w = document.getElementById(`qe-weight-${j}`);
    if (w) ex.weight = w.value;
  });
  _qeGeneratedExercises.splice(i, 1);
  if (_qeEditingExerciseIndex === i) _qeEditingExerciseIndex = null;
  else if (_qeEditingExerciseIndex > i) _qeEditingExerciseIndex--;
  _qeRenderExerciseList();
}

async function qeRegenExercise(i) {
  // Persist weight edits
  _qeGeneratedExercises.forEach((ex, j) => {
    const w = document.getElementById(`qe-weight-${j}`);
    if (w) ex.weight = w.value;
  });

  const muscles  = [..._qeSelectedMuscles].join(", ");
  const current  = _qeGeneratedExercises[i].name;
  const others   = _qeGeneratedExercises.filter((_, j) => j !== i).map(e => e.name).join(", ");

  // Show a spinner in the row while loading
  const listEl = document.getElementById("qe-exercise-list");
  const rows = listEl?.querySelectorAll(".qe-exercise-item");
  if (rows?.[i]) {
    rows[i].style.opacity = "0.4";
    rows[i].style.pointerEvents = "none";
  }

  try {
    const data = await callAI({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{
        role: "user",
        content: `Replace "${current}" with ONE different exercise targeting ${muscles}. Already in the workout: ${others || "none"}. Reps must be a single integer, never a range. Return ONLY valid JSON, no markdown:\n{"name":"Exercise Name","sets":3,"reps":10,"rest":"60s","weight":"135 lbs"}`
      }]
    });
    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    const ex = JSON.parse(text.replace(/```json|```/g, "").trim());
    _qeGeneratedExercises[i] = { ...ex, weight: _roundExWeight(ex.weight) };
  } catch (_) {
    // Silently fail — restore the row
  }

  _qeRenderExerciseList();
}

// ── AI Cardio Generation ──────────────────────────────────────────────────────

function qeGoCardioManual() {
  if (_qeSelectedType === "swim" && typeof SwimBuilderModal !== "undefined") {
    const dateStr = document.getElementById("qe-date")?.value || null;
    try { closeQuickEntry(); } catch {}
    SwimBuilderModal.open(dateStr);
    return;
  }
  qeShowStep(2, "cardio-manual");
}

// ── Structured swim main set generator ──────────────────────────────────────
//
// Builds a swim main set with concrete sets × distance @ pace and rest
// periods instead of a time-block "swim Z3 for 13 min" instruction. Used
// by qeGenerateCardio's swim branch.
//
// Arguments:
//   mainMin   — total minutes available for the main set (after warmup/cooldown)
//   intensity — "light" | "moderate" | "intense" | "max"
//   cssSec    — user's Critical Swim Speed in seconds per 100m (nullable)
//   iz        — the intensity zone map ({ warmup, main, hard, cooldown })
//
// Returns an array of interval objects ready to push into the cardio
// intervals list. Each interval carries a human-readable `details`
// string with the structured set AND the reps/restDuration fields so
// the intensity strip can render rest gaps between reps.

function _swimFmtPace(secPer100m) {
  if (secPer100m == null || isNaN(secPer100m)) return null;
  const t = Math.round(secPer100m);
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${s.toString().padStart(2, "0")}/100m`;
}

function _swimWarmupText(warmupMin, cssSec) {
  const easyPace = cssSec ? _swimFmtPace(cssSec + 15) : null;
  const yd400 = "400m (or 400 yd) easy + 4 × 50m build w/ 20s rest";
  return easyPace ? `${yd400}. Easy pace ~${easyPace}.` : yd400 + ". Conversational pace.";
}

function _swimCooldownText(cooldownMin, cssSec) {
  return "200-300m easy, mix freestyle and backstroke, focus on breathing recovery.";
}

// Estimate per-rep seconds for a given distance at a given pace offset
// from CSS. Used to pass a sensible `duration` on rep-based intervals.
function _swimRepSeconds(distMeters, cssSec, paceOffsetSec) {
  if (!cssSec) return Math.round(distMeters * 1.4); // ~1.4 sec/m default (~2:20/100m)
  return Math.round((distMeters / 100) * (cssSec + (paceOffsetSec || 0)));
}

function _swimSetDetails(reps, distM, cssSec, paceOffsetSec, restStr, label) {
  const paceStr = cssSec
    ? _swimFmtPace(cssSec + (paceOffsetSec || 0))
    : (label || "by feel");
  const paceLabel = cssSec ? `@ ${paceStr}` : `at ${label || "steady effort"}`;
  return `${reps} × ${distM}m ${paceLabel} w/ ${restStr} rest`;
}

// Map a swim pace_target free-text label to a training zone so the
// intensity strip and duration estimator can paint distinct zones
// across a workout. The canonical swim step tree carries pace_target
// strings like "easy", "build to fast", "@ CSS", "race pace", etc;
// without this mapping every step rendered as Z2 regardless.
function _swimPaceTargetToZone(paceTarget, name) {
  const t = String(paceTarget || "").toLowerCase();
  const n = String(name || "").toLowerCase();
  const combined = t + " " + n;
  if (/cool ?down|very easy|long and loose/.test(combined)) return "Z1";
  if (/sprint|all.?out|max|race ?pace|css.?-|build to fast/.test(combined)) return "Z5";
  if (/threshold|@ ?css\b/.test(combined)) return "Z4";
  if (/tempo|css.?\+ ?[1-5]\b/.test(combined)) return "Z3";
  if (/easy|warm ?up|aerobic|recovery|drill|technique|kick|side ?kick/.test(combined)) return "Z2";
  return "Z2";
}

// Convert a canonical swim step tree to the flat intervals shape the
// day-card renderer + duration estimator already consume. Repeat blocks
// emit one record per child with a `reps` count (matching the existing
// expansion loop). Distances stay in meters so _distToMin can apply
// swim pace; rests stay in seconds.
function _swimStepsToIntervals(steps) {
  const out = [];
  function walk(arr, reps) {
    if (!Array.isArray(arr)) return;
    for (const s of arr) {
      if (!s || typeof s !== "object") continue;
      if (s.kind === "interval") {
        out.push({
          name: s.name || "Swim",
          duration: `${Math.round(s.distance_m || 0)}m`,
          effort: _swimPaceTargetToZone(s.pace_target, s.name),
          details: s.pace_target ? `@ ${s.pace_target}` : "",
          reps: reps > 1 ? reps : undefined,
        });
      } else if (s.kind === "rest") {
        out.push({
          name: "Rest",
          duration: `${Math.round(s.duration_sec || 0)}s`,
          effort: "RW",
          details: "",
          reps: reps > 1 ? reps : undefined,
        });
      } else if (s.kind === "repeat") {
        walk(s.children || [], (reps || 1) * (s.count || 1));
      }
    }
  }
  walk(steps, 1);
  return out;
}

function _generateStructuredSwimMain(mainMin, intensity, cssSec, iz) {
  // Randomly pick a variant per intensity. On Regenerate, this runs
  // again and Math.random yields a different pick → user sees a
  // different swim workout.
  const _pick = arr => arr[Math.floor(Math.random() * arr.length)];

  if (intensity === "light") {
    // Aerobic continuous or long reps — warmup/cooldown already handle easy.
    const variants = [
      () => ({
        name: "Main Set",
        effort: "Z2",
        details: cssSec
          ? `Continuous ${Math.round(mainMin * 60 / (cssSec + 10) * 100) * 10 || 1500}m at ${_swimFmtPace(cssSec + 10)}, steady breathing. Stop if form breaks down.`
          : `Continuous swim at easy aerobic pace for the full time. Focus on form.`,
        duration: mainMin + " min",
      }),
      () => {
        const reps = 4;
        const dist = 300;
        const rest = "20s";
        return {
          name: "Main Set",
          effort: "Z2",
          details: _swimSetDetails(reps, dist, cssSec, 12, rest, "easy aerobic"),
          duration: `${Math.round(_swimRepSeconds(dist, cssSec, 12) / 60)} min`,
          reps,
          restDuration: rest,
          restEffort: "Z1",
        };
      },
      () => {
        const reps = 6;
        const dist = 200;
        const rest = "15s";
        return {
          name: "Main Set",
          effort: "Z2",
          details: _swimSetDetails(reps, dist, cssSec, 10, rest, "easy aerobic"),
          duration: `${Math.round(_swimRepSeconds(dist, cssSec, 10) / 60)} min`,
          reps,
          restDuration: rest,
          restEffort: "Z1",
        };
      },
    ];
    return [_pick(variants)()];
  }

  if (intensity === "moderate") {
    // Main aerobic set + optional tempo accent. Mix of variants.
    const variants = [
      () => [{
        name: "Main Set",
        effort: "Z2",
        details: _swimSetDetails(8, 200, cssSec, 5, "15s", "cruise pace"),
        duration: `${Math.round(_swimRepSeconds(200, cssSec, 5) / 60)} min`,
        reps: 8,
        restDuration: "15s",
        restEffort: "Z1",
      }],
      () => [{
        name: "Main Set",
        effort: "Z3",
        details: _swimSetDetails(4, 300, cssSec, 5, "20s", "cruise / CSS+5s"),
        duration: `${Math.round(_swimRepSeconds(300, cssSec, 5) / 60)} min`,
        reps: 4,
        restDuration: "20s",
        restEffort: "Z1",
      }],
      () => [
        {
          name: "Main Set",
          effort: "Z2",
          details: _swimSetDetails(3, 200, cssSec, 8, "15s", "aerobic"),
          duration: `${Math.round(_swimRepSeconds(200, cssSec, 8) / 60)} min`,
          reps: 3,
          restDuration: "15s",
          restEffort: "Z1",
        },
        {
          name: "Tempo Set",
          effort: "Z3",
          details: _swimSetDetails(4, 150, cssSec, 3, "20s", "tempo / CSS+3s"),
          duration: `${Math.round(_swimRepSeconds(150, cssSec, 3) / 60)} min`,
          reps: 4,
          restDuration: "20s",
          restEffort: "Z1",
        },
      ],
      () => [{
        name: "Descending Set",
        effort: "Z3",
        details: cssSec
          ? `6 × 150m descending: first 2 @ ${_swimFmtPace(cssSec + 8)}, middle 2 @ ${_swimFmtPace(cssSec + 3)}, last 2 @ ${_swimFmtPace(cssSec)}. 20s rest.`
          : `6 × 150m descending — first 2 easy, middle 2 cruise, last 2 threshold. 20s rest.`,
        duration: `${Math.round(_swimRepSeconds(150, cssSec, 5) / 60)} min`,
        reps: 6,
        restDuration: "20s",
        restEffort: "Z1",
      }],
    ];
    return _pick(variants)();
  }

  if (intensity === "intense") {
    // CSS intervals at threshold pace.
    const variants = [
      () => [{
        name: "CSS Intervals",
        effort: "Z4",
        details: _swimSetDetails(8, 100, cssSec, 0, "15s", "CSS pace"),
        duration: `${Math.round(_swimRepSeconds(100, cssSec, 0) / 60 * 10) / 10} min`,
        reps: 8,
        restDuration: "15s",
        restEffort: "Z1",
      }],
      () => [{
        name: "CSS Intervals",
        effort: "Z4",
        details: _swimSetDetails(6, 200, cssSec, 0, "20s", "CSS pace"),
        duration: `${Math.round(_swimRepSeconds(200, cssSec, 0) / 60 * 10) / 10} min`,
        reps: 6,
        restDuration: "20s",
        restEffort: "Z1",
      }],
      () => [{
        name: "Descending Intervals",
        effort: "Z4",
        details: cssSec
          ? `10 × 100m descending: first 5 @ ${_swimFmtPace(cssSec + 5)} (CSS+5s), last 5 @ ${_swimFmtPace(cssSec)} (CSS). 15s rest.`
          : `10 × 100m descending — first 5 at cruise, last 5 at threshold. 15s rest.`,
        duration: `${Math.round(_swimRepSeconds(100, cssSec, 2) / 60 * 10) / 10} min`,
        reps: 10,
        restDuration: "15s",
        restEffort: "Z1",
      }],
      () => [{
        name: "CSS Ladder",
        effort: "Z4",
        details: cssSec
          ? `Ladder 50/100/150/200/150/100/50m all @ ${_swimFmtPace(cssSec)} (CSS) w/ 15s rest.`
          : `Ladder 50/100/150/200/150/100/50m all at threshold effort w/ 15s rest.`,
        duration: `${Math.round(_swimRepSeconds(800, cssSec, 0) / 60 * 10) / 10} min`,
        // Ladder has varying distances per rep — treat as 7 reps of ~114m avg
        reps: 7,
        restDuration: "15s",
        restEffort: "Z1",
      }],
      () => [{
        name: "Broken 400s",
        effort: "Z4",
        details: cssSec
          ? `4 × 400m @ ${_swimFmtPace(cssSec)} (CSS), broken every 100m w/ 10s mini-rest inside each 400. 30s rest between 400s.`
          : `4 × 400m at threshold effort, broken every 100m w/ 10s rest inside each 400. 30s rest between 400s.`,
        duration: `${Math.round(_swimRepSeconds(400, cssSec, 2) / 60 * 10) / 10} min`,
        reps: 4,
        restDuration: "30s",
        restEffort: "Z1",
      }],
    ];
    return _pick(variants)();
  }

  // intensity === "max"
  const variants = [
    () => [{
      name: "Sprint Set",
      effort: "Z5",
      details: _swimSetDetails(10, 50, cssSec, -5, "30s", "CSS-5s / sprint"),
      duration: `${Math.round(_swimRepSeconds(50, cssSec, -5) / 60 * 10) / 10} min`,
      reps: 10,
      restDuration: "30s",
      restEffort: "Z1",
    }],
    () => [{
      name: "All-Out Sprints",
      effort: "Z5",
      details: `16 × 25m all-out sprint, max effort. 20s rest.`,
      duration: `${Math.round(_swimRepSeconds(25, cssSec, -8) / 60 * 10) / 10} min`,
      reps: 16,
      restDuration: "20s",
      restEffort: "Z1",
    }],
    () => [{
      name: "Descending Sprints",
      effort: "Z5",
      details: cssSec
        ? `8 × 75m descending pace: first 2 @ ${_swimFmtPace(cssSec)} (CSS), next 3 @ ${_swimFmtPace(cssSec - 3)}, last 3 @ ${_swimFmtPace(cssSec - 6)} all-out. 20s rest.`
        : `8 × 75m descending pace — first 2 at threshold, middle 3 hard, last 3 all-out. 20s rest.`,
      duration: `${Math.round(_swimRepSeconds(75, cssSec, -3) / 60 * 10) / 10} min`,
      reps: 8,
      restDuration: "20s",
      restEffort: "Z1",
    }],
    () => [
      {
        name: "Threshold Opener",
        effort: "Z4",
        details: _swimSetDetails(4, 100, cssSec, 0, "15s", "CSS pace"),
        duration: `${Math.round(_swimRepSeconds(100, cssSec, 0) / 60 * 10) / 10} min`,
        reps: 4,
        restDuration: "15s",
        restEffort: "Z1",
      },
      {
        name: "Sprint Set",
        effort: "Z5",
        details: _swimSetDetails(8, 50, cssSec, -5, "30s", "sprint"),
        duration: `${Math.round(_swimRepSeconds(50, cssSec, -5) / 60 * 10) / 10} min`,
        reps: 8,
        restDuration: "30s",
        restEffort: "Z1",
      },
    ],
  ];
  return _pick(variants)();
}

// ── Shared cardio workout builder ───────────────────────────────────────
//
// Pure compute — reads profile/zones from localStorage, builds the
// intervals array (plus canonical swim step tree for swim), returns the
// workout object. Called from BOTH Add Session (qeGenerateCardio) and
// Build a Plan → Create Your Own (custom-plan.js) so both flows ask the
// same questions and produce the same output.
//
// opts: { type, intensity, duration, bikeDur, runDur }
//   type:      "running" | "cycling" | "swim" | "walking" | "rowing" | "brick"
//   intensity: "easy" | "moderate" | "hard" | "long" (Add Session UI labels)
//              OR "light" | "moderate" | "intense" | "max" (legacy keys)
//   duration:  total minutes as number or numeric string
//   bikeDur:   brick bike duration in minutes (brick only)
//   runDur:    brick run duration in minutes (brick only)
function _qeBuildCardioWorkout(opts) {
  const type      = opts.type;
  // Map Add Session's intensity labels to the internal intensity keys
  // used by the variant selectors. Legacy keys pass through unchanged.
  const _intensityAlias = { easy: "light", hard: "intense", long: "moderate" };
  const intensity = _intensityAlias[opts.intensity] || opts.intensity || "moderate";
  const isBrick   = type === "brick";
  const bikeDur   = isBrick ? (opts.bikeDur || 45) : null;
  const runDur    = isBrick ? (opts.runDur  || 20) : null;
  const duration  = isBrick ? (parseInt(bikeDur) + parseInt(runDur)) : (parseInt(opts.duration) || 45);

  let profile = {};
  try { profile = JSON.parse(localStorage.getItem("profile")) || {}; } catch {}

  let zones = {};
  try { zones = JSON.parse(localStorage.getItem("trainingZones")) || {}; } catch {}

  const durMin = parseInt(duration) || 45;
  const sportName = { running: "Run", cycling: "Ride", swim: "Swim", hiit: "HIIT", brick: "Brick" };

  // Derive the level for THIS sport from threshold data instead of the
  // old self-reported profile.fitnessLevel (removed per SPEC §3.3). Falls
  // back to "intermediate" when thresholds aren't set.
  const sportKey = type === "swim" ? "swimming" : type === "cycling" ? "cycling" : "running";
  const level = (typeof SportLevels !== "undefined" && SportLevels.getSportLevel)
    ? SportLevels.getSportLevel(sportKey)
    : (profile.fitnessLevel || "intermediate");

  // Build zone-based details from user's training zones
  function runDetail(zone) {
    const r = zones.running || {};
    if (zone === "Z2" && r.easy) return `Easy pace: ${r.easy}`;
    if (zone === "Z2" && r.easyPaceMin) return `Easy pace: ${r.easyPaceMin}:${(r.easyPaceSec||"00").toString().padStart(2,"0")}/mile`;
    if (zone === "Z3" && r.tempo) return `Tempo pace: ${r.tempo}`;
    if (zone === "Z3" && r.thresholdPaceMin) return `Threshold: ${r.thresholdPaceMin}:${(r.thresholdPaceSec||"00").toString().padStart(2,"0")}/mile`;
    if (zone === "Z4" && r.thresholdPaceMin) return `Threshold pace: ${r.thresholdPaceMin}:${(r.thresholdPaceSec||"00").toString().padStart(2,"0")}/mile`;
    if (zone === "Z5" && r.vo2max) return `VO2max effort: ${r.vo2max}`;
    const descs = { Z1: "Very easy effort, conversational", Z2: "Aerobic base, comfortable pace",
      Z3: "Tempo effort, comfortably hard", Z4: "Threshold effort, sustainable hard",
      Z5: "VO2max, hard effort", Z6: "Max sprint" };
    return descs[zone] || "Steady effort";
  }
  function bikeDetail(zone) {
    const c = zones.cycling || {};
    const ftp = c.ftp ? parseInt(c.ftp) : null;
    const pctMap = { Z1: 0.5, Z2: 0.7, Z3: 0.85, Z4: 0.95, Z5: 1.1, Z6: 1.3 };
    if (ftp && pctMap[zone]) return `~${Math.round(ftp * pctMap[zone])}W (${Math.round(pctMap[zone]*100)}% FTP)`;
    const descs = { Z1: "Easy spin, recovery", Z2: "Endurance pace",
      Z3: "Sweet spot / tempo", Z4: "Threshold effort", Z5: "VO2max intervals", Z6: "Sprint" };
    return descs[zone] || "Steady effort";
  }
  function swimDetail(zone) {
    const s = zones.swimming || {};
    if (s.css) {
      const descs = { Z1: `Easy, CSS + 15-20s`, Z2: `Aerobic, CSS + 8-12s`,
        Z3: `Tempo, CSS + 3-5s`, Z4: `Threshold, near CSS (${s.css}/100m)`, Z5: `VO2max, CSS - 3-5s` };
      return descs[zone] || `Steady effort`;
    }
    const descs = { Z1: "Very easy, long rest", Z2: "Steady swimming, moderate effort",
      Z3: "Tempo effort", Z4: "Threshold pace", Z5: "Hard interval effort" };
    return descs[zone] || "Steady effort";
  }

  // Intensity maps to zone distribution
  const intZones = {
    light:    { warmup: "Z1", main: "Z2", hard: "Z3", cooldown: "Z1" },
    moderate: { warmup: "Z1", main: "Z2", hard: "Z3", cooldown: "Z1" },
    intense:  { warmup: "Z2", main: "Z3", hard: "Z4", cooldown: "Z1" },
    max:      { warmup: "Z2", main: "Z3", hard: "Z5", cooldown: "Z1" },
  };
  const iz = intZones[intensity] || intZones.moderate;

  let intervals = [];
  const detailFn = type === "cycling" ? bikeDetail : type === "swim" ? swimDetail : runDetail;
  const warmupMin = level === "beginner" ? Math.max(5, Math.round(durMin * 0.2)) : Math.round(durMin * 0.15);
  const cooldownMin = Math.max(3, Math.round(durMin * 0.1));

  if (type === "brick") {
    const bMin = parseInt(bikeDur) || 45;
    const rMin = parseInt(runDur) || 20;
    const bWarmup = Math.round(bMin * 0.2);
    const bMain = bMin - bWarmup;
    const rMain = rMin - 2;
    intervals = [
      { name: "Bike Warm-Up", duration: bWarmup + " min", effort: "Z1", details: bikeDetail("Z1"), sport: "bike" },
      { name: "Bike Main Set", duration: bMain + " min", effort: iz.main, details: bikeDetail(iz.main), sport: "bike" },
      { name: "Transition", duration: "2 min", effort: "T1", details: "Quick change, settle into run form", sport: "run" },
      { name: "Run Main Set", duration: rMain + " min", effort: iz.main, details: runDetail(iz.main), sport: "run" },
    ];
    if (intensity === "intense" || intensity === "max") {
      const hardDur = Math.round(bMain * 0.3);
      intervals.splice(2, 0, { name: "Bike Hard Effort", duration: hardDur + " min", effort: iz.hard, details: bikeDetail(iz.hard), sport: "bike" });
      intervals[1].duration = (bMain - hardDur) + " min";
    }
  } else if (type === "swim") {
    const mainMin = durMin - warmupMin - cooldownMin;
    const swimCss = (zones.swimming && zones.swimming.css) || null;
    intervals = [
      { name: "Warm-Up", duration: warmupMin + " min", effort: iz.warmup, details: _swimWarmupText(warmupMin, swimCss) },
      ..._generateStructuredSwimMain(mainMin, intensity, swimCss, iz),
      { name: "Cool-Down", duration: cooldownMin + " min", effort: iz.cooldown, details: _swimCooldownText(cooldownMin, swimCss) },
    ];
  } else if (type === "walking") {
    // Walking is always active-recovery zone — conversational, restorative.
    // Explicit effort "walk" is picked up by the renderer and skips the
    // running pace-zone overlay that would otherwise mis-label a walk as
    // "Z2 7:01/mi".
    intervals = [{
      name: "Walk",
      duration: durMin + " min",
      effort: "Z1",
      details: "Brisk walk, comfortable and conversational — this is active recovery, not a run.",
    }];
  } else if (type === "rowing") {
    // Rowing sessions are measured in seconds-per-500m, not minutes-per-mile.
    // We don't currently store rowing zones in trainingZones, so we output
    // descriptive effort tiers keyed to RPE without a numeric pace overlay.
    // _getIntervalZones returns null for rowing so the renderer won't try
    // to paint a /mi label onto the tag.
    const mainMin = durMin - warmupMin - cooldownMin;
    const rowEffortText = {
      Z1: "Very easy /500m — easy breathing, long smooth strokes.",
      Z2: "Steady /500m — all-day pace, conversational.",
      Z3: "Tempo /500m — comfortably hard, controlled breath.",
      Z4: "Threshold /500m — hard but sustainable for ~20 minutes.",
      Z5: "Max /500m — near all-out, only sustainable for short reps.",
    };
    intervals = [
      { name: "Warm-Up",   duration: warmupMin  + " min", effort: "Z1",     details: rowEffortText.Z1 },
      { name: "Main Set",  duration: mainMin    + " min", effort: iz.main,  details: rowEffortText[iz.main] || "Steady /500m" },
      { name: "Cool-Down", duration: cooldownMin + " min", effort: "Z1",    details: rowEffortText.Z1 },
    ];
    if (intensity === "intense" || intensity === "max") {
      // Swap in a tempo block for intense rows
      intervals[1] = { name: "Tempo Set", duration: mainMin + " min", effort: iz.hard, details: rowEffortText[iz.hard] || "Hard /500m" };
    }
  } else {
    const mainMin = durMin - warmupMin - cooldownMin;
    intervals = [
      { name: "Warm-Up", duration: warmupMin + " min", effort: iz.warmup, details: detailFn(iz.warmup) },
    ];
    if (intensity === "light") {
      const lightVariants = [
        () => [{ name: "Steady State", duration: mainMin + " min", effort: iz.main, details: detailFn(iz.main) }],
        () => {
          const half = Math.round(mainMin / 2);
          return [
            { name: "Easy Cruise", duration: half + " min", effort: "Z2", details: detailFn("Z2") },
            { name: "Relaxed Finish", duration: (mainMin - half) + " min", effort: "Z1", details: detailFn("Z1") },
          ];
        },
        () => [
          { name: "Gradual Build", duration: Math.round(mainMin * 0.6) + " min", effort: "Z1", details: detailFn("Z1") },
          { name: "Comfortable Effort", duration: Math.round(mainMin * 0.4) + " min", effort: "Z2", details: detailFn("Z2") },
        ],
      ];
      intervals.push(...lightVariants[Math.floor(Math.random() * lightVariants.length)]());
    } else if (intensity === "moderate") {
      const modVariants = [
        () => [
          { name: "Base Effort", duration: Math.round(mainMin * 0.7) + " min", effort: iz.main, details: detailFn(iz.main) },
          { name: "Tempo Push", duration: Math.round(mainMin * 0.3) + " min", effort: iz.hard, details: detailFn(iz.hard) },
        ],
        () => [
          { name: "Easy Base", duration: Math.round(mainMin * 0.4) + " min", effort: iz.main, details: detailFn(iz.main) },
          { name: "Tempo Block", duration: Math.round(mainMin * 0.35) + " min", effort: iz.hard, details: detailFn(iz.hard) },
          { name: "Easy Finish", duration: Math.round(mainMin * 0.25) + " min", effort: iz.main, details: detailFn(iz.main) },
        ],
        () => {
          const reps = 3;
          const workMin = Math.max(2, Math.round((mainMin * 0.4) / reps));
          const easyMin = Math.max(2, Math.round((mainMin * 0.6) / (reps + 1)));
          return [
            { name: "Steady Build", duration: easyMin + " min", effort: iz.main, details: detailFn(iz.main) },
            { name: `Tempo Surges (${reps}x)`, duration: workMin + " min", effort: iz.hard, details: detailFn(iz.hard), reps: reps, restDuration: easyMin + " min", restEffort: iz.main },
          ];
        },
        () => [
          { name: "Progression Start", duration: Math.round(mainMin * 0.5) + " min", effort: iz.main, details: detailFn(iz.main) },
          { name: "Tempo Finish", duration: Math.round(mainMin * 0.5) + " min", effort: iz.hard, details: detailFn(iz.hard) },
        ],
      ];
      intervals.push(...modVariants[Math.floor(Math.random() * modVariants.length)]());
    } else {
      const intVariants = [
        () => {
          const reps = intensity === "max" ? 5 : 4;
          const workMin = Math.max(2, Math.floor((mainMin * 0.5) / reps));
          const restMin = Math.max(1, Math.floor((mainMin * 0.5) / reps));
          return [
            { name: "Easy Base", duration: Math.round(mainMin * 0.2) + " min", effort: iz.main, details: detailFn(iz.main) },
            { name: `Intervals (${reps}x)`, duration: workMin + " min", effort: iz.hard, details: detailFn(iz.hard), reps: reps, restDuration: restMin + " min", restEffort: iz.warmup },
          ];
        },
        () => {
          const reps = intensity === "max" ? 6 : 5;
          const workMin = Math.max(1, Math.floor((mainMin * 0.45) / reps));
          const restMin = Math.max(1, Math.floor((mainMin * 0.3) / reps));
          return [
            { name: "Build-Up", duration: Math.round(mainMin * 0.15) + " min", effort: iz.main, details: detailFn(iz.main) },
            { name: `Short Repeats (${reps}x)`, duration: workMin + " min", effort: iz.hard, details: detailFn(iz.hard), reps: reps, restDuration: restMin + " min", restEffort: iz.warmup },
            { name: "Easy Flush", duration: Math.round(mainMin * 0.1) + " min", effort: iz.main, details: detailFn(iz.main) },
          ];
        },
        () => {
          const reps = intensity === "max" ? 4 : 3;
          const workMin = Math.max(3, Math.floor((mainMin * 0.55) / reps));
          const restMin = Math.max(2, Math.floor((mainMin * 0.25) / reps));
          return [
            { name: `Long Efforts (${reps}x)`, duration: workMin + " min", effort: iz.hard, details: detailFn(iz.hard), reps: reps, restDuration: restMin + " min", restEffort: iz.warmup },
            { name: "Easy Wind-Down", duration: Math.round(mainMin * 0.1) + " min", effort: iz.main, details: detailFn(iz.main) },
          ];
        },
      ];
      intervals.push(...intVariants[Math.floor(Math.random() * intVariants.length)]());
    }
    intervals.push({ name: "Cool-Down", duration: cooldownMin + " min", effort: iz.cooldown, details: detailFn(iz.cooldown) });
  }

  const title = type === "walking"
    ? `Walk — ${durMin} min`
    : `${sportName[type] || type} — ${intensity} ${durMin} min`;
  const workout = { title, intervals };

  // Swim: attach canonical step tree so SwimCardRenderer renders Garmin-style.
  if (type === "swim" && typeof SwimWorkoutGenerator !== "undefined" && typeof SwimWorkout !== "undefined") {
    try {
      const lib = window.VARIANT_LIBRARY_SWIM;
      // Per SPEC §1.1 — the user picks a swim session type explicitly.
      // Fall back to intensity-derived mapping when opts.swimSessionType
      // is missing (e.g. when called from the plan generator).
      const swimTypeMap = {
        technique:     "swim_technique",
        endurance:     "swim_endurance",
        css_intervals: "swim_css_intervals",
        speed_sprint:  "swim_speed",
      };
      const sessionTypeId = swimTypeMap[opts.swimSessionType]
        || { light: "swim_technique", moderate: "swim_endurance", intense: "swim_css_intervals", max: "swim_speed" }[intensity]
        || "swim_endurance";
      const variants = (lib && lib.variants && lib.variants[sessionTypeId]) || [];
      const variant = variants[Math.floor(Math.random() * variants.length)];
      if (variant) {
        const css = (zones.swimming && zones.swimming.css) || null;
        // Pool size: explicit override from the form, else the profile
        // setting via SwimWorkout.getUserPoolSize().
        let poolSize = null;
        if (opts.poolSize && SwimWorkout.POOL_SIZES) {
          poolSize = SwimWorkout.POOL_SIZES.find(p => p.value === opts.poolSize) || null;
        }
        const result = SwimWorkoutGenerator.generateSwimWorkout({
          sessionTypeId, variantId: variant.id,
          userZones: { css }, experienceLevel: level,
          poolSize,
          variantOffset: Math.floor(Math.random() * 12),
        });
        const w = result.workout;
        workout.steps = w.steps;
        workout.pool_size_m = w.pool_size_m;
        workout.pool_unit = w.pool_unit;
        workout.total_distance_m = w.total_distance_m;
        workout.why_text = w.why_text;
        workout.title = w.title;
        // Replace the random minute-based intervals (built upstream as
        // generic Z2 placeholders) with intervals derived from the
        // canonical step tree, with effort inferred from pace_target.
        // This drives the day-card duration badge AND the intensity
        // strip from the same source the visible step list uses, so
        // "build to fast" segments actually paint as a higher zone
        // and the duration matches the requested length.
        workout.intervals = _swimStepsToIntervals(w.steps);
      }
    } catch (e) {
      console.warn("[_qeBuildCardioWorkout swim] canonical shape failed:", e);
    }
  }

  // Cycling: when the user picks a session type (SPEC §1.2), replace the
  // generic intervals with a structure built from VARIANT_LIBRARY_BIKE so
  // the card title, phases, and interval list all agree. Variants whose
  // prescribed rep block can't fit inside the user's chosen duration are
  // filtered out before selection.
  if (type === "cycling" && opts.bikeSessionType) {
    try {
      const bikeTypeMap = {
        z2_endurance:  { sessionTypeId: "bike_endurance",            preferredVariant: "bike_endurance_steady" },
        long_ride:     { sessionTypeId: "bike_endurance",            preferredVariant: "bike_endurance_steady" },
        recovery_spin: { sessionTypeId: "bike_endurance",            preferredVariant: "bike_endurance_steady" },
        tempo:         { sessionTypeId: "bike_intervals_sweet_spot", preferredVariant: null },
        sweet_spot:    { sessionTypeId: "bike_intervals_sweet_spot", preferredVariant: null },
        threshold:     { sessionTypeId: "bike_intervals_ftp",        preferredVariant: null },
        vo2_intervals: { sessionTypeId: "bike_intervals_vo2",        preferredVariant: null },
      };
      const m = bikeTypeMap[opts.bikeSessionType];
      const lib = (typeof window !== "undefined" && window.VARIANT_LIBRARY_BIKE) || null;
      if (m && lib && lib.variants && lib.variants[m.sessionTypeId]) {
        const variants = lib.variants[m.sessionTypeId];
        const wuMin = m.sessionTypeId === "bike_endurance" ? 5 : Math.min(15, Math.max(5, Math.round(durMin * 0.15)));
        const cdMin = m.sessionTypeId === "bike_endurance" ? 5 : Math.min(10, Math.max(3, Math.round(durMin * 0.1)));

        const _pickReps = (repSpec) => {
          if (typeof repSpec === "number") return repSpec;
          if (repSpec && typeof repSpec === "object") {
            return repSpec[level] || repSpec.intermediate || repSpec.beginner || 0;
          }
          return 0;
        };

        // Main-set window = what's left after warmup + cooldown. We no
        // longer filter variants by whether their prescribed rep count
        // fits — instead we rescale the rep count to fill this window,
        // so the generated workout hits the user-selected duration.
        const targetMainMin = Math.max(1, durMin - wuMin - cdMin);

        // Pick any variant — preferred if set, else random. All get
        // rescaled below.
        const variant = (m.preferredVariant && variants.find(v => v.id === m.preferredVariant))
          || variants[Math.floor(Math.random() * variants.length)];

        // Given a rep block (repMin work + restMin rest between reps),
        // return the rep count that best fills targetMainMin without
        // overshooting: N*repMin + (N-1)*restMin ≤ targetMainMin.
        const _fitReps = (repMin, restMin) => {
          const block = Math.max(1, repMin + restMin);
          return Math.max(1, Math.floor((targetMainMin + restMin) / block));
        };

        if (variant) {
          // Map a %FTP target (number or [lo, hi]) to the Z-effort label the
          // card renderer uses to look up wattage from trainingZones.
          const _effortForPct = (pct) => {
            if (pct == null) return "Z2";
            const p = Array.isArray(pct) ? (pct[0] + pct[1]) / 2 : pct;
            if (p < 0.55) return "Z1";
            if (p < 0.75) return "Z2";
            if (p < 0.90) return "Z3";
            if (p < 1.05) return "Z4";
            if (p < 1.20) return "Z5";
            return "Z6";
          };

          const ms = variant.main_set || {};
          const bikeIntervals = [
            { name: "Warm-Up", duration: wuMin + " min", effort: "Z1", details: bikeDetail("Z1") },
          ];

          if (ms.type === "continuous") {
            const mainMin = Math.max(1, durMin - wuMin - cdMin);
            const eff = _effortForPct(ms.power_target_pct_ftp || [0.65, 0.75]);
            bikeIntervals.push({ name: "Steady Endurance", duration: mainMin + " min", effort: eff, details: bikeDetail(eff) });
          } else if (ms.type === "base_plus_surges") {
            const mainMin = Math.max(1, durMin - wuMin - cdMin);
            const surges = ms.surges || {};
            const surgeCount = surges.count || 6;
            const surgeMin = Math.max(1, Math.round((surges.duration_sec || 60) / 60));
            const baseEff = _effortForPct(ms.base_pct_ftp || [0.65, 0.75]);
            const surgeEff = _effortForPct(surges.power_target_pct_ftp || 1.05);
            // Display the base block first, then the surges as a separate
            // repeating segment so the card shows the interval structure.
            const surgeTotal = surgeCount * surgeMin;
            const baseMin = Math.max(1, mainMin - surgeTotal);
            const restMin = Math.max(1, Math.round(baseMin / surgeCount));
            bikeIntervals.push({ name: "Endurance Base", duration: baseMin + " min", effort: baseEff, details: bikeDetail(baseEff) });
            bikeIntervals.push({
              name: `Surges (${surgeCount}×)`,
              duration: surgeMin + " min",
              effort: surgeEff,
              details: bikeDetail(surgeEff),
              reps: surgeCount,
              restDuration: restMin + " min",
              restEffort: baseEff,
            });
          } else if (ms.type === "alternation_block") {
            // FTP over-unders — render as one labeled block; the details
            // text carries the alternation pattern.
            const repMin = Math.max(1, Math.round((ms.duration_sec || 0) / 60));
            const restMin = Math.max(1, Math.round((ms.rest_sec || 180) / 60));
            const reps = _fitReps(repMin, restMin);
            const blocks = ms.blocks || [];
            const details = blocks.length === 2
              ? `Alternate ${Math.round((blocks[0].duration_sec || 60))}s @ ${Math.round((blocks[0].power_target_pct_ftp || 1.05) * 100)}% FTP / ${Math.round((blocks[1].duration_sec || 60))}s @ ${Math.round((blocks[1].power_target_pct_ftp || 0.95) * 100)}% FTP`
              : "Over-unders";
            bikeIntervals.push({
              name: variant.name,
              duration: repMin + " min",
              effort: "Z4",
              details,
              reps,
              restDuration: restMin + " min",
              restEffort: "Z1",
            });
          } else if (ms.type === "progression") {
            const repMin = Math.max(1, Math.round((ms.duration_sec || 0) / 60));
            const restMin = Math.max(1, Math.round((ms.rest_sec || 180) / 60));
            const reps = _fitReps(repMin, restMin);
            const eff = _effortForPct(ms.end_pct_ftp || 1.15);
            bikeIntervals.push({
              name: variant.name,
              duration: repMin + " min",
              effort: eff,
              details: `Progress from ${Math.round((ms.start_pct_ftp || 1.0) * 100)}% → ${Math.round((ms.end_pct_ftp || 1.15) * 100)}% FTP across each rep`,
              reps,
              restDuration: restMin + " min",
              restEffort: "Z1",
            });
          } else {
            // Standard interval block: reps × duration_sec at power_target_pct_ftp.
            // Rep count scales with the user's selected duration (_fitReps)
            // rather than the variant's prescribed count, so a 60-min sweet
            // spot session actually fills 60 minutes instead of falling back
            // to the variant's fixed 3–4 reps.
            const repMin = Math.max(1, Math.round((ms.duration_sec || 0) / 60));
            const restMin = Math.max(1, Math.round((ms.rest_sec || 180) / 60));
            const reps = _fitReps(repMin, restMin);
            const eff = _effortForPct(ms.power_target_pct_ftp);
            bikeIntervals.push({
              name: variant.name,
              duration: repMin + " min",
              effort: eff,
              details: bikeDetail(eff),
              reps,
              restDuration: restMin + " min",
              restEffort: "Z1",
            });
          }

          bikeIntervals.push({ name: "Cool-Down", duration: cdMin + " min", effort: "Z1", details: bikeDetail("Z1") });

          workout.intervals = bikeIntervals;
          workout.title = variant.name;
          workout.why_text = variant.description || "";
          workout.bike_session_type = opts.bikeSessionType;
          workout.variant_id = variant.id;

          // Still populate .phases for the few callers that want the
          // generator's structured phase list (live tracker, share sheet).
          if (typeof window !== "undefined" && window.BikeWorkoutGenerator) {
            try {
              const ftp = (zones.biking && zones.biking.ftp) || null;
              const result = window.BikeWorkoutGenerator.generateBikeWorkout({
                sessionTypeId: m.sessionTypeId,
                variantId: variant.id,
                userZones: { ftp },
                experienceLevel: level,
                durationOverrideMin: durMin,
              });
              if (result && result.workout && result.workout.phases) {
                workout.phases = result.workout.phases;
              }
            } catch {}
          }
        }
      }
    } catch (e) {
      console.warn("[_qeBuildCardioWorkout cycling] variant build failed:", e);
    }
  }

  return workout;
}

// Expose the cardio builder so other flows (custom-plan.js) can produce
// identical output without duplicating 200+ lines of variant logic.
if (typeof window !== "undefined") window.QEBuildCardioWorkout = _qeBuildCardioWorkout;

function qeGenerateCardio() {
  const type      = _qeSelectedType;
  const intensity = document.getElementById("qe-activity-intensity")?.value || "moderate";
  const isBrick   = type === "brick";
  const bikeDur   = isBrick ? (document.getElementById("qe-brick-bike-duration")?.value || "45") : null;
  const runDur    = isBrick ? (document.getElementById("qe-brick-run-duration")?.value || "20")  : null;
  const duration  = isBrick ? String(parseInt(bikeDur) + parseInt(runDur)) : (document.getElementById("qe-cardio-duration")?.value || "45");
  // Sport-specific session type selections — see SPEC §1.1-1.2.
  const swimSessionType = type === "swim" ? (document.getElementById("qe-swim-session-type")?.value || "endurance") : null;
  const bikeSessionType = type === "cycling" ? (document.getElementById("qe-bike-session-type")?.value || "z2_endurance") : null;
  const poolSize = type === "swim" ? (document.getElementById("qe-swim-pool")?.value || null) : null;

  // Persist the pool size to profile when the user picks one in the form
  // — same key the Profile settings screen writes to, so the two stay
  // in sync regardless of which place the user sets it first.
  if (type === "swim" && poolSize) {
    try {
      const p = JSON.parse(localStorage.getItem("profile") || "{}");
      if (p.pool_size !== poolSize) {
        p.pool_size = poolSize;
        localStorage.setItem("profile", JSON.stringify(p));
      }
    } catch {}
  }

  qeShowStep(2, "cardio-generated");

  const loadingEl = document.getElementById("qe-ai-loading");
  const resultEl  = document.getElementById("qe-ai-result");
  loadingEl.style.display = "";
  resultEl.innerHTML = "";

  try {
    const workout = _qeBuildCardioWorkout({
      type, intensity, duration, bikeDur, runDur,
      swimSessionType, bikeSessionType, poolSize,
    });
    _qeGeneratedCardioData = workout;
    loadingEl.style.display = "none"; _stopLoadingMessages();

    const effortToZone = { RW:"rw",Z1:"z1",Z2:"z2",Z3:"z3",Z4:"z4",Z5:"z5",Z6:"z6", Easy:"z2",Moderate:"z3",Hard:"z4",Max:"z5", T1:"z-transition" };
    let html;
    if (type === "swim" && Array.isArray(workout.steps) && workout.steps.length && typeof SwimCardRenderer !== "undefined") {
      html = `<div class="qe-generated-workout">${SwimCardRenderer.render(workout)}</div>`;
    } else {
      html = `<div class="qe-generated-workout"><div class="qe-generated-title">${escHtml(workout.title)}</div>`;
      (workout.intervals || []).forEach(iv => {
        const zCls = effortToZone[iv.effort] || "z2";
        const sportTag = iv.sport ? `<span class="qe-brick-sport qe-brick-${iv.sport}">${iv.sport === "bike" ? "Bike" : "Run"}</span> ` : "";
        const badgeHtml = iv.effort ? `<span class="zone-badge ${zCls}">${escHtml(iv.effort)}</span>` : "";
        // Duration text: show reps × per-rep dur for structured blocks
        // so the card reflects the actual work time (e.g. "4 × 10 min").
        const reps = iv.reps || 1;
        const durText = reps > 1 ? `${reps} × ${escHtml(iv.duration)}` : escHtml(iv.duration);
        const restText = (reps > 1 && iv.restDuration) ? ` <span class="qe-cardio-rest">(${escHtml(iv.restDuration)} rest)</span>` : "";
        const detailsHtml = iv.details ? `<div class="qe-cardio-details">${escHtml(iv.details)}</div>` : "";
        html += `<div class="qe-cardio-interval">
          <div class="qe-cardio-interval-header">
            <span class="qe-cardio-phase">${sportTag}${escHtml(iv.name)}</span>
            <span class="qe-cardio-meta">${durText}${restText}</span>
          </div>
          ${badgeHtml ? `<div class="qe-cardio-badge-row">${badgeHtml}</div>` : ""}
          ${detailsHtml}
        </div>`;
      });
      html += `</div>`;
    }
    resultEl.innerHTML = html;

    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;gap:10px;margin-top:12px";
    btnRow.innerHTML = `
      <button class="btn-primary"   style="flex:1" onclick="qeSaveGeneratedCardio()">Save Session</button>
      <button class="btn-secondary" style="flex:1" onclick="qeGenerateCardio()">Regenerate</button>`;
    resultEl.appendChild(btnRow);

  } catch (err) {
    loadingEl.style.display = "none"; _stopLoadingMessages();
    resultEl.innerHTML = `<div class="qe-ai-error">
      ${ICONS.warning} Could not generate workout. ${err.message || "Try again."}<br><br>
      <button class="btn-secondary" onclick="qeGoCardioManual()">Add manually instead</button>
    </div>`;
  }
}

let _lastCardioSaveTime = 0;
function qeSaveGeneratedCardio() {
  // Prevent double-save within 2 seconds
  const now = Date.now();
  if (now - _lastCardioSaveTime < 2000) return;
  _lastCardioSaveTime = now;
  const dateStr = document.getElementById("qe-date").value;
  if (!dateStr || !_qeGeneratedCardioData) return;

  const typeMap = { running: "running", cycling: "cycling", swim: "swimming", hiit: "hiit", brick: "brick" };
  const type    = typeMap[_qeSelectedType] || _qeSelectedType || "general";

  let restrictions = {};
  try { restrictions = JSON.parse(localStorage.getItem("dayRestrictions")) || {}; } catch {}
  const existingR = restrictions[dateStr];
  if (existingR && existingR.action === "remove") {
    if (!confirm("This day has a restriction that removes all sessions.\n\nRemove the restriction and add this workout?")) return;
    delete restrictions[dateStr];
    localStorage.setItem("dayRestrictions", JSON.stringify(restrictions)); if (typeof DB !== 'undefined') DB.syncKey('dayRestrictions');
  }

  let workouts = [];
  try { workouts = JSON.parse(localStorage.getItem("workouts")) || []; } catch {}
  workouts.unshift({
    id: generateId(), date: dateStr, type,
    notes: _qeGeneratedCardioData.title || "",
    exercises: [],
    aiSession: _qeGeneratedCardioData,
  });
  localStorage.setItem("workouts", JSON.stringify(workouts)); if (typeof DB !== 'undefined') DB.syncWorkouts();

  renderCalendar();
  if (selectedDate === dateStr) renderDayDetail(dateStr);
  if (typeof renderWorkoutHistory === "function") renderWorkoutHistory();
  setTimeout(() => closeQuickEntry(), 700);
}

// ── Cardio manual rows ────────────────────────────────────────────────────────

function qeInitCardioRows() {
  _qeCardioRowCount = 0;
  document.getElementById("qe-cardio-interval-rows").innerHTML = "";
  qeAddCardioRow();
}

function _qeCardioRowDuration(id) {
  const row = document.getElementById(`qe-crow-${id}`);
  const mode = row?.dataset.durMode || "time";
  if (mode === "distance") {
    const val  = document.getElementById(`qe-cdist-${id}`)?.value || "";
    const unit = typeof getDistanceUnit === "function" ? getDistanceUnit() : "mi";
    return val ? `${val} ${unit}` : "";
  }
  const val = document.getElementById(`qe-cmin-${id}`)?.value || "";
  return val ? `${val} min` : "";
}

function setQEIntervalMode(id, mode) {
  const row = document.getElementById(`qe-crow-${id}`);
  if (!row) return;
  row.dataset.durMode = mode;
  document.getElementById(`qe-dist-wrap-${id}`).style.display = mode === "distance" ? "" : "none";
  document.getElementById(`qe-time-wrap-${id}`).style.display = mode === "time"     ? "" : "none";
  row.querySelectorAll(".qe-dur-mode-btn").forEach(btn =>
    btn.classList.toggle("active", btn.dataset.mode === mode));
}

function qeAddCardioRow(iv) {
  _qeCardioRowCount++;
  const id   = _qeCardioRowCount;
  const unit = typeof getDistanceUnit === "function" ? getDistanceUnit() : "mi";
  const isBrick = _qeSelectedType === "brick";
  const disc = iv?.discipline || "";
  let initMode = "time", initDist = "", initMin = "";
  if (iv?.duration) {
    const durStr = String(iv.duration);
    if (/mi|km|m\b|yd/i.test(durStr)) { initMode = "distance"; initDist = durStr.match(/[\d.]+/)?.[0] || ""; }
    else { initMin = durStr.match(/[\d.]+/)?.[0] || ""; }
  }
  const eff = iv?.effort || "Z2";
  const _esel = v => eff === v || (v === "Z1" && eff === "Easy") || (v === "Z2" && eff === "Moderate") || (v === "Z4" && eff === "Hard") || (v === "Z5" && eff === "Max") ? " selected" : "";
  const _dsel = v => disc === v ? " selected" : "";
  const trashSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4c0-1.1.9-2 2-2h4a2 2 0 012 2v2"/><path d="M19 6v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>';
  const div = document.createElement("div");
  div.className = "edit-interval-card";
  div.id = `qe-crow-${id}`;
  div.dataset.durMode = initMode;
  div.draggable = true;
  div.innerHTML = `
    <div class="eiv-header">
      <span class="drag-handle" title="Drag to reorder · drop on a row to create repeat block">⠿</span>
      ${isBrick ? `<select id="qe-cdisc-${id}" class="seg-discipline" style="width:auto;padding:4px 24px 4px 6px;font-size:0.82rem">
        <option value="bike"${_dsel("bike")}>Bike</option>
        <option value="transition"${_dsel("transition")}>T</option>
        <option value="run"${_dsel("run")}>Run</option>
      </select>` : ""}
      <input type="text" class="eiv-phase-input" id="qe-cphase-${id}" value="${escHtml(iv?.name || "")}" placeholder="${isBrick ? "e.g. Steady Ride" : "e.g. Warm-up"}" />
      <button class="remove-exercise-btn" onclick="qeRemoveCardioRow(${id})">${trashSvg}</button>
    </div>
    <div class="eiv-fields">
      <div class="eiv-field">
        <div class="qe-dur-toggle">
          <button type="button" class="qe-dur-mode-btn${initMode==="distance"?" active":""}" data-mode="distance"
            onclick="setQEIntervalMode(${id},'distance')">Dist</button>
          <button type="button" class="qe-dur-mode-btn${initMode==="time"?" active":""}" data-mode="time"
            onclick="setQEIntervalMode(${id},'time')">Time</button>
        </div>
        <div id="qe-dist-wrap-${id}" style="${initMode==="distance"?"":"display:none"}">
          <input type="number" id="qe-cdist-${id}" value="${initDist}" placeholder="e.g. 5" min="0" step="0.1" style="width:60px" />
          <span class="qe-unit-label">${unit}</span>
        </div>
        <div id="qe-time-wrap-${id}" style="${initMode==="time"?"":"display:none"}">
          <input type="number" id="qe-cmin-${id}" value="${initMin}" placeholder="10" min="0" style="width:60px" />
          <span class="qe-unit-label">min</span>
        </div>
      </div>
      <div class="eiv-field">
        <select id="qe-ceffort-${id}">
          <option value="RW"${_esel("RW")}>Rest / Walk</option>
          <option value="Z1"${_esel("Z1")}>Z1 Recovery</option>
          <option value="Z2"${_esel("Z2")}>Z2 Aerobic</option>
          <option value="Z3"${_esel("Z3")}>Z3 Tempo</option>
          <option value="Z4"${_esel("Z4")}>Z4 Threshold</option>
          <option value="Z5"${_esel("Z5")}>Z5 VO2 Max</option>
          <option value="Z6"${_esel("Z6")}>Z6 Sprint</option>
        </select>
      </div>
    </div>
    <div class="eiv-details">
      <input type="text" id="qe-cdetails-${id}" value="${escHtml(iv?.details || "")}" placeholder="e.g. 5:30/km, keep HR under 145" />
    </div>`;

  // Wire drag-to-reorder + drop-in-middle to group as repeat block
  const container = document.getElementById("qe-cardio-interval-rows");
  div.addEventListener("dragstart", e => { _qeCardioDragEl = div; div.classList.add("drag-active"); e.dataTransfer.effectAllowed = "move"; });
  div.addEventListener("dragend", () => { div.classList.remove("drag-active"); _qeCardioDragEl = null; _qeClearCardioHints(); });
  div.addEventListener("dragover", e => {
    if (!_qeCardioDragEl || _qeCardioDragEl === div) return;
    e.preventDefault();
    div.classList.remove("drag-insert-above", "drag-insert-below", "drag-ss-target");
    const pct = (e.clientY - div.getBoundingClientRect().top) / div.getBoundingClientRect().height;
    if (pct > 0.3 && pct < 0.7) div.classList.add("drag-ss-target");
    else div.classList.add(pct <= 0.3 ? "drag-insert-above" : "drag-insert-below");
  });
  div.addEventListener("dragleave", () => div.classList.remove("drag-insert-above", "drag-insert-below", "drag-ss-target"));
  div.addEventListener("drop", e => {
    e.preventDefault();
    _qeClearCardioHints();
    if (!_qeCardioDragEl || _qeCardioDragEl === div) return;
    const pct = (e.clientY - div.getBoundingClientRect().top) / div.getBoundingClientRect().height;
    if (pct > 0.3 && pct < 0.7) {
      _qeCardioGroupRepeat(_qeCardioDragEl, div);
    } else {
      if (pct <= 0.3) container.insertBefore(_qeCardioDragEl, div);
      else container.insertBefore(_qeCardioDragEl, div.nextSibling);
      _qeCardioEjectIfIsolated(_qeCardioDragEl);
      _qeCardioRefreshBadges();
    }
    _qeCardioDragEl = null;
  });
  if (typeof TouchDrag !== "undefined") {
    TouchDrag.attach(div, container, {
      hintClasses: ["drag-insert-above", "drag-insert-below", "drag-ss-target"],
      rowSelector: ".edit-interval-card",
      handleSelector: ".drag-handle",
      onDrop(dragEl, targetEl, clientY) {
        _qeClearCardioHints();
        const pct = (clientY - targetEl.getBoundingClientRect().top) / targetEl.getBoundingClientRect().height;
        if (pct > 0.3 && pct < 0.7) {
          _qeCardioGroupRepeat(dragEl, targetEl);
        } else {
          if (pct <= 0.3) container.insertBefore(dragEl, targetEl);
          else container.insertBefore(dragEl, targetEl.nextSibling);
          _qeCardioEjectIfIsolated(dragEl);
          _qeCardioRefreshBadges();
        }
      },
    });
  }
  container.appendChild(div);
  _qeCardioRefreshBadges();
}

let _qeCardioDragEl = null;
function _qeClearCardioHints() {
  document.querySelectorAll("#qe-cardio-interval-rows .edit-interval-card").forEach(el =>
    el.classList.remove("drag-insert-above", "drag-insert-below", "drag-ss-target", "drag-active"));
}

// Group two cardio rows into a repeat block (shared repeatGroup letter).
function _qeCardioGroupRepeat(dragEl, targetEl) {
  const container = document.getElementById("qe-cardio-interval-rows");
  container.insertBefore(dragEl, targetEl.nextSibling);
  let group = targetEl.dataset.repeatGroup || dragEl.dataset.repeatGroup || "";
  if (!group) {
    const used = new Set(Array.from(container.querySelectorAll(".edit-interval-card"))
      .map(r => r.dataset.repeatGroup).filter(Boolean));
    for (const letter of ["A","B","C","D","E","F"]) { if (!used.has(letter)) { group = letter; break; } }
    if (!group) group = "A";
  }
  targetEl.dataset.repeatGroup = group;
  dragEl.dataset.repeatGroup = group;
  if (!targetEl.dataset.groupSets) targetEl.dataset.groupSets = "3";
  if (!dragEl.dataset.groupSets)   dragEl.dataset.groupSets = "3";
  _qeCardioRefreshBadges();
}

// If a row is no longer adjacent to any row in the same group, eject it.
function _qeCardioEjectIfIsolated(el) {
  const g = el.dataset.repeatGroup;
  if (!g) return;
  const above = el.previousElementSibling;
  const below = el.nextElementSibling;
  if (!(above && above.dataset.repeatGroup === g) && !(below && below.dataset.repeatGroup === g)) {
    delete el.dataset.repeatGroup;
  }
}

// Rebuild repeat-block badges on all cardio rows.
function _qeCardioRefreshBadges() {
  const container = document.getElementById("qe-cardio-interval-rows");
  if (!container) return;
  const rows = Array.from(container.querySelectorAll(".edit-interval-card"));
  // Pass 1: eject isolated rows
  rows.forEach((row, i) => {
    const g = row.dataset.repeatGroup;
    if (!g) return;
    const above = rows[i - 1], below = rows[i + 1];
    if (!(above && above.dataset.repeatGroup === g) && !(below && below.dataset.repeatGroup === g))
      delete row.dataset.repeatGroup;
  });
  // Pass 2: render badges + rounds control on first row of each group
  const counts = {};
  const seenGroups = new Set();
  rows.forEach(row => {
    row.querySelectorAll(".cp-ss-badge, .cp-ss-sets-wrap").forEach(el => el.remove());
    const g = row.dataset.repeatGroup;
    if (!g) return;
    counts[g] = (counts[g] || 0) + 1;
    const header = row.querySelector(".eiv-header");
    if (!seenGroups.has(g)) {
      seenGroups.add(g);
      const curRounds = row.dataset.groupSets || "3";
      if (!row.dataset.groupSets) row.dataset.groupSets = curRounds;
      const wrap = document.createElement("span");
      wrap.className = "cp-ss-sets-wrap";
      wrap.innerHTML = `<span class="cp-ss-badge" style="cursor:default">${g}</span>` +
        `<input type="number" class="cp-ss-sets-input" min="1" max="20" value="${curRounds}" title="Rounds for this repeat block" />` +
        `<span class="cp-ss-sets-label">rounds</span>` +
        `<button class="cp-ss-ungroup-btn" title="Ungroup">×</button>`;
      wrap.querySelector("input").addEventListener("change", function () {
        rows.filter(r => r.dataset.repeatGroup === g).forEach(r => r.dataset.groupSets = this.value);
      });
      wrap.querySelector(".cp-ss-ungroup-btn").addEventListener("click", () => {
        rows.filter(r => r.dataset.repeatGroup === g).forEach(r => { delete r.dataset.repeatGroup; delete r.dataset.groupSets; });
        _qeCardioRefreshBadges();
      });
      header.appendChild(wrap);
    } else {
      const badge = document.createElement("span");
      badge.className = "cp-ss-badge";
      badge.textContent = `${g}${counts[g]}`;
      badge.title = "Click to ungroup this interval";
      badge.addEventListener("click", () => { delete row.dataset.repeatGroup; delete row.dataset.groupSets; _qeCardioRefreshBadges(); });
      header.appendChild(badge);
    }
  });
}

function qeRemoveCardioRow(id) {
  const el = document.getElementById(`qe-crow-${id}`);
  if (el) el.remove();
}

function qeSaveCardioManual() {
  // Prevent double-save within 2 seconds
  const now = Date.now();
  if (now - _lastCardioSaveTime < 2000) return;
  _lastCardioSaveTime = now;
  const dateStr = document.getElementById("qe-date").value;
  const msgEl   = document.getElementById("qe-cardio-manual-msg");
  if (!dateStr) { if (msgEl) msgEl.textContent = "Please select a date."; return; }

  const workoutName = document.getElementById("qe-cardio-manual-name")?.value.trim() || "";
  const notes       = document.getElementById("qe-cardio-manual-notes")?.value.trim() || "";
  const intervals = [];
  document.querySelectorAll("[id^='qe-cphase-']").forEach(inp => {
    const idx      = inp.id.replace("qe-cphase-", "");
    const duration = _qeCardioRowDuration(idx);
    if (!duration) return;   // skip rows with no duration at all
    const name = inp.value.trim() || `Interval ${intervals.length + 1}`;
    const interval = {
      name,
      duration,
      effort:   document.getElementById(`qe-ceffort-${idx}`)?.value  || "Z2",
      details:  document.getElementById(`qe-cdetails-${idx}`)?.value || "",
    };
    const discEl = document.getElementById(`qe-cdisc-${idx}`);
    if (discEl) interval.discipline = discEl.value || "bike";
    // Repeat-block grouping from drag-to-group
    const rowEl = document.getElementById(`qe-crow-${idx}`);
    if (rowEl && rowEl.dataset.repeatGroup) {
      interval.repeatGroup = rowEl.dataset.repeatGroup;
      if (rowEl.dataset.groupSets) interval.groupSets = parseInt(rowEl.dataset.groupSets) || 3;
    }
    intervals.push(interval);
  });

  const typeMap = { running: "running", cycling: "cycling", swim: "swimming", hiit: "hiit", brick: "brick" };
  const type    = typeMap[_qeSelectedType] || _qeSelectedType || "general";

  let restrictions = {};
  try { restrictions = JSON.parse(localStorage.getItem("dayRestrictions")) || {}; } catch {}
  const existingR = restrictions[dateStr];
  if (existingR && existingR.action === "remove") {
    if (!confirm("This day has a restriction that removes all sessions.\n\nRemove the restriction and add this workout?")) return;
    delete restrictions[dateStr];
    localStorage.setItem("dayRestrictions", JSON.stringify(restrictions)); if (typeof DB !== 'undefined') DB.syncKey('dayRestrictions');
  }

  const displayName = workoutName || capitalize(type) + " Session";
  let workouts = [];
  try { workouts = JSON.parse(localStorage.getItem("workouts")) || []; } catch {}
  workouts.unshift({
    id: generateId(), date: dateStr, type, notes, exercises: [],
    fromSaved: workoutName || undefined,
    ...(intervals.length ? { aiSession: { title: displayName, intervals } } : {})
  });
  localStorage.setItem("workouts", JSON.stringify(workouts)); if (typeof DB !== 'undefined') DB.syncWorkouts();

  renderCalendar();
  if (selectedDate === dateStr) renderDayDetail(dateStr);
  if (typeof renderWorkoutHistory === "function") renderWorkoutHistory();

  if (msgEl) { msgEl.style.color = "var(--color-success)"; msgEl.innerHTML = `Session saved! ${ICONS.activity}`; }
  setTimeout(() => closeQuickEntry(), 700);
}

// ── Manual strength entry ─────────────────────────────────────────────────────

function qeInitManualRows() {
  _qeManualRowCount = 0;
  document.getElementById("qe-exercise-rows").innerHTML = "";
  // Show/hide HIIT metadata
  const hiitMeta = document.getElementById("qe-hiit-meta");
  if (hiitMeta) hiitMeta.style.display = _qeSelectedType === "hiit" ? "" : "none";
  // Dynamic placeholders matching Build a Plan's cpManualSelectType
  const _typeLabels = { strength:"Strength",hiit:"HIIT",yoga:"Yoga",bodyweight:"Bodyweight",general:"General" };
  const nameInput = document.getElementById("qe-manual-workout-name");
  if (nameInput) nameInput.placeholder = _qeSelectedType === "hiit" ? "e.g. Tabata Burner"
    : "e.g. " + (_typeLabels[_qeSelectedType] || "Custom") + " Day A";
  const notesInput = document.getElementById("qe-manual-notes");
  if (notesInput) notesInput.placeholder = "e.g. Upper body focus, felt strong";
  qeAddExerciseRow();
  qeAddExerciseRow();
  qeAddExerciseRow();
}

function qeAddExerciseRow() {
  _qeManualRowCount++;
  const id  = _qeManualRowCount;
  const div = document.createElement("div");
  const isHiit = _qeSelectedType === "hiit";
  const isBW = _qeSelectedType === "bodyweight";
  div.className = "ex-row qe-manual-row" + (isHiit ? " hiit-row" : "");
  div.id = `qe-mrow-${id}`;
  div.draggable = true;
  if (isHiit) {
    div.innerHTML = `
      <div class="ex-row-header">
        <input type="text" id="qe-mex-${id}" class="ex-row-name" placeholder="e.g. Burpees, Row 500m" />
        <button type="button" class="ex-row-delete" onclick="qeRemoveRow(${id})" title="Remove">×</button>
      </div>
      <div class="ex-row-defaults ex-row-defaults--hiit">
        <div class="ex-row-field">
          <label>Reps / Time / Distance</label>
          <input type="text" id="qe-mreps-${id}" placeholder="e.g. 10, 45s, 500m" />
        </div>
        <div class="ex-row-field">
          <label>Weight</label>
          <input type="text" id="qe-mwt-${id}" placeholder="optional" />
        </div>
      </div>`;
  } else {
    const exPlaceholder = isBW ? "e.g. Push-ups, Plank" : "e.g. Bench Press";
    const repsLabel = isBW ? "Reps / Time" : "Reps";
    const repsPlaceholder = isBW ? "10 or 60s" : "10";
    const weightField = isBW ? "" : `
        <div class="ex-row-field">
          <label>Weight (lbs)</label>
          <input type="text" id="qe-mwt-${id}" placeholder="lbs" data-pyr-field="qe:default:${id}" />
        </div>`;
    div.innerHTML = `
      <div class="ex-row-header">
        <input type="text" id="qe-mex-${id}" class="ex-row-name" placeholder="${exPlaceholder}" />
        <button type="button" class="ex-row-delete" onclick="qeRemoveRow(${id})" title="Remove">×</button>
      </div>
      <div class="ex-row-defaults${isBW ? " ex-row-defaults--bw" : ""}">
        <div class="ex-row-field">
          <label>Sets</label>
          <input type="number" id="qe-msets-${id}" min="1" max="20" placeholder="3" data-pyr-field="qe:sets:${id}" />
        </div>
        <div class="ex-row-field">
          <label>${repsLabel}</label>
          <input type="text" id="qe-mreps-${id}" placeholder="${repsPlaceholder}" data-pyr-field="qe:default:${id}" />
        </div>${weightField}
      </div>
      <button type="button" class="ex-row-customize-toggle" id="qe-pyr-toggle-${id}" data-pyr-toggle="qe:${id}">Customize per set ▾</button>
      <div class="ex-pyramid-detail${isBW ? " ex-pyramid-detail--bw" : ""}" id="qe-pyr-${id}" style="display:none"></div>`;
  }
  let _qeHoverTimer = null;
  div.addEventListener("dragstart", (e) => { _qeManualDragId = id; div.classList.add("drag-active"); e.dataTransfer.effectAllowed = "move"; });
  div.addEventListener("dragend",   ()  => { div.classList.remove("drag-active"); _qeManualDragId = null; _qeClearAllHints(); });
  div.addEventListener("dragover",  (e) => {
    if (_qeManualDragId == null || _qeManualDragId === id) return;
    e.preventDefault();
    const rect = div.getBoundingClientRect();
    const pct  = (e.clientY - rect.top) / rect.height;
    div.classList.remove("drag-insert-above", "drag-insert-below", "drag-ss-target");
    if (pct > 0.3 && pct < 0.7) {
      div.classList.add("drag-ss-target");
      if (!_qeHoverTimer) _qeHoverTimer = setTimeout(() => {}, 600);
    } else {
      clearTimeout(_qeHoverTimer); _qeHoverTimer = null;
      div.classList.add(pct <= 0.3 ? "drag-insert-above" : "drag-insert-below");
    }
  });
  div.addEventListener("dragleave", () => { clearTimeout(_qeHoverTimer); _qeHoverTimer = null; div.classList.remove("drag-insert-above", "drag-insert-below", "drag-ss-target"); });
  div.addEventListener("drop", (e) => {
    e.preventDefault();
    const rect = div.getBoundingClientRect();
    const pct  = (e.clientY - rect.top) / rect.height;
    clearTimeout(_qeHoverTimer); _qeHoverTimer = null;
    _qeClearAllHints();
    if (pct > 0.3 && pct < 0.7) {
      _qeManualGroupSuperset(_qeManualDragId, id);
    } else {
      _qeManualReorder(_qeManualDragId, id, pct <= 0.3);
    }
    _qeManualDragId = null;
  });
  // Touch support for mobile
  const qeContainer = document.getElementById("qe-exercise-rows");
  TouchDrag.attach(div, qeContainer, {
    hintClasses: ["drag-insert-above", "drag-insert-below", "drag-ss-target"],
    rowSelector: ".qe-manual-row",
    handleSelector: ".drag-handle",
    onDrop(dragEl, targetEl, clientY) {
      const rect = targetEl.getBoundingClientRect();
      const pct = (clientY - rect.top) / rect.height;
      _qeClearAllHints();
      const fromId = parseInt(dragEl.id.replace("qe-mrow-", ""));
      const toId   = parseInt(targetEl.id.replace("qe-mrow-", ""));
      if (pct > 0.3 && pct < 0.7) {
        _qeManualGroupSuperset(fromId, toId);
      } else {
        _qeManualReorder(fromId, toId, pct <= 0.3);
      }
    }
  });
  qeContainer.appendChild(div);
}

function _qeClearAllHints() {
  document.querySelectorAll(".qe-manual-row").forEach(el => {
    el.classList.remove("drag-insert-above", "drag-insert-below", "drag-ss-target", "drag-active");
  });
}

function _qeManualReorder(fromId, toId, insertAbove) {
  const fromEl = document.getElementById(`qe-mrow-${fromId}`);
  const toEl   = document.getElementById(`qe-mrow-${toId}`);
  if (!fromEl || !toEl) return;
  const container = toEl.parentNode;
  if (insertAbove) container.insertBefore(fromEl, toEl);
  else             toEl.after(fromEl);
}

function _qeManualGroupSuperset(fromId, toId) {
  const fromEl = document.getElementById(`qe-mrow-${fromId}`);
  const toEl   = document.getElementById(`qe-mrow-${toId}`);
  if (!fromEl || !toEl) return;

  toEl.after(fromEl);

  let gid = toEl.dataset.ssId;
  if (!gid) {
    _qeManualSsCount++;
    gid = `mss-${_qeManualSsCount}`;
    toEl.dataset.ssId = gid;
    _qeManualAddSupersetLabel(toEl, gid);
  }
  fromEl.dataset.ssId = gid;
  fromEl.classList.add("qe-manual-ss-member");
  toEl.classList.add("qe-manual-ss-member");
  _qeManualUpdateSupersetWrap(gid);
  // Sync sets from group input and hide member sets inputs
  const wrap = document.getElementById(`qe-ss-wrap-${gid}`);
  const groupSets = wrap?.querySelector(".qe-ss-sets-input")?.value || "3";
  [fromEl, toEl].forEach(el => {
    const inp = el.querySelector(`[id^="qe-msets-"]`);
    if (inp) inp.value = groupSets;
    _qeManualHideSetsInput(el);
  });
}

function _qeManualAddSupersetLabel(anchorEl, gid) {
  // Wrap in a superset group if not already
  const container = document.getElementById("qe-exercise-rows");
  let wrap = document.getElementById(`qe-ss-wrap-${gid}`);
  if (!wrap) {
    const setsVal = anchorEl.querySelector(`[id^="qe-msets-"]`)?.value || "3";
    wrap = document.createElement("div");
    wrap.className = "qe-superset-group";
    wrap.id = `qe-ss-wrap-${gid}`;
    wrap.innerHTML = `<div class="qe-superset-label">Superset <span class="qe-ss-sets-wrap"><input type="number" class="qe-ss-sets-input" min="1" max="20" value="${setsVal}" onchange="_qeManualSupersetSetsChange('${gid}', this.value)" /> sets</span><button class="qe-unsuperset-btn" onclick="_qeManualUnsuperset('${gid}')">Remove</button></div>`;
    anchorEl.parentNode.insertBefore(wrap, anchorEl);
    wrap.appendChild(anchorEl);
    // Hide anchor's individual sets input
    _qeManualHideSetsInput(anchorEl);
  }
}

function _qeManualUpdateSupersetWrap(gid) {
  const wrap = document.getElementById(`qe-ss-wrap-${gid}`);
  if (!wrap) return;
  // Move all rows with this gid into the wrap (they may have been moved by drop)
  document.querySelectorAll(`[data-ss-id="${gid}"]`).forEach(el => {
    if (!wrap.contains(el)) wrap.appendChild(el);
  });
}

function _qeManualUnsuperset(gid) {
  const wrap = document.getElementById(`qe-ss-wrap-${gid}`);
  if (!wrap) return;
  const container = document.getElementById("qe-exercise-rows");
  wrap.querySelectorAll(".qe-manual-row").forEach(el => {
    // Restore sets input visibility
    _qeManualShowSetsInput(el);
    el.classList.remove("qe-manual-ss-member");
    delete el.dataset.ssId;
    container.appendChild(el);
  });
  wrap.remove();
}

function toggleManualSupersetMode(btn) {
  const rows = document.getElementById("qe-exercise-rows");
  if (!rows) return;
  const btns = rows.querySelectorAll(".qe-manual-ss-btn");
  const showing = btns[0]?.style.display !== "none";
  btns.forEach(b => b.style.display = showing ? "none" : "");
  btn.classList.toggle("is-active", !showing);
}

function _qeManualHideSetsInput(rowEl) {
  const inp = rowEl.querySelector(`[id^="qe-msets-"]`);
  if (inp) { const w = inp.closest("div"); if (w) w.style.display = "none"; }
}
function _qeManualShowSetsInput(rowEl) {
  const inp = rowEl.querySelector(`[id^="qe-msets-"]`);
  if (inp) { const w = inp.closest("div"); if (w) w.style.display = ""; }
}
function _qeManualSupersetSetsChange(gid, value) {
  const wrap = document.getElementById(`qe-ss-wrap-${gid}`);
  if (!wrap) return;
  wrap.querySelectorAll(`[id^="qe-msets-"]`).forEach(inp => { inp.value = value; });
}

function qeRemoveRow(id) {
  const el = document.getElementById(`qe-mrow-${id}`);
  if (el) el.remove();
}

// Toggle the per-set customization panel for a row. Collapsed by default.
function qeTogglePerSet(id) {
  const detail = document.getElementById(`qe-pyr-${id}`);
  const toggle = document.getElementById(`qe-pyr-toggle-${id}`);
  if (!detail || !toggle) return;
  const isHidden = detail.style.display !== "block";
  if (isHidden) {
    detail.style.display = "block";
    toggle.textContent = "Collapse ▴";
    qePyramidSetsChanged(id); // build the per-set rows now that panel is open
  } else {
    detail.style.display = "none";
    toggle.textContent = "Customize per set ▾";
  }
}

// Rebuild per-set rows to match the current Sets count. Only runs if the
// per-set panel is currently expanded — the panel is collapsed by default.
function qePyramidSetsChanged(id) {
  const detail = document.getElementById(`qe-pyr-${id}`);
  if (!detail || detail.style.display === "none") return;
  const setsInput = document.getElementById(`qe-msets-${id}`);
  let setsVal = parseInt(setsInput?.value) || 0;
  // Fall back to the placeholder default so tapping "Customize per set"
  // always produces rows even when the user hasn't typed a Sets count yet.
  // The placeholder is the implied default (usually "3").
  if (setsVal < 1) {
    setsVal = parseInt(setsInput?.placeholder) || 3;
    if (setsInput && !setsInput.value) setsInput.value = String(setsVal);
  }
  const defaultReps = document.getElementById(`qe-mreps-${id}`)?.value || "";
  const defaultWeight = document.getElementById(`qe-mwt-${id}`)?.value || "";

  const isBW = _qeSelectedType === "bodyweight";

  // Preserve any existing per-set values so typing into Sets doesn't wipe edits
  const existing = [];
  detail.querySelectorAll(".ex-pyr-row").forEach(pr => {
    existing.push({
      reps: pr.querySelector(".ex-pyr-reps")?.value || "",
      weight: pr.querySelector(".ex-pyr-weight")?.value || "",
    });
  });

  const repsHeader = isBW ? "Reps / Time" : "Reps";
  const repsPh = isBW ? (defaultReps || "10 or 60s") : (defaultReps || "10");
  let html = isBW
    ? `<div class="ex-pyr-header"><span></span><span>${repsHeader}</span></div>`
    : `<div class="ex-pyr-header"><span></span><span>${repsHeader}</span><span>Weight</span></div>`;
  for (let i = 0; i < setsVal; i++) {
    const prev = existing[i] || {};
    const reps = prev.reps || defaultReps;
    const weight = prev.weight || defaultWeight;
    html += isBW
      ? `<div class="ex-pyr-row">
          <span class="ex-pyr-label">Set ${i + 1}</span>
          <input type="text" class="ex-pyr-reps" placeholder="${repsPh}" value="${reps}" />
        </div>`
      : `<div class="ex-pyr-row">
          <span class="ex-pyr-label">Set ${i + 1}</span>
          <input type="text" class="ex-pyr-reps" placeholder="${repsPh}" value="${reps}" />
          <input type="text" class="ex-pyr-weight" placeholder="${defaultWeight || 'lbs'}" value="${weight}" />
        </div>`;
  }
  detail.innerHTML = html;
}

// When the default Reps/Weight changes, propagate into empty per-set cells.
// No-op if the per-set panel is collapsed.
function qePyramidDefaultsChanged(id) {
  const detail = document.getElementById(`qe-pyr-${id}`);
  if (!detail || detail.style.display === "none") return;
  const defaultReps = document.getElementById(`qe-mreps-${id}`)?.value || "";
  const defaultWeight = document.getElementById(`qe-mwt-${id}`)?.value || "";
  detail.querySelectorAll(".ex-pyr-row").forEach(pr => {
    const rInp = pr.querySelector(".ex-pyr-reps");
    const wInp = pr.querySelector(".ex-pyr-weight");
    if (rInp && !rInp.value) rInp.value = defaultReps;
    if (wInp && !wInp.value) wInp.value = defaultWeight;
    if (rInp) rInp.placeholder = defaultReps || "10";
    if (wInp) wInp.placeholder = defaultWeight || "lbs";
  });
  if (!detail.querySelector(".ex-pyr-row")) qePyramidSetsChanged(id);
}

// Back-compat shims
function qeTogglePyramid(id) { qeTogglePerSet(id); }

function qeSaveManual() {
  const dateStr = document.getElementById("qe-date").value;
  if (!dateStr) { document.getElementById("qe-manual-msg").textContent = "Please select a date."; return; }

  const isHiit = _qeSelectedType === "hiit";
  const isBW   = _qeSelectedType === "bodyweight";
  const notes     = (document.getElementById("qe-manual-notes").value || "").trim();
  const exercises = [];
  document.querySelectorAll("[id^='qe-mex-']").forEach(inp => {
    const idx  = inp.id.replace("qe-mex-", "");
    const name = inp.value.trim();
    if (!name) return;
    const row = document.getElementById(`qe-mrow-${idx}`);
    const rawWeight = document.getElementById(`qe-mwt-${idx}`)?.value || "";
    const ex = {
      name,
      reps:   document.getElementById(`qe-mreps-${idx}`)?.value || "",
      weight: isBW ? (rawWeight || "Bodyweight") : rawWeight,
    };
    if (!isHiit) ex.sets = document.getElementById(`qe-msets-${idx}`)?.value || "";
    if (row?.dataset.ssId) ex.supersetId = row.dataset.ssId;

    // Collect per-set details only if the panel is expanded AND values differ
    // from the defaults — otherwise save as a flat sets/reps/weight entry.
    const pyrDetail = document.getElementById(`qe-pyr-${idx}`);
    if (pyrDetail && pyrDetail.style.display !== "none") {
      const pyrRows = pyrDetail.querySelectorAll(".ex-pyr-row");
      if (pyrRows.length > 0) {
        const perSet = [];
        let hasDiff = false;
        pyrRows.forEach(pr => {
          const r = pr.querySelector(".ex-pyr-reps")?.value.trim() || ex.reps;
          const w = pr.querySelector(".ex-pyr-weight")?.value.trim() || ex.weight;
          perSet.push({ reps: r, weight: w });
          if (r !== ex.reps || w !== ex.weight) hasDiff = true;
        });
        if (hasDiff) {
          ex.perSet = perSet;
          ex.setDetails = perSet; // legacy alias for existing readers
        }
      }
    }
    exercises.push(ex);
  });

  if (!exercises.length) { document.getElementById("qe-manual-msg").textContent = "Add at least one exercise."; return; }
  const defaultName = isHiit ? "HIIT Session"
                    : _qeSelectedType === "bodyweight" ? "Bodyweight Session"
                    : "Strength Session";
  const manualName = (document.getElementById("qe-manual-workout-name")?.value || "").trim() || defaultName;

  let hiitMeta = null;
  if (isHiit) {
    hiitMeta = {
      format: document.getElementById("qe-manual-hiit-format")?.value || "circuit",
      rounds: parseInt(document.getElementById("qe-manual-hiit-rounds")?.value) || 1,
      restBetweenExercises: (document.getElementById("qe-manual-hiit-rest-ex")?.value || "").trim() || undefined,
      restBetweenRounds: (document.getElementById("qe-manual-hiit-rest-rnd")?.value || "").trim() || undefined,
    };
  }
  _qeSaveStrengthWorkout(dateStr, manualName, notes, exercises, hiitMeta);
}

function _qeSaveStrengthWorkout(dateStr, label, notes, exercises, hiitMeta, duration) {
  let restrictions = {};
  try { restrictions = JSON.parse(localStorage.getItem("dayRestrictions")) || {}; } catch {}
  const existingR = restrictions[dateStr];
  if (existingR && existingR.action === "remove") {
    if (!confirm("This day has a restriction that removes all sessions.\n\nRemove the restriction and add this workout?")) return;
    delete restrictions[dateStr];
    localStorage.setItem("dayRestrictions", JSON.stringify(restrictions)); if (typeof DB !== 'undefined') DB.syncKey('dayRestrictions');
  }

  let workouts = [];
  try { workouts = JSON.parse(localStorage.getItem("workouts")) || []; } catch {}
  const _saveType = _qeSelectedType === "hiit"       ? "hiit"
                  : _qeSelectedType === "bodyweight" ? "bodyweight"
                  : "weightlifting";
  const entry = { id: generateId(), date: dateStr, type: _saveType, name: label, notes, exercises };
  if (hiitMeta) entry.hiitMeta = hiitMeta;
  if (duration && duration > 0) entry.duration = duration;
  workouts.unshift(entry);
  localStorage.setItem("workouts", JSON.stringify(workouts)); if (typeof DB !== 'undefined') DB.syncWorkouts();

  renderCalendar();
  if (selectedDate === dateStr) renderDayDetail(dateStr);
  if (typeof renderWorkoutHistory === "function") renderWorkoutHistory();

  const msgEl = document.getElementById("qe-manual-msg");
  if (msgEl) { msgEl.style.color = "var(--color-success)"; msgEl.innerHTML = `Session saved! ${ICONS.activity}`; }
  setTimeout(() => closeQuickEntry(), 700);
}

// ── Cardio save ───────────────────────────────────────────────────────────────
function saveQuickActivity() {
  const dateStr = document.getElementById("qe-date").value;
  if (!dateStr) { document.getElementById("qe-activity-msg").textContent = "Please select a date."; return; }

  const typeMap = { running: "running", cycling: "cycling", swim: "swimming", hiit: "hiit", brick: "brick" };
  const type    = typeMap[_qeSelectedType] || _qeSelectedType || "general";
  const notes   = document.getElementById("qe-activity-notes").value.trim();
  const msg     = document.getElementById("qe-activity-msg");

  let restrictions = {};
  try { restrictions = JSON.parse(localStorage.getItem("dayRestrictions")) || {}; } catch {}
  const existingR = restrictions[dateStr];
  if (existingR && existingR.action === "remove") {
    const label = RESTRICTION_LABELS[existingR.type] || existingR.type;
    if (!confirm(`This day has a "${label}" restriction.\n\nRemove the restriction and add this workout?`)) return;
    delete restrictions[dateStr];
    localStorage.setItem("dayRestrictions", JSON.stringify(restrictions)); if (typeof DB !== 'undefined') DB.syncKey('dayRestrictions');
  }

  const intensity  = document.getElementById("qe-activity-intensity")?.value || "moderate";
  const generateCb = document.getElementById("qe-generate-workout");
  let generatedSession = null;
  if (generateCb?.checked && typeof SESSION_DESCRIPTIONS !== "undefined") {
    const typeToDisc = { running: "run", cycling: "bike", triathlon: "brick", swim: "swim" };
    const disc = typeToDisc[type];
    if (disc) {
      const sessionDef = (SESSION_DESCRIPTIONS[disc] || {})[intensity];
      if (sessionDef) generatedSession = { ...sessionDef, name: `${capitalize(intensity === "long" ? "Long" : intensity)} ${capitalize(disc)}` };
    }
  }

  // Collect any manually entered cardio intervals from the DOM rows
  // (the interval/phase rows the user typed: Warm up, Interval Fast, etc.)
  // Previously these were silently dropped at save time — only the
  // generatedSession checkbox path preserved structured body data.
  let manualIntervals = null;
  const cardioRows = document.querySelectorAll("#qe-cardio-interval-rows [id^='qe-crow-']");
  if (cardioRows.length) {
    const ivs = [];
    cardioRows.forEach(row => {
      const rowId = row.id.replace("qe-crow-", "");
      const name = document.getElementById("qe-cphase-" + rowId)?.value?.trim() || "";
      if (!name) return;
      const iv = {
        name,
        duration: typeof _qeCardioRowDuration === "function" ? _qeCardioRowDuration(rowId) : "",
        effort: document.getElementById("qe-ceffort-" + rowId)?.value || "Z2",
        details: document.getElementById("qe-cdetails-" + rowId)?.value || "",
      };
      const repsVal = parseInt(document.getElementById("qe-creps-" + rowId)?.value);
      if (repsVal > 1) {
        iv.reps = repsVal;
        const restVal = document.getElementById("qe-crest-" + rowId)?.value;
        if (restVal) iv.restDuration = restVal + " min";
      }
      if (row.dataset.repeatGroup) {
        iv.repeatGroup = row.dataset.repeatGroup;
        if (row.dataset.groupSets) iv.groupSets = parseInt(row.dataset.groupSets) || 3;
      }
      ivs.push(iv);
    });
    if (ivs.length) {
      manualIntervals = {
        title: notes || "Custom " + capitalize(type) + " Session",
        intervals: ivs,
      };
    }
  }

  let workouts = [];
  try { workouts = JSON.parse(localStorage.getItem("workouts")) || []; } catch {}
  const entry = { id: generateId(), date: dateStr, type, notes, exercises: [] };
  if (generatedSession)  entry.generatedSession = generatedSession;
  if (manualIntervals)   entry.aiSession = manualIntervals;
  workouts.unshift(entry);
  localStorage.setItem("workouts", JSON.stringify(workouts)); if (typeof DB !== 'undefined') DB.syncWorkouts();
  if (typeof trackWorkoutLogged === "function") trackWorkoutLogged({ type, date: dateStr, source: "quick_entry" });

  renderCalendar();
  if (selectedDate === dateStr) renderDayDetail(dateStr);
  if (typeof renderWorkoutHistory === "function") renderWorkoutHistory();

  msg.style.color = "var(--color-success)";
  msg.textContent = "Activity logged!";
  setTimeout(() => closeQuickEntry(), 700);
}

// ── Restriction save ──────────────────────────────────────────────────────────
function saveQuickRestriction() {
  const dateStr = document.getElementById("qe-date").value;
  if (!dateStr) { document.getElementById("qe-restriction-msg").textContent = "Please select a date."; return; }
  const type   = document.getElementById("qe-restriction-type").value;
  const note   = document.getElementById("qe-restriction-note").value.trim();
  const action = document.querySelector('input[name="qe-session-action"]:checked')?.value || "reduce";
  const msg    = document.getElementById("qe-restriction-msg");

  // Swap-discipline action: "I can't swim today, swap it for
  // something I can do". We store the blocked disciplines alongside
  // the restriction so the session filter hides those workouts and
  // the day detail renders a substitute-suggestion card. Multiple
  // disciplines can be blocked in one pass for travel days where
  // several sports are unavailable at once.
  let disciplines = null;
  if (action === "swap") {
    const picked = Array.from(document.querySelectorAll("#qe-restriction-disc-row input[type=checkbox]:checked"))
      .map(el => el.value);
    if (picked.length === 0) {
      msg.style.color = "var(--color-danger)";
      msg.textContent = "Pick at least one discipline to swap.";
      return;
    }
    disciplines = picked;
  }

  let restrictions = {};
  try { restrictions = JSON.parse(localStorage.getItem("dayRestrictions")) || {}; } catch {}
  const entry = { type, note, action, createdAt: new Date().toISOString() };
  if (disciplines) entry.disciplines = disciplines;
  restrictions[dateStr] = entry;
  localStorage.setItem("dayRestrictions", JSON.stringify(restrictions)); if (typeof DB !== 'undefined') DB.syncKey('dayRestrictions');

  renderCalendar();
  if (selectedDate === dateStr) renderDayDetail(dateStr);

  msg.style.color = "var(--color-success)";
  msg.textContent = "Restriction saved!";
  setTimeout(() => closeQuickEntry(), 700);
}

// Show/hide the discipline picker based on the Session Action radio.
// "Swap" surfaces the picker so the user can mark which sports are
// blocked; Reduce / Remove hide the picker.
function onRestrictionActionChange() {
  const action = document.querySelector('input[name="qe-session-action"]:checked')?.value || "reduce";
  const row = document.getElementById("qe-restriction-disc-row");
  if (!row) return;
  row.style.display = action === "swap" ? "" : "none";
}
// Back-compat shim — older inline HTML may still reference this name.
function onRestrictionTypeChange() { onRestrictionActionChange(); }

function toggleQEGenerate() {}
function switchQETab() {}

function removeRestriction(dateStr) {
  let restrictions = {};
  try { restrictions = JSON.parse(localStorage.getItem("dayRestrictions")) || {}; } catch {}
  delete restrictions[dateStr];
  localStorage.setItem("dayRestrictions", JSON.stringify(restrictions)); if (typeof DB !== 'undefined') DB.syncKey('dayRestrictions');
  renderCalendar();
  renderDayDetail(dateStr);
}

// ── Equipment restriction save / remove ───────────────────────────────────────
function saveQuickEquipmentRestriction() {
  const startStr  = document.getElementById("qe-date").value;
  const endStr    = document.getElementById("qe-equip-end-date").value || startStr;
  const isPermanent = document.getElementById("qe-equip-permanent")?.checked || false;
  if (!startStr && !isPermanent) { document.getElementById("qe-equipment-msg").textContent = "Please select a date."; return; }

  const available = EQUIPMENT_OPTIONS
    .filter(o => document.getElementById(`qe-equip-${o.value}`)?.checked)
    .map(o => o.value);
  const note = document.getElementById("qe-equip-note").value.trim();
  const dumbbellMaxWeightRaw = document.getElementById("qe-dumbbell-max-weight")?.value;
  const dumbbellMaxWeight = dumbbellMaxWeightRaw ? parseInt(dumbbellMaxWeightRaw, 10) : null;
  const cablesMachineTypes = available.includes("cables")
    ? Array.from(document.querySelectorAll("#qe-cables-detail input[type=checkbox]:checked")).map(c => c.dataset.machine)
    : [];
  const entry = { available, note, ...(dumbbellMaxWeight ? { dumbbellMaxWeight } : {}), ...(cablesMachineTypes.length ? { cablesMachineTypes } : {}), createdAt: new Date().toISOString() };

  let restrictions = {};
  try { restrictions = JSON.parse(localStorage.getItem("equipmentRestrictions")) || {}; } catch {}

  if (isPermanent) {
    restrictions["permanent"] = { ...entry, permanent: true };
  } else {
    // Apply to every date in the range
    const start = new Date(startStr + "T00:00:00");
    const end   = new Date(endStr   + "T00:00:00");
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      restrictions[d.toISOString().slice(0, 10)] = entry;
    }
  }
  localStorage.setItem("equipmentRestrictions", JSON.stringify(restrictions)); if (typeof DB !== 'undefined') DB.syncKey('equipmentRestrictions');

  if (typeof refreshGeneratedWorkouts === "function") refreshGeneratedWorkouts();
  renderCalendar();
  if (selectedDate) renderDayDetail(selectedDate);

  const msg = document.getElementById("qe-equipment-msg");
  msg.style.color = "var(--color-success)";
  msg.textContent = "Equipment restriction saved!";
  setTimeout(() => closeQuickEntry(), 700);
}

function removeEquipmentRestriction(dateStr, scope) {
  let restrictions = {};
  try { restrictions = JSON.parse(localStorage.getItem("equipmentRestrictions")) || {}; } catch {}

  const isPermKey = dateStr === "permanent";
  const thisEntry = restrictions[dateStr];
  if (!thisEntry) { renderCalendar(); renderDayDetail(dateStr); return; }

  // If no scope yet and this date is part of a multi-date series, show inline choice
  if (!scope && !isPermKey) {
    const createdAt = thisEntry.createdAt;
    const seriesDates = createdAt
      ? Object.keys(restrictions).filter(k => k !== "permanent" && restrictions[k].createdAt === createdAt)
      : [dateStr];
    if (seriesDates.length > 1) {
      const banner = document.querySelector(".equipment-banner");
      if (banner) {
        const btn = banner.querySelector(".restriction-remove-btn");
        if (btn) btn.outerHTML = `
          <div class="equip-remove-choice">
            <button class="restriction-remove-btn" onclick="removeEquipmentRestriction('${dateStr}','day')">This day</button>
            <button class="restriction-remove-btn equip-remove-series" onclick="removeEquipmentRestriction('${dateStr}','series')">Entire series</button>
          </div>`;
      }
      return;
    }
  }

  if (scope === "series" && !isPermKey) {
    const createdAt = thisEntry.createdAt;
    Object.keys(restrictions).forEach(k => {
      if (k !== "permanent" && restrictions[k].createdAt === createdAt) delete restrictions[k];
    });
  } else {
    delete restrictions[dateStr];
  }

  localStorage.setItem("equipmentRestrictions", JSON.stringify(restrictions)); if (typeof DB !== 'undefined') DB.syncKey('equipmentRestrictions');
  if (typeof refreshGeneratedWorkouts === "function") refreshGeneratedWorkouts();
  renderCalendar();
  renderDayDetail(dateStr);
}


// ── Import a Training Plan ────────────────────────────────────────────────────

async function importTrainingPlan() {
  const text = (document.getElementById("import-plan-text")?.value || "").trim();
  const msg  = document.getElementById("import-plan-msg");
  const preview = document.getElementById("import-plan-preview");
  if (!text) { msg.textContent = "Please paste a training plan."; msg.style.color = "var(--color-error)"; return; }

  const startDate = document.getElementById("custom-plan-start")?.value || document.getElementById("import-start-date")?.value || getTodayString();
  const repeat    = parseInt(document.getElementById("import-repeat")?.value) || 1;

  msg.textContent = "Parsing your plan...";
  msg.style.color = "var(--color-text-muted)";

  let profile = {};
  try { profile = JSON.parse(localStorage.getItem("profile")) || {}; } catch {}
  const profileCtx = profile.weight
    ? `Athlete: ${profile.weight} lbs${profile.gender ? `, ${profile.gender}` : ""}, ${profile.fitnessLevel || "intermediate"} level.`
    : "";

  let refCtx = "";
  try {
    const allZones = JSON.parse(localStorage.getItem("trainingZones")) || {};
    const refs = allZones.strength || null;
    if (refs) {
      const liftLabels = { bench: "Bench Press", squat: "Back Squat", deadlift: "Deadlift", ohp: "Overhead Press", row: "Barbell Row" };
      const lines = Object.entries(liftLabels)
        .filter(([k]) => refs[k]?.weight)
        .map(([k, label]) => `${label}: ${refs[k].weight} lbs`);
      if (lines.length) refCtx = ` Reference lifts: ${lines.join(", ")}.`;
    }
  } catch {}

  try {
    const data = await callAI({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [{
        role: "user",
        content: `Parse this training plan into structured JSON. ${profileCtx}${refCtx}

The plan text:
"""
${text}
"""

Return ONLY valid JSON, no markdown. The format must be:
{
  "planName": "Plan title",
  "weekCount": 1,
  "sessions": [
    {
      "weekDay": 1,
      "weekNumber": 1,
      "type": "running|cycling|swimming|weightlifting|general|yoga|rest",
      "sessionName": "Session title",
      "exercises": [{"name":"Exercise","sets":3,"reps":"10","weight":"135 lbs","rest":"60s"}],
      "intervals": [{"name":"Phase","duration":"10 min","effort":"Z2","details":"description"}],
      "details": "Plain text description if not exercises/intervals"
    }
  ]
}

Rules:
- weekDay: 0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat
- weekNumber: starts at 1, increment for multi-week plans
- For strength sessions: use "exercises" array with specific weights in lbs. Scale from reference lifts if provided.
- For cardio sessions: use "intervals" array with duration, effort zone, and details. Each interval entry is ONE phase — expand repeats into individual entries.
  - For notation like "3x6 (2 min rest)" meaning 3 sets of 6 minutes with 2 min rest between sets, produce: warmup, then interval 1 (6 min), recovery (2 min), interval 2 (6 min), recovery (2 min), interval 3 (6 min), cooldown. The duration is the WORK duration per set, NOT the rest duration.
  - Always include a warmup interval at the start and a cooldown interval at the end if specified.
  - Recovery intervals between sets should have effort "Z1" or "Z2" and name "RECOVERY".
- For simple sessions (yoga, rest, cross-train): use "details" string.
- Omit rest days entirely — do not include them.
- If the plan doesn't specify weeks, treat it as 1 week.
- Every session MUST have a type and sessionName.`
      }]
    });

    const raw = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const plan = JSON.parse(cleaned);

    if (!plan.sessions || !plan.sessions.length) {
      msg.textContent = "Couldn't parse any sessions from that text. Try adding more detail.";
      msg.style.color = "var(--color-error)";
      return;
    }

    // Build schedule entries
    const start = new Date(startDate + "T00:00:00");
    const startDow = start.getDay();
    const weekCount = plan.weekCount || 1;
    const schedule = [];

    for (let cycle = 0; cycle < repeat; cycle++) {
      for (const s of plan.sessions) {
        const weekOffset = ((s.weekNumber || 1) - 1) + cycle * weekCount;
        const dow = s.weekDay ?? 1;
        let delta = (dow - startDow + 7) % 7 + weekOffset * 7;
        const date = new Date(start);
        date.setDate(date.getDate() + delta);
        const dateStr = date.toISOString().slice(0, 10);

        const entry = {
          id: `import-${dateStr}-${s.type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          date: dateStr,
          type: s.type || "general",
          level: profile.fitnessLevel || "intermediate",
          sessionName: s.sessionName || "Session",
          source: "imported",
        };

        if (s.exercises && s.exercises.length) {
          entry.exercises = s.exercises;
        }
        if (s.intervals && s.intervals.length) {
          entry.aiSession = { title: s.sessionName, intervals: s.intervals };
        }
        if (s.details) {
          entry.details = s.details;
        }

        // For cardio types without intervals, map to discipline/load for rich rendering
        const _discMap = { running: "run", cycling: "bike", swimming: "swim" };
        if (_discMap[entry.type] && !entry.aiSession) {
          entry.discipline = _discMap[entry.type];
          const nm = (entry.sessionName + " " + (entry.details || "")).toLowerCase();
          if (/interval|speed|vo2|fartlek|repeat/i.test(nm)) entry.load = "hard";
          else if (/tempo|threshold|sweetspot|race.?pace/i.test(nm)) entry.load = "moderate";
          else if (/long|endurance|distance/i.test(nm)) entry.load = "long";
          else entry.load = "easy";
        }

        schedule.push(entry);
      }
    }

    // Tag every entry with a planId so we can remove them as a group
    const planId = `imported-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    schedule.forEach(e => { e.planId = planId; });

    // Save to workoutSchedule
    const existing = typeof loadWorkoutSchedule === "function" ? loadWorkoutSchedule() : [];
    const merged = [...existing, ...schedule];
    localStorage.setItem("workoutSchedule", JSON.stringify(merged)); if (typeof DB !== 'undefined') DB.syncSchedule();

    // Save imported plan metadata for Active Training Plans display
    const planMeta = {
      id: planId,
      name: plan.planName || "Imported Plan",
      createdAt: new Date().toISOString().slice(0, 10),
      startDate: startDate,
      weekCount: repeat * weekCount,
      sessions: schedule.map(s => ({
        date: s.date,
        type: s.type,
        sessionName: s.sessionName,
        exerciseCount: s.exercises ? s.exercises.length : 0,
        intervalCount: s.aiSession?.intervals ? s.aiSession.intervals.length : 0,
        details: s.details || "",
      })),
    };
    const importedPlans = (() => { try { return JSON.parse(localStorage.getItem("importedPlans")) || []; } catch { return []; } })();
    importedPlans.push(planMeta);
    localStorage.setItem("importedPlans", JSON.stringify(importedPlans)); if (typeof DB !== 'undefined') DB.syncKey('importedPlans');

    // Show success
    const totalSessions = schedule.length;
    const weeks = repeat * weekCount;
    msg.style.color = "var(--color-success)";
    msg.textContent = `Imported ${totalSessions} sessions across ${weeks} week${weeks > 1 ? "s" : ""}!`;

    // Show preview
    preview.style.display = "";
    const grouped = {};
    schedule.forEach(s => {
      const wk = Math.floor((new Date(s.date + "T00:00:00") - start) / (7 * 864e5)) + 1;
      if (!grouped[wk]) grouped[wk] = [];
      grouped[wk].push(s);
    });
    preview.innerHTML = Object.entries(grouped).map(([wk, sessions]) => {
      const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
      const rows = sessions.map(s => {
        const d = new Date(s.date + "T00:00:00");
        const dayName = dayNames[d.getDay()];
        const exCount = s.exercises ? `${s.exercises.length} exercises` : "";
        const ivCount = s.aiSession?.intervals ? `${s.aiSession.intervals.length} intervals` : "";
        const detail = exCount || ivCount || s.details || "";
        return `<tr><td>${dayName}</td><td><span class="workout-tag tag-${s.type}">${s.type}</span></td><td>${s.sessionName}</td><td class="import-detail-cell">${detail}</td></tr>`;
      }).join("");
      return `<div class="import-week-group"><h4>Week ${wk}</h4><table class="exercise-table"><thead><tr><th>Day</th><th>Type</th><th>Session</th><th>Detail</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }).join("");

    // Refresh calendar
    if (typeof renderCalendar === "function") renderCalendar();

  } catch (err) {
    msg.textContent = `Error: ${err.message}`;
    msg.style.color = "var(--color-error)";
  }
}

// Set default import start date on load
document.addEventListener("DOMContentLoaded", () => {
  const el = document.getElementById("import-start-date");
  if (el && !el.value) el.value = getTodayString();
});

// ── Workout Rating & Feedback Loop ──────────────────────────────────────────

const RATING_LABELS = ["", "Too Easy", "Easy", "Just Right", "Hard", "Crushed Me"];
const RATING_EMOJIS = ["", "\u{1F971}", "\u{1F60C}", "\u{1F44C}", "\u{1F4AA}", "\u{1F635}"];

function loadWorkoutRatings() {
  try { return JSON.parse(localStorage.getItem("workoutRatings")) || {}; } catch { return {}; }
}

function saveWorkoutRating(workoutId, rating, note) {
  const ratings = loadWorkoutRatings();
  ratings[workoutId] = { rating, note: note || "", date: new Date().toISOString() };
  localStorage.setItem("workoutRatings", JSON.stringify(ratings)); if (typeof DB !== 'undefined') DB.syncKey('workoutRatings');
}

function getWorkoutRating(workoutId) {
  return loadWorkoutRatings()[workoutId] || null;
}

function showRatingModal(workoutId, dateStr) {
  // Remove existing modal if any
  const existing = document.getElementById("rating-modal-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "rating-modal-overlay";
  overlay.className = "rating-modal-overlay";
  overlay.onclick = e => { if (e.target === overlay) dismissRatingModal(); };
  overlay.innerHTML = `
    <div class="rating-modal">
      <div class="rating-modal-title">How did that feel?</div>
      <div class="rating-scale" id="rating-scale">
        ${[1,2,3,4,5].map(n => `
          <button class="rating-btn" data-rating="${n}" onclick="selectRating(${n})">
            <span class="rating-emoji">${RATING_EMOJIS[n]}</span>
            <span class="rating-label">${RATING_LABELS[n]}</span>
          </button>
        `).join("")}
      </div>
      <textarea id="rating-note" class="rating-note" placeholder="Quick note (optional) — e.g. 'Shoulders felt tight'"></textarea>
      <div class="rating-modal-actions">
        <button class="rating-skip-btn" onclick="dismissRatingModal()">Skip</button>
        <button class="rating-save-btn" id="rating-save-btn" disabled onclick="confirmRating('${workoutId}','${dateStr}')">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  // Animate in
  requestAnimationFrame(() => overlay.classList.add("visible"));
}

let _selectedRating = 0;

function selectRating(n) {
  _selectedRating = n;
  document.querySelectorAll("#rating-scale .rating-btn").forEach(btn => {
    btn.classList.toggle("selected", parseInt(btn.dataset.rating) === n);
  });
  const saveBtn = document.getElementById("rating-save-btn");
  if (saveBtn) saveBtn.disabled = false;
}

function confirmRating(workoutId, dateStr) {
  if (!_selectedRating) return;
  const note = (document.getElementById("rating-note")?.value || "").trim();
  saveWorkoutRating(workoutId, _selectedRating, note);
  _selectedRating = 0;
  dismissRatingModal();
  // Re-render to show rating on badge
  if (dateStr && typeof renderDayDetail === "function") renderDayDetail(dateStr);
  if (typeof renderStats === "function") renderStats();
}

function dismissRatingModal() {
  const overlay = document.getElementById("rating-modal-overlay");
  if (overlay) {
    overlay.classList.remove("visible");
    setTimeout(() => overlay.remove(), 200);
  }
  _selectedRating = 0;
}

function buildRatingDisplay(workoutId) {
  const r = getWorkoutRating(workoutId);
  if (!r) return "";
  const emoji = RATING_EMOJIS[r.rating] || "";
  const label = RATING_LABELS[r.rating] || "";
  const noteHtml = r.note ? `<span class="rating-display-note">${_escRatingHtml(r.note)}</span>` : "";
  return `<span class="rating-display">${emoji} ${label}${noteHtml}</span>`;
}

function _escRatingHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

function getRatingSmartAlert() {
  const ratings = loadWorkoutRatings();
  const entries = Object.values(ratings).sort((a, b) => b.date.localeCompare(a.date));
  if (entries.length < 3) return null;

  const recent = entries.slice(0, 5);
  const tooEasy = recent.filter(r => r.rating <= 1).length;
  const tooHard = recent.filter(r => r.rating >= 5).length;

  if (tooEasy >= 3) return { type: "easy", message: "Your last few workouts felt too easy. Consider increasing intensity or leveling up your plan." };
  if (tooHard >= 3) return { type: "hard", message: "Your last few workouts have been very tough. Consider dialing back intensity or taking a rest day." };
  return null;
}

// ── Rest Day Intelligence ───────────────────────────────────────────────────

function _getTrainingDaysAround(dateStr) {
  const schedule = [];
  try { schedule.push(...(JSON.parse(localStorage.getItem("workoutSchedule")) || [])); } catch {}
  const plan = [];
  try { plan.push(...(JSON.parse(localStorage.getItem("trainingPlan")) || [])); } catch {}
  const logged = [];
  try { logged.push(...(JSON.parse(localStorage.getItem("workouts")) || [])); } catch {}
  const completionMeta = loadCompletionMeta();

  const trainingDates = new Set();
  const typesByDate = {};

  const addDate = (d, type) => {
    if (!d) return;
    trainingDates.add(d);
    if (!typesByDate[d]) typesByDate[d] = [];
    if (type && !typesByDate[d].includes(type)) typesByDate[d].push(type);
  };

  // Scheduled workouts — only count if the user actually completed the session
  schedule.forEach(w => {
    if (completionMeta[`session-sw-${w.id}`]) addDate(w.date, w.discipline || w.type);
  });

  // Race-plan entries — only count if completed
  plan.forEach(p => {
    if (completionMeta[`session-plan-${p.date}-${p.raceId}`]) addDate(p.date, p.discipline);
  });

  // Logged workouts: count completion receipts, Strava-imported activity, or
  // template-based manual logs (fromSaved). A bare logged entry (Add Session
  // without a completion receipt) is still a planned session, not a trained day.
  logged.forEach(w => {
    if (w.isCompletion || w.source === "strava" || w.fromSaved) {
      addDate(w.date, w.type);
    } else if (completionMeta[`session-log-${w.id}`]) {
      addDate(w.date, w.type);
    }
  });

  return { trainingDates, typesByDate };
}

function getRestDayRecommendation(dateStr) {
  const { trainingDates, typesByDate } = _getTrainingDaysAround(dateStr);
  const recommendations = [];

  // 1. Consecutive training days — count streak ending at yesterday
  const today = new Date(dateStr + "T00:00:00");
  let streak = 0;
  const d = new Date(today);
  d.setDate(d.getDate() - 1); // start from yesterday
  while (trainingDates.has(localDateStr(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  // Also count today if it has training
  if (trainingDates.has(dateStr)) streak++;

  if (streak >= 7) {
    recommendations.push({
      type: "streak",
      icon: "warning",
      message: `You've trained ${streak} days straight. Consider a rest or active recovery day.`
    });
  } else if (streak >= 5) {
    recommendations.push({
      type: "streak",
      icon: "lightbulb",
      message: `${streak} consecutive training days. A rest day soon could help recovery.`
    });
  }

  // 2. Same discipline overlap — check if yesterday and today have the same high-impact type
  //    Use getDataForDate to match what's actually shown on the calendar
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = localDateStr(yesterday);
  const _visibleTypes = (data) => {
    if (data.restriction && data.restriction.action === "remove") return [];
    const types = [];
    if (data.planEntry) types.push(data.planEntry.discipline);
    data.scheduledWorkouts.forEach(w => { if (w.type) types.push(w.type); if (w.discipline) types.push(w.discipline); });
    data.loggedWorkouts.forEach(w => { if (w.type) types.push(w.type); });
    return [...new Set(types)];
  };
  const _getMuscleGroups = (data) => {
    const groups = new Set();
    const focusMap = { chest:"push", shoulders:"push", triceps:"push", back:"pull", biceps:"pull", quads:"legs", hamstrings:"legs", glutes:"legs", calves:"legs", core:"legs" };
    const all = [...data.scheduledWorkouts, ...data.loggedWorkouts];
    all.forEach(w => {
      if (w.type !== "weightlifting") return;
      // Extract from sessionName (e.g. "Push", "Pull", "Legs", "Quads / Hamstrings")
      const name = (w.sessionName || "").toLowerCase();
      const idMatch = String(w.id).match(/weightlifting-(\w+)-b/);
      const idFocus = idMatch ? idMatch[1] : null;
      if (idFocus) { groups.add(idFocus); return; }
      // Check sessionName for known focus keywords
      if (/push/.test(name)) { groups.add("push"); return; }
      if (/pull/.test(name)) { groups.add("pull"); return; }
      if (/leg|quad|hamstring|glute|calv/.test(name)) { groups.add("legs"); return; }
      if (/upper/.test(name)) { groups.add("push"); groups.add("pull"); return; }
      if (/lower/.test(name)) { groups.add("legs"); return; }
      if (/full/.test(name)) { groups.add("push"); groups.add("pull"); groups.add("legs"); return; }
      if (/chest/.test(name)) { groups.add("push"); return; }
      if (/back/.test(name)) { groups.add("pull"); return; }
      if (/shoulder|arm|bicep|tricep/.test(name)) { groups.add(focusMap[name] || "push"); return; }
    });
    return groups;
  };
  const todayData = getDataForDate(dateStr);
  const yData = getDataForDate(yStr);
  const todayTypes = _visibleTypes(todayData);
  const yTypes = _visibleTypes(yData);
  const HIGH_IMPACT = ["running", "weightlifting", "run"];
  const overlap = todayTypes.filter(t => yTypes.includes(t) && HIGH_IMPACT.includes(t));
  if (overlap.length > 0) {
    // For weightlifting, only warn if same muscle groups are targeted
    if (overlap[0] === "weightlifting") {
      const todayMuscles = _getMuscleGroups(todayData);
      const yMuscles = _getMuscleGroups(yData);
      const muscleOverlap = [...todayMuscles].some(m => yMuscles.has(m));
      if (muscleOverlap) {
        const shared = [...todayMuscles].filter(m => yMuscles.has(m));
        const label = shared.map(m => m.charAt(0).toUpperCase() + m.slice(1)).join(" / ");
        recommendations.push({
          type: "overlap",
          icon: "alertCircle",
          message: `Back-to-back ${label.toLowerCase()} sessions. Consider alternating muscle groups or adding recovery.`
        });
      }
    } else {
      const label = overlap[0] === "run" ? "running" : overlap[0];
      recommendations.push({
        type: "overlap",
        icon: "alertCircle",
        message: `Back-to-back ${label} sessions. Consider adding recovery.`
      });
    }
  }

  // 3. Rating-based: if recent ratings are mostly hard/crushed
  if (typeof loadWorkoutRatings === "function") {
    const ratings = loadWorkoutRatings();
    const recentRatings = Object.values(ratings)
      .filter(r => r.date)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5);
    const hardCount = recentRatings.filter(r => r.rating >= 4).length;
    if (recentRatings.length >= 3 && hardCount >= 3) {
      recommendations.push({
        type: "fatigue",
        icon: "thermometer",
        message: "Recent workouts have been tough. A deload or rest day may help you recover."
      });
    }
  }

  // 4. Tomorrow check — if tomorrow has a hard session scheduled and today is also hard
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tStr = localDateStr(tomorrow);
  const tomorrowTypes = typesByDate[tStr] || [];
  if (todayTypes.length > 0 && tomorrowTypes.length > 0 && streak >= 4) {
    recommendations.push({
      type: "upcoming",
      icon: "lightbulb",
      message: "Training scheduled tomorrow too. Listen to your body and rest if needed."
    });
  }

  return recommendations;
}

function buildRestDayBanner(dateStr) {
  const recs = getRestDayRecommendation(dateStr);
  if (!recs.length) return "";

  // Show the most important recommendation only (avoid banner overload)
  const rec = recs[0];
  const icon = ICONS[rec.icon] || ICONS.lightbulb;
  return `<div class="rest-intel-banner rest-intel-${rec.type}">
    <span class="rest-intel-icon">${icon}</span>
    <span class="rest-intel-msg">${rec.message}</span>
  </div>`;
}
