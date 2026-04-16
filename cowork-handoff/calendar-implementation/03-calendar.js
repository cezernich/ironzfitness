/* ═══════════════════════════════════════════════════════════════════
   calendar.js — IronZ Calendar (Week Carousel + Month Grid)
   Drop-in replacement for the old calendar rendering.
   Reads trainingPlan / workoutSchedule / events from localStorage.
   ═══════════════════════════════════════════════════════════════════ */

/* ── Discipline colors & intensity mapping ── */
const DISCIPLINE_COLORS = {
  run:            { bg: 'rgba(78,205,196,.18)',  stroke: '#4ecdc4', dot: 'c-low',  cls: 'run'  },
  swim:           { bg: 'rgba(108,92,231,.18)',  stroke: '#6c5ce7', dot: 'c-end',  cls: 'swim' },
  bike:           { bg: 'rgba(244,162,97,.18)',  stroke: '#f4a261', dot: 'c-med',  cls: 'bike' },
  strength:       { bg: 'rgba(230,57,70,.18)',   stroke: '#e63946', dot: 'c-high', cls: 'str'  },
  weightlifting:  { bg: 'rgba(230,57,70,.18)',   stroke: '#e63946', dot: 'c-high', cls: 'str'  },
  hyrox:          { bg: 'rgba(230,57,70,.18)',   stroke: '#e63946', dot: 'c-high', cls: 'str'  },
  yoga:           { bg: 'rgba(108,92,231,.18)',  stroke: '#6c5ce7', dot: 'c-end',  cls: 'swim' },
  rest:           { bg: 'transparent',           stroke: '#d0d0d0', dot: '',       cls: 'rest' },
};

const INTENSITY_RING = {
  low:       'il',
  moderate:  'im',
  medium:    'im',
  high:      'ih',
  endurance: 'ie',
};

const INTENSITY_DOT = {
  low:       'c-low',
  moderate:  'c-med',
  medium:    'c-med',
  high:      'c-high',
  endurance: 'c-end',
};

/* ── SVG icons per discipline ── */
const DISC_SVG = {
  run:  '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><path d="M7 20l3-7 2.5 2V20"/><path d="M17 8l-3 4-2.5-2-3 4"/></svg>',
  swim: '<svg viewBox="0 0 24 24"><path d="M2 16c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2c1.3 0 1.9.5 2.5 1"/><circle cx="12" cy="7" r="2"/><path d="M9 12l3-3 3 3"/></svg>',
  bike: '<svg viewBox="0 0 24 24"><circle cx="5.5" cy="17.5" r="3.5" fill="none"/><circle cx="18.5" cy="17.5" r="3.5" fill="none"/><path d="M15 6h2l3 8M5.5 17.5L8 10h4l2 4"/></svg>',
  str:  '<svg viewBox="0 0 24 24"><path d="M6 5v14M18 5v14M2 8h4M18 8h4M2 16h4M18 16h4M6 12h12"/></svg>',
};
const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
const CLOCK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
const PLAY_SVG  = '<svg viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg>';
const CHEV_SVG  = '<svg class="det-chev" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>';

/* ── State ── */
let calMode     = 'week';   // 'week' | 'month'
let calWeekStart = null;     // Date: Monday of displayed week
let calMonth     = null;     // { year, month } for month view
let selectedDate = null;     // Date object — currently highlighted day

/* ── Helpers ── */
function _toDateStr(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}
function _parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function _sameDay(a, b) {
  return a && b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}
function _mondayOf(d) {
  const r = new Date(d);
  const day = r.getDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1) - day;
  r.setDate(r.getDate() + diff);
  r.setHours(0, 0, 0, 0);
  return r;
}
function _addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function _resolveDiscipline(disc) {
  if (!disc) return DISCIPLINE_COLORS.rest;
  const key = disc.toLowerCase().replace(/[^a-z]/g, '');
  // Map common aliases
  if (key.includes('run') || key.includes('jog'))  return DISCIPLINE_COLORS.run;
  if (key.includes('swim'))                         return DISCIPLINE_COLORS.swim;
  if (key.includes('bike') || key.includes('cycl')) return DISCIPLINE_COLORS.bike;
  if (key.includes('strength') || key.includes('weight') || key.includes('lift'))
    return DISCIPLINE_COLORS.strength;
  if (key.includes('hyrox'))                        return DISCIPLINE_COLORS.hyrox;
  if (key.includes('yoga') || key.includes('stretch'))
    return DISCIPLINE_COLORS.yoga;
  return DISCIPLINE_COLORS.run; // fallback
}

