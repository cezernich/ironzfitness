// hydration.js — Water tracking with visual bottle fill and smart daily targets

/* =====================================================================
   BEVERAGE TYPES & COEFFICIENTS
   ===================================================================== */

const BEVERAGE_TYPES = {
  water:        { label: "Water",        coeff: 1.0,  icon: "\u{1F4A7}" },
  sports_drink: { label: "Sports Drink", coeff: 1.0,  icon: "\u26A1" },
  tea:          { label: "Tea",          coeff: 0.85, icon: "\u{1F375}" },
  coffee:       { label: "Coffee",       coeff: 0.75, icon: "\u2615" }
};

const WORKOUT_HYDRATION_BONUS = {
  strength: 20, hiit: 20, crossfit: 20, weights: 20,
  run: 24, bike: 24, swim: 24, brick: 24, cycling: 24, running: 24,
  yoga: 12, bodyweight: 12, stretch: 12, flexibility: 12
};

/* =====================================================================
   SETTINGS & TARGETS
   ===================================================================== */

function getHydrationSettings() {
  try {
    return JSON.parse(localStorage.getItem("hydrationSettings") || "{}");
  } catch { return {}; }
}

function saveHydrationSettingsData(settings) {
  localStorage.setItem("hydrationSettings", JSON.stringify(settings)); if (typeof DB !== 'undefined') DB.syncKey('hydrationSettings');
}

function getBaseHydrationTarget() {
  const settings = getHydrationSettings();
  if (settings.dailyTargetOz) return settings.dailyTargetOz;

  let weight = 160;
  try {
    const profile = JSON.parse(localStorage.getItem("profile") || "{}");
    weight = parseFloat(profile.weight) || 160;
  } catch {}

  return Math.round(weight * 0.6);
}

function getTodayWorkoutInfo() {
  return getWorkoutInfoForDate(getHydrationDate());
}

function getHydrationBreakdown() {
  return getHydrationBreakdownForDate(getHydrationDate());
}

function getHydrationTarget() {
  return getHydrationBreakdown().totalOz;
}

function getBottleSize() {
  const settings = getHydrationSettings();
  // Prefer the first named bottle when the user has set some up — that
  // becomes the "default bottle" the progress display (N / target
  // bottles) normalizes against. Fall back to the legacy bottleSize
  // setting, then to 12oz.
  const bottles = Array.isArray(settings.bottles) ? settings.bottles : [];
  if (bottles.length && bottles[0].size) return bottles[0].size;
  return settings.bottleSize || 12;
}

/** Returns the list of user-defined named bottles. Empty if the user
 *  hasn't set any up yet — in that case the UI falls back to the legacy
 *  "+ My Bottle" button. */
function getNamedBottles() {
  const settings = getHydrationSettings();
  return Array.isArray(settings.bottles) ? settings.bottles : [];
}

function saveNamedBottles(bottles) {
  const settings = getHydrationSettings();
  settings.bottles = bottles;
  saveHydrationSettingsData(settings);
}

/** Log one named bottle by id — thin wrapper around logWaterOz that
 *  keeps the call site on the hydration card simple. */
function logNamedBottle(bottleId) {
  const bottles = getNamedBottles();
  const b = bottles.find(x => x.id === bottleId);
  if (!b) return;
  logWaterOz(parseFloat(b.size) || 0);
}

function isHydrationEnabled() {
  return localStorage.getItem("hydrationEnabled") !== "0";
}

function setHydrationEnabled(enabled) {
  localStorage.setItem("hydrationEnabled", enabled ? "1" : "0"); if (typeof DB !== 'undefined') DB.syncKey('hydrationEnabled');
  if (typeof trackEvent === "function") trackEvent("feature_toggled", { feature: "hydration", enabled });
  if (typeof syncFeatureToggles === "function") syncFeatureToggles();
  applyHydrationToggle();
}

function applyHydrationToggle() {
  const enabled = isHydrationEnabled();
  const card = document.getElementById("hydration-card");
  const toggle = document.getElementById("pref-hydration-toggle");
  if (card) card.style.display = enabled ? "" : "none";
  if (toggle) toggle.checked = enabled;
}

