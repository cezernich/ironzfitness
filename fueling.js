// fueling.js — Fueling recommendations for endurance workouts
// Based on current sports science consensus (ACSM, Jeukendrup research)

// ── Fueling toggle ──────────────────────────────────────────────────────────

function isFuelingEnabled() {
  return localStorage.getItem("fuelingEnabled") !== "0";
}

function setFuelingEnabled(enabled) {
  localStorage.setItem("fuelingEnabled", enabled ? "1" : "0"); if (typeof DB !== 'undefined') DB.syncKey('fuelingEnabled');
  const toggle = document.getElementById("pref-fueling-toggle");
  if (toggle) toggle.checked = enabled;
  if (typeof renderCalendar === "function") renderCalendar();
  if (typeof selectedDate !== "undefined" && selectedDate && typeof renderDayDetail === "function") renderDayDetail(selectedDate);
}

function applyFuelingToggle() {
  const toggle = document.getElementById("pref-fueling-toggle");
  if (toggle) toggle.checked = isFuelingEnabled();
}

// SVG icon for fueling markers (small flask shape)
const FUEL_ICON_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>`;
const FUEL_ICON_SVG_LG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>`;

const FUELING_DEFAULTS = {
  thresholds: [
    { minDuration: 0,   maxDuration: 60,  carbsPerHour: 0,  note: "Water only. No fueling needed for sessions under 60 minutes." },
    { minDuration: 60,  maxDuration: 90,  carbsPerHour: 30, startMinute: 25, intervalMinutes: 25, note: "Light fueling. ~30g carbs/hr." },
    { minDuration: 90,  maxDuration: 150, carbsPerHour: 60, startMinute: 20, intervalMinutes: 20, note: "Moderate fueling. ~60g carbs/hr." },
    { minDuration: 150, maxDuration: Infinity, carbsPerHour: 90, startMinute: 15, intervalMinutes: 20, note: "Heavy fueling. 60-90g carbs/hr. Include sodium." }
  ],
  gelCarbContent: 25,
  hydration: {
    general: "16-24 oz per hour",
    sodium: "500-700mg per hour for sessions over 90 min"
  }
};

// Fuel source options for customization
const FUEL_SOURCES = [
  { id: "gel",           name: "Energy Gel",        carbs: 25, unit: "gel" },
  { id: "chews",         name: "Energy Chews",      carbs: 24, unit: "pack" },
  { id: "bar",           name: "Energy Bar",        carbs: 40, unit: "bar" },
  { id: "banana",        name: "Banana",            carbs: 27, unit: "banana" },
  { id: "sports-drink",  name: "Sports Drink (16oz)", carbs: 14, unit: "bottle" },
  { id: "dates",         name: "Dates (2-3)",       carbs: 30, unit: "serving" },
  { id: "rice-cake",     name: "Rice Cake",         carbs: 30, unit: "piece" },
  { id: "maple-syrup",   name: "Maple Syrup Packet", carbs: 26, unit: "packet" },
];

/**
 * getUserFuelingPrefs()
 * Returns user's fueling preferences from localStorage.
 */
function getUserFuelingPrefs() {
  try {
    return JSON.parse(localStorage.getItem("fuelingPrefs")) || {};
  } catch { return {}; }
}

function saveUserFuelingPrefs(prefs) {
  localStorage.setItem("fuelingPrefs", JSON.stringify(prefs)); if (typeof DB !== 'undefined') DB.syncKey('fuelingPrefs');
}

/**
 * generateFuelingPlan(durationMinutes)
 * Returns a fueling plan object or null if no fueling needed.
 * Respects user customization for carb targets and fuel source.
 */
function generateFuelingPlan(durationMinutes) {
  const durMin = parseFloat(durationMinutes);
  if (!durMin || durMin <= 0) return null;

  const prefs = getUserFuelingPrefs();
  const rule = FUELING_DEFAULTS.thresholds.find(r => durMin >= r.minDuration && durMin < r.maxDuration);
  if (!rule || rule.carbsPerHour === 0) return null;

  // User overrides
  const carbsPerHour = prefs.carbsPerHour || rule.carbsPerHour;
  const fuelSourceId = prefs.fuelSource || "gel";
  const fuelSource = FUEL_SOURCES.find(s => s.id === fuelSourceId) || FUEL_SOURCES[0];
  const carbsPerServing = prefs.customCarbsPerServing || fuelSource.carbs;

  // Calculate intervals based on carbs needed per hour and carbs per serving
  const servingsPerHour = carbsPerHour / carbsPerServing;
  const intervalMinutes = Math.round(60 / servingsPerHour);
  const startMinute = prefs.startMinute || rule.startMinute;

  const fuelTimes = [];
  const count = Math.ceil((durMin - startMinute) / intervalMinutes);
  for (let i = 0; i < count && i < 20; i++) {
    fuelTimes.push(startMinute + (i * intervalMinutes));
  }

  return {
    totalCarbs: Math.round((carbsPerHour * durMin) / 60),
    carbsPerHour,
    items: fuelTimes.map(t => ({ minute: t, carbs: carbsPerServing, source: fuelSource })),
    hydrationOz: durMin > 60 ? `${Math.round(durMin / 60 * 20)}-${Math.round(durMin / 60 * 24)} oz` : "Sip water as needed",
    note: rule.note,
    needsSodium: durMin >= 90,
    fuelSource,
  };
}

/**
 * renderFuelingPlanHTML(durationMinutes, sessionName)
 * Returns HTML string for a collapsible fueling plan section.
 */
