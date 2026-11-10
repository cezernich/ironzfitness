// fueling.js — Fueling recommendations for endurance workouts
// Based on current sports science consensus (ACSM, Jeukendrup research)

// ── Fueling toggle ──────────────────────────────────────────────────────────

function isFuelingEnabled() {
  return localStorage.getItem("fuelingEnabled") !== "0";
}

function setFuelingEnabled(enabled) {
  localStorage.setItem("fuelingEnabled", enabled ? "1" : "0"); if (typeof DB !== 'undefined') DB.syncKey('fuelingEnabled');
  if (typeof trackEvent === "function") trackEvent("feature_toggled", { feature: "fueling", enabled });
  if (typeof syncFeatureToggles === "function") syncFeatureToggles();
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
  return typeof DB!=='undefined'&&DB.fuelingPreferences?DB.fuelingPreferences.getCached():{};
}
function saveUserFuelingPrefs(prefs) {
  if(typeof DB==='undefined'||!DB.fuelingPreferences)throw Error('Fueling preferences are unavailable. Reload and try again.');
  DB.fuelingPreferences.save(prefs);
}

// Intensity scaling factor. Easy / recovery days need less fueling;
// race / threshold sessions burn carbs faster and demand more.
function _fuelingIntensityFactor(load) {
  const l = String(load || "moderate").toLowerCase();
  if (l === "easy" || l === "recovery" || l === "rest") return 0.8;
  if (l === "long") return 1.1;
  if (l === "hard" || l === "threshold" || l === "interval") return 1.15;
  if (l === "race") return 1.2;
  return 1.0; // moderate default
}

/**
 * generateFuelingPlan(durationMinutes, sessionCtx)
 * Returns a fueling plan object or null if no fueling needed.
 *
 * @param {number} durationMinutes
 * @param {Object} [sessionCtx] - optional { load, discipline }
 *        used to scale carbs/hour by intensity
 */
function generateFuelingPlan(durationMinutes, sessionCtx) {
  const durMin = parseFloat(durationMinutes);
  if (!durMin || durMin <= 0) return null;

  const prefs = getUserFuelingPrefs();
  const rule = FUELING_DEFAULTS.thresholds.find(r => durMin >= r.minDuration && durMin < r.maxDuration);
  if (!rule || rule.carbsPerHour === 0) return null;

  // Compute automatic carbs/hour from the duration band, then scale
  // by athlete weight and session intensity unless the user has
  // explicitly overridden it via prefs.carbsPerHour.
  const weightFactor = 1; // Carbohydrate absorption is not scaled by body mass.
  const intensityFactor = _fuelingIntensityFactor(sessionCtx && sessionCtx.load);
  const requestedAuto = Math.round(rule.carbsPerHour * intensityFactor);
  const autoCarbsHour = FuelingPolicy.limit(requestedAuto,{practicedCarbsPerHour:prefs.practicedCarbsPerHour}).carbsPerHour;

  // User hard override takes priority; otherwise use the scaled value.
  const override=Number(prefs.carbsPerHour)>0;
  const limited=FuelingPolicy.limit(override?Number(prefs.carbsPerHour):requestedAuto,{
    practicedCarbsPerHour:prefs.practicedCarbsPerHour,explicitOverride:override,
  });
  const carbsPerHour = limited.carbsPerHour;
  const fuelSourceId = prefs.fuelSource || "gel";
  const fuelSource = FUEL_SOURCES.find(s => s.id === fuelSourceId) || FUEL_SOURCES[0];
  const carbsPerServing = prefs.customCarbsPerServing || fuelSource.carbs;

  // Spread portions every20min; a whole serving may exceed a low gut cap.
  const intervalMinutes=20;
  const startMinute=Number(prefs.startMinute)>0?Number(prefs.startMinute):rule.startMinute;
  const count=Math.max(0,Math.ceil((durMin-startMinute)/intervalMinutes));
  if(!Number.isFinite(count)||count>256)return null;
  const portionCarbs=Math.floor(carbsPerHour/3*10)/10;
  const targetCarbs=Math.floor(carbsPerHour*durMin/60);
  const items=[];let remaining=targetCarbs;
  for(let i=0;i<count&&remaining>=.1;i++) {
    const carbs=Math.min(portionCarbs,Math.floor(remaining*10+1e-8)/10);
    items.push({minute:startMinute+i*intervalMinutes,carbs,servings:carbs/carbsPerServing,source:fuelSource});
    remaining-=carbs;
  }

  return {
    totalCarbs: Math.round(items.reduce((sum,item)=>sum+item.carbs,0)*10)/10,
    targetCarbs,
    carbsPerHour,
    autoCarbsHour,
    weightFactor,
    intensityFactor,
    isOverride: override,
    gutCap: limited.gutCap,
    practiceLevelConfirmed: limited.practiceLevelConfirmed,
    items,
    hydrationOz: durMin > 60 ? `${Math.round(durMin / 60 * 20)}-${Math.round(durMin / 60 * 24)} oz` : "Sip water as needed",
    note: `${carbsPerHour}g/hr target, within the ${limited.gutCap}g/hr ceiling. ` + (!limited.practiceLevelConfirmed ? "Confirm the intake you have already practiced; do not jump to this ceiling." : "Stay within your practiced intake."),
    needsSodium: durMin >= 90,
    fuelSource,
    carbsPerServing,
  };
}