/* =====================================================================
   DAILY LOG
   ===================================================================== */

function getHydrationLog() {
  try {
    return JSON.parse(localStorage.getItem("hydrationLog") || "{}");
  } catch { return {}; }
}

/** Normalize a day's log entry to the new format. Handles legacy number format. */
function normalizeDayLog(entry) {
  if (entry == null) return { total: 0, beverages: [] };
  if (typeof entry === "number") return { total: entry, beverages: [{ type: "water", count: entry }] };
  return entry;
}

/** Get bottle count from a log entry (handles both old number and new object format) */
function getLogBottles(entry) {
  if (entry == null) return 0;
  if (typeof entry === "number") return entry;
  return entry.total || 0;
}

function getTodayHydration() {
  return getHydrationForDate(getHydrationDate()).total;
}

/** Get effective oz for today accounting for beverage coefficients */
function getTodayEffectiveOz() {
  return getEffectiveOzForDate(getHydrationDate());
}

let _selectedBeverage = "water";
let _hydrationDate = null; // null = today

/** Get the currently selected hydration date (defaults to today) */
function getHydrationDate() {
  return _hydrationDate || getTodayString();
}

/** Set the hydration date and re-render */
function setHydrationDate(dateStr) {
  _hydrationDate = dateStr || null;
  renderHydration();
}

/** Navigate hydration date by offset days (-1 = yesterday, +1 = tomorrow) */
function shiftHydrationDate(offset) {
  const current = getHydrationDate();
  const d = new Date(current + "T12:00:00");
  d.setDate(d.getDate() + offset);
  const today = getTodayString();
  const newDate = d.toISOString().slice(0, 10);
  // Don't allow future dates
  if (newDate > today) return;
  setHydrationDate(newDate === today ? null : newDate);
}

/** Get hydration data for a specific date */
function getHydrationForDate(dateStr) {
  const log = getHydrationLog();
  return normalizeDayLog(log[dateStr]);
}

/** Get effective oz for a specific date accounting for beverage coefficients */
function getEffectiveOzForDate(dateStr) {
  const day = getHydrationForDate(dateStr);
  const bottleSize = getBottleSize();
  let effectiveOz = 0;
  for (const b of day.beverages) {
    const coeff = (BEVERAGE_TYPES[b.type] || BEVERAGE_TYPES.water).coeff;
    effectiveOz += b.count * bottleSize * coeff;
  }
  return Math.round(effectiveOz);
}

/** Get workout bonus for a specific date */
function getWorkoutInfoForDate(dateStr) {
  try {
    const schedule = JSON.parse(localStorage.getItem("workoutSchedule") || "[]");
    const dayWorkouts = schedule.filter(w => w.date === dateStr);
    if (dayWorkouts.length === 0) return null;
    let bestBonus = 0;
    let bestName = "";
    let bestDurationMin = 0;
    for (const w of dayWorkouts) {
      const t = (w.type || "").toLowerCase();
      const bonus = WORKOUT_HYDRATION_BONUS[t] || 16;
      if (bonus > bestBonus) {
        bestBonus = bonus;
        bestName = w.sessionName || w.type || "workout";
        const d = parseFloat(w.duration);
        bestDurationMin = isFinite(d) && d > 0 ? d : 0;
      }
    }
    return { bonusOz: bestBonus, sessionName: bestName, durationMin: bestDurationMin };
  } catch { return null; }
}

/** Get hydration breakdown for a specific date */
function getHydrationBreakdownForDate(dateStr) {
  const baseOz = getBaseHydrationTarget();
  const workoutInfo = getWorkoutInfoForDate(dateStr);
  const bonusOz = workoutInfo ? workoutInfo.bonusOz : 0;
  let saunaBonus = 0;
  try {
    const log = JSON.parse(localStorage.getItem("hydrationLog") || "{}");
    saunaBonus = (log[dateStr] && log[dateStr].saunaBonus) || 0;
  } catch {}
  const totalBonus = bonusOz + saunaBonus;
  let reason = null;
  if (workoutInfo && saunaBonus > 0) {
    reason = `${baseOz} base + ${bonusOz} workout + ${saunaBonus} sauna`;
  } else if (workoutInfo) {
    reason = `${baseOz} base + ${bonusOz} for your ${workoutInfo.sessionName}`;
  } else if (saunaBonus > 0) {
    reason = `${baseOz} base + ${saunaBonus} for sauna session`;
  }
  return { baseOz, bonusOz: totalBonus, totalOz: baseOz + totalBonus, reason };
}