function renderFuelingPlanHTML(durationMinutes, sessionName) {
  if (!isFuelingEnabled()) return "";
  const plan = generateFuelingPlan(durationMinutes);
  if (!plan) return "";

  const itemList = plan.items.map((item, i) =>
    `<div class="fueling-item"><span class="fueling-item-icon">${FUEL_ICON_SVG}</span> Min ${item.minute}: ${item.source.name} #${i + 1} (${item.carbs}g carbs)</div>`
  ).join("");

  const sodiumNote = plan.needsSodium
    ? `<div class="fueling-item fueling-sodium">Sodium: ${FUELING_DEFAULTS.hydration.sodium}</div>`
    : "";

  const id = "fueling-" + Math.random().toString(36).slice(2, 8);
  return `
    <div class="fueling-plan-section">
      <button class="fueling-toggle" onclick="this.classList.toggle('is-open');document.getElementById('${id}').classList.toggle('is-open')">
        <span class="fueling-toggle-icon">${FUEL_ICON_SVG_LG}</span>
        Fueling Plan (${Math.round(durationMinutes)} min)
        <span class="chevron-why">&#9662;</span>
      </button>
      <div class="fueling-plan-body" id="${id}">
        <div class="fueling-summary">~${plan.totalCarbs}g carbs needed (${plan.carbsPerHour}g/hr) | ${plan.hydrationOz} water</div>
        <div class="fueling-note">${plan.note}</div>
        ${itemList}
        <div class="fueling-item"><span class="fueling-item-icon">${FUEL_ICON_SVG}</span> Hydration: ${plan.hydrationOz}, sip every 15 min</div>
        ${sodiumNote}
        <button class="fueling-customize-btn" onclick="openFuelingPrefs()">Customize fueling</button>
      </div>
    </div>
  `;
}

/**
 * openFuelingPrefs()
 * Opens a modal for users to customize their fueling preferences.
 */
function openFuelingPrefs() {
  const prefs = getUserFuelingPrefs();

  let overlay = document.getElementById("fueling-prefs-overlay");
  if (overlay) overlay.remove();

  overlay = document.createElement("div");
  overlay.id = "fueling-prefs-overlay";
  overlay.className = "quick-entry-overlay is-open";
  overlay.style.cssText = "display:flex;z-index:10001";
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  const currentSource = prefs.fuelSource || "gel";

  overlay.innerHTML = `
    <div class="quick-entry-modal" style="max-width:400px;padding:24px">
      <h3 style="margin:0 0 4px">Fueling Preferences</h3>
      <p style="margin:0 0 16px;color:var(--color-text-muted);font-size:0.82rem">Customize how fueling plans are calculated for your workouts.</p>

      <div class="form-row" style="margin-bottom:12px">
        <label>Fuel Source</label>
        <select id="fuel-pref-source" onchange="_fuelSourceChanged()">
          ${FUEL_SOURCES.map(s => `<option value="${s.id}" ${s.id === currentSource ? "selected" : ""}>${s.name} (${s.carbs}g carbs/${s.unit})</option>`).join("")}
        </select>
      </div>

      <div class="form-row" style="margin-bottom:12px">
        <label>Carbs per serving <span class="optional-tag">override</span></label>
        <input type="number" id="fuel-pref-carbs-per" placeholder="auto" min="5" max="100" value="${prefs.customCarbsPerServing || ""}" />
      </div>

      <div class="form-row" style="margin-bottom:12px">
        <label>Target carbs/hour <span class="optional-tag">override</span></label>
        <input type="number" id="fuel-pref-carbs-hr" placeholder="auto (based on duration)" min="10" max="120" value="${prefs.carbsPerHour || ""}" />
      </div>

      <div class="form-row" style="margin-bottom:16px">
        <label>Start fueling at minute</label>
        <input type="number" id="fuel-pref-start" placeholder="auto" min="5" max="60" value="${prefs.startMinute || ""}" />
      </div>

      <div style="display:flex;gap:8px">
        <button class="btn-primary" style="flex:1" onclick="_saveFuelingPrefs()">Save</button>
        <button class="btn-secondary" style="flex:1" onclick="document.getElementById('fueling-prefs-overlay').remove()">Cancel</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
}

function _fuelSourceChanged() {
  const sourceId = document.getElementById("fuel-pref-source")?.value;
  const source = FUEL_SOURCES.find(s => s.id === sourceId);
  const carbsInput = document.getElementById("fuel-pref-carbs-per");
  if (source && carbsInput && !carbsInput.value) {
    carbsInput.placeholder = `${source.carbs}g (default)`;
  }
}

function _saveFuelingPrefs() {
  const prefs = {};
  const source = document.getElementById("fuel-pref-source")?.value;
  const carbsPer = parseInt(document.getElementById("fuel-pref-carbs-per")?.value);
  const carbsHr = parseInt(document.getElementById("fuel-pref-carbs-hr")?.value);
  const start = parseInt(document.getElementById("fuel-pref-start")?.value);

  if (source && source !== "gel") prefs.fuelSource = source;
  if (carbsPer > 0) prefs.customCarbsPerServing = carbsPer;
  if (carbsHr > 0) prefs.carbsPerHour = carbsHr;
  if (start > 0) prefs.startMinute = start;

  saveUserFuelingPrefs(prefs);
  document.getElementById("fueling-prefs-overlay")?.remove();

  // Refresh calendar to update fueling plans
  if (typeof renderCalendar === "function") renderCalendar();
  if (typeof selectedDate !== "undefined" && selectedDate && typeof renderDayDetail === "function") renderDayDetail(selectedDate);
}