/* ── Data access ── */
function _getWorkoutsForDate(dateStr) {
  // Try generated_plans / trainingPlan from localStorage
  const sources = ['trainingPlan', 'workoutSchedule'];
  let workouts = [];

  for (const key of sources) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        workouts = workouts.concat(
          data.filter(w => w.date === dateStr || w.scheduledDate === dateStr)
        );
      }
    } catch (e) { /* ignore parse errors */ }
  }

  // Also check events (calendar items)
  try {
    const evts = JSON.parse(localStorage.getItem('events') || '[]');
    if (Array.isArray(evts)) {
      workouts = workouts.concat(
        evts.filter(e => e.date === dateStr && e.type !== 'restriction')
      );
    }
  } catch (e) {}

  return workouts;
}

function _isCompleted(dateStr) {
  // Check if all workouts for a past date are marked done
  try {
    const log = JSON.parse(localStorage.getItem('workoutLog') || '[]');
    if (Array.isArray(log)) {
      return log.some(l => l.date === dateStr && l.completed);
    }
  } catch (e) {}
  return false;
}

function _totalDuration(workouts) {
  let mins = 0;
  for (const w of workouts) {
    mins += (w.durationMin || w.duration || 0);
  }
  return mins;
}

function _formatDuration(mins) {
  if (mins <= 0) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/* ══════════════════════════════════════════════════
   WEEK VIEW — Carousel
   ══════════════════════════════════════════════════ */
function _renderWeekView() {
  const grid = document.getElementById('calendar-grid');
  const bar  = document.getElementById('week-overview-bar');
  const label = document.getElementById('calendar-month-label');
  if (!grid) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sun = _addDays(calWeekStart, 6);

  // Header label: "May 4 – 10, 2026"
  const m1 = MONTH_NAMES[calWeekStart.getMonth()];
  const m2 = MONTH_NAMES[sun.getMonth()];
  const sameMo = calWeekStart.getMonth() === sun.getMonth();
  if (label) {
    label.textContent = sameMo
      ? `${m1} ${calWeekStart.getDate()} – ${sun.getDate()}, ${sun.getFullYear()}`
      : `${m1} ${calWeekStart.getDate()} – ${m2} ${sun.getDate()}, ${sun.getFullYear()}`;
  }

  // Show/hide "today" button
  const thisWeekBtn = document.getElementById('cal-this-week-btn');
  const realMonday = _mondayOf(today);
  if (thisWeekBtn) {
    thisWeekBtn.style.display = _sameDay(calWeekStart, realMonday) ? 'none' : 'flex';
  }

  // Toggle button state
  const toggleBtn = document.getElementById('cal-zoom-btn');
  if (toggleBtn) toggleBtn.classList.remove('active');

  // Build carousel
  let weekMins = 0;
  let weekSessions = 0;
  let html = '<div class="car-w"><div class="car" id="cal-carousel">';

  for (let i = 0; i < 7; i++) {
    const d = _addDays(calWeekStart, i);
    const ds = _toDateStr(d);
    const isToday = _sameDay(d, today);
    const isSel = _sameDay(d, selectedDate);
    const workouts = _getWorkoutsForDate(ds);
    const completed = _isCompleted(ds);
    const isPast = d < today;
    const dur = _totalDuration(workouts);
    weekMins += dur;
    weekSessions += workouts.length;

    if (isToday) {
      // CENTER CARD
      html += `<div class="dc c" data-date="${ds}" onclick="selectCalDate('${ds}')">`;
      html += `<div class="c-top"><div class="c-dl">${DAY_NAMES[i]}</div><div class="c-pill">Today</div></div>`;
      html += `<div class="c-num">${d.getDate()}</div>`;

      if (workouts.length > 0) {
        html += '<div class="wo-cir">';
        for (const w of workouts.slice(0, 3)) {
          const dc = _resolveDiscipline(w.discipline || w.type);
          const svgKey = dc.cls === 'rest' ? 'run' : dc.cls;
          const intCls = INTENSITY_RING[(w.intensity || 'low').toLowerCase()] || 'il';
          html += `<div class="wc ${dc.cls} ${intCls}">${DISC_SVG[svgKey] || DISC_SVG.run}</div>`;
        }
        html += '</div>';
        if (dur > 0) html += `<div class="c-time">${_formatDuration(dur)} total</div>`;
      } else {
        html += '<div class="s-rest" style="color:rgba(255,255,255,.4)">REST</div>';
      }
      html += '</div>';

    } else {
      // SIDE CARD
      const selCls = isSel ? ' selected' : '';
      html += `<div class="dc s${selCls}" data-date="${ds}" onclick="selectCalDate('${ds}')">`;
      html += `<div class="s-lb">${DAY_NAMES[i]}</div>`;
      html += `<div class="s-nm">${d.getDate()}</div>`;
      html += '<div class="s-dots">';
      if (workouts.length > 0) {
        for (const w of workouts.slice(0, 3)) {
          const intDot = INTENSITY_DOT[(w.intensity || 'low').toLowerCase()] || 'c-low';
          html += `<div class="s-dot ${intDot}"></div>`;
        }
      } else {
        html += '<span class="s-rest">REST</span>';
      }
      html += '</div>';
      if (isPast && completed && workouts.length > 0) {
        html += `<div class="s-check">${CHECK_SVG}</div>`;
      }
      html += '</div>';
    }
  }

  html += '</div></div>'; // close .car and .car-w

  grid.innerHTML = html;

  // Scroll carousel to center today's card
  requestAnimationFrame(() => {
    const carousel = document.getElementById('cal-carousel');
    const center = carousel && carousel.querySelector('.dc.c');
    if (center && carousel) {
      carousel.scrollLeft = center.offsetLeft - (carousel.offsetWidth / 2) + (center.offsetWidth / 2);
    }
  });

  // Week overview bar
  if (bar) {
    bar.innerHTML = `
      <div class="wk-bar">
        <span class="wk-lb">This Week</span>
        <div class="wk-stats">
          <span class="wk-st">${CLOCK_SVG} ${_formatDuration(weekMins) || '0m'}</span>
          <span class="wk-st">${DISC_SVG.run} ${weekSessions}</span>
        </div>
      </div>`;
  }
}

/* ══════════════════════════════════════════════════
   MONTH VIEW — Grid
   ══════════════════════════════════════════════════ */
function _renderMonthView() {
  const grid = document.getElementById('calendar-grid');
  const bar  = document.getElementById('week-overview-bar');
  const label = document.getElementById('calendar-month-label');
  if (!grid) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const year = calMonth.year;
  const month = calMonth.month; // 0-indexed

  // Header label
  if (label) {
    label.textContent = `${MONTH_NAMES[month]} ${year}`;
  }

  // Show/hide today button
  const thisWeekBtn = document.getElementById('cal-this-week-btn');
  if (thisWeekBtn) {
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
    thisWeekBtn.style.display = isCurrentMonth ? 'none' : 'flex';
  }

  // Toggle button active
  const toggleBtn = document.getElementById('cal-zoom-btn');
  if (toggleBtn) toggleBtn.classList.add('active');

  // Calculate grid: start from Monday of the week containing the 1st
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth  = new Date(year, month + 1, 0);
  const gridStart = _mondayOf(firstOfMonth);

  // We need enough rows to cover the month (5 or 6 weeks)
  const totalDays = Math.ceil(
    (lastOfMonth.getTime() - gridStart.getTime()) / (86400000)
  ) + 1;
  const rows = Math.ceil(totalDays / 7);

  let monthMins = 0;
  let monthSessions = 0;

  let html = '<div class="month-grid">';
  html += '<div class="month-dow">';
  for (const dn of DAY_NAMES) html += `<span>${dn}</span>`;
  html += '</div>';
  html += '<div class="month-days">';

  for (let i = 0; i < rows * 7; i++) {
    const d = _addDays(gridStart, i);
    const ds = _toDateStr(d);
    const isToday = _sameDay(d, today);
    const isSel = _sameDay(d, selectedDate);
    const inMonth = d.getMonth() === month;
    const workouts = _getWorkoutsForDate(ds);
    const completed = _isCompleted(ds);
    const isPast = d < today;

    if (inMonth) {
      const dur = _totalDuration(workouts);
      monthMins += dur;
      monthSessions += workouts.length;
    }

    let cls = 'md';
    if (isToday) cls += ' today';
    if (isSel) cls += ' selected';
    if (!inMonth) cls += ' other-month';

    html += `<div class="${cls}" data-date="${ds}" onclick="selectCalDate('${ds}')">`;
    html += `<div class="md-num">${d.getDate()}</div>`;

    if (workouts.length > 0) {
      html += '<div class="md-dots">';
      for (const w of workouts.slice(0, 3)) {
        const intDot = INTENSITY_DOT[(w.intensity || 'low').toLowerCase()] || 'c-low';
        html += `<div class="md-dot ${intDot}"></div>`;
      }
      html += '</div>';
      if (isPast && completed && inMonth) {
        html += `<div class="md-check">${CHECK_SVG}</div>`;
      }
    } else if (inMonth) {
      html += '<div class="md-rest">REST</div>';
    }

    html += '</div>';
  }

  html += '</div></div>'; // close .month-days and .month-grid
  grid.innerHTML = html;

  // Month overview bar
  if (bar) {
    bar.innerHTML = `
      <div class="wk-bar">
        <span class="wk-lb">${MONTH_NAMES[month]} Total</span>
        <div class="wk-stats">
          <span class="wk-st">${CLOCK_SVG} ${_formatDuration(monthMins) || '0m'}</span>
          <span class="wk-st">${DISC_SVG.run} ${monthSessions}</span>
        </div>
      </div>`;
  }
}

/* ══════════════════════════════════════════════════
   DAY DETAIL — Renders below the calendar card
   ══════════════════════════════════════════════════ */
function _renderDayDetail() {
  const container = document.getElementById('day-detail-content');
  if (!container) return;

  const ds = _toDateStr(selectedDate);
  const workouts = _getWorkoutsForDate(ds);
  const dur = _totalDuration(workouts);

  // Format date nicely
  const opts = { month: 'long', day: 'numeric', year: 'numeric' };
  const dateLabel = selectedDate.toLocaleDateString('en-US', opts);

  if (workouts.length === 0) {
    container.innerHTML = `
      <div class="det-hdr">
        <span class="det-dt">${dateLabel}</span>
      </div>
      <div style="padding:20px 16px;text-align:center;color:#bbb;font-size:13px;">
        Rest day — no workouts scheduled
      </div>`;
    return;
  }

  let html = `
    <div class="det-hdr">
      <span class="det-dt">${dateLabel}</span>
      <span class="det-tm">${CLOCK_SVG} ${_formatDuration(dur)}</span>
    </div>`;

  for (let idx = 0; idx < workouts.length; idx++) {
    const w = workouts[idx];
    const dc = _resolveDiscipline(w.discipline || w.type);
    const svgKey = dc.cls === 'rest' ? 'run' : dc.cls;
    const intDot = INTENSITY_DOT[(w.intensity || 'low').toLowerCase()] || 'c-low';
    const name = w.name || w.sessionType || w.discipline || 'Workout';
    const descParts = [];
    if (w.durationMin || w.duration) descParts.push(_formatDuration(w.durationMin || w.duration));
    if (w.zone) descParts.push(w.zone);
    if (w.intensity) descParts.push(w.intensity);
    if (w.distance) descParts.push(w.distance);
    const desc = descParts.join(' · ');

    html += `<div class="det-item${idx === 0 ? ' open' : ''}" onclick="this.classList.toggle('open')">`;
    html += `<div class="det-row">`;
    html += `<div class="det-ic ${dc.cls}">${DISC_SVG[svgKey] || DISC_SVG.run}</div>`;
    html += `<div class="det-info"><div class="det-nm">${name}</div>`;
    if (desc) html += `<div class="det-desc">${desc}</div>`;
    html += `</div>`;
    html += `<div class="det-int ${intDot}"></div>`;
    html += CHEV_SVG;
    html += `</div>`; // close det-row

    // Expandable exercise list
    if (w.exercises && Array.isArray(w.exercises) && w.exercises.length > 0) {
      html += '<div class="det-expand"><div class="ex-list">';
      for (const ex of w.exercises) {
        html += `<div class="ex-row">
          <span class="ex-name">${ex.name || ex.exercise || ''}</span>
          <span class="ex-sets">${ex.sets || ex.reps || ex.duration || ''}</span>
        </div>`;
      }
      html += '</div></div>';
    } else {
      html += '<div class="det-expand"></div>';
    }

    html += '</div>'; // close det-item
  }

  // Start button for first workout
  const firstName = workouts[0].name || workouts[0].sessionType || 'Workout';
  html += `<button class="det-start" onclick="startWorkout('${ds}', 0)">${PLAY_SVG} Start ${firstName}</button>`;

  container.innerHTML = html;
}

/* ══════════════════════════════════════════════════
   PUBLIC API — called from HTML buttons
   ══════════════════════════════════════════════════ */
function renderCalendar() {
  if (calMode === 'week') {
    _renderWeekView();
  } else {
    _renderMonthView();
  }
  _renderDayDetail();
}

function selectCalDate(dateStr) {
  selectedDate = _parseDate(dateStr);
  renderCalendar();
}

function calPrev() {
  if (calMode === 'week') {
    calWeekStart = _addDays(calWeekStart, -7);
  } else {
    calMonth.month--;
    if (calMonth.month < 0) {
      calMonth.month = 11;
      calMonth.year--;
    }
  }
  renderCalendar();
}

function calNext() {
  if (calMode === 'week') {
    calWeekStart = _addDays(calWeekStart, 7);
  } else {
    calMonth.month++;
    if (calMonth.month > 11) {
      calMonth.month = 0;
      calMonth.year++;
    }
  }
  renderCalendar();
}

function goToThisWeek() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  selectedDate = today;
  calWeekStart = _mondayOf(today);
  calMonth = { year: today.getFullYear(), month: today.getMonth() };
  renderCalendar();
}