function logWater(beverageType) {
  const type = beverageType || _selectedBeverage || "water";
  const log = getHydrationLog();
  const dateStr = getHydrationDate();
  const day = normalizeDayLog(log[dateStr]);

  day.total++;
  const existing = day.beverages.find(b => b.type === type);
  if (existing) existing.count++;
  else day.beverages.push({ type, count: 1 });

  log[dateStr] = day;
  localStorage.setItem("hydrationLog", JSON.stringify(log)); if (typeof DB !== 'undefined') DB.syncKey('hydrationLog');
  if (typeof trackEvent === "function") {
    let target = null;
    try { target = getHydrationBreakdownForDate(dateStr)?.totalOz || null; } catch {}
    trackEvent("hydration_logged", { beverage: type, bottles_today: day.total, target });
  }

  renderHydration();

  // Refresh day detail if visible
  if (typeof selectedDate !== "undefined" && selectedDate && typeof renderDayDetail === "function") {
    renderDayDetail(selectedDate);
  }

  // Check if target met (only animate for today)
  if (dateStr === getTodayString()) {
    const effectiveOz = getEffectiveOzForDate(dateStr);
    const targetOz = getHydrationBreakdownForDate(dateStr).totalOz;
    const bottleSize = getBottleSize();
    const prevOz = effectiveOz - bottleSize * (BEVERAGE_TYPES[type] || BEVERAGE_TYPES.water).coeff;
    if (effectiveOz >= targetOz && prevOz < targetOz) {
      playHydrationGoalAnimation();
    }
  }
}

function logWaterOz(oz) {
  const bottleSize = getBottleSize();
  const bottles = oz / bottleSize;
  const type = _selectedBeverage || "water";
  const log = getHydrationLog();
  const dateStr = getHydrationDate();
  const day = normalizeDayLog(log[dateStr]);

  day.total += bottles;
  const existing = day.beverages.find(b => b.type === type);
  if (existing) existing.count += bottles;
  else day.beverages.push({ type, count: bottles });

  log[dateStr] = day;
  localStorage.setItem("hydrationLog", JSON.stringify(log)); if (typeof DB !== 'undefined') DB.syncKey('hydrationLog');
  renderHydration();

  if (typeof selectedDate !== "undefined" && selectedDate && typeof renderDayDetail === "function") {
    renderDayDetail(selectedDate);
  }

  if (dateStr === getTodayString()) {
    const effectiveOz = getEffectiveOzForDate(dateStr);
    const targetOz = getHydrationBreakdownForDate(dateStr).totalOz;
    const coeff = (BEVERAGE_TYPES[type] || BEVERAGE_TYPES.water).coeff;
    const prevOz = effectiveOz - oz * coeff;
    if (effectiveOz >= targetOz && prevOz < targetOz) {
      playHydrationGoalAnimation();
    }
  }

  // Close quick add panel
  const panel = document.getElementById("hydration-quickadd");
  if (panel) panel.style.display = "none";
}

function logWaterCustom() {
  const input = document.getElementById("hydration-custom-oz");
  const oz = parseFloat(input?.value);
  if (!oz || oz <= 0) return;
  logWaterOz(oz);
  if (input) input.value = "";
}

function toggleQuickAddWater() {
  const panel = document.getElementById("hydration-quickadd");
  if (panel) panel.style.display = panel.style.display === "none" ? "" : "none";
}