/**
 * renderFuelingPlanHTML(durationMinutes, sessionName, sessionCtx)
 * Returns HTML string for a collapsible fueling plan section.
 *
 * @param {number} durationMinutes
 * @param {string} sessionName
 * @param {Object} [sessionCtx] - { load, discipline } used for intensity scaling
 */
function renderFuelingPlanHTML(durationMinutes, sessionName, sessionCtx) {
  if (!isFuelingEnabled()) return "";
  const _disc = String(sessionCtx?.discipline || "").toLowerCase();
  const _name = String(sessionName || "").toLowerCase();
  // Fueling plans only render for disciplines where mid-session
  // intake is realistic. Swim is excluded — mid-pool gels aren't a
  // thing for typical training swims. Brick stays in because the
  // run/bike legs DO warrant fueling. Triathlon stays in for the
  // multi-leg sessions where fueling is critical (long bricks, long
  // open-water swims that lead into a bike).
  const AEROBIC_DISCIPLINES = new Set(["run", "running", "bike", "cycling", "cycle", "brick", "triathlon"]);
  if (!AEROBIC_DISCIPLINES.has(_disc)) return "";
  const plan = generateFuelingPlan(durationMinutes, sessionCtx);
  if (!plan) return "";

  const itemList = plan.items.map((item, i) =>
    `<div class="fueling-item"><span class="fueling-item-icon">${FUEL_ICON_SVG}</span> Min ${item.minute}: ${Number(item.servings.toFixed(2))} serving of ${item.source.name} (${item.carbs}g carbs)</div>`
  ).join("");

  const sodiumNote = plan.needsSodium
    ? `<div class="fueling-item fueling-sodium">Sodium: ${FUELING_DEFAULTS.hydration.sodium}</div>`
    : "";

  const factorsBadge = `<span class="fueling-factors-badge">${plan.isOverride?'User target · ':''}Ceiling ${plan.gutCap}g/hr${plan.practiceLevelConfirmed?' practiced':' (unconfirmed default)'}</span>`;
  const gelLine = `Using ${plan.fuelSource.name} at ${plan.carbsPerServing}g carbs each`;

  const id = "fueling-" + Math.random().toString(36).slice(2, 8);
  return `
    <div class="fueling-plan-section">
      <button class="fueling-toggle" onclick="this.classList.toggle('is-open');document.getElementById('${id}').classList.toggle('is-open')">
        <span class="fueling-toggle-icon">${FUEL_ICON_SVG_LG}</span>
        Fueling Plan (${Math.round(durationMinutes)} min)
        <span class="chevron-why">&#9662;</span>
      </button>
      <div class="fueling-plan-body" id="${id}">
        <div class="fueling-summary">~${plan.totalCarbs}g carbs scheduled (${plan.carbsPerHour}g/hr target) | ${plan.hydrationOz} water</div>
        <div class="fueling-factors">${factorsBadge}</div>
        <div class="fueling-note">${plan.note}</div>
        <div class="fueling-gel-line">${gelLine} <button class="fueling-gel-change" onclick="openFuelingPrefs()">change</button></div>
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

      <div class="form-row" style="margin-bottom:12px">
        <label>Practiced carbs/hour ceiling</label>
        <input type="number" id="fuel-pref-practiced" placeholder="60 until confirmed" min="10" max="120" value="${prefs.practicedCarbsPerHour || ""}" />
        <p class="hint">Enter an intake you have already practiced comfortably, not a future goal. Automatic targets stay at or below 90 g/hr.</p>
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
  const practicedRaw=document.getElementById("fuel-pref-practiced")?.value||"";
  const practiced=Number(practicedRaw);
  if(practicedRaw.trim()&&(!Number.isFinite(practiced)||practiced<10||practiced>120)) {
    if(typeof showToast==='function')showToast('Enter practiced intake between 10 and 120 g/hr.','error');
    return;
  }
  if(practicedRaw.trim())prefs.practicedCarbsPerHour=practiced;

  if (source && source !== "gel") prefs.fuelSource = source;
  if (carbsPer > 0) prefs.customCarbsPerServing = carbsPer;
  if (carbsHr > 0) prefs.carbsPerHour = carbsHr;
  if (start > 0) prefs.startMinute = start;

  try { saveUserFuelingPrefs(prefs); }
  catch(error) {
    if(typeof showToast==='function')showToast('Fueling preferences could not be saved. Check device storage and try again.','error');
    return;
  }
  document.getElementById("fueling-prefs-overlay")?.remove();

  // Refresh calendar to update fueling plans
  if (typeof renderCalendar === "function") renderCalendar();
  if (typeof selectedDate !== "undefined" && selectedDate && typeof renderDayDetail === "function") renderDayDetail(selectedDate);
}