function toggleCalendarMode() {
  if (calMode === 'week') {
    calMode = 'month';
    // Derive month from current week
    const mid = _addDays(calWeekStart, 3);
    calMonth = { year: mid.getFullYear(), month: mid.getMonth() };
  } else {
    calMode = 'week';
    // Derive week from selectedDate or today
    calWeekStart = _mondayOf(selectedDate || new Date());
  }
  renderCalendar();
}

function toggleCalHelp() {
  const tip = document.getElementById('cal-help-tooltip');
  if (tip) tip.style.display = tip.style.display === 'block' ? 'none' : 'block';
}

function startWorkout(dateStr, idx) {
  // Hook into live-tracker if available
  if (typeof openLiveTracker === 'function') {
    openLiveTracker(dateStr, idx);
  } else {
    console.log('Start workout:', dateStr, idx);
  }
}

/* ── Swipe gesture support for week carousel ── */
function _initSwipeGestures() {
  const grid = document.getElementById('calendar-grid');
  if (!grid) return;

  let startX = 0;
  let startY = 0;

  grid.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  grid.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;

    // Only trigger on horizontal swipes (not scrolls)
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (calMode === 'week') {
        // Swiping the whole week (not individual cards — cards scroll in carousel)
        // This is a fallback; the carousel itself handles per-card swiping
      } else {
        // In month view, swipe to change month
        if (dx > 0) calPrev();
        else calNext();
      }
    }
  }, { passive: true });
}

/* ── Init ── */
function initCalendar() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  selectedDate = today;
  calWeekStart = _mondayOf(today);
  calMonth = { year: today.getFullYear(), month: today.getMonth() };

  renderCalendar();
  _initSwipeGestures();
}

// Auto-init when DOM is ready (app.js may also call initCalendar)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCalendar);
} else {
  // DOM already loaded — defer to let other scripts register first
  setTimeout(initCalendar, 0);
}