function undoWater() {
  const log = getHydrationLog();
  const dateStr = getHydrationDate();
  const day = normalizeDayLog(log[dateStr]);
  if (day.total <= 0) return;

  day.total--;
  for (let i = day.beverages.length - 1; i >= 0; i--) {
    if (day.beverages[i].count > 0) {
      day.beverages[i].count--;
      if (day.beverages[i].count === 0) day.beverages.splice(i, 1);
      break;
    }
  }

  log[dateStr] = day;
  localStorage.setItem("hydrationLog", JSON.stringify(log)); if (typeof DB !== 'undefined') DB.syncKey('hydrationLog');
  renderHydration();

  if (typeof selectedDate !== "undefined" && selectedDate && typeof renderDayDetail === "function") {
    renderDayDetail(selectedDate);
  }
}

/* =====================================================================
   RENDERING
   ===================================================================== */

function renderHydration() {
  if (!isHydrationEnabled()) return;

  const dateStr = getHydrationDate();
  const today = getTodayString();
  const isToday = dateStr === today;

  const bottleSize = getBottleSize();
  const breakdown = getHydrationBreakdown();
  const targetOz = breakdown.totalOz;
  const bottles = getTodayHydration();
  const effectiveOz = getTodayEffectiveOz();
  const bottlesNeeded = Math.ceil(targetOz / bottleSize);

  // Date navigator
  _renderHydrationDateNav(dateStr, isToday);

  // Current / target display
  const currentEl = document.getElementById("hydration-current");
  const targetEl = document.getElementById("hydration-target-display");
  const ozEl = document.getElementById("hydration-oz-display");
  if (currentEl) currentEl.textContent = bottles;
  if (targetEl) targetEl.textContent = bottlesNeeded;
  if (ozEl) ozEl.textContent = `${effectiveOz} / ${targetOz} oz`;

  // My Bottle button(s). If the user has named bottles set up, replace
  // the single "+ My Bottle" button with a row of named-bottle buttons
  // so they can tap the exact bottle they just drank. Otherwise fall
  // back to the legacy single button + bottleSize label.
  _renderBottleButtons();

  // Undo button
  const undoBtn = document.getElementById("hydration-undo-btn");
  if (undoBtn) undoBtn.style.display = bottles > 0 ? "" : "none";

  // Fill animation — use effective oz ratio
  const pctForVisual = Math.min(effectiveOz / targetOz, 1);
  updateHydrationVisualPct(pctForVisual);

  // Target breakdown context
  renderHydrationContext(breakdown);

  // Beverage picker
  renderBeveragePicker();

  // Smart timing tip (only for today)
  if (isToday) {
    renderHydrationTimingTip();
  } else {
    const tipEl = document.getElementById("hydration-tip");
    if (tipEl) tipEl.style.display = "none";
  }
}

function _renderHydrationDateNav(dateStr, isToday) {
  let nav = document.getElementById("hydration-date-nav");
  if (!nav) {
    const header = document.querySelector("#hydration-card .hydration-header");
    if (!header) return;
    nav = document.createElement("div");
    nav.id = "hydration-date-nav";
    nav.className = "hydration-date-nav";
    header.insertAdjacentElement("afterend", nav);
  }
  // Hide the date nav when showing today — hydration is always "today"
  nav.style.display = isToday ? "none" : "";

  // Format date label
  const d = new Date(dateStr + "T12:00:00");
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const label = isToday ? "Today" : `${dayNames[d.getDay()]}, ${monthNames[d.getMonth()]} ${d.getDate()}`;

  nav.innerHTML = `
    <button class="hydration-nav-btn" onclick="shiftHydrationDate(-1)" title="Previous day">&lsaquo;</button>
    <span class="hydration-nav-label">${label}</span>
    <button class="hydration-nav-btn" onclick="shiftHydrationDate(1)" title="Next day" ${isToday ? "disabled" : ""}>&rsaquo;</button>
    ${!isToday ? `<button class="hydration-nav-today-btn" onclick="setHydrationDate(null)">Today</button>` : ""}
  `;
}

function updateHydrationVisual(current, target) {
  updateHydrationVisualPct(Math.min(current / target, 1));
}

function updateHydrationVisualPct(pct) {
  // Horizontal progress bar (primary visual)
  const bar = document.getElementById("hydration-bar-fill");
  if (bar) {
    bar.style.width = Math.min(pct * 100, 100) + "%";
    bar.style.background = pct >= 1 ? "var(--color-success, #22c55e)" : "var(--color-accent)";
  }
  // Legacy SVG fill (kept for animation JS that targets it)
  const rect = document.getElementById("hydration-fill-rect");
  if (rect) {
    const fillHeight = 135 * pct;
    rect.setAttribute("y", 155 - fillHeight);
    rect.setAttribute("height", fillHeight);
  }
}

function renderHydrationContext(breakdown) {
  const el = document.getElementById("hydration-context");
  if (!el) return;
  if (breakdown.bonusOz > 0) {
    el.style.display = "";
    // Unambiguous phrasing: show base → total so the user can see the
    // bonus has already been added. The old "Target is 133oz today (+16oz
    // for your Long Run)" read as "target WAS 133, adding 16 now".
    const who = escHtml(breakdown.reason ? breakdown.reason.split("for your ").pop() : "workout");
    el.innerHTML = `<span class="hydration-transparency-note">${typeof ICONS !== "undefined" ? ICONS.lightbulb : ""} Today's target: ${breakdown.totalOz}oz &mdash; ${breakdown.baseOz}oz base + ${breakdown.bonusOz}oz for your ${who}.</span>`;
  } else {
    // Suppress the base-target note on rest days — it takes up a line of
    // vertical space with information the user has already seen.
    el.style.display = "none";
    el.innerHTML = "";
  }
}

function _renderBottleButtons() {
  const legacyBtn = document.getElementById("hydration-mybottle-btn");
  if (!legacyBtn) return;

  const bottles = getNamedBottles();
  const bottleSize = getBottleSize();

  // Find or create the container that holds named bottle buttons. It
  // sits in place of the legacy button; when there are no named bottles
  // we hide it and show the legacy button instead.
  let container = document.getElementById("hydration-bottle-buttons");
  if (!container) {
    container = document.createElement("div");
    container.id = "hydration-bottle-buttons";
    container.className = "hydration-bottle-buttons";
    legacyBtn.insertAdjacentElement("afterend", container);
  }

  if (!bottles.length) {
    // Legacy mode — keep the single "+ My Bottle" button and hide the
    // multi-bottle container.
    legacyBtn.style.display = "";
    legacyBtn.textContent = `+ My Bottle (${bottleSize}oz)`;
    container.style.display = "none";
    container.innerHTML = "";
    return;
  }

  // Multi-bottle mode — hide the legacy button, render a grid of named
  // bottles. Each button logs its bottle's oz via logNamedBottle.
  legacyBtn.style.display = "none";
  container.style.display = "";
  container.innerHTML = bottles.map(b => {
    const name = escHtml(b.name || "Bottle");
    const size = parseFloat(b.size) || 0;
    return `<button class="btn-primary hydration-bottle-btn" onclick="logNamedBottle('${escHtml(b.id)}')">+ ${name} (${size}oz)</button>`;
  }).join("");
}

function renderBeveragePicker() {
  let picker = document.getElementById("hydration-beverage-picker");
  if (!picker) {
    // Insert before the primary action button
    const btn = document.getElementById("hydration-mybottle-btn");
    if (!btn) return;
    picker = document.createElement("div");
    picker.id = "hydration-beverage-picker";
    picker.className = "hydration-beverage-picker";
    btn.insertAdjacentElement("beforebegin", picker);
  }

  let html = "";
  for (const [key, bev] of Object.entries(BEVERAGE_TYPES)) {
    const active = key === _selectedBeverage ? " active" : "";
    const coeffNote = bev.coeff < 1 ? ` (${Math.round(bev.coeff * 100)}%)` : "";
    html += `<button class="hydration-bev-btn${active}" onclick="_selectedBeverage='${key}';renderBeveragePicker()" title="${escHtml(bev.label)}${coeffNote}">${bev.icon} ${escHtml(bev.label)}</button>`;
  }
  picker.innerHTML = html;
}

function renderHydrationTimingTip() {
  const tipEl = document.getElementById("hydration-tip");
  const tipText = document.getElementById("hydration-tip-text");
  if (!tipEl || !tipText) return;

  const workoutInfo = getTodayWorkoutInfo();
  if (!workoutInfo) {
    tipEl.style.display = "none";
    return;
  }

  tipEl.style.display = "";
  const now = new Date();
  const hour = now.getHours();

  // Smart timing based on time of day and workout. If we know the planned
  // duration, tailor the electrolyte guidance instead of hedging with "if
  // it's over 60 min" — the app already knows how long the session is.
  const dur = workoutInfo.durationMin || 0;
  let tip;
  if (hour < 10) {
    tip = `Training day: front-load hydration before your ${workoutInfo.sessionName}. Aim for ${Math.round(workoutInfo.bonusOz * 0.6)}oz before you start.`;
  } else if (hour < 16) {
    let electrolyteClause;
    if (dur >= 90) {
      electrolyteClause = `Add electrolytes during your ${dur}-min ${workoutInfo.sessionName}.`;
    } else if (dur > 60) {
      electrolyteClause = `Add electrolytes during your ${dur}-min ${workoutInfo.sessionName}.`;
    } else if (dur > 0) {
      electrolyteClause = `Water is fine for your ${dur}-min ${workoutInfo.sessionName} — no electrolytes needed.`;
    } else {
      electrolyteClause = `Consider electrolytes during your ${workoutInfo.sessionName} if it's over 60 min.`;
    }
    tip = `Training day: keep sipping. ${electrolyteClause}`;
  } else {
    tip = `Post-training: prioritize ${Math.round(workoutInfo.bonusOz * 0.5)}oz of your remaining target to help recover from your ${workoutInfo.sessionName}.`;
  }
  tipText.textContent = tip;
}

function playHydrationGoalAnimation() {
  const svg = document.getElementById("hydration-bottle-svg");
  if (!svg) return;
  const card = document.getElementById("hydration-card");

  // Pulse the bottle
  svg.style.transition = "transform 0.3s ease";
  svg.style.transform = "scale(1.15)";
  setTimeout(() => { svg.style.transform = "scale(1)"; }, 300);
  setTimeout(() => { svg.style.transform = "scale(1.1)"; }, 500);
  setTimeout(() => { svg.style.transform = "scale(1)"; }, 700);

  // Burst particles around the bottle
  const visual = svg.parentElement;
  if (!visual) return;
  visual.style.position = "relative";
  const colors = ["#22c55e", "#4ade80", "#86efac", "#a7f3d0", "#34d399"];
  for (let i = 0; i < 14; i++) {
    const dot = document.createElement("span");
    dot.className = "hydration-burst-particle";
    const angle = (Math.PI * 2 / 14) * i + (Math.random() * 0.4 - 0.2);
    const dist = 40 + Math.random() * 30;
    dot.style.setProperty("--x", `${Math.cos(angle) * dist}px`);
    dot.style.setProperty("--y", `${Math.sin(angle) * dist}px`);
    dot.style.background = colors[i % colors.length];
    dot.style.width = dot.style.height = `${5 + Math.random() * 5}px`;
    dot.style.left = "40px";
    dot.style.top = "80px";
    visual.appendChild(dot);
    dot.addEventListener("animationend", () => dot.remove());
  }
}

// checkElectrolyteSuggestion — replaced by renderHydrationTimingTip()
function checkElectrolyteSuggestion() { renderHydrationTimingTip(); }

/* =====================================================================
   SETTINGS MODAL
   ===================================================================== */

function openHydrationSettings() {
  const modal = document.getElementById("hydration-settings-modal");
  if (!modal) return;
  modal.style.display = "";
  requestAnimationFrame(() => modal.classList.add("is-open"));

  const settings = getHydrationSettings();
  const bottleSizeEl = document.getElementById("hydration-bottle-size");
  const targetEl = document.getElementById("hydration-daily-target-oz");
  if (bottleSizeEl) bottleSizeEl.value = settings.bottleSize || 12;
  if (targetEl) targetEl.value = settings.dailyTargetOz || getBaseHydrationTarget();
  _renderBottleEditor();
}

// ── Bottle editor (settings modal) ───────────────────────────────────
// Lets the user set up multiple named bottles (e.g. "Hydroflask 32oz",
// "Gym bottle 20oz") so the hydration card shows a button per bottle
// instead of one generic "+ My Bottle" shortcut.

function _renderBottleEditor() {
  const list = document.getElementById("hydration-bottles-list");
  if (!list) return;
  const bottles = getNamedBottles();
  if (!bottles.length) {
    list.innerHTML = `<p class="hint" style="margin:0 0 8px">No custom bottles yet. Add one below — each bottle becomes a one-tap log button on the hydration card.</p>`;
    return;
  }
  list.innerHTML = bottles.map(b => {
    const id = escHtml(b.id);
    return `
      <div class="hydration-bottle-row" data-bottle-id="${id}">
        <input type="text" class="hydration-bottle-name" value="${escHtml(b.name || "")}" placeholder="Name (e.g. Hydroflask)" />
        <input type="number" class="hydration-bottle-size" value="${parseFloat(b.size) || ""}" min="1" max="128" placeholder="oz" />
        <button class="hydration-bottle-delete" title="Remove" onclick="_removeBottle('${id}')">&times;</button>
      </div>`;
  }).join("");
}

function _addBottle() {
  const bottles = getNamedBottles().slice();
  bottles.push({
    id: "b-" + Date.now().toString(36),
    name: "",
    size: 20,
  });
  saveNamedBottles(bottles);
  _renderBottleEditor();
}

function _removeBottle(id) {
  const bottles = getNamedBottles().filter(b => b.id !== id);
  saveNamedBottles(bottles);
  _renderBottleEditor();
}

function closeHydrationSettings() {
  const modal = document.getElementById("hydration-settings-modal");
  if (!modal) return;
  modal.classList.remove("is-open");
  modal.addEventListener("transitionend", () => { modal.style.display = "none"; }, { once: true });
}

function saveHydrationSettings() {
  const bottleSize = parseInt(document.getElementById("hydration-bottle-size")?.value || "12");
  const dailyTargetOz = parseInt(document.getElementById("hydration-daily-target-oz")?.value || "96");

  // Harvest the bottle editor rows — each row carries its id and the
  // latest name/size the user typed. Empty or zero-sized entries are
  // dropped so the user can delete a bottle by clearing its fields.
  const rows = Array.from(document.querySelectorAll(".hydration-bottle-row"));
  const bottles = rows.map(row => {
    const id = row.getAttribute("data-bottle-id");
    const name = row.querySelector(".hydration-bottle-name")?.value.trim() || "";
    const size = parseFloat(row.querySelector(".hydration-bottle-size")?.value) || 0;
    return { id, name, size };
  }).filter(b => b.size > 0 && b.name);

  // Merge with existing settings so we don't blow away other keys.
  const prev = getHydrationSettings();
  saveHydrationSettingsData(Object.assign({}, prev, { bottleSize, dailyTargetOz, bottles }));
  closeHydrationSettings();
  renderHydration();
}

/* =====================================================================
   SAUNA HYDRATION ADJUSTMENT
   ===================================================================== */

function adjustHydrationForSauna(dateStr, durationMinutes) {
  // ~1.5 oz additional hydration per minute of sauna/steam exposure
  const additionalOz = Math.round(durationMinutes * 1.5);
  try {
    const log = JSON.parse(localStorage.getItem("hydrationLog")) || {};
    const dayLog = log[dateStr] || { total: 0, beverages: [], saunaBonus: 0 };
    dayLog.saunaBonus = (dayLog.saunaBonus || 0) + additionalOz;
    log[dateStr] = dayLog;
    localStorage.setItem("hydrationLog", JSON.stringify(log)); if (typeof DB !== 'undefined') DB.syncKey('hydrationLog');
  } catch {}
}

/* =====================================================================
   INIT
   ===================================================================== */

function initHydration() {
  applyHydrationToggle();
  if (isHydrationEnabled()) renderHydration();
}
