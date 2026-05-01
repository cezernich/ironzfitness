// js/onboarding-v2.js — Onboarding Survey v2 + standalone Build Plan
//
// Implements the onboarding flow per:
//   cowork-handoff/IronZ_Onboarding_BuildPlan_Implementation_Spec.docx
//
// Phase 2 (this commit) ships the full ob-1 → ob-6 + manual-landing
// experience. The bp-* Build Plan screens land in Phase 3 — for now
// the "Build My Plan" fork routes to the legacy openSurvey() which
// still gates on surveyComplete, so a first-time user who picks
// Build Plan lands in the existing Build Plan survey while Phases 3/4
// replace it.
//
// Architecture:
//
// - Vanilla JS, no bundler. All exports live on window.OnboardingV2.
// - Screen container: #ob-v2-root, which contains .ob-v2-screen
//   children. Showing a screen means toggling .is-active on the
//   target and removing it from siblings.
// - User input lives in _state until _savePrefsAndContinue /
//   _saveInjuriesAndContinue / _saveNotifsAndContinue / etc. flush
//   the relevant slice into localStorage via DB.syncKey.
// - Profile data goes through DB.profile.save() which handles field
//   name mapping (name → full_name, weight → weight_lbs, etc.).
// - On completion both paths (fork → plan OR manual-landing) set
//   hasOnboarded = "1" and DB.syncKey it. The plan path also routes
//   to legacy openSurvey() (Phase 3 replaces this with bp-1).

(function () {
  "use strict";

  // One-time defensive repair: an earlier build of _confirmAndSavePlan
  // wrote the weekly-template OBJECT to `workoutSchedule` localStorage,
  // but the rest of the app expects an array. Detect and reset so
  // calendar day-detail doesn't crash on .filter() of a non-array.
  try {
    const raw = localStorage.getItem("workoutSchedule");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        console.warn("[OnboardingV2] Resetting corrupted workoutSchedule (was object, expected array)");
        localStorage.setItem("workoutSchedule", "[]");
        if (typeof DB !== "undefined" && DB.syncKey) DB.syncKey("workoutSchedule");
      }
    }
  } catch (e) { /* invalid JSON — leave it alone */ }

  // ── In-flight state ─────────────────────────────────────────────────
  const _state = {
    currentScreen: null,
    mode: null, // "onboarding" | "buildplan"
    profile: {},
    preferences: { workoutPlans: true, nutrition: true, hydration: true, fueling: true },
    injuries: [],
    connectedApps: [],
    notifSettings: {
      workoutReminder: { enabled: true, time: "7AM" },
      hydration: { enabled: true, frequency: "2hr" },
      nutrition: { enabled: true, triggers: ["nolog"] },
      weeklySummary: { enabled: true },
    },
    // Build Plan state (bp-* screens)
    selectedSports: [],
    gymAccess: "full",
    trainingGoals: [],
    // Hybrid strength role per TRAINING_PHILOSOPHY.md §2.5.3. Required
    // when the athlete selects both strength and an endurance sport.
    // One of: injury_prevention | race_performance | hypertrophy | minimal
    strengthRole: null,
    raceEvents: [],
    currentRace: { name: "", category: "triathlon", type: "ironman", date: "", goal: "finish", priority: "A", leadIn: null },
    leadInCount: 4,
    planDetails: { duration: "12", sessionLength: "60", daysPerWeek: "5" },
    thresholds: {},
    strengthSetup: { sessionsPerWeek: 3, split: "ppl", customMuscles: [], sessionLength: 45, refreshWeeks: 4, customRefreshWeeks: null },
    // longRun / longRide start unset so _renderLongDayBlocks can pick
    // the right default based on the user's sport mix (triathletes get
    // Wed long run + Sat long ride; run-only athletes get Sat long run).
    // Hard-coding them at init would preempt that logic and everyone
    // would end up with a Sunday long run.
    longDays: { longRun: null, longRide: null },
    schedule: { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] },
  };

  // Progress mapping — each screen → percent complete. Values match
  // spec §3.1 ("ob-1: 8%") and scale linearly through the fork.
  const _progressBySreen = {
    "ob-v2-1":  { pct: 8,   label: "Welcome" },
    "ob-v2-2":  { pct: 25,  label: "Profile" },
    "ob-v2-3":  { pct: 40,  label: "Preferences" },
    "ob-v2-4":  { pct: 55,  label: "Injuries" },
    "ob-v2-5":  { pct: 68,  label: "Apps" },
    "ob-v2-5b": { pct: 80,  label: "Notifications" },
    "ob-v2-6":  { pct: 92,  label: "Choose Path" },
    "ob-v2-manual-landing": { pct: 100, label: "Ready" },
    "bp-v2-1":       { pct: 55, label: "Sports" },
    "bp-v2-2":       { pct: 60, label: "Goals" },
    "bp-v2-3-race":  { pct: 65, label: "Race" },
    "bp-v2-3-norace":{ pct: 65, label: "Plan" },
    "bp-v2-4":       { pct: 72, label: "Thresholds" },
    "bp-v2-6":       { pct: 80, label: "Strength" },
    "bp-v2-4b":      { pct: 85, label: "Long Days" },
    "bp-v2-5":       { pct: 90, label: "Schedule" },
    "bp-v2-7":       { pct: 96, label: "Preview" },
    "bp-v2-done":    { pct: 100, label: "Ready" },
  };

  // ── Utilities ───────────────────────────────────────────────────────

  function _lsSet(key, value) {
    try {
      localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
      if (typeof DB !== "undefined" && DB.syncKey) DB.syncKey(key);
    } catch (e) {
      console.warn("[OnboardingV2] _lsSet failed", key, e);
    }
  }

  function _lsGet(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      try { return JSON.parse(raw); } catch { return raw; }
    } catch { return fallback; }
  }

  function _escape(str) {
    const d = document.createElement("div");
    d.textContent = str == null ? "" : String(str);
    return d.innerHTML;
  }

  // Resolve an ICONS.* key to its SVG string. Called once per screen
  // during _hydrateIcons() to replace `<span data-ob-icon="..."></span>`
  // placeholders with real SVGs from js/icons.js.
  function _iconSvg(key) {
    const I = (typeof ICONS !== "undefined") ? ICONS : {};
    return I[key] || "";
  }

  function _hydrateIcons(root) {
    if (!root) return;
    root.querySelectorAll("[data-ob-icon]").forEach(el => {
      const key = el.getAttribute("data-ob-icon");
      const svg = _iconSvg(key);
      if (svg && el.innerHTML !== svg) {
        el.innerHTML = svg;
      }
    });
  }

  function _calcAge(iso) {
    if (!iso) return null;
    const dob = new Date(iso);
    if (isNaN(dob)) return null;
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
    return age;
  }

  // ── Birthday picker (Month / Day / Year selects) ─────────────────
  //
  // Replaces native <input type="date"> on iOS, where the wheel UI
  // requires a "tap out / tap back in" dance to set Day after Month
  // and Year. Three selects commit each value on tap and match the
  // pattern used by MyFitnessPal / Strava.
  //
  // Wired against TWO inputs in the app: ob-v2-bday (onboarding) and
  // profile-birthday (settings). Both have a hidden mirror that
  // carries the ISO YYYY-MM-DD string so existing readers
  // (loadProfile, _calcAge) work unchanged.
  const _BDAY_MONTHS = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  function _initBdayPicker(hiddenInputId) {
    const monthSel = document.getElementById(hiddenInputId + "-month");
    const daySel   = document.getElementById(hiddenInputId + "-day");
    const yearSel  = document.getElementById(hiddenInputId + "-year");
    const hidden   = document.getElementById(hiddenInputId);
    if (!monthSel || !daySel || !yearSel || !hidden) return;
    // Idempotent: skip re-population if options are already filled.
    if (monthSel.options.length > 0) return;

    monthSel.innerHTML = '<option value="">Month</option>' +
      _BDAY_MONTHS.slice(1).map((m, i) => `<option value="${i + 1}">${m}</option>`).join("");
    daySel.innerHTML = '<option value="">Day</option>' +
      Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join("");
    // Years from this year backwards to 1930 — covers the user-base
    // bracket the existing min/max attributes were enforcing.
    const thisYear = new Date().getFullYear();
    const yearOptions = [];
    for (let y = thisYear; y >= 1930; y--) yearOptions.push(`<option value="${y}">${y}</option>`);
    yearSel.innerHTML = '<option value="">Year</option>' + yearOptions.join("");

    const onChange = () => {
      _syncBdayPickerToHidden(hiddenInputId);
      // Adjust day options when month/year changes so February only
      // shows 28/29 days etc. Preserve current day if still valid.
      const m = parseInt(monthSel.value, 10);
      const y = parseInt(yearSel.value, 10);
      if (m && y) {
        const daysInMonth = new Date(y, m, 0).getDate();
        const currentDay = parseInt(daySel.value, 10);
        daySel.innerHTML = '<option value="">Day</option>' +
          Array.from({ length: daysInMonth }, (_, i) => `<option value="${i + 1}"${currentDay === i + 1 ? " selected" : ""}>${i + 1}</option>`).join("");
        // If the current day is no longer valid (e.g. switched to Feb
        // with a 31 selected), the select clears — re-sync the hidden
        // input to reflect that.
        _syncBdayPickerToHidden(hiddenInputId);
      }
    };
    monthSel.addEventListener("change", onChange);
    daySel.addEventListener("change", onChange);
    yearSel.addEventListener("change", onChange);
  }

  function _syncBdayPickerToHidden(hiddenInputId) {
    const monthSel = document.getElementById(hiddenInputId + "-month");
    const daySel   = document.getElementById(hiddenInputId + "-day");
    const yearSel  = document.getElementById(hiddenInputId + "-year");
    const hidden   = document.getElementById(hiddenInputId);
    if (!monthSel || !daySel || !yearSel || !hidden) return;
    const m = parseInt(monthSel.value, 10);
    const d = parseInt(daySel.value, 10);
    const y = parseInt(yearSel.value, 10);
    if (m && d && y) {
      const mm = String(m).padStart(2, "0");
      const dd = String(d).padStart(2, "0");
      hidden.value = `${y}-${mm}-${dd}`;
    } else {
      hidden.value = "";
    }
    // Fire change event so any listeners (validation, age calculator)
    // that were wired against the original date input keep working.
    try { hidden.dispatchEvent(new Event("change", { bubbles: true })); } catch {}
  }

  function _setBdayPickerValue(hiddenInputId, isoDate) {
    if (!isoDate) return;
    const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return;
    const monthSel = document.getElementById(hiddenInputId + "-month");
    const daySel   = document.getElementById(hiddenInputId + "-day");
    const yearSel  = document.getElementById(hiddenInputId + "-year");
    const hidden   = document.getElementById(hiddenInputId);
    if (!monthSel || !daySel || !yearSel || !hidden) return;
    yearSel.value = String(parseInt(m[1], 10));
    monthSel.value = String(parseInt(m[2], 10));
    // Trigger month/year change handler so day list updates to the
    // right number of days, then set the day.
    monthSel.dispatchEvent(new Event("change", { bubbles: true }));
    daySel.value = String(parseInt(m[3], 10));
    hidden.value = isoDate;
  }

  // Expose so settings.js / profile UI can also use the same picker.
  if (typeof window !== "undefined") {
    window._initBdayPicker = _initBdayPicker;
    window._setBdayPickerValue = _setBdayPickerValue;
  }

  // ── Screen navigation ──────────────────────────────────────────────

  // goTo auto-detects which overlay the target screen lives in
  // (#ob-v2-root or #bp-v2-overlay), activates that overlay, hides
  // the other if it was open, and deactivates sibling screens only
  // within the target screen's own container.
  function goTo(screenId) {
    const target = document.getElementById(screenId);
    if (!target) {
      console.warn("[OnboardingV2] goTo: unknown screen", screenId);
      return;
    }
    const container = target.closest(".ob-v2-screen-container");
    const overlay = target.closest(".ob-v2-root");
    if (!container || !overlay) {
      console.warn("[OnboardingV2] goTo: screen has no overlay ancestor", screenId);
      return;
    }
    // Activate the owning overlay and deactivate the other one
    const obRoot = document.getElementById("ob-v2-root");
    const bpRoot = document.getElementById("bp-v2-overlay");
    if (overlay === obRoot) {
      _showOverlay(obRoot);
      if (bpRoot && bpRoot.classList.contains("is-active")) _hideOverlay(bpRoot);
    } else if (overlay === bpRoot) {
      _showOverlay(bpRoot);
      if (obRoot && obRoot.classList.contains("is-active")) _hideOverlay(obRoot);
    }
    // Deactivate sibling screens in this container only
    container.querySelectorAll(".ob-v2-screen").forEach(s => s.classList.remove("is-active"));
    target.classList.add("is-active");
    _state.currentScreen = screenId;
    _updateProgress(screenId);
    _hydrateIcons(target);
    container.scrollTop = 0;
  }

  function _updateProgress(screenId) {
    const meta = _progressBySreen[screenId];
    if (!meta) return;
    const isBp = screenId.indexOf("bp-v2-") === 0;
    const fill = document.getElementById(isBp ? "bp-v2-progress-fill" : "ob-v2-progress-fill");
    const label = document.getElementById(isBp ? "bp-v2-progress-label" : "ob-v2-progress-label");
    if (fill) fill.style.width = meta.pct + "%";
    if (label) label.textContent = meta.label;
  }

  // ── Screen entry points ────────────────────────────────────────────

  // Called from app.js init(). If the user hasn't finished onboarding
  // yet, show the overlay and return true. Otherwise return false so
  // the caller knows to skip.
  function maybeStart() {
    const done = localStorage.getItem("hasOnboarded") === "1";
    if (done) return false;
    _openOverlay();
    _state.mode = "onboarding";
    goTo("ob-v2-1");
    _prefillProfile();
    return true;
  }

  function openOnboarding() {
    _openOverlay();
    _state.mode = "onboarding";
    goTo("ob-v2-1");
    _prefillProfile();
  }

  // Standalone Build Plan entry point — always starts fresh.
  // Resets in-flight state and UI selections on every open so the
  // user can rebuild without seeing leftover choices from last time.
  // Thresholds ARE pre-filled from the user's existing Training
  // Zones & Strength Benchmarks so they don't have to re-type them.
  function openBuildPlan() {
    _state.mode = "buildplan";
    _resetBuildPlanState();
    _state.thresholds = _loadExistingThresholds();
    // Every click on Build Plan opens a fresh builder — no sport
    // pre-selection carried over from the user's last run or from any
    // existing A race. The user explicitly asked for this: a build
    // plan flow that's pre-populated with "Running / Swimming / Cycling"
    // from an earlier session felt like the plan had already been
    // decided for them. Pre-selection logic is intentionally removed.
    _clearBuildPlanScreens();
    _openBuildPlanOverlay();
    goTo("bp-v2-1");
  }

  // Inspect localStorage.events for an upcoming A-priority race and,
  // if the race category implies multi-discipline training (triathlon,
  // duathlon), pre-select those sports in _state.selectedSports so the
  // Build Plan starts from a reasonable baseline for that race.
  function _preselectSportsFromARace() {
    let events = [];
    try { events = JSON.parse(localStorage.getItem("events") || "[]") || []; } catch {}
    if (!Array.isArray(events) || events.length === 0) return;
    const todayStr = new Date().toISOString().slice(0, 10);
    const upcoming = events.filter(e => e && e.date >= todayStr);
    const aRace = upcoming.find(e => String(e.priority || "A").toUpperCase() === "A");
    if (!aRace) return;
    const cat = String(aRace.category || aRace.type || "").toLowerCase();
    // Triathlon A race → pre-select swim + bike + run
    if (/(triathlon|ironman|olympic|sprint)/.test(cat)) {
      _state.selectedSports = Array.from(new Set([..._state.selectedSports, "swim", "bike", "run"]));
      return;
    }
    if (/(marathon|5k|10k|halfmarathon|ultra|running)/.test(cat)) {
      _state.selectedSports = Array.from(new Set([..._state.selectedSports, "run"]));
      return;
    }
    if (/(century|granfondo|stage|crit|cycling)/.test(cat)) {
      _state.selectedSports = Array.from(new Set([..._state.selectedSports, "bike"]));
      return;
    }
    if (/hyrox/.test(cat)) {
      // Mirror _toggleSport: Hyrox races need run + strength + hyrox in
      // the schedule so downstream plan gen actually mixes session types.
      _state.selectedSports = Array.from(new Set([..._state.selectedSports, "run", "strength", "hyrox"]));
      return;
    }
  }

  // Paint the pre-selected sport cards so they show as is-selected
  // on first render. Called after _clearBuildPlanScreens wipes state.
  function _applyPreselectedSports() {
    if (!Array.isArray(_state.selectedSports) || !_state.selectedSports.length) return;
    _state.selectedSports.forEach(sport => {
      const el = document.querySelector('#bp-v2-sport-grid [data-sport="' + sport + '"]');
      if (el) el.classList.add("is-selected");
    });
    // Show the triathlon helper note if all three tri sports are selected
    if (["swim", "bike", "run"].every(s => _state.selectedSports.includes(s))) {
      const triNote = document.getElementById("bp-v2-tri-note");
      if (triNote) triNote.style.display = "";
    }
    if (typeof _applySportSideEffects === "function") _applySportSideEffects();
  }

  // Edit entry point — jump straight to the Weekly Schedule step
  // with the existing Build Plan's inputs already loaded. Used by
  // the "Edit" button on the Active Training Inputs card so users
  // can tweak day-to-day composition without re-answering every
  // question from sport selection onward.
  function openBuildPlanEdit(planId) {
    _state.mode = "buildplan";
    _resetBuildPlanState();
    _state._editingPlanId = planId || null;
    // Pull everything back in from localStorage so the edit screen
    // has the same context the user had when they first built it.
    try {
      const sports = _lsGet("selectedSports", null);
      if (Array.isArray(sports)) _state.selectedSports = sports;
    } catch {}
    try {
      const goals = _lsGet("trainingGoals", null);
      if (Array.isArray(goals)) _state.trainingGoals = goals;
    } catch {}
    try {
      const role = _lsGet("strengthRole", null);
      if (typeof role === "string" && role) _state.strengthRole = role;
    } catch {}
    try {
      const races = _lsGet("raceEvents", null);
      if (Array.isArray(races) && races.length) {
        _state.raceEvents = races;
        _state.currentRace = Object.assign({}, _state.currentRace, races[0]);
      }
    } catch {}
    try {
      const str = _lsGet("strengthSetup", null);
      if (str && typeof str === "object") _state.strengthSetup = Object.assign({}, _state.strengthSetup, str);
    } catch {}
    try {
      const tpl = _lsGet("buildPlanTemplate", null);
      if (tpl && typeof tpl === "object") {
        _BP_DAYS.forEach(d => {
          _state.schedule[d] = Array.isArray(tpl[d]) ? tpl[d].slice() : [];
        });
        // A saved template means the user already committed edits once —
        // treat the re-open as "already touched" so long-day tweaks don't
        // wipe their prior composition.
        _state._scheduleTouched = true;
        // Self-heal: the schedule picker (_openAddSlotPicker) offers
        // "strength" regardless of selectedSports, but never syncs the
        // pick back. If the persisted template has strength chips and
        // selectedSports is missing "strength", _renderSchedule's filter
        // would silently strip every strength chip on edit-open and the
        // user sees their lifting days vanish. Reconcile before render.
        const _hasStrInTpl = _BP_DAYS.some(d =>
          (_state.schedule[d] || []).some(s => typeof s === "string" && s.indexOf("strength") === 0)
        );
        if (_hasStrInTpl && Array.isArray(_state.selectedSports) && !_state.selectedSports.includes("strength")) {
          _state.selectedSports = _state.selectedSports.concat(["strength"]);
          _lsSet("selectedSports", _state.selectedSports);
        }
      }
    } catch {}
    _state.thresholds = _loadExistingThresholds();
    _clearBuildPlanScreens();
    _openBuildPlanOverlay();
    goTo("bp-v2-5");
    _renderSchedule();
  }

  // Read the user's existing Training Zones & Strength Benchmarks
  // from localStorage.trainingZones and convert to the internal
  // _state.thresholds shape used by bp-v2-4. This lets the threshold
  // screen pre-fill inputs and pre-select the appropriate method,
  // so users who've already set their numbers just keep them.
  function _loadExistingThresholds() {
    let zones = {};
    let prior = {};
    let profile = {};
    try { zones = JSON.parse(localStorage.getItem("trainingZones") || "{}") || {}; }
    catch { zones = {}; }
    // Also read the user's last saved Build Plan thresholds — the
    // previous run may have captured inputs (e.g. a CSS Test's 400m/
    // 200m times) that don't have a simple trainingZones equivalent.
    // Those should come back pre-filled the next time Build Plan opens.
    try { prior = JSON.parse(localStorage.getItem("thresholds") || "{}") || {}; }
    catch { prior = {}; }
    try { profile = JSON.parse(localStorage.getItem("profile") || "{}") || {}; }
    catch { profile = {}; }

    // profile.*Updated stamps are written by saveTrainingZonesData — use
    // them as the freshness signal for the collapsed "Looks good?" UX.
    const profileStamp = {
      run: profile.thresholdPaceUpdated,
      bike: profile.ftpUpdated,
      swim: profile.cssTimeUpdated,
      strength: profile.strengthThresholdUpdatedAt,
    };

    const result = {};

    // ── Running ──────────────────────────────────────────────────────────
    // The Training Zones tab saves {referenceDist, referenceTime, vdot} on
    // race-based entry. The Build Plan flow can additionally write
    // thresholdPace directly. Either form should pre-fill the right method.
    if (zones.running) {
      const r = zones.running;
      const tp = r.thresholdPace || r.threshold_pace;
      if (tp) {
        result.run = { mode: "known", method: "pace", threshPace: String(tp) };
      } else if (r.referenceDist && r.referenceTime) {
        result.run = {
          mode: "known",
          method: "race",
          raceDist: _normalizeRunDistance(r.referenceDist),
          raceTime: String(r.referenceTime),
        };
      }
      const ts = profileStamp.run || r.lastUpdated || r.calculatedAt;
      if (result.run && ts) result.run._updatedAt = ts;
    }

    // ── Cycling ──────────────────────────────────────────────────────────
    if (zones.biking && zones.biking.ftp) {
      result.bike = { mode: "known", method: "ftp", ftp: String(zones.biking.ftp) };
      const ts = profileStamp.bike || zones.biking.lastUpdated || zones.biking.calculatedAt;
      if (ts) result.bike._updatedAt = ts;
    }

    // ── Swimming ─────────────────────────────────────────────────────────
    // Training Zones tab saves {referenceDist:"400m", referenceTime,
    // tPaceSec, tPaceStr}. Build Plan flow writes {css, cssPace}. Read
    // either. Pre-fill the pace input (common path) AND the css-test
    // fields when we have the 400m reference time — that way if the user
    // clicks Edit and switches methods, both are already populated.
    if (zones.swimming) {
      const sw = zones.swimming;
      const cssSec = Number(sw.tPaceSec) || parseInt(sw.cssPace, 10) || parseInt(sw.css, 10) || null;
      if (cssSec && cssSec > 0) {
        const base = { mode: "known", method: "pace", cssPace: String(Math.round(cssSec)) };
        // If we also have the reference 400m time, back-fill the
        // css-test inputs so switching methods preserves the user's
        // original source numbers.
        if (sw.referenceDist === "400m" && sw.referenceTime) {
          const parts = String(sw.referenceTime).split(":").map(x => parseInt(x, 10));
          const m = Number.isFinite(parts[0]) ? parts[0] : 0;
          const s = Number.isFinite(parts[1]) ? parts[1] : 0;
          if (m || s) {
            base.css400min = String(m);
            base.css400sec = String(s);
          }
        }
        result.swim = base;
      }
      const ts = profileStamp.swim || sw.lastUpdated || sw.calculatedAt;
      if (result.swim && ts) result.swim._updatedAt = ts;
    }

    // ── Strength ─────────────────────────────────────────────────────────
    if (zones.strength) {
      const s = zones.strength;
      const out = { mode: "known" };
      if (s.squat && s.squat.weight)    out.squat = String(s.squat.weight);
      if (s.bench && s.bench.weight)    out.bench = String(s.bench.weight);
      if (s.deadlift && s.deadlift.weight) out.dead = String(s.deadlift.weight);
      if (out.squat || out.bench || out.dead) {
        const ts = profileStamp.strength || s.updatedAt || s.lastUpdated || s.calculatedAt;
        if (ts) out._updatedAt = ts;
        result.strength = out;
      }
    }

    // Layer the prior Build Plan thresholds over the trainingZones-derived
    // defaults. The prior run wins because it captures method-specific
    // inputs (CSS Test times, 20-min bike test watts, race results) that
    // trainingZones only records in collapsed form. Preserve the
    // trainingZones-derived _updatedAt unless the prior entry has its own.
    Object.keys(prior || {}).forEach(key => {
      const p = prior[key];
      if (!p || typeof p !== "object") return;
      const hasValues = Object.keys(p).some(k => k !== "mode" && k !== "_updatedAt" && p[k] != null && p[k] !== "");
      if (hasValues) {
        const prevTs = result[key] && result[key]._updatedAt;
        result[key] = { ...(result[key] || {}), ...p };
        if (prevTs && !result[key]._updatedAt) result[key]._updatedAt = prevTs;
      }
    });
    return result;
  }

  // Reset every Build Plan state field back to its default.
  // Profile/onboarding fields are left alone.
  function _resetBuildPlanState() {
    _state.selectedSports = [];
    _state.gymAccess = "full";
    _state.trainingGoals = [];
    _state.strengthRole = null;
    _state.raceEvents = [];
    _state.currentRace = { name: "", category: "triathlon", type: "ironman", date: "", goal: "finish", priority: "A", leadIn: null };
    _state.leadInCount = 4;
    _state.planDetails = { duration: "12", sessionLength: "60", daysPerWeek: "5", startDate: _nextMondayISO() };
    _state.thresholds = {};
    _state.strengthSetup = { sessionsPerWeek: 3, split: "ppl", customMuscles: [], sessionLength: 45, refreshWeeks: 4, customRefreshWeeks: null };
    _state.longDays = { longRun: null, longRide: null };
    _state.schedule = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
    _state._editingPlanId = null;
    // Reset the "user touched the schedule chips" flag so a fresh Build
    // Plan run starts clean. Flipped true by any chip add/remove/drag so
    // _saveLongDaysAndContinue knows to preserve (not wipe) user edits.
    _state._scheduleTouched = false;
    // Re-pre-fill strength setup from plan details on the next
    // visit to bp-v2-6 (one-shot flag so the user's manual tweaks
    // aren't clobbered mid-flow).
    _state._strengthSyncedFromPlan = false;
  }

  // Default start = the Monday on or after today (ISO yyyy-mm-dd).
  // Default plan start = tomorrow. Previously this returned next Monday,
  // which could push the start up to 6 days out; the athlete expects to
  // begin the next day after building a plan, not wait a full week.
  function _tomorrowISO() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  // Kept for any stray callers referencing the old name.
  const _nextMondayISO = _tomorrowISO;

  // Update the start date from the bp-v2-5 date input.
  function _setStartDate(val) {
    if (val && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
      _state.planDetails.startDate = val;
    }
  }

  // Wipe any `is-selected` / filled-in DOM state left over from a
  // previous Build Plan run so each open renders a blank slate.
  function _clearBuildPlanScreens() {
    const ov = document.getElementById("bp-v2-overlay");
    if (!ov) return;
    ov.querySelectorAll(".is-selected").forEach(el => el.classList.remove("is-selected"));
    ov.querySelectorAll("input[type=text], input[type=number], input[type=date], input[type=time]").forEach(el => { el.value = ""; });
    ov.querySelectorAll("textarea").forEach(el => { el.value = ""; });
    // Reset <select>s to their first `selected` option (or first option)
    // so a stale value from a previous Build Plan run doesn't leak into
    // the new flow. Previously only text/number inputs were cleared,
    // which meant the race-category dropdown could still show "Hyrox"
    // after the user switched to a Triathlon build.
    ov.querySelectorAll("select").forEach(sel => {
      const defaultOpt = sel.querySelector("option[selected]") || sel.querySelector("option");
      if (defaultOpt) sel.value = defaultOpt.value;
    });
    // Reset default long-day picks (Sun run / Sat ride)
    const defRun  = ov.querySelector('[data-longrun="sun"]');
    const defRide = ov.querySelector('[data-longride="sat"]');
    if (defRun)  defRun.classList.add("is-selected");
    if (defRide) defRide.classList.add("is-selected");
    // Reset strength counter display
    const strCount = document.getElementById("bp-v2-strength-count");
    if (strCount) strCount.textContent = String(_state.strengthSetup.sessionsPerWeek);
    // Collapse any sport-conditional sections
    const equip = document.getElementById("bp-v2-equipment-section");
    if (equip) equip.style.display = "none";
    const triNote = document.getElementById("bp-v2-tri-note");
    if (triNote) triNote.style.display = "none";
    // Clear any dynamically rendered containers so stale HTML from a
    // previous run doesn't leak through to the next one.
    const thresh = document.getElementById("bp-v2-thresholds-container");
    if (thresh) thresh.innerHTML = "";
    const grid = document.getElementById("bp-v2-schedule-grid");
    if (grid) grid.innerHTML = "";
    const summary = document.getElementById("bp-v2-schedule-summary");
    if (summary) summary.innerHTML = "";
  }

  function _showOverlay(el) {
    if (!el) return;
    el.classList.add("is-active");
    el.setAttribute("aria-hidden", "false");
    document.body.classList.add("ob-v2-lock");
  }

  function _hideOverlay(el) {
    if (!el) return;
    el.classList.remove("is-active");
    el.setAttribute("aria-hidden", "true");
    // Only unlock body if neither overlay is visible
    const ob = document.getElementById("ob-v2-root");
    const bp = document.getElementById("bp-v2-overlay");
    const anyActive = (ob && ob.classList.contains("is-active")) || (bp && bp.classList.contains("is-active"));
    if (!anyActive) document.body.classList.remove("ob-v2-lock");
  }

  function _openOverlay() { _showOverlay(document.getElementById("ob-v2-root")); }
  function _closeOverlay() { _hideOverlay(document.getElementById("ob-v2-root")); }
  function _openBuildPlanOverlay() { _showOverlay(document.getElementById("bp-v2-overlay")); }
  function _closeBuildPlanOverlay() { _hideOverlay(document.getElementById("bp-v2-overlay")); }

  // Public: close Build Plan modal (X button + Escape future)
  function closeBuildPlan() {
    _closeBuildPlanOverlay();
  }

  // Pre-fill profile fields from existing localStorage.profile. Useful
  // when the user signs in on a new device with data they already
  // saved, or when we reopen onboarding explicitly.
  function _prefillProfile() {
    const p = _lsGet("profile", {}) || {};
    const name = document.getElementById("ob-v2-name");
    if (name && p.name) name.value = p.name;
    // Birthday picker: three Month/Day/Year selects mirror to the
    // hidden ob-v2-bday ISO input. _initBdayPicker fills in the
    // option lists on first call (idempotent).
    _initBdayPicker("ob-v2-bday");
    if (p.birthday) _setBdayPickerValue("ob-v2-bday", p.birthday);
    const weight = document.getElementById("ob-v2-weight");
    if (weight && p.weight) weight.value = p.weight;
    const hFt = document.getElementById("ob-v2-height-ft");
    const hIn = document.getElementById("ob-v2-height-in");
    if (p.height && hFt && hIn) {
      const total = parseInt(p.height, 10);
      if (!isNaN(total) && total > 0) {
        hFt.value = Math.floor(total / 12);
        hIn.value = total % 12;
      }
    }
    const gender = document.getElementById("ob-v2-gender");
    if (gender && p.gender) gender.value = p.gender;
  }

  // ── ob-2: Athlete Profile validation ───────────────────────────────

  function validateProfile() {
    _clearFieldErrors();

    const nameEl = document.getElementById("ob-v2-name");
    const bdayEl = document.getElementById("ob-v2-bday");
    const weightEl = document.getElementById("ob-v2-weight");
    const hFtEl = document.getElementById("ob-v2-height-ft");
    const hInEl = document.getElementById("ob-v2-height-in");
    const genderEl = document.getElementById("ob-v2-gender");

    const name = (nameEl?.value || "").trim();
    const bday = (bdayEl?.value || "").trim();
    const weight = parseFloat(weightEl?.value);
    const hFt = parseInt(hFtEl?.value, 10);
    const hIn = parseInt(hInEl?.value, 10);
    const gender = (genderEl?.value || "").trim();

    let ok = true;

    // Birthday: year 1930–2015
    if (!bday) {
      _showError(bdayEl, "ob-v2-err-bday", "Birthday is required.");
      ok = false;
    } else {
      const year = parseInt(bday.slice(0, 4), 10);
      if (isNaN(year) || year < 1930 || year > 2015) {
        _showError(bdayEl, "ob-v2-err-bday", "Please enter a year between 1930 and 2015.");
        ok = false;
      }
    }

    // Weight: 50–500 lbs
    if (isNaN(weight) || weight < 50 || weight > 500) {
      _showError(weightEl, "ob-v2-err-weight", "Weight must be between 50 and 500 lbs.");
      ok = false;
    }

    // Height: feet 3–8, inches 0–11
    if (isNaN(hFt) || hFt < 3 || hFt > 8 || isNaN(hIn) || hIn < 0 || hIn > 11) {
      // Attach error to whichever field is first invalid for border color
      const firstBad = (isNaN(hFt) || hFt < 3 || hFt > 8) ? hFtEl : hInEl;
      _showError(firstBad, "ob-v2-err-height", "Height must be 3-8 ft and 0-11 in.");
      if (hFtEl) hFtEl.classList.add("ob-v2-field-error");
      if (hInEl) hInEl.classList.add("ob-v2-field-error");
      ok = false;
    }

    if (!ok) return;

    const totalInches = (hFt * 12) + hIn;
    const profile = {
      name: name || "Athlete",
      birthday: bday,
      age: String(_calcAge(bday) || ""),
      weight: String(weight),
      height: String(totalInches),
      gender,
      // Preserve any existing profile fields so we don't clobber
      // squat1RM / pool_size / etc. set elsewhere.
      ..._lsGet("profile", {}),
    };
    // Reapply the onboarding-specific fields on top of the existing
    // spread so the user's new inputs win.
    profile.name = name || profile.name;
    profile.birthday = bday;
    profile.age = String(_calcAge(bday) || "");
    profile.weight = String(weight);
    profile.height = String(totalInches);
    profile.gender = gender;

    _state.profile = profile;
    _lsSet("profile", profile);
    // Push to Supabase via the proper mapper.
    if (typeof DB !== "undefined" && DB.profile && DB.profile.save) {
      DB.profile.save(profile).catch(err => console.warn("[OnboardingV2] profile save failed", err));
    }

    goTo("ob-v2-3");
  }

  function _clearFieldErrors() {
    document.querySelectorAll("#ob-v2-2 .ob-v2-field-error").forEach(el => el.classList.remove("ob-v2-field-error"));
    document.querySelectorAll("#ob-v2-2 .ob-v2-error-msg").forEach(el => { el.textContent = ""; el.classList.remove("is-visible"); });
  }

  function _showError(inputEl, errId, msg) {
    if (inputEl) inputEl.classList.add("ob-v2-field-error");
    const err = document.getElementById(errId);
    if (err) { err.textContent = msg; err.classList.add("is-visible"); }
  }

  // ── ob-3: Preferences ──────────────────────────────────────────────

  function _togglePref(btn) {
    if (!btn) return;
    btn.classList.toggle("on");
    const key = btn.getAttribute("data-pref");
    _state.preferences[key] = btn.classList.contains("on");
  }

  function _savePrefsAndContinue() {
    const p = _state.preferences;
    _lsSet("nutritionEnabled", p.nutrition ? "1" : "0");
    _lsSet("hydrationEnabled", p.hydration ? "1" : "0");
    _lsSet("fuelingEnabled", p.fueling ? "1" : "0");
    // workoutPlans toggle doesn't gate anything today, but stash it
    // on onboardingData so the planner can see it later if needed.
    const obData = _lsGet("onboardingData", {}) || {};
    obData.workoutPlansEnabled = !!p.workoutPlans;
    _lsSet("onboardingData", obData);
    goTo("ob-v2-4");
  }

  // ── ob-4: Injuries ─────────────────────────────────────────────────

  function _toggleInjury(btn) {
    if (!btn) return;
    const injury = btn.getAttribute("data-injury");
    if (injury === "none") {
      // Selecting "None" deselects everything else. Toggling off None
      // just removes it.
      const wasOn = btn.classList.contains("is-selected");
      document.querySelectorAll("#ob-v2-injury-chips .ob-v2-injury-chip").forEach(el => el.classList.remove("is-selected"));
      if (!wasOn) btn.classList.add("is-selected");
      return;
    }
    // Selecting a real injury deselects "None".
    const none = document.querySelector('#ob-v2-injury-chips [data-injury="none"]');
    if (none) none.classList.remove("is-selected");
    btn.classList.toggle("is-selected");
  }

  function _saveInjuriesAndContinue() {
    const selected = Array.from(document.querySelectorAll("#ob-v2-injury-chips .ob-v2-injury-chip.is-selected"))
      .map(el => el.getAttribute("data-injury"));
    // If nothing is selected, treat as ["none"] — matches the legacy
    // shape and means "no limitations".
    const injuries = selected.length ? selected : ["none"];
    _state.injuries = injuries;
    _lsSet("injuries", injuries);
    goTo("ob-v2-5");
  }

  // ── ob-5: Connect Apps ─────────────────────────────────────────────

  function _toggleApp(btn) {
    if (!btn) return;
    const isOn = btn.classList.toggle("is-connected");
    btn.textContent = isOn ? "Connected" : "Connect";
  }

  function _saveAppsAndContinue() {
    const connected = Array.from(document.querySelectorAll("#ob-v2-5 .ob-v2-connect-btn.is-connected"))
      .map(el => el.getAttribute("data-app"));
    _state.connectedApps = connected;
    _lsSet("connectedApps", connected);
    // Before showing ob-5b, hide conditional notif sections based on
    // the preferences the user set in ob-3.
    _applyNotifConditionals();
    goTo("ob-v2-5b");
  }

  // ── ob-5b: Notifications ───────────────────────────────────────────

  // Apply conditional visibility: hydration / nutrition sections only
  // show if their corresponding toggle was ON in ob-3.
  function _applyNotifConditionals() {
    const hydEnabled = localStorage.getItem("hydrationEnabled") === "1";
    const nutEnabled = localStorage.getItem("nutritionEnabled") === "1";
    const hydSection = document.getElementById("ob-v2-notif-hydration-section");
    const nutSection = document.getElementById("ob-v2-notif-nutrition-section");
    if (hydSection) hydSection.style.display = hydEnabled ? "" : "none";
    if (nutSection) nutSection.style.display = nutEnabled ? "" : "none";
  }

  function _toggleNotif(btn) {
    if (!btn) return;
    const isOn = btn.classList.toggle("on");
    const key = btn.getAttribute("data-notif");
    const freq = document.getElementById(`ob-v2-notif-${key === "workoutReminder" ? "workout" : key}-freq`);
    if (freq) freq.style.display = isOn ? "" : "none";
  }

  function _selectNotifSingle(btn) {
    if (!btn) return;
    const group = btn.getAttribute("data-notif-opt");
    document.querySelectorAll(`[data-notif-opt="${group}"]`).forEach(el => el.classList.remove("is-selected"));
    btn.classList.add("is-selected");
  }

  function _toggleNotifMulti(btn) {
    if (!btn) return;
    btn.classList.toggle("is-selected");
    // Update the nutrition description when triggers change.
    const selected = Array.from(document.querySelectorAll('[data-notif-opt="nutritionTrigger"].is-selected'))
      .map(el => el.getAttribute("data-value"));
    const desc = document.getElementById("ob-v2-nutrition-desc");
    if (desc) {
      if (!selected.length) {
        desc.textContent = "Pick when you'd like to be reminded.";
      } else {
        const parts = [];
        if (selected.includes("nolog")) parts.push("we'll check in mid-morning if you haven't logged");
        if (selected.includes("mealtime")) parts.push("nudge at breakfast, lunch, and dinner");
        if (selected.includes("offtarget")) parts.push("alert when you're far from your daily targets");
        desc.textContent = parts.join(" · ");
      }
    }
  }

  function _collectNotifSettings() {
    const workoutOn = document.querySelector('#ob-v2-5b [data-notif="workoutReminder"]')?.classList.contains("on");
    const hydrationOn = document.querySelector('#ob-v2-5b [data-notif="hydration"]')?.classList.contains("on");
    const nutritionOn = document.querySelector('#ob-v2-5b [data-notif="nutrition"]')?.classList.contains("on");
    const summaryOn = document.querySelector('#ob-v2-5b [data-notif="weeklySummary"]')?.classList.contains("on");
    const workoutTime = document.querySelector('#ob-v2-5b [data-notif-opt="workoutTime"].is-selected')?.getAttribute("data-value") || "7AM";
    const hydrationFreq = document.querySelector('#ob-v2-5b [data-notif-opt="hydrationFreq"].is-selected')?.getAttribute("data-value") || "2hr";
    const nutritionTriggers = Array.from(document.querySelectorAll('#ob-v2-5b [data-notif-opt="nutritionTrigger"].is-selected'))
      .map(el => el.getAttribute("data-value"));
    return {
      workoutReminder: { enabled: !!workoutOn, time: workoutTime },
      hydration:       { enabled: !!hydrationOn, frequency: hydrationFreq },
      nutrition:       { enabled: !!nutritionOn, triggers: nutritionTriggers },
      weeklySummary:   { enabled: !!summaryOn },
    };
  }

  function _saveNotifsAndContinue() {
    const settings = _collectNotifSettings();
    _state.notifSettings = settings;
    _lsSet("notifSettings", settings);
    goTo("ob-v2-6");
  }

  // ── ob-6: The Fork ─────────────────────────────────────────────────

  function _selectFork(choice) {
    document.querySelectorAll("#ob-v2-6 .ob-v2-fork-card").forEach(el => el.classList.remove("is-selected"));
    const card = document.getElementById(choice === "plan" ? "ob-v2-fork-plan" : "ob-v2-fork-manual");
    if (card) card.classList.add("is-selected");
    // Auto-advance after 350ms so the user sees the selection state
    setTimeout(() => {
      if (choice === "plan") {
        // Transition from onboarding overlay into the Build Plan overlay.
        // Keep mode=onboarding so _confirmAndSavePlan still stamps
        // hasOnboarded=1 at the end of bp-done. Start with a fresh
        // Build Plan state so first-time users see a blank slate.
        _resetBuildPlanState();
        _state.thresholds = _loadExistingThresholds();
        _clearBuildPlanScreens();
        _openBuildPlanOverlay();
        goTo("bp-v2-1");
      } else {
        goTo("ob-v2-manual-landing");
      }
    }, 350);
  }

  // Called from the manual-landing screen's action buttons. Completes
  // onboarding, closes the overlay, and optionally navigates to a
  // starting surface on the main app.
  function _finishManual(target) {
    _finishOnboarding(false, target);
  }

  // Final completion handler for the MANUAL (no-plan) path only.
  // The plan fork is handled directly in _selectFork → openBuildPlan.
  function _finishOnboarding(_buildPlan, manualTarget) {
    _lsSet("hasOnboarded", "1");
    try {
      if (typeof loadProfileIntoForm === "function") loadProfileIntoForm();
      if (typeof updateNavInitials === "function") updateNavInitials();
      if (typeof renderGreeting === "function") renderGreeting();
    } catch {}

    _closeOverlay();

    const dest = manualTarget === "library" ? "saved-library"
               : manualTarget === "explore" ? "home"
               : "home";
    if (typeof showTab === "function") showTab(dest);
  }

  // ── Public API ─────────────────────────────────────────────────────
  if (typeof window !== "undefined") {
    window.OnboardingV2 = {
      maybeStart,
      openBuildPlan,
      openBuildPlanEdit,
      closeBuildPlan,
      openOnboarding,
      goTo,
      validateProfile,
      // Private helpers exposed for inline onclick handlers
      _togglePref,
      _savePrefsAndContinue,
      _toggleInjury,
      _saveInjuriesAndContinue,
      _toggleApp,
      _saveAppsAndContinue,
      _toggleNotif,
      _selectNotifSingle,
      _toggleNotifMulti,
      _saveNotifsAndContinue,
      _selectFork,
      _finishManual,
      _selectPreviewPhase,
      // Internals for subsequent phases and tests
      _state,
      _lsSet,
      _lsGet,
      _escape,
      _hydrateIcons,
    };
  }
  // BUILD PLAN SCREENS (bp-v2-*) — spec §4.2

  function _bpBack(currentScreen) {
    if (currentScreen === "bp-v2-1") {
      // Standalone path: dismiss the Build Plan modal entirely.
      if (_state.mode === "buildplan") { _closeBuildPlanOverlay(); return; }
      // Onboarding fork path: close the BP overlay and return to ob-6.
      _closeBuildPlanOverlay();
      goTo("ob-v2-6");
      return;
    }
    if (currentScreen === "bp-v2-4") {
      goTo(_state.trainingGoals.includes("race") ? "bp-v2-3-race" : "bp-v2-3-norace");
      return;
    }
    if (currentScreen === "bp-v2-5") {
      // When editing an existing plan we jump straight into bp-v2-5,
      // so "Back" should dismiss the modal rather than walk backwards
      // through screens the user never saw.
      if (_state._editingPlanId) { _closeBuildPlanOverlay(); return; }
      goTo(_shouldShowLongDays() ? "bp-v2-4b" : (_state.selectedSports.includes("strength") ? "bp-v2-6" : "bp-v2-4"));
      return;
    }
    if (currentScreen === "bp-v2-4b") {
      // Mirror of the forward routing into 4b: strength users came from
      // the strength setup screen (bp-v2-6); everyone else came from the
      // plan-details screen (bp-v2-4). Hardcoding bp-v2-6 here was a bug —
      // non-strength athletes got dropped into "strength sessions per
      // week" when they pressed Back.
      goTo(_state.selectedSports.includes("strength") ? "bp-v2-6" : "bp-v2-4");
      return;
    }
  }

  function _toggleSport(btn) {
    if (!btn) return;
    const sport = btn.getAttribute("data-sport");
    if (sport === "triathlon") {
      const on = !btn.classList.contains("is-selected");
      btn.classList.toggle("is-selected", on);
      ["swim", "bike", "run"].forEach(s => {
        const el = document.querySelector(`#bp-v2-sport-grid [data-sport="${s}"]`);
        if (el) el.classList.toggle("is-selected", on);
      });
      const triNote = document.getElementById("bp-v2-tri-note");
      if (triNote) triNote.style.display = on ? "" : "none";
    } else if (sport === "hyrox") {
      // Hyrox is 50/50 running + functional strength (Philosophy §9.5).
      // Selecting Hyrox auto-selects run + strength so the Build Plan
      // downstream (thresholds, schedule, plan generation) actually
      // mixes the three training types — otherwise every day seeds as
      // "hyrox" and the plan renders identical sessions all week.
      const on = !btn.classList.contains("is-selected");
      btn.classList.toggle("is-selected", on);
      ["run", "strength"].forEach(s => {
        const el = document.querySelector(`#bp-v2-sport-grid [data-sport="${s}"]`);
        if (el) el.classList.toggle("is-selected", on);
      });
    } else {
      btn.classList.toggle("is-selected");
    }
    _applySportSideEffects();
  }
  function _applySportSideEffects() {
    const strengthSelected = !!document.querySelector('#bp-v2-sport-grid [data-sport="strength"].is-selected');
    const equip = document.getElementById("bp-v2-equipment-section");
    if (equip) equip.style.display = strengthSelected ? "" : "none";
  }
  function _selectGym(btn) {
    if (!btn) return;
    document.querySelectorAll("#bp-v2-equipment-section [data-gym]").forEach(el => el.classList.remove("is-selected"));
    btn.classList.add("is-selected");
    _state.gymAccess = btn.getAttribute("data-gym");
  }
  function _saveSportsAndContinue() {
    const selected = Array.from(document.querySelectorAll("#bp-v2-sport-grid .is-selected"))
      .map(el => el.getAttribute("data-sport"));
    const sports = selected.filter(s => s !== "triathlon");
    _state.selectedSports = sports;
    _lsSet("selectedSports", sports);
    _renderGoalCards();
    goTo("bp-v2-2");
  }

  // Goal catalog — training intent only. Body-composition goals
  // (bulk / cut / lose / build / maintain) used to live here too,
  // which meant Build Plan silently rewrote the user's nutrition
  // every plan cycle. Body comp now lives on profile.bodyCompGoal
  // (Athlete Profile UI) — independent axis, single source of truth.
  // Build Plan asks ONLY about training direction.
  //
  // §2.5.2: Endurance athletes (standalone endurance + hybrid) pick from
  //   the endurance goal list.
  // §2.5.1: Standalone-strength athletes pick from the strength-only list.
  // §2.5.3: Hybrid athletes ALSO pick exactly one strength role below
  //   the endurance goals. Strength role drives rep ranges, session
  //   length, frequency, and exercise bias (see Phase 2 in _buildSessionForSport).

  const _ENDURANCE_GOALS = [
    { id: "race",      icon: "flag",     text: "Train for a Race" },
    { id: "speed",     icon: "zap",      text: "Get Faster" },
    { id: "endurance", icon: "activity", text: "Build Endurance" },
    { id: "general",   icon: "target",   text: "General Fitness" },
  ];

  const _STRENGTH_ONLY_GOALS = [
    { id: "stronger",  icon: "trophy",   text: "Get Stronger" },
    { id: "general",   icon: "target",   text: "General Fitness" },
  ];

  // Strength roles for hybrid athletes (§2.5.3). Radio, not checkbox —
  // the generator needs exactly one. Drives PROGRAMMING (rep ranges,
  // exercise bias) only — does not feed nutrition. Hypertrophy used to
  // live here as "Build Muscle" but it leaked into the body-comp math
  // by silently flipping bulking on; replaced with a neutral
  // "General Strength" option that programs the same balanced split
  // without the nutrition side effect.
  const _HYBRID_STRENGTH_ROLES = [
    { id: "injury_prevention", icon: "shield",   text: "Injury Prevention", desc: "Keep joints durable, fix imbalances." },
    { id: "race_performance",  icon: "trophy",   text: "Race Performance",  desc: "Support your race with sport-specific power." },
    { id: "general",           icon: "weights",  text: "General Strength",  desc: "Balanced full-body strength alongside cardio." },
    { id: "minimal",           icon: "flame",    text: "Minimal",           desc: "Light maintenance only." },
  ];

  function _goalCardHTML(g) {
    return '<button type="button" class="ob-v2-goal-card" data-goal="' + g.id + '" onclick="OnboardingV2._toggleGoal(this)">' +
        '<span class="ob-v2-goal-icon" data-ob-icon="' + g.icon + '"></span>' +
        '<span class="ob-v2-goal-text">' + _escape(g.text) + '</span>' +
        '<span class="ob-v2-goal-check">&#10003;</span>' +
      '</button>';
  }
  function _roleCardHTML(r) {
    return '<button type="button" class="ob-v2-goal-card ob-v2-goal-card--role" data-role="' + r.id + '" onclick="OnboardingV2._toggleStrengthRole(this)">' +
        '<span class="ob-v2-goal-icon" data-ob-icon="' + r.icon + '"></span>' +
        '<span class="ob-v2-goal-text">' +
          _escape(r.text) +
          '<span class="ob-v2-goal-desc">' + _escape(r.desc) + '</span>' +
        '</span>' +
        '<span class="ob-v2-goal-check">&#10003;</span>' +
      '</button>';
  }

  function _renderGoalCards() {
    const host = document.getElementById("bp-v2-goal-cards");
    if (!host) return;
    const sports = _state.selectedSports || [];
    const hasStrength = sports.includes("strength");
    const hasEndurance = sports.some(s => ["run", "bike", "swim", "hyrox", "rowing"].includes(s));

    let html = "";
    let subtitle = "Select all that apply.";

    if (hasStrength && !hasEndurance) {
      // Standalone strength — single section, unchanged set
      subtitle = "Select all that apply. These shape your rep ranges, volume, and nutrition.";
      html += _STRENGTH_ONLY_GOALS.map(_goalCardHTML).join("");
    } else if (!hasStrength && hasEndurance) {
      // Standalone endurance — show endurance goals + a recommendation
      // card. The user can accept to add strength and flip into hybrid.
      subtitle = "Select all that apply. These shape your cardio intensity and volume.";
      html += _ENDURANCE_GOALS.map(_goalCardHTML).join("");
      html += '<div class="ob-v2-goal-recommendation" id="bp-v2-strength-recommendation">' +
        '<div class="ob-v2-goal-recommendation-body">' +
          '<div class="ob-v2-goal-recommendation-title">Recommendation — Add Strength</div>' +
          '<p class="ob-v2-goal-recommendation-text">1–2 short strength sessions per week reduce injury risk and preserve muscle while you train endurance.</p>' +
        '</div>' +
        '<button type="button" class="ob-v2-btn-secondary ob-v2-goal-recommendation-btn" onclick="OnboardingV2._addStrengthFromRecommendation()">Add Strength</button>' +
      '</div>';
    } else if (hasStrength && hasEndurance) {
      // Hybrid — two sections on one screen
      subtitle = "Select all that apply for endurance, then pick one Strength Goal.";
      html += '<div class="ob-v2-goal-section-label">Endurance Goals</div>';
      html += _ENDURANCE_GOALS.map(_goalCardHTML).join("");
      html += '<div class="ob-v2-goal-section-label ob-v2-goal-section-label--strength">Strength Goal</div>';
      html += '<p class="ob-v2-goal-section-hint">Pick one — this shapes your strength sessions.</p>';
      html += _HYBRID_STRENGTH_ROLES.map(_roleCardHTML).join("");
      html += '<p class="ob-v2-goal-error" id="bp-v2-role-error" style="display:none">Pick a strength goal to continue.</p>';
    } else {
      // No sports selected at all — shouldn't be reachable via the UI
      // but render something sensible if it is.
      html += _ENDURANCE_GOALS.map(_goalCardHTML).join("");
    }

    host.innerHTML = html;
    _hydrateIcons(host);

    // Reapply previously-selected endurance goals (user going back)
    (_state.trainingGoals || []).forEach(id => {
      const el = host.querySelector('[data-goal="' + id + '"]');
      if (el) el.classList.add("is-selected");
    });
    // Reapply previously-selected strength role
    if (_state.strengthRole) {
      const el = host.querySelector('[data-role="' + _state.strengthRole + '"]');
      if (el) el.classList.add("is-selected");
    }

    const sub = document.getElementById("bp-v2-goal-subtitle");
    if (sub) sub.textContent = subtitle;
  }

  function _toggleGoal(btn) { if (btn) btn.classList.toggle("is-selected"); }

  // Radio semantics — only one role can be selected.
  function _toggleStrengthRole(btn) {
    if (!btn) return;
    const host = document.getElementById("bp-v2-goal-cards");
    if (!host) return;
    host.querySelectorAll('[data-role]').forEach(el => el.classList.remove("is-selected"));
    btn.classList.add("is-selected");
    const errEl = document.getElementById("bp-v2-role-error");
    if (errEl) errEl.style.display = "none";
  }

  // "Add Strength" on the standalone-endurance recommendation card —
  // promotes the athlete to hybrid by adding strength to their sports
  // selection and re-rendering the goals screen with both sections.
  function _addStrengthFromRecommendation() {
    const sports = Array.isArray(_state.selectedSports) ? _state.selectedSports.slice() : [];
    if (!sports.includes("strength")) sports.push("strength");
    _state.selectedSports = sports;
    _lsSet("selectedSports", sports);
    _renderGoalCards();
  }
  function _saveGoalsAndContinue() {
    const goals = Array.from(document.querySelectorAll("#bp-v2-2 [data-goal].is-selected"))
      .map(el => el.getAttribute("data-goal"));
    const sports = _state.selectedSports || [];
    const hasStrength = sports.includes("strength");
    const hasEndurance = sports.some(s => ["run", "bike", "swim", "hyrox", "rowing"].includes(s));

    // Defensive: bulk/cut don't apply to endurance-tinged plans (you
    // can't bulk and train for a triathlon). Drop them if they leaked
    // in through a stale saved state.
    const cleaned = (hasEndurance)
      ? goals.filter(g => g !== "bulk" && g !== "cut")
      : goals;
    _state.trainingGoals = cleaned;
    _lsSet("trainingGoals", cleaned);

    // Hybrid athletes must ALSO pick a Strength Goal (§2.5.3).
    if (hasStrength && hasEndurance) {
      const pickedRole = document.querySelector("#bp-v2-2 [data-role].is-selected")?.getAttribute("data-role") || null;
      if (!pickedRole) {
        const errEl = document.getElementById("bp-v2-role-error");
        if (errEl) errEl.style.display = "";
        const host = document.getElementById("bp-v2-goal-cards");
        const firstRole = host?.querySelector("[data-role]");
        if (firstRole && typeof firstRole.scrollIntoView === "function") {
          firstRole.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        return;
      }
      _state.strengthRole = pickedRole;
      _lsSet("strengthRole", pickedRole);
    } else {
      // Not a hybrid athlete — clear any stale role so the generator
      // doesn't read one that no longer applies.
      _state.strengthRole = null;
      _lsSet("strengthRole", null);
    }

    if (cleaned.includes("race")) { goTo("bp-v2-3-race"); _applyRaceCategoryDefault(); _applyRacePrioritySection(); return; }
    // Strength-only users skip the generic Plan Details screen — the
    // same fields (block length, session length, days per week) live
    // on bp-v2-6 Strength Setup to avoid asking twice.
    const strengthOnly = sports.length > 0 && sports.every(s => s === "strength");
    if (strengthOnly) {
      _state.raceEvents = [];
      _lsSet("raceEvents", []);
      goTo("bp-v2-4");
      _renderThresholdSections();
      return;
    }
    goTo("bp-v2-3-norace");
  }

  // Pre-select the Race Category dropdown based on the user's
  // selectedSports. Hyrox-only → hyrox; single run/bike/swim → matching
  // category; swim+bike+run → triathlon; etc. Only applied on first entry
  // to the race step (when currentRace hasn't been saved yet) so coming
  // back via Back doesn't clobber a manual change.
  function _applyRaceCategoryDefault() {
    // Default the race date to ~14 weeks out when the field is empty.
    // Without this iOS Safari renders <input type="date"> as a tiny
    // bubble (no value → no rendered placeholder text), AND the user
    // could click Continue with no date set. 14w matches the
    // "recommended plan" callout copy.
    _applyRaceDateDefault();

    const sel = document.getElementById("bp-v2-race-category");
    if (!sel) return;
    // Always derive from selectedSports when entering the race step —
    // previously this short-circuited on _state.currentRace.date, but
    // openBuildPlan() restores currentRace from raceEvents[0] (the
    // existing A race on the calendar), so the date was populated from
    // a DIFFERENT prior race and the guard prevented the new race's
    // category from reflecting the current selection.
    const cat = _defaultRaceCategoryForSports(_state.selectedSports || []);
    if (!cat || cat === sel.value) return;
    sel.value = cat;
    _updateRaceTypes();
  }

  function _applyRaceDateDefault() {
    const input = document.getElementById("bp-v2-race-date");
    if (!input || input.value) return;
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 98); // 14 weeks from today
    input.value = d.toISOString().slice(0, 10);
    _updateWeeksCallout();
  }

  function _defaultRaceCategoryForSports(sports) {
    if (!Array.isArray(sports) || !sports.length) return null;
    const has = s => sports.includes(s);
    if (has("triathlon")) return "triathlon";
    if (has("swim") && has("bike") && has("run")) return "triathlon";
    // Hyrox is distinctive — any selection containing it defaults to
    // hyrox, unless the three tri disciplines were also picked (handled
    // above). Checked before the single-discipline branch so run+hyrox
    // stays Hyrox rather than degrading to Running.
    if (has("hyrox")) return "hyrox";
    // Strength is a companion sport, not a race category — ignore it
    // when deciding the default so "run + strength" still defaults to
    // Running and "bike + strength" still defaults to Cycling.
    const endurance = sports.filter(s => s !== "strength");
    if (endurance.length === 1) {
      if (endurance[0] === "run")   return "running";
      if (endurance[0] === "bike")  return "cycling";
      if (endurance[0] === "swim")  return "swimming";
    }
    if (endurance.includes("run"))  return "running";
    if (endurance.includes("bike")) return "cycling";
    if (endurance.includes("swim")) return "swimming";
    return null;
  }

  function _updateRaceTypes() {
    const cat = document.getElementById("bp-v2-race-category")?.value;
    const typeSel = document.getElementById("bp-v2-race-type");
    if (!typeSel) return;
    const OPTIONS = {
      triathlon: [["sprint","Sprint Triathlon"],["olympic","Olympic Triathlon"],["halfIronman","Half Ironman (70.3)"],["ironman","Full Ironman (140.6)"]],
      running:   [["5k","5K"],["10k","10K"],["halfMarathon","Half Marathon"],["marathon","Marathon"],["ultra","Ultra"]],
      cycling:   [["century","Century"],["granFondo","Gran Fondo"],["crit","Criterium"],["stage","Stage Race"]],
      swimming:  [["openWater","Open Water 5K"],["pool","Pool Meet"]],
      hyrox:     [["hyrox","Hyrox"]],
      other:     [["custom","Custom Race"]],
    };
    const list = OPTIONS[cat] || OPTIONS.triathlon;
    typeSel.innerHTML = list.map(([v, l]) => `<option value="${v}">${_escape(l)}</option>`).join("");
    _updateWeeksCallout();
  }
  // Plans further out than this are almost certainly a typo (e.g.
  // "09/05/20205" → 948555 weeks). 104 weeks = 2 years, which already
  // covers even the longest Ironman or ultra arc with comfortable runway.
  const MAX_PLAN_WEEKS = 104;

  function _updateWeeksCallout() {
    const input = document.getElementById("bp-v2-race-date");
    // Pin the native picker's floor to today so users can't scroll back
    // into past dates. Also updates after DST / midnight rollovers.
    if (input && !input.min) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      input.min = today.toISOString().slice(0, 10);
    }
    const date = input && input.value;
    const text = document.getElementById("bp-v2-weeks-text");
    if (!text) return;
    const gap = document.getElementById("bp-v2-gap-fill-section");
    // B race short-circuits the whole plan flow — there's no new
    // training block being generated, so the "extra time before your
    // plan starts" lead-in block is meaningless. Hide it whenever the
    // current race priority is B, regardless of how far out the race is.
    const currentPriority = (_state.currentRace && _state.currentRace.priority) || "A";
    if (currentPriority === "B") {
      if (gap) gap.style.display = "none";
    }
    if (!date) {
      text.textContent = "Pick a race date to see your timeline.";
      if (gap && currentPriority !== "B") gap.style.display = "none";
      return;
    }
    // Guard against typos like year "20205" that produce nonsense week
    // counts. Show a friendly warning instead of echoing the raw number.
    const parsed = new Date(date);
    const now = new Date();
    if (isNaN(parsed.getTime())) {
      text.textContent = "That doesn't look like a valid race date — please re-enter.";
      if (gap && currentPriority !== "B") gap.style.display = "none";
      return;
    }
    // Reject past dates — training plans are built backwards from a
    // future race. A race that already happened can't drive periodization.
    const todayMid = new Date(); todayMid.setHours(0, 0, 0, 0);
    if (parsed < todayMid) {
      text.textContent = "That date is in the past — pick a date in the future.";
      if (gap && currentPriority !== "B") gap.style.display = "none";
      return;
    }
    const diffDays = Math.max(0, Math.ceil((parsed - now) / 86400000));
    const weeks = Math.ceil(diffDays / 7);
    if (weeks > MAX_PLAN_WEEKS) {
      text.textContent = "That date is more than 2 years out — double-check the year.";
      if (gap && currentPriority !== "B") gap.style.display = "none";
      return;
    }
    const raceType = document.getElementById("bp-v2-race-type")?.value || "ironman";
    const planMax = _planWeeksForType(raceType);
    text.textContent = weeks + " weeks until your race. Recommended plan length: " + planMax[0] + "-" + planMax[1] + " weeks.";
    if (gap && currentPriority !== "B") {
      gap.style.display = weeks > planMax[1] ? "" : "none";
    }
  }
  function _planWeeksForType(type) {
    const map = {
      sprint: [8, 12], olympic: [10, 14], halfIronman: [16, 22], ironman: [20, 30],
      "5k": [6, 10], "10k": [8, 12], halfMarathon: [12, 16], marathon: [16, 20], ultra: [20, 30],
      century: [12, 16], granFondo: [10, 14], crit: [8, 12], stage: [12, 16],
      openWater: [8, 12], pool: [6, 10], hyrox: [10, 14], custom: [8, 16],
    };
    return map[type] || [8, 16];
  }
  function _selectRaceGoal(btn) {
    if (!btn) return;
    document.querySelectorAll("#bp-v2-3-race [data-race-goal]").forEach(el => el.classList.remove("is-selected"));
    btn.classList.add("is-selected");
  }
  function _selectLeadInPhase(btn) {
    if (!btn) return;
    document.querySelectorAll("#bp-v2-gap-fill-section [data-leadin-phase]").forEach(el => el.classList.remove("is-selected"));
    btn.classList.add("is-selected");
  }
  function _adjustLeadIn(delta) {
    const cur = parseInt(document.getElementById("bp-v2-leadin-count")?.textContent, 10) || 4;
    const next = Math.max(1, Math.min(7, cur + delta));
    _state.leadInCount = next;
    const el = document.getElementById("bp-v2-leadin-count");
    if (el) el.textContent = String(next);
  }
  function _selectRacePriority(btn) {
    if (!btn) return;
    const group = btn.parentElement;
    if (!group) return;
    group.querySelectorAll(".ob-v2-chip").forEach(el => el.classList.remove("is-selected"));
    btn.classList.add("is-selected");
    _state.currentRace.priority = btn.getAttribute("data-race-priority") || "A";
    // Re-run the weeks-callout so the lead-in / gap-fill section
    // hides instantly when the user flips to B (and reappears for A
    // if they have enough runway).
    _updateWeeksCallout();
  }

  // Returns the first upcoming A-priority race in localStorage.events,
  // or null if there isn't one. Used to decide whether to surface the
  // A/B priority picker on bp-v2-3-race, and whether to demote an
  // existing A race when the user sets the new one to A.
  function _existingARace() {
    let events = [];
    try { events = JSON.parse(localStorage.getItem("events") || "[]") || []; } catch {}
    const todayStr = new Date().toISOString().slice(0, 10);
    return events.find(e => e && e.date >= todayStr && (e.priority || "A").toUpperCase() === "A") || null;
  }

  // Show / hide the priority picker when the race screen becomes
  // visible. When there's already an upcoming A race, default the new
  // one to B and surface the picker with a hint that mentions the
  // existing race by name.
  function _applyRacePrioritySection() {
    const group = document.getElementById("bp-v2-race-priority-group");
    if (!group) return;
    const existing = _existingARace();
    if (!existing) {
      group.style.display = "none";
      _state.currentRace.priority = "A";
      return;
    }
    group.style.display = "";
    const hint = document.getElementById("bp-v2-race-priority-hint");
    if (hint) {
      const name = existing.name || existing.type || "your current A race";
      hint.textContent = 'You already have an A race (' + name + '). Only one A race at a time — pick A to demote ' + name + ' to B, or keep this as a B race.';
    }
    // Default the new race to B when an A race exists.
    _state.currentRace.priority = "B";
    group.querySelectorAll(".ob-v2-chip").forEach(el =>
      el.classList.toggle("is-selected", el.getAttribute("data-race-priority") === "B")
    );
  }

  function _saveRaceAndContinue() {
    const name = document.getElementById("bp-v2-race-name")?.value.trim() || "";
    const category = document.getElementById("bp-v2-race-category")?.value || "triathlon";
    const type = document.getElementById("bp-v2-race-type")?.value || "ironman";
    const date = document.getElementById("bp-v2-race-date")?.value || "";
    const goal = document.querySelector("#bp-v2-3-race [data-race-goal].is-selected")?.getAttribute("data-race-goal") || "finish";
    const priority = document.querySelector("#bp-v2-race-priority-group [data-race-priority].is-selected")?.getAttribute("data-race-priority") || _state.currentRace.priority || "A";
    const leadInPhase = document.querySelector("#bp-v2-gap-fill-section [data-leadin-phase].is-selected")?.getAttribute("data-leadin-phase") || null;
    const gapVisible = document.getElementById("bp-v2-gap-fill-section")?.style.display !== "none";
    const leadIn = gapVisible && leadInPhase ? { phase: leadInPhase, daysPerWeek: _state.leadInCount } : null;

    // Race date is required. Without it plan generation has no target
    // week to work back from, and the UI already prompts the user via
    // the weeks-callout strip.
    if (!date) {
      const text = document.getElementById("bp-v2-weeks-text");
      if (text) text.textContent = "Pick a race date before continuing.";
      const input = document.getElementById("bp-v2-race-date");
      if (input) { input.focus(); input.showPicker?.(); }
      return;
    }

    // Reject obviously-bad dates (past, or year "20205" typos) before
    // they can propagate through plan generation.
    {
      const parsed = new Date(date);
      const todayMid = new Date(); todayMid.setHours(0, 0, 0, 0);
      const isPast = !isNaN(parsed.getTime()) && parsed < todayMid;
      const weeksOut = isNaN(parsed.getTime())
        ? NaN
        : Math.ceil(Math.max(0, (parsed - new Date()) / 86400000) / 7);
      const badDate = isNaN(parsed.getTime()) || isPast || weeksOut > MAX_PLAN_WEEKS;
      if (badDate) {
        const text = document.getElementById("bp-v2-weeks-text");
        if (text) {
          if (isNaN(parsed.getTime())) text.textContent = "That doesn't look like a valid race date — please re-enter.";
          else if (isPast)              text.textContent = "That date is in the past — pick a date in the future.";
          else                          text.textContent = "That date is more than 2 years out — double-check the year.";
        }
        const input = document.getElementById("bp-v2-race-date");
        if (input) { input.focus(); input.select?.(); }
        return;
      }
    }

    // If the user picks A and there's already an existing A race in
    // localStorage.events, demote the existing one to B in-place.
    // We only touch the priority field — other race metadata stays.
    if (priority === "A") {
      try {
        const events = JSON.parse(localStorage.getItem("events") || "[]") || [];
        const todayStr = new Date().toISOString().slice(0, 10);
        let demoted = false;
        events.forEach(e => {
          if (e && e.date >= todayStr && (e.priority || "A").toUpperCase() === "A") {
            e.priority = "B";
            demoted = true;
          }
        });
        if (demoted) {
          localStorage.setItem("events", JSON.stringify(events));
          if (typeof DB !== "undefined" && DB.syncKey) DB.syncKey("events");
        }
      } catch (err) { console.warn("[OnboardingV2] A-race demotion failed", err); }
    }

    const race = { name: name || type, category, type, date, priority, goal, leadIn };
    _state.currentRace = race;
    _state.raceEvents = [race];
    _lsSet("raceEvents", _state.raceEvents);

    // B race short-circuit: a B race rides on top of the existing A
    // race's plan — there's no new threshold test, no new schedule,
    // no new strength split. Save the race as a calendar event,
    // apply its taper window to the A-race plan via insertBRaceWindow,
    // and show a compact review of the A-race week the B race sits
    // in so the user can glance at what's already scheduled and
    // decide whether to tweak.
    if (priority === "B") {
      try {
        _persistBRaceAndReshape(race);
      } catch (e) {
        console.warn("[OnboardingV2] B race short-circuit save failed", e);
      }
      _state._bRaceReviewDate = race.date || null;
      goTo("bp-v2-b-review");
      _renderBRaceReview(race);
      return;
    }

    goTo("bp-v2-4");
    _renderThresholdSections();
  }

  // Render the B-race review screen: a mini day-by-day strip of the
  // A-race plan's week that the B race sits inside, with the B race
  // day highlighted. Pulls live data from workoutSchedule (after
  // insertBRaceWindow has already reshaped it) so the preview
  // reflects the tapered schedule the user will actually train.
  function _renderBRaceReview(race) {
    const container = document.getElementById("bp-v2-b-review-week");
    const label = document.getElementById("bp-v2-b-review-week-label");
    const subtitle = document.getElementById("bp-v2-b-review-subtitle");
    if (!container) return;
    if (subtitle && race && race.name) {
      subtitle.textContent = `Your A-race plan already covers the week of ${race.name}. We recommend leaving it as-is — the taper has been adjusted around race day — but here's what's scheduled if you want to tweak anything.`;
    }
    const raceDate = (race && race.date) ? new Date(race.date + "T12:00:00") : new Date();
    if (isNaN(raceDate.getTime())) return;
    // Monday-anchored week containing the race date.
    const monday = new Date(raceDate);
    const dow = monday.getDay();
    monday.setDate(monday.getDate() + (dow === 0 ? -6 : 1 - dow));
    monday.setHours(0, 0, 0, 0);
    const weekStartIso = monday.toISOString().slice(0, 10);
    const weekEnd = new Date(monday); weekEnd.setDate(weekEnd.getDate() + 6);
    if (label) {
      const fmt = d => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      label.textContent = `Race week · ${fmt(monday)} – ${fmt(weekEnd)}`;
    }
    let schedule = [];
    try { schedule = JSON.parse(localStorage.getItem("workoutSchedule")) || []; } catch {}
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday); d.setDate(d.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      const daySessions = schedule.filter(s => s && s.date === iso && !_isRestSession(s));
      const isRaceDay = iso === (race && race.date);
      const dow = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][d.getDay() === 0 ? 6 : d.getDay() - 1];
      days.push({ iso, dow, dayNum: d.getDate(), sessions: daySessions, isRaceDay });
    }
    container.innerHTML = days.map(day => {
      const chips = day.isRaceDay
        ? `<span class="ob-v2-b-review-race-chip">${_escape(race.name || "Race day")}</span>`
        : (day.sessions.length === 0
            ? `<span class="ob-v2-b-review-rest">Rest</span>`
            : day.sessions.map(s => `<span class="ob-v2-b-review-chip">${_escape(s.sessionName || s.type || "Session")}</span>`).join(""));
      return `
        <div class="ob-v2-b-review-row ${day.isRaceDay ? "is-race-day" : ""}">
          <div class="ob-v2-b-review-dow">${day.dow} <span class="ob-v2-b-review-num">${day.dayNum}</span></div>
          <div class="ob-v2-b-review-chips">${chips}</div>
        </div>`;
    }).join("");
  }

  // Helper: treat anything that looks like a rest placeholder as
  // rest so the review strip shows "Rest" instead of a phantom chip.
  function _isRestSession(s) {
    if (!s) return false;
    const load = String(s.load || "").toLowerCase();
    const type = String(s.type || "").toLowerCase();
    const disc = String(s.discipline || "").toLowerCase();
    const name = String(s.sessionName || "").toLowerCase();
    return load === "rest" || type === "rest" || disc === "rest" || /^\s*rest\s*$/.test(name);
  }

  // "Tweak this week in calendar" — close the overlay, jump to home,
  // and snap the calendar to the B-race week so the user can tap
  // into any day to edit without hunting for it.
  function _goToBRaceInCalendar() {
    const dateStr = _state._bRaceReviewDate;
    _closeBuildPlanOverlay();
    _closeOverlay();
    try {
      if (typeof renderRaceEvents === "function") renderRaceEvents();
      if (typeof renderTrainingInputs === "function") renderTrainingInputs();
    } catch {}
    if (typeof showTab === "function") showTab("home");
    // Snap the home calendar to the B race week and select the race day.
    // Previously this did `window.currentWeekStart = …`, but calendar.js
    // declares currentWeekStart with `let` — assigning to window creates
    // a new window property without touching the let binding, so the
    // calendar stayed on its current week. jumpCalendarToWeek (exposed
    // from calendar.js) mutates the real binding in its own scope.
    try {
      if (dateStr && typeof jumpCalendarToWeek === "function") {
        jumpCalendarToWeek(dateStr);
      } else if (dateStr && typeof selectDay === "function") {
        selectDay(dateStr);
      } else if (typeof renderCalendar === "function") {
        renderCalendar();
      }
    } catch (e) { console.warn("[OnboardingV2] jump to B race week failed", e); }
  }

  // Save a B race as a calendar event and let the existing multi-race
  // helpers (prepareRaceCalendar + insertBRaceWindow) reshape the A
  // race's workoutSchedule taper window around it. No new training
  // plan is generated — that's the whole point of B priority.
  function _persistBRaceAndReshape(race) {
    if (!race || !race.date) return;
    // Append to legacy events store in the same shape the A-race flow uses.
    const legacy = _mapRacesToLegacyEvents([race]);
    if (legacy.length) {
      const existing = _lsGet("events", []) || [];
      _lsSet("events", existing.concat(legacy));
    }
    // Reshape any existing workoutSchedule entries for the taper
    // window around this B race, if the A-race plan is present.
    try {
      let schedule = [];
      try { schedule = JSON.parse(localStorage.getItem("workoutSchedule")) || []; } catch {}
      if (schedule.length && typeof prepareRaceCalendar === "function" && typeof insertBRaceWindow === "function") {
        const raceCalendar = prepareRaceCalendar(_lsGet("events", []) || []);
        if (raceCalendar && raceCalendar.bRaces.length) {
          raceCalendar.bRaces.forEach(bRace => insertBRaceWindow(schedule, bRace, raceCalendar.aRace));
          localStorage.setItem("workoutSchedule", JSON.stringify(schedule));
          if (typeof DB !== "undefined" && DB.syncSchedule) DB.syncSchedule();
        }
      }
    } catch (e) {
      console.warn("[OnboardingV2] B race taper reshape failed", e);
    }
    // Refresh any visible surfaces so the new B race shows up.
    try {
      if (typeof renderRaceEvents === "function") renderRaceEvents();
      if (typeof renderTrainingInputs === "function") renderTrainingInputs();
      if (typeof renderCalendar === "function") renderCalendar();
    } catch {}
  }

  function _selectPlanOption(btn, field) {
    if (!btn) return;
    const group = btn.parentElement;
    if (!group) return;
    group.querySelectorAll(".ob-v2-chip").forEach(el => el.classList.remove("is-selected"));
    btn.classList.add("is-selected");
    const val = btn.getAttribute("data-duration") || btn.getAttribute("data-session-length") || btn.getAttribute("data-days");
    _state.planDetails[field] = val;
    // Show/hide the custom weeks input when the user toggles into/out of Custom.
    if (field === "duration") {
      const customBlock = document.getElementById("bp-v2-duration-custom");
      if (customBlock) customBlock.style.display = val === "custom" ? "" : "none";
      if (val === "custom") {
        const input = document.getElementById("bp-v2-duration-weeks");
        if (input) {
          // Reset to whatever was previously typed, or blank so they can type fresh
          const stored = _state.planDetails.customWeeks;
          input.value = stored ? String(stored) : "";
          setTimeout(() => input.focus(), 0);
        }
      }
    }
  }
  function _setCustomDuration(val) {
    const n = parseInt(val, 10);
    if (!isNaN(n) && n > 0) {
      _state.planDetails.customWeeks = n;
      _state.planDetails.duration = String(n);
    }
  }
  // Half/Full Ironman plans require a 5-day/week floor regardless of level.
  // Athletes below that floor simply don't accumulate enough stimulus to
  // finish safely. The safety valve is short/easy sessions on those 5+
  // days (see TRAINING_PHILOSOPHY §4.7), not fewer days.
  const _LONG_COURSE_MIN_DAYS = 5;
  function _minDaysForCurrentRaces() {
    const races = Array.isArray(_state.raceEvents) ? _state.raceEvents : [];
    const hasLongCourse = races.some(r => r && (r.type === 'ironman' || r.type === 'halfIronman'));
    return hasLongCourse ? _LONG_COURSE_MIN_DAYS : 1;
  }
  function _adjustDaysPerWeek(delta) {
    const floor = _minDaysForCurrentRaces();
    const cur = parseInt(_state.planDetails.daysPerWeek, 10) || 5;
    const next = Math.max(floor, Math.min(7, cur + delta));
    _state.planDetails.daysPerWeek = String(next);
    const el = document.getElementById("bp-v2-days-count");
    if (el) el.textContent = String(next);
    _updateDaysHint();
  }
  function _updateDaysHint() {
    const hint = document.getElementById("bp-v2-days-hint");
    if (!hint) return;
    const floor = _minDaysForCurrentRaces();
    if (floor > 1) {
      hint.textContent = `Half and Full Ironman need a minimum of ${floor} days/week. Sessions can be short or easy where needed — trim individual days later.`;
    } else {
      hint.textContent = 'days per week';
    }
  }
  function _enforceLongCourseDaysFloor() {
    const floor = _minDaysForCurrentRaces();
    const cur = parseInt(_state.planDetails.daysPerWeek, 10) || 5;
    if (cur < floor) {
      _state.planDetails.daysPerWeek = String(floor);
      const el = document.getElementById("bp-v2-days-count");
      if (el) el.textContent = String(floor);
    }
    _updateDaysHint();
  }
  function _saveNoraceAndContinue() {
    _state.raceEvents = [];
    _lsSet("raceEvents", []);
    goTo("bp-v2-4");
    _renderThresholdSections();
  }

  // Per-spec threshold method definitions. Each sport (except strength)
  // offers a method dropdown — the selected method determines which
  // input fields are shown. Strength stays fixed with 3 1RM inputs.
  const THRESHOLD_METHODS = {
    swim: [
      { id: "css-test", label: "CSS Test (400m + 200m)", fields: [
        { id: "css400", label: "400m time", combo: true, parts: [
          { id: "css400min", placeholder: "6",  suffix: "min" },
          { id: "css400sec", placeholder: "30", suffix: "sec" },
        ]},
        { id: "css200", label: "200m time", combo: true, parts: [
          { id: "css200min", placeholder: "3", suffix: "min" },
          { id: "css200sec", placeholder: "5", suffix: "sec" },
        ]},
      ]},
      { id: "pace", label: "I know my CSS pace", fields: [
        { id: "cssPace", label: "CSS pace (sec / 100m)", placeholder: "85", inputmode: "numeric" },
      ]},
      { id: "race", label: "Recent race result", fields: [
        { id: "raceDist", label: "Distance (meters)", placeholder: "1500", inputmode: "numeric" },
        { id: "raceTime", label: "Time (mm:ss)", placeholder: "22:30" },
      ]},
    ],
    bike: [
      { id: "ftp", label: "I know my FTP", fields: [
        { id: "ftp", label: "FTP (watts)", placeholder: "250", inputmode: "numeric" },
      ]},
      { id: "20min-test", label: "20-minute test result", fields: [
        { id: "twentyMinWatts", label: "Avg watts over 20 min", placeholder: "265", inputmode: "numeric" },
      ]},
      { id: "race", label: "Recent race result", fields: [
        { id: "raceDist", label: "Distance (miles)", placeholder: "40", inputmode: "numeric" },
        { id: "raceTime", label: "Time (hh:mm)", placeholder: "1:55" },
        { id: "raceWatts", label: "Avg watts (optional)", placeholder: "240", inputmode: "numeric" },
      ]},
    ],
    run: [
      { id: "pace", label: "I know my threshold pace", fields: [
        { id: "threshPace", label: "Threshold pace (min/mile)", placeholder: "7:30" },
      ]},
      { id: "race", label: "Recent race result", fields: [
        { id: "raceDist", label: "Distance", select: true, options: [
          ["mile",         "Mile"],
          ["5k",           "5K"],
          ["10k",          "10K"],
          ["halfMarathon", "Half Marathon"],
          ["marathon",     "Marathon"],
        ]},
        { id: "raceTime", label: "Time (hh:mm:ss)", placeholder: "45:00" },
      ]},
    ],
    hyrox: [
      { id: "finish", label: "Recent Hyrox finish time", fields: [
        { id: "finishMin", label: "Finish time (minutes)", placeholder: "75", inputmode: "numeric" },
      ]},
      { id: "5k-fallback", label: "Use my 5K time as a fallback", fields: [
        { id: "fiveKTime", label: "5K time (mm:ss)", placeholder: "22:30" },
      ]},
    ],
  };

  function _renderThresholdSections() {
    const container = document.getElementById("bp-v2-thresholds-container");
    if (!container) return;
    const sports = _state.selectedSports || [];
    const sections = [];
    if (sports.includes("swim"))     sections.push(_thresholdSection("swim", "Swimming", "swim", THRESHOLD_METHODS.swim));
    if (sports.includes("bike"))     sections.push(_thresholdSection("bike", "Cycling", "bike", THRESHOLD_METHODS.bike));
    if (sports.includes("run"))      sections.push(_thresholdSection("run", "Running", "run", THRESHOLD_METHODS.run));
    // Bodyweight-only users have no meaningful 1RMs to report —
    // skip the Squat / Bench / Deadlift threshold section entirely.
    // Their plan will render bodyweight-library exercises instead.
    if (sports.includes("strength") && _state.gymAccess !== "bodyweight") {
      sections.push(_strengthThresholdSection());
    }
    if (sports.includes("hyrox"))    sections.push(_thresholdSection("hyrox", "Hyrox", "trophy", THRESHOLD_METHODS.hyrox));
    container.innerHTML = sections.join("");
    _hydrateIcons(container);
    // Render method fields AND pre-fill from existing trainingZones values
    // that were loaded into _state.thresholds at openBuildPlan().
    container.querySelectorAll("[data-threshold]").forEach(section => {
      const key = section.getAttribute("data-threshold");
      const saved = _state.thresholds && _state.thresholds[key];
      if (key === "strength") {
        // Strength has no method dropdown — just fill the 3 1RM inputs
        if (saved) {
          ["squat", "bench", "dead"].forEach(id => {
            if (saved[id] != null) {
              const el = document.getElementById("bp-v2-str-" + id);
              if (el) el.value = saved[id];
            }
          });
        }
        _applyCollapsedState(section, key, saved);
        return;
      }
      // Pre-select saved method (fall back to first option)
      const sel = document.querySelector('[data-threshold-method="' + key + '"]');
      if (sel && saved && saved.method) sel.value = saved.method;
      _renderMethodFields(key);
      // Pre-fill the input values that match the selected method
      if (saved) {
        document.querySelectorAll('[data-threshold="' + key + '"] [data-threshold-input]').forEach(input => {
          const id = input.getAttribute("data-threshold-input");
          if (saved[id] != null) input.value = saved[id];
        });
      }
      _applyCollapsedState(section, key, saved);
    });
  }

  // If a sport's threshold was updated in the last 90 days, collapse the
  // card by default to a summary line + Edit button — no need to re-type.
  // The underlying form stays in the DOM (hidden), so _saveThresholds-
  // AndContinue can still read its pre-filled values on submit.
  function _applyCollapsedState(section, key, saved) {
    if (!section || !saved || !_isRecent(saved._updatedAt)) return;
    const body = section.querySelector('[data-threshold-body="' + key + '"]');
    if (!body) return;
    const summaryHtml = _thresholdSummaryHtml(key, saved);
    if (!summaryHtml) return;
    const collapsed = document.createElement("div");
    collapsed.className = "ob-v2-threshold-collapsed";
    collapsed.setAttribute("data-threshold-collapsed", key);
    collapsed.innerHTML = summaryHtml;
    body.style.display = "none";
    body.parentNode.insertBefore(collapsed, body);
    section.classList.add("is-confirmed");
  }

  function _editThreshold(key) {
    const section = document.querySelector('[data-threshold="' + key + '"]');
    if (!section) return;
    const body = section.querySelector('[data-threshold-body="' + key + '"]');
    const collapsed = section.querySelector('[data-threshold-collapsed="' + key + '"]');
    if (collapsed && collapsed.parentNode) collapsed.parentNode.removeChild(collapsed);
    if (body) body.style.display = "";
    section.classList.remove("is-confirmed");
  }

  // The Training Zones tab stores running distances as "Mile" / "5K" /
  // "10K" / "Half Marathon" / "Marathon". The Build Plan race-method
  // <select> uses lowercase camelCase values. Normalize so the pre-fill
  // actually matches an <option> value.
  function _normalizeRunDistance(raw) {
    if (!raw) return "";
    const s = String(raw).toLowerCase().replace(/\s+/g, "");
    const map = { mile: "mile", "5k": "5k", "10k": "10k", halfmarathon: "halfMarathon", marathon: "marathon" };
    return map[s] || String(raw);
  }

  function _isRecent(iso, days) {
    if (!iso) return false;
    const then = new Date(iso).getTime();
    if (!then || isNaN(then)) return false;
    const windowDays = typeof days === "number" ? days : 90;
    return (Date.now() - then) <= windowDays * 24 * 60 * 60 * 1000;
  }

  function _formatUpdatedDate(iso) {
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return "";
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    } catch { return ""; }
  }

  function _formatSeconds(sec) {
    if (sec == null || !isFinite(sec)) return "";
    const n = Math.max(0, Math.round(sec));
    const m = Math.floor(n / 60);
    const s = n % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  // Human summary line for a pre-filled threshold. Returns the full
  // <div>…</div> HTML for the collapsed block (summary + updated date
  // + Edit button), or "" if we don't have enough data to summarise.
  function _thresholdSummaryHtml(key, saved) {
    if (!saved) return "";
    let primary = "";
    let secondary = "";
    if (key === "swim") {
      const css = parseInt(saved.cssPace, 10);
      if (!css) return "";
      primary = "CSS " + _formatSeconds(css) + " /100m";
      if (saved.css400min || saved.css400sec) {
        const m = parseInt(saved.css400min, 10) || 0;
        const s = parseInt(saved.css400sec, 10) || 0;
        secondary = "from 400m in " + m + ":" + (s < 10 ? "0" : "") + s;
      }
    } else if (key === "bike") {
      if (saved.ftp) primary = "FTP " + saved.ftp + " W";
      else if (saved.twentyMinWatts) primary = "20-min test " + saved.twentyMinWatts + " W";
      else return "";
    } else if (key === "run") {
      if (saved.threshPace) {
        primary = "Threshold " + saved.threshPace + " /mi";
      } else if (saved.raceDist && saved.raceTime) {
        primary = String(saved.raceDist).toUpperCase() + " in " + saved.raceTime;
      } else {
        return "";
      }
    } else if (key === "strength") {
      const parts = [];
      if (saved.squat) parts.push("Squat " + saved.squat);
      if (saved.bench) parts.push("Bench " + saved.bench);
      if (saved.dead)  parts.push("Deadlift " + saved.dead);
      if (!parts.length) return "";
      primary = parts.join(" · ") + " lbs";
    } else if (key === "hyrox") {
      if (saved.finishMin) primary = "Finish " + saved.finishMin + " min";
      else if (saved.fiveKTime) primary = "5K " + saved.fiveKTime;
      else return "";
    } else {
      return "";
    }
    const updated = saved._updatedAt ? _formatUpdatedDate(saved._updatedAt) : "";
    return (
      '<div class="ob-v2-threshold-summary">' +
        '<span class="ob-v2-threshold-summary-check" aria-hidden="true">✓</span>' +
        '<div class="ob-v2-threshold-summary-text">' +
          '<div class="ob-v2-threshold-summary-primary">' + _escape(primary) + '</div>' +
          (secondary ? '<div class="ob-v2-threshold-summary-secondary">' + _escape(secondary) + '</div>' : '') +
          (updated ? '<div class="ob-v2-threshold-updated">Looks good? Updated ' + _escape(updated) + '.</div>' : '<div class="ob-v2-threshold-updated">Looks good?</div>') +
        '</div>' +
        '<button type="button" class="ob-v2-threshold-edit" onclick="OnboardingV2._editThreshold(\'' + key + '\')">Edit</button>' +
      '</div>'
    );
  }

  function _thresholdSection(key, label, iconKey, methods) {
    const methodOpts = methods.map(m =>
      '<option value="' + m.id + '">' + _escape(m.label) + '</option>'
    ).join("");
    return '<div class="ob-v2-threshold-section" data-threshold="' + key + '">' +
      '<div class="ob-v2-threshold-header">' +
        '<span class="ob-v2-threshold-icon" data-ob-icon="' + iconKey + '"></span>' +
        '<span class="ob-v2-threshold-name">' + _escape(label) + '</span>' +
        '<button type="button" class="ob-v2-test-me" data-threshold-key="' + key + '" onclick="OnboardingV2._toggleTestMe(this)">Test me</button>' +
      '</div>' +
      '<div class="ob-v2-threshold-body" data-threshold-body="' + key + '">' +
        '<div class="ob-v2-form-group">' +
          '<label for="bp-v2-method-' + key + '">How do you want to provide this?</label>' +
          '<select id="bp-v2-method-' + key + '" data-threshold-method="' + key + '" onchange="OnboardingV2._changeThresholdMethod(\'' + key + '\')">' +
            methodOpts +
          '</select>' +
        '</div>' +
        '<div class="ob-v2-threshold-inputs" data-threshold-inputs="' + key + '"></div>' +
      '</div>' +
    '</div>';
  }

  function _strengthThresholdSection() {
    const fields = [
      { id: "squat", label: "Back Squat 1RM (lbs)", placeholder: "225" },
      { id: "bench", label: "Bench Press 1RM (lbs)", placeholder: "185" },
      { id: "dead",  label: "Deadlift 1RM (lbs)", placeholder: "315" },
    ];
    const inputs = fields.map(f =>
      '<div class="ob-v2-form-group">' +
        '<label for="bp-v2-str-' + f.id + '">' + _escape(f.label) + '</label>' +
        '<input type="text" id="bp-v2-str-' + f.id + '" data-threshold-input="' + f.id + '" placeholder="' + _escape(f.placeholder) + '" inputmode="numeric" />' +
      '</div>'
    ).join("");
    return '<div class="ob-v2-threshold-section" data-threshold="strength">' +
      '<div class="ob-v2-threshold-header">' +
        '<span class="ob-v2-threshold-icon" data-ob-icon="weights"></span>' +
        '<span class="ob-v2-threshold-name">Strength</span>' +
        '<button type="button" class="ob-v2-test-me" data-threshold-key="strength" onclick="OnboardingV2._toggleTestMe(this)">Test me</button>' +
      '</div>' +
      '<div class="ob-v2-threshold-body" data-threshold-body="strength">' +
        '<div class="ob-v2-threshold-inputs" data-threshold-inputs="strength">' + inputs + '</div>' +
      '</div>' +
    '</div>';
  }

  function _renderMethodFields(key) {
    const methods = THRESHOLD_METHODS[key];
    if (!methods) return;
    const select = document.querySelector('[data-threshold-method="' + key + '"]');
    const container = document.querySelector('[data-threshold-inputs="' + key + '"]');
    if (!select || !container) return;
    const method = methods.find(m => m.id === select.value) || methods[0];
    container.innerHTML = method.fields.map(f => {
      if (f.combo && Array.isArray(f.parts)) {
        // Row of inline inputs with inline suffix labels — used for
        // min/sec pairs so they read as a single time rather than two
        // stacked form groups.
        const parts = f.parts.map(p =>
          '<div class="ob-v2-combo-part">' +
            '<input type="text" id="bp-v2-' + key + '-' + p.id + '" data-threshold-input="' + p.id + '" placeholder="' + _escape(p.placeholder || "") + '" inputmode="numeric" />' +
            '<span class="ob-v2-combo-suffix">' + _escape(p.suffix || "") + '</span>' +
          '</div>'
        ).join("");
        return '<div class="ob-v2-form-group">' +
          '<label>' + _escape(f.label) + '</label>' +
          '<div class="ob-v2-combo-row">' + parts + '</div>' +
        '</div>';
      }
      if (f.select && Array.isArray(f.options)) {
        const opts = f.options.map(o =>
          '<option value="' + _escape(o[0]) + '">' + _escape(o[1]) + '</option>'
        ).join("");
        return '<div class="ob-v2-form-group">' +
          '<label for="bp-v2-' + key + '-' + f.id + '">' + _escape(f.label) + '</label>' +
          '<select id="bp-v2-' + key + '-' + f.id + '" data-threshold-input="' + f.id + '">' + opts + '</select>' +
        '</div>';
      }
      const inputmode = f.inputmode ? ' inputmode="' + f.inputmode + '"' : "";
      return '<div class="ob-v2-form-group">' +
        '<label for="bp-v2-' + key + '-' + f.id + '">' + _escape(f.label) + '</label>' +
        '<input type="text" id="bp-v2-' + key + '-' + f.id + '" data-threshold-input="' + f.id + '" placeholder="' + _escape(f.placeholder) + '"' + inputmode + ' />' +
      '</div>';
    }).join("");
  }

  function _changeThresholdMethod(key) {
    _renderMethodFields(key);
    // Re-hydrate any fields the user had values for — switching methods
    // shouldn't wipe a 400m time that's already on record.
    const saved = _state.thresholds && _state.thresholds[key];
    if (!saved) return;
    document.querySelectorAll('[data-threshold="' + key + '"] [data-threshold-input]').forEach(input => {
      const id = input.getAttribute("data-threshold-input");
      if (saved[id] != null && saved[id] !== "") input.value = saved[id];
    });
  }

  function _toggleTestMe(btn) {
    if (!btn) return;
    const key = btn.getAttribute("data-threshold-key");
    // If the section is currently in "Looks good?" collapsed state, drop
    // that first — Test me means the user wants to re-do this threshold.
    const section = document.querySelector('[data-threshold="' + key + '"]');
    if (section && section.classList.contains("is-confirmed")) _editThreshold(key);
    const isOn = btn.classList.toggle("is-active");
    const body = document.querySelector('[data-threshold-body="' + key + '"]');
    if (body) body.style.display = isOn ? "none" : "";
    btn.textContent = isOn ? "Testing" : "Test me";
  }

  function _saveThresholdsAndContinue() {
    const result = {};
    document.querySelectorAll("#bp-v2-thresholds-container [data-threshold]").forEach(section => {
      const key = section.getAttribute("data-threshold");
      const testBtn = section.querySelector(".ob-v2-test-me");
      if (testBtn && testBtn.classList.contains("is-active")) { result[key] = { mode: "test" }; return; }
      const vals = {};
      section.querySelectorAll("[data-threshold-input]").forEach(input => {
        const id = input.getAttribute("data-threshold-input");
        const v = input.value.trim();
        if (v) vals[id] = v;
      });
      const methodSel = section.querySelector('[data-threshold-method]');
      const method = methodSel ? methodSel.value : null;
      if (Object.keys(vals).length) {
        result[key] = Object.assign({ mode: "known" }, method ? { method } : {}, vals);
      } else {
        result[key] = { mode: "test" };
      }
    });
    _state.thresholds = result;
    _lsSet("thresholds", result);
    // Round-trip any known values back into the app's Training Zones &
    // Strength Benchmarks so the two surfaces stay in sync. The existing
    // saveTrainingZonesData() stamps lastUpdated AND appends to
    // trainingZonesHistory so prior versions are retained with a date.
    _persistThresholdsToZones(result);
    if (!_state.selectedSports.includes("strength")) {
      if (_shouldShowLongDays()) { goTo("bp-v2-4b"); _renderLongDayBlocks(); }
      else { goTo("bp-v2-5"); _renderSchedule(); }
      return;
    }
    goTo("bp-v2-6");
    _applyStrengthCountSideEffects();
  }

  // Writes any threshold values the user entered in bp-v2-4 back into
  // localStorage.trainingZones via the app's saveTrainingZonesData()
  // helper. History retention + lastUpdated stamping happen there.
  function _persistThresholdsToZones(thresholds) {
    if (!thresholds || typeof saveTrainingZonesData !== "function") return;
    const nowIso = new Date().toISOString();

    // Running — if user provided a threshold pace, sync it.
    const r = thresholds.run;
    if (r && r.mode === "known" && r.threshPace) {
      try {
        saveTrainingZonesData("running", {
          thresholdPace: r.threshPace,
          calculatedAt: nowIso,
          source: "build_plan_v2",
        });
      } catch (e) { console.warn("[OnboardingV2] sync running zones failed", e); }
    }

    // Biking — resolve FTP from whatever method the user picked:
    //   ftp       → raw FTP number
    //   20min-test → avg watts over 20 min × 0.95 (standard estimate)
    //   race      → fall back to raw watts if provided
    const b = thresholds.bike;
    if (b && b.mode === "known") {
      let ftp = null;
      if (b.ftp) ftp = parseInt(b.ftp, 10);
      else if (b.method === "20min-test" && b.twentyMinWatts) {
        const avg = parseInt(b.twentyMinWatts, 10);
        if (avg > 0) ftp = Math.round(avg * 0.95);
      } else if (b.method === "race" && b.raceWatts) {
        ftp = parseInt(b.raceWatts, 10);
      }
      if (ftp && ftp > 0) {
        let zones = null;
        try {
          if (typeof computeBikingZones === "function") zones = computeBikingZones(ftp).zones;
        } catch {}
        try {
          saveTrainingZonesData("biking", {
            ftp,
            zones,
            calculatedAt: nowIso,
            source: "build_plan_v2",
          });
        } catch (e) { console.warn("[OnboardingV2] sync biking zones failed", e); }
      }
    }

    // Swimming — resolve CSS from whatever method the user picked:
    //   pace     → raw seconds/100m
    //   css-test → derived from 400m + 200m times using the standard
    //              CSS formula: (t400 - t200) / 2 seconds per 100m
    //   race     → skipped for now (needs a lookup table)
    const s = thresholds.swim;
    if (s && s.mode === "known") {
      let css = null;
      if (s.cssPace) css = parseInt(s.cssPace, 10);
      else if (s.method === "css-test") {
        const m400 = parseInt(s.css400min, 10) || 0;
        const s400 = parseInt(s.css400sec, 10) || 0;
        const m200 = parseInt(s.css200min, 10) || 0;
        const s200 = parseInt(s.css200sec, 10) || 0;
        const t400 = m400 * 60 + s400;
        const t200 = m200 * 60 + s200;
        if (t400 > 0 && t200 > 0 && t400 > t200) {
          // (400m time - 200m time) / 2 = sec per 100m at CSS
          css = Math.round((t400 - t200) / 2);
        }
      }
      if (css && css > 0) {
        try {
          saveTrainingZonesData("swimming", {
            css,
            cssPace: css,
            calculatedAt: nowIso,
            source: "build_plan_v2",
          });
        } catch (e) { console.warn("[OnboardingV2] sync swim zones failed", e); }
      }
    }

    // Strength — 1RMs for squat/bench/deadlift.
    const st = thresholds.strength;
    if (st && st.mode === "known") {
      const data = { updatedAt: nowIso, source: "build_plan_v2" };
      const parse = v => parseInt(v, 10);
      if (st.squat) data.squat    = { weight: parse(st.squat), type: "1rm" };
      if (st.bench) data.bench    = { weight: parse(st.bench), type: "1rm" };
      if (st.dead)  data.deadlift = { weight: parse(st.dead),  type: "1rm" };
      if (data.squat || data.bench || data.deadlift) {
        try { saveTrainingZonesData("strength", data); }
        catch (e) { console.warn("[OnboardingV2] sync strength zones failed", e); }
      }
    }
  }
  function _testMeForEverythingAndContinue() {
    document.querySelectorAll("#bp-v2-thresholds-container .ob-v2-test-me").forEach(btn => {
      if (!btn.classList.contains("is-active")) btn.click();
    });
    _saveThresholdsAndContinue();
  }

  function _adjustStrengthCount(delta) {
    const cur = _state.strengthSetup.sessionsPerWeek;
    const next = Math.max(0, Math.min(7, cur + delta));
    _state.strengthSetup.sessionsPerWeek = next;
    const el = document.getElementById("bp-v2-strength-count");
    if (el) el.textContent = String(next);
    _applyStrengthCountSideEffects();
    if (_state.strengthSetup.split === "custom") _renderCustomDayList();
  }
  function _applyStrengthCountSideEffects() {
    const sports = _state.selectedSports || [];
    const strengthOnly = sports.length > 0 && sports.every(s => s === "strength");
    // Mixed-sport users already answered days/week + session length
    // on bp-v2-3-norace. Re-ask them here would be repetitive, so
    // pre-fill the strength-days counter and session-length chip.
    //
    // Default strength days follow TRAINING_PHILOSOPHY:
    //   - Strength-only: match planDays (strength IS the plan)
    //   - Hybrid with a strengthRole picked (§2.5.3): use the role's cap
    //       injury_prevention / race_performance: 2
    //       hypertrophy: 3
    //       minimal: 1
    //   - Hybrid with an endurance race (§8.4 Base phase upper bound): 3
    //     — capping here prevents the previous bug where a 5-day Ironman
    //     athlete ended up with 5 strength sessions/week
    //   - Otherwise: fall back to planDays
    if (!strengthOnly && _state._strengthSyncedFromPlan !== true) {
      const planDays = parseInt(_state.planDetails.daysPerWeek, 10) || 0;
      const role = _state.strengthRole;
      const roleCap = {
        injury_prevention: 2,
        race_performance:  2,
        hypertrophy:       3,
        minimal:           1,
      }[role];
      const ENDURANCE_RACES = new Set([
        "ironman", "halfIronman", "olympic", "sprint",
        "marathon", "halfMarathon", "tenK", "fiveK",
        "centuryRide", "granFondo",
      ]);
      const raceType = (_state.currentRace && _state.currentRace.type) || null;
      const isEnduranceRace = raceType && ENDURANCE_RACES.has(raceType);

      let defaultDays;
      if (roleCap != null) {
        defaultDays = roleCap;
      } else if (isEnduranceRace) {
        defaultDays = Math.min(3, planDays || 3);
      } else {
        defaultDays = planDays > 0 ? Math.min(7, planDays) : 3;
      }
      _state.strengthSetup.sessionsPerWeek = Math.max(0, defaultDays);

      const planLen = parseInt(_state.planDetails.sessionLength, 10);
      if (planLen > 0) _state.strengthSetup.sessionLength = planLen;
      _state._strengthSyncedFromPlan = true;
    }

    const count = _state.strengthSetup.sessionsPerWeek;
    const countEl = document.getElementById("bp-v2-strength-count");
    if (countEl) countEl.textContent = String(count);

    // Sync the session-length chip so the pre-populated value reads
    // as selected instead of the static markup default.
    const curLen = String(_state.strengthSetup.sessionLength || 45);
    document.querySelectorAll("#bp-v2-strength-rest [data-str-length]").forEach(el => {
      el.classList.toggle("is-selected", el.getAttribute("data-str-length") === curLen);
    });

    const rest = document.getElementById("bp-v2-strength-rest");
    if (rest) rest.style.display = count === 0 ? "none" : "";
    const rec = document.getElementById("bp-v2-split-rec");
    if (rec) {
      if (count <= 2) rec.textContent = "Full Body recommended for your frequency.";
      else if (count === 3) rec.textContent = "Push / Pull / Legs recommended for 3 days.";
      else rec.textContent = "PPL recommended. Upper / Lower also a solid pick for 4+ days.";
    }
    // Block-length + start-date section only appears when the user is
    // strength-only. Endurance / mixed users answer those questions on
    // bp-v2-3-norace instead, so showing them twice would be redundant.
    const blockSection = document.getElementById("bp-v2-strength-block-section");
    if (blockSection) {
      blockSection.style.display = strengthOnly ? "" : "none";
      // Seed the start-date input with the default (next Monday) so
      // it's never blank when the strength-only user lands here.
      const dateInput = document.getElementById("bp-v2-str-start-date");
      if (dateInput) {
        if (!_state.planDetails.startDate) _state.planDetails.startDate = _nextMondayISO();
        dateInput.value = _state.planDetails.startDate;
        const today = new Date(); today.setHours(0,0,0,0);
        dateInput.min = today.toISOString().slice(0, 10);
      }
      // Sync the duration chip with _state so the right one is selected
      // when the user lands on the screen.
      document.querySelectorAll("#bp-v2-strength-block-section [data-str-duration]").forEach(el => {
        el.classList.toggle("is-selected", el.getAttribute("data-str-duration") === String(_state.planDetails.duration));
      });
      const refreshRaw = _state.strengthSetup.refreshWeeks;
      const refreshVal = refreshRaw === "custom" ? "custom" : String(refreshRaw || 4);
      document.querySelectorAll("#bp-v2-strength-block-section [data-str-refresh]").forEach(el => {
        el.classList.toggle("is-selected", el.getAttribute("data-str-refresh") === refreshVal);
      });
      const refreshCustom = document.getElementById("bp-v2-str-refresh-custom");
      if (refreshCustom) refreshCustom.style.display = refreshVal === "custom" ? "" : "none";
      const refreshInp = document.getElementById("bp-v2-str-refresh-weeks");
      if (refreshInp && _state.strengthSetup.customRefreshWeeks) {
        refreshInp.value = String(_state.strengthSetup.customRefreshWeeks);
      }
    }
  }
  function _selectStrDuration(btn) {
    if (!btn) return;
    const group = btn.parentElement;
    if (!group) return;
    group.querySelectorAll(".ob-v2-chip").forEach(el => el.classList.remove("is-selected"));
    btn.classList.add("is-selected");
    const val = btn.getAttribute("data-str-duration");
    _state.planDetails.duration = val;
    const customBlock = document.getElementById("bp-v2-str-duration-custom");
    if (customBlock) customBlock.style.display = val === "custom" ? "" : "none";
    if (val === "custom") {
      const inp = document.getElementById("bp-v2-str-duration-weeks");
      if (inp) {
        const stored = _state.planDetails.customWeeks;
        inp.value = stored ? String(stored) : "";
        setTimeout(() => inp.focus(), 0);
      }
    }
  }
  function _selectStrRefresh(btn) {
    if (!btn) return;
    const group = btn.parentElement;
    if (!group) return;
    group.querySelectorAll(".ob-v2-chip").forEach(el => el.classList.remove("is-selected"));
    btn.classList.add("is-selected");
    const val = btn.getAttribute("data-str-refresh");
    const customBlock = document.getElementById("bp-v2-str-refresh-custom");
    if (val === "custom") {
      _state.strengthSetup.refreshWeeks = "custom";
      if (customBlock) customBlock.style.display = "";
      const inp = document.getElementById("bp-v2-str-refresh-weeks");
      if (inp) {
        const stored = _state.strengthSetup.customRefreshWeeks;
        inp.value = stored ? String(stored) : "";
        setTimeout(() => inp.focus(), 0);
      }
    } else {
      _state.strengthSetup.refreshWeeks = parseInt(val, 10) || 4;
      if (customBlock) customBlock.style.display = "none";
    }
  }
  function _setCustomRefresh(val) {
    const n = parseInt(val, 10);
    _state.strengthSetup.customRefreshWeeks = (n > 0 && n <= 52) ? n : null;
  }
  function _selectSplit(btn) {
    if (!btn) return;
    document.querySelectorAll("#bp-v2-split-chips .ob-v2-chip").forEach(el => el.classList.remove("is-selected"));
    btn.classList.add("is-selected");
    _state.strengthSetup.split = btn.getAttribute("data-split");
    const customBlock = document.getElementById("bp-v2-custom-muscles");
    if (customBlock) customBlock.style.display = _state.strengthSetup.split === "custom" ? "" : "none";
    if (_state.strengthSetup.split === "custom") _renderCustomDayList();
  }
  // Legacy flat-muscle toggle (kept for back-compat if any caller remains).
  function _toggleMuscle(btn) { if (btn) btn.classList.toggle("is-selected"); }

  // Custom split: one row per day, each with muscle-group chips.
  // State lives in _state.strengthSetup.customMuscles as
  // { "1": ["chest","triceps"], "2": ["back","biceps"], ... }
  const _BP_MUSCLES = [
    ["chest","Chest"], ["back","Back"], ["shoulders","Shoulders"],
    ["biceps","Biceps"], ["triceps","Triceps"], ["quads","Quads"],
    ["hamstrings","Hamstrings"], ["glutes","Glutes"], ["calves","Calves"],
    ["core","Core"], ["fullbody","Full Body"],
  ];
  function _renderCustomDayList() {
    const host = document.getElementById("bp-v2-custom-day-list");
    if (!host) return;
    const days = _state.strengthSetup.sessionsPerWeek || 0;
    if (days <= 0) { host.innerHTML = ""; return; }
    // Normalize state into object shape keyed by day index.
    const cur = _state.strengthSetup.customMuscles;
    if (!cur || Array.isArray(cur)) _state.strengthSetup.customMuscles = {};
    const store = _state.strengthSetup.customMuscles;
    const rows = [];
    for (let i = 1; i <= days; i++) {
      const key = String(i);
      if (!Array.isArray(store[key])) store[key] = [];
      const selected = store[key];
      const chips = _BP_MUSCLES.map(m =>
        '<button type="button" class="ob-v2-chip' + (selected.includes(m[0]) ? " is-selected" : "") + '" ' +
          'data-muscle="' + m[0] + '" data-day="' + i + '" ' +
          'onclick="OnboardingV2._toggleMuscleForDay(' + i + ',\'' + m[0] + '\',this)">' +
          _escape(m[1]) +
        '</button>'
      ).join("");
      rows.push(
        '<div class="ob-v2-custom-day">' +
          '<div class="ob-v2-custom-day-head">Day ' + i + '</div>' +
          '<div class="ob-v2-chips">' + chips + '</div>' +
        '</div>'
      );
    }
    host.innerHTML = rows.join("");
  }
  function _toggleMuscleForDay(dayIdx, muscle, btn) {
    const store = _state.strengthSetup.customMuscles || (_state.strengthSetup.customMuscles = {});
    const key = String(dayIdx);
    if (!Array.isArray(store[key])) store[key] = [];
    const list = store[key];
    const at = list.indexOf(muscle);
    if (at >= 0) list.splice(at, 1); else list.push(muscle);
    if (btn) btn.classList.toggle("is-selected", at < 0);
  }
  function _selectStrLength(btn) {
    if (!btn) return;
    const group = btn.parentElement;
    if (!group) return;
    group.querySelectorAll(".ob-v2-chip").forEach(el => el.classList.remove("is-selected"));
    btn.classList.add("is-selected");
    _state.strengthSetup.sessionLength = parseInt(btn.getAttribute("data-str-length"), 10) || 45;
  }
  function _saveStrengthAndContinue() {
    // customMuscles is now a per-day object (see _renderCustomDayList).
    // _toggleMuscleForDay maintains it in _state directly, so we just
    // persist whatever's there. Non-custom splits leave it empty.
    _lsSet("strengthSetup", _state.strengthSetup);
    if (_shouldShowLongDays()) { goTo("bp-v2-4b"); _renderLongDayBlocks(); }
    else { goTo("bp-v2-5"); _renderSchedule(); }
  }

  // Which long sessions make sense for a given race type.
  // Only races where a dedicated weekly long session matters.
  function _longSportsForRace(race) {
    if (!race || !race.date || !race.type) return [];
    const t = race.type;
    if (["marathon", "halfMarathon", "ultra"].includes(t)) return ["run"];
    if (["century", "granFondo", "stage"].includes(t))     return ["bike"];
    if (["halfIronman", "ironman"].includes(t))            return ["run", "bike"];
    return [];
  }
  function _shouldShowLongDays() {
    const needed = _longSportsForRace(_state.currentRace);
    if (!needed.length) return false;
    // Only show the screen if at least one "long" sport is actually selected.
    return needed.some(s => _state.selectedSports.includes(s));
  }
  function _renderLongDayBlocks() {
    const needed = _longSportsForRace(_state.currentRace);
    const run  = document.getElementById("bp-v2-longrun-block");
    const ride = document.getElementById("bp-v2-longride-block");
    const showRun  = needed.includes("run")  && _state.selectedSports.includes("run");
    const showRide = needed.includes("bike") && _state.selectedSports.includes("bike");
    if (run)  run.style.display  = showRun  ? "" : "none";
    if (ride) ride.style.display = showRide ? "" : "none";

    // Default recommendations:
    //   Triathletes (run + bike selected) → Long Run Wed, Long Ride Sat.
    //     Wed spaces the two hardest days mid-week so the Saturday long
    //     ride isn't compromised by a fresh run.
    //   Run-only athletes → Long Run Sat (the conventional weekend default).
    //   Bike-only athletes → Long Ride Sat.
    const isTri = showRun && showRide;
    const defaultRun  = isTri ? "wed" : "sat";
    const defaultRide = "sat";

    if (showRun && !_state.longDays.longRun) {
      _state.longDays.longRun = defaultRun;
    }
    if (showRide && !_state.longDays.longRide) {
      _state.longDays.longRide = defaultRide;
    }

    // Sync chip selection UI with state
    if (run) {
      run.querySelectorAll("[data-longrun]").forEach(el => {
        el.classList.toggle("is-selected", el.getAttribute("data-longrun") === _state.longDays.longRun);
      });
    }
    if (ride) {
      ride.querySelectorAll("[data-longride]").forEach(el => {
        el.classList.toggle("is-selected", el.getAttribute("data-longride") === _state.longDays.longRide);
      });
    }
    // Disable adjacent chips on the opposing group so users can't pick
    // back-to-back long days (§4.3 — no consecutive hard days for non-advanced).
    _refreshLongDayAvailability();
  }
  // Day-of-week order (Monday-first) used for adjacency checks on the
  // Long Days screen. Back-to-back long run + long ride violates §4.3
  // (no consecutive hard days) for non-advanced athletes, so we block
  // the user from picking adjacent days.
  const _DOW_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  function _dowIndex(dow) { return _DOW_ORDER.indexOf(dow); }
  function _areAdjacentDow(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    return Math.abs(_dowIndex(a) - _dowIndex(b)) === 1;
  }

  function _selectLongDay(btn, which) {
    if (!btn) return;
    if (btn.disabled || btn.classList.contains("is-disabled")) return;
    const attr = which === "longRun" ? "data-longrun" : "data-longride";
    const group = btn.parentElement;
    if (!group) return;
    group.querySelectorAll('[' + attr + ']').forEach(el => el.classList.remove("is-selected"));
    btn.classList.add("is-selected");
    _state.longDays[which] = btn.getAttribute(attr);
    _refreshLongDayAvailability();
  }

  // Grey out chips on the OTHER discipline that would create a back-to-back
  // long-day pair with the current selection. Also clears a conflicting
  // other-side selection if the user re-picks into its adjacency zone.
  function _refreshLongDayAvailability() {
    const runRoot = document.getElementById("bp-v2-longrun-block");
    const rideRoot = document.getElementById("bp-v2-longride-block");
    const runSel = _state.longDays.longRun;
    const rideSel = _state.longDays.longRide;

    const refreshGroup = (root, attr, otherSel, selfKey) => {
      if (!root || !otherSel) return;
      root.querySelectorAll('[' + attr + ']').forEach(el => {
        const dow = el.getAttribute(attr);
        const conflict = _areAdjacentDow(dow, otherSel);
        el.classList.toggle("is-disabled", conflict);
        el.toggleAttribute("disabled", conflict);
        el.title = conflict ? "Adjacent to your other long day — pick a non-consecutive day." : "";
        // If the currently-selected chip is now disabled, drop the selection.
        if (conflict && _state.longDays[selfKey] === dow) {
          _state.longDays[selfKey] = null;
          el.classList.remove("is-selected");
        }
      });
    };

    refreshGroup(runRoot, "data-longrun", rideSel, "longRun");
    refreshGroup(rideRoot, "data-longride", runSel, "longRide");
  }

  function _saveLongDaysAndContinue() {
    // Persist for the rule engine — classifier + session assembler read
    // localStorage["longDays"] and anchor long run / long ride placement
    // to these days.
    _lsSet("longDays", _state.longDays);
    // If the user has not manually edited the Schedule yet, wipe and let
    // _renderSchedule re-seed against the new long-day anchors. If they
    // HAVE touched the schedule (added a Monday chip, moved a session,
    // etc.), preserve their edits and only move the long chips — per
    // the spec's §6 Explicit Day Preservation row, user-placed sessions
    // are never overwritten by the distribution pass.
    if (!_state._scheduleTouched) {
      _BP_DAYS.forEach(d => { _state.schedule[d] = []; });
    } else {
      _reconcileLongDayPlacement();
    }
    goTo("bp-v2-5");
    _renderSchedule();
  }

  // Move run-long / bike-long chips to the currently-selected long days
  // without disturbing the rest of the week. Called when the user tweaks
  // the long-day picker after manually editing the Schedule screen.
  function _reconcileLongDayPlacement() {
    const pairs = [
      { code: "run-long",  target: _state.longDays && _state.longDays.longRun },
      { code: "bike-long", target: _state.longDays && _state.longDays.longRide },
    ];
    pairs.forEach(({ code, target }) => {
      if (!target) return;
      let found = false;
      _BP_DAYS.forEach(d => {
        const slots = _state.schedule[d] || [];
        const idx = slots.indexOf(code);
        if (idx === -1) return;
        if (d === target) { found = true; return; }
        slots.splice(idx, 1);
      });
      if (!found) {
        const targetSlots = _state.schedule[target] || (_state.schedule[target] = []);
        if (!targetSlots.includes(code)) targetSlots.push(code);
      }
    });
  }

  // Flip the "user touched the schedule" flag from every mutation path
  // that represents an explicit edit (chip add, chip remove, subtype
  // swap, drag-drop). Read by _saveLongDaysAndContinue to decide
  // whether to wipe-and-reseed or preserve the user's edits.
  function _markScheduleTouched() {
    _state._scheduleTouched = true;
  }

  const _BP_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const _BP_DAY_LABELS = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

  function _renderSchedule() {
    const grid = document.getElementById("bp-v2-schedule-grid");
    if (!grid) return;
    // Guarantee all 7 day keys exist on the schedule object
    _BP_DAYS.forEach(d => {
      if (!Array.isArray(_state.schedule[d])) _state.schedule[d] = [];
    });
    // Strip slots whose sport the user didn't select — fixes the case where
    // the user toggled strength on earlier (directly, or via a Hyrox pick
    // that auto-added it), went through strength setup, then came back and
    // deselected strength on the sports grid. Without this filter the
    // previously-seeded "strength" / "strength-*" chips linger on Mon/Fri
    // even though the sport is no longer in selectedSports.
    const selectedSet = new Set(_state.selectedSports || []);
    const slotBelongsToSelectedSport = (code) => {
      if (code === "rest" || code === "brick") return true;
      if (code.indexOf("strength") === 0) return selectedSet.has("strength");
      const base = code.split("-")[0];
      return selectedSet.has(base);
    };
    _BP_DAYS.forEach(d => {
      _state.schedule[d] = _state.schedule[d].filter(slotBelongsToSelectedSport);
    });
    // Seed only on FIRST entry to bp-5 in a fresh build flow. Skip the
    // seed entirely when editing an existing plan — even if the saved
    // template was empty (older saves predate buildPlanTemplate), we
    // shouldn't re-fill all 7 days with defaults; that overwrites the
    // user's intent. Better to show an empty grid and let them build
    // from scratch.
    const allEmpty = _BP_DAYS.every(d => _state.schedule[d].length === 0);
    const isEditing = !!_state._editingPlanId;
    if (allEmpty && !isEditing) _seedSchedule();
    // Sync the start-date input with state, seeding the default if unset.
    const dateInput = document.getElementById("bp-v2-start-date");
    if (dateInput) {
      if (!_state.planDetails.startDate) _state.planDetails.startDate = _nextMondayISO();
      dateInput.value = _state.planDetails.startDate;
      // Cap min to today so users can't backdate
      const today = new Date(); today.setHours(0,0,0,0);
      dateInput.min = today.toISOString().slice(0, 10);
    }
    // CTA label: "Save Changes" when revising an existing plan,
    // "Continue" when building a new one. Edits to _state.schedule
    // are buffered in memory until this button is pressed — nothing
    // is written to localStorage during chip clicks.
    const cta = document.getElementById("bp-v2-schedule-cta");
    if (cta) cta.textContent = isEditing ? "Save Changes" : "Continue";
    grid.innerHTML = _BP_DAYS.map(day => {
      const slots = _state.schedule[day] || [];
      const chipsHtml = slots.map((s, i) => {
        // For display, show the enriched label if the stored slot is
        // already an enriched code (e.g. "run-interval"), else compute
        // the position-based enrichment via _enrichSlotPreview so the
        // chip reflects what the user will actually get.
        const displayCode = s.indexOf("-") > 0 ? s : s;
        const label = _enrichedLabel(displayCode);
        const bucket = _sportBucketFromEnriched(s);
        const cls = bucket.replace(/[^a-z0-9]/gi, "");
        return '<span class="ob-v2-slot-chip ob-v2-slot-' + cls + '" ' +
          'draggable="true" ' +
          'data-slot-day="' + day + '" data-slot-idx="' + i + '" data-slot-sport="' + s + '" ' +
          'ondragstart="OnboardingV2._slotDragStart(event)" ' +
          'ondragend="OnboardingV2._slotDragEnd(event)" ' +
          'onclick="OnboardingV2._openSlotSubtypePicker(\'' + day + '\',' + i + ',this)">' +
          _escape(label) +
          '<button type="button" class="ob-v2-slot-remove" onclick="event.stopPropagation();OnboardingV2._removeSlotAt(\'' + day + '\',' + i + ')" aria-label="Remove">&times;</button>' +
          '</span>';
      }).join("");
      return '<div class="ob-v2-schedule-day" ' +
        'data-day="' + day + '" ' +
        'ondragover="OnboardingV2._slotDragOver(event)" ' +
        'ondragleave="OnboardingV2._slotDragLeave(event)" ' +
        'ondrop="OnboardingV2._slotDrop(event,\'' + day + '\')">' +
        '<div class="ob-v2-day-name">' + _BP_DAY_LABELS[day] + '</div>' +
        '<div class="ob-v2-day-slots">' + chipsHtml +
          '<button type="button" class="ob-v2-add-slot" onclick="OnboardingV2._openAddSlotPicker(\'' + day + '\',this)" aria-label="Add session">+</button>' +
        '</div>' +
      '</div>';
    }).join("");
    _renderScheduleSummary();
  }
  function _seedSchedule() {
    const sports = _state.selectedSports.slice();
    const strength = _state.strengthSetup.sessionsPerWeek || 0;
    // "Distributable" sports fill non-strength slots — everything the
    // user selected except strength itself. Previously the filter was
    // hard-coded to run/bike/swim, so picking walking or yoga (or
    // rowing / hiit / circuit / mobility / hyrox) silently dropped
    // those selections and the schedule came back with only the sports
    // in the hard-coded list plus strength, which didn't match what the
    // user had tapped. Now any selected sport that isn't strength gets
    // round-robined into the remaining day slots.
    const endurance = sports.filter(s => s !== "strength");
    const needed = _longSportsForRace(_state.currentRace);
    _BP_DAYS.forEach(d => { _state.schedule[d] = []; });
    // Anchor long sessions first (if race-relevant)
    if (needed.includes("run") && _state.longDays.longRun) {
      _state.schedule[_state.longDays.longRun] = ["run-long"];
    }
    if (needed.includes("bike") && _state.longDays.longRide) {
      const d = _state.longDays.longRide;
      if (!_state.schedule[d].length) _state.schedule[d] = ["bike-long"];
    }

    // Post-long-run shakeout (running-only plans, §4b): the day after a
    // long run wants an easy recovery run (Z1, 20-30 min) — not a blank.
    // Round-robin below actively avoids same-sport adjacency, which would
    // leave Sunday empty for a Saturday long run. Anchor the shakeout
    // here so adjacency skips this day but the run is already placed.
    // Skipped for triathletes (their long-ride / long-run often share the
    // weekend and doubling up would wreck recovery) and for days the user
    // explicitly marked Rest.
    const _isRunningOnly =
      Array.isArray(sports) &&
      sports.includes("run") &&
      !sports.includes("bike") &&
      !sports.includes("swim");
    if (_isRunningOnly && _state.longDays.longRun) {
      const dowOf = { sun:0, mon:1, tue:2, wed:3, thu:4, fri:5, sat:6 };
      const longDow = dowOf[_state.longDays.longRun];
      if (longDow != null) {
        const nextDow = (longDow + 1) % 7;
        const nextKey = Object.keys(dowOf).find(k => dowOf[k] === nextDow);
        if (nextKey && !_state.schedule[nextKey].includes("rest")
            && _state.schedule[nextKey].length === 0) {
          _state.schedule[nextKey] = ["run-recovery"];
        }
      }
    }
    // Distribute remaining endurance sports round-robin across remaining
    // days, but cap at the user's requested daysPerWeek. Previously this
    // filled ALL 7 days then carved rest from the leftovers, which meant
    // a "Run only, 1 day/week" user got runs on 5 days because the
    // post-fill carve respected daysPerWeek but the pre-fill didn't.
    if (endurance.length) {
      const wantedTraining = Math.max(1, Math.min(7,
        parseInt(_state.planDetails.daysPerWeek, 10) || 5
      ));
      const alreadyAnchored = _BP_DAYS.filter(d => _state.schedule[d].length > 0).length;
      const remainingSlots = Math.max(0, wantedTraining - alreadyAnchored);

      // Try to place each sport round-robin while avoiding same-discipline
      // on consecutive days. For each session we want to place, pick the
      // earliest empty day that (a) satisfies the slot budget and (b) is
      // not adjacent to another day already carrying the same sport
      // (including long variants like run-long / bike-long). Falls back
      // to any empty day if no spaced option exists.
      const sameSport = (code, sport) => code === sport || code === `${sport}-long` || code === `${sport}-interval` || code === `${sport}-tempo`;
      const dayHasSport = (d, sport) => (_state.schedule[d] || []).some(c => sameSport(c, sport));
      const adjacentHasSport = (d, sport) => _BP_DAYS.some(dd => _areAdjacentDow(d, dd) && dayHasSport(dd, sport));

      // Anti-rest-cluster placement. Research-backed running programming
      // (Daniels, Pfitzinger, Higdon) spreads rest across the week rather
      // than clustering two off-days back-to-back. At each placement
      // step we:
      //   1. Among empty non-same-sport-adjacent days, pick the one
      //      whose placement minimizes the longest consecutive-rest
      //      streak across the resulting week.
      //   2. If none are non-adjacent, fall back to any empty day using
      //      the same streak-minimization rule.
      // Ties break toward the earlier weekday so placement stays
      // deterministic across runs. Without this, a 5-day runner with
      // Sat long + Sun recovery ended up with runs Mon/Tue/Wed and rest
      // Thu+Fri — a 2-day rest block mid-week that the literature
      // discourages.
      const _maxEmptyStreakIfFilled = (candidate) => {
        let maxStreak = 0, cur = 0;
        for (const d of _BP_DAYS) {
          const emptyAfter = d === candidate ? false : _state.schedule[d].length === 0;
          if (emptyAfter) { cur++; if (cur > maxStreak) maxStreak = cur; }
          else cur = 0;
        }
        return maxStreak;
      };
      const _pickBestSpread = (candidates) => {
        if (!candidates.length) return null;
        let best = null, bestStreak = Infinity;
        for (const d of candidates) {
          const s = _maxEmptyStreakIfFilled(d);
          if (s < bestStreak) { bestStreak = s; best = d; }
        }
        return best;
      };

      let placed = 0;
      let idx = 0;
      let safety = 0;
      while (placed < remainingSlots && safety < endurance.length * 14) {
        safety++;
        const sport = endurance[idx % endurance.length];
        // Prefer non-adjacent empty days, optimizing spread within that set.
        const nonAdj = _BP_DAYS.filter(d => _state.schedule[d].length === 0 && !adjacentHasSport(d, sport));
        let target = _pickBestSpread(nonAdj);
        // If every empty day is adjacent to the sport, allow adjacency
        // but still optimize spread among empties.
        if (!target) {
          const empties = _BP_DAYS.filter(d => _state.schedule[d].length === 0);
          target = _pickBestSpread(empties);
        }
        if (!target) break;
        _state.schedule[target].push(sport);
        idx++;
        placed++;
      }
    }

    // Swim minimum: triathletes need at least 2 swim days per week —
    // one swim/week is too little stimulus to maintain or build the
    // feel-for-water that open-water and tri racing demand. If the
    // round-robin only placed one swim, find the best spot for a
    // second: prefer a day that isn't already carrying a long-run /
    // long-ride session, isn't a rest day, and doesn't already have
    // swim. If every day is full, fall back to adding swim as a
    // second session on the lightest non-long day.
    if (sports.includes("swim")) {
      const swimCount = () => _BP_DAYS.reduce((n, d) => n + (_state.schedule[d].includes("swim") ? 1 : 0), 0);
      if (swimCount() < 2) {
        const isLongDay = d => _state.schedule[d].includes("run-long") || _state.schedule[d].includes("bike-long");
        const existingSwimDays = _BP_DAYS.filter(d => _state.schedule[d].includes("swim"));
        const adjacentToSwim = d => existingSwimDays.some(sd => _areAdjacentDow(d, sd));

        // Preferred: a non-swim, non-rest, non-long day that isn't adjacent
        // to an existing swim day (§4.3 — spread disciplines).
        let candidates = _BP_DAYS.filter(d =>
          !_state.schedule[d].includes("swim") &&
          !_state.schedule[d].includes("rest") &&
          !isLongDay(d) &&
          !adjacentToSwim(d)
        );
        candidates.sort((a, b) => _state.schedule[a].length - _state.schedule[b].length);
        let target = candidates[0];
        if (!target) {
          // Fallback: allow adjacency if no other option exists.
          const fb = _BP_DAYS.filter(d =>
            !_state.schedule[d].includes("swim") &&
            !_state.schedule[d].includes("rest") &&
            !isLongDay(d)
          ).sort((a, b) => _state.schedule[a].length - _state.schedule[b].length);
          target = fb[0]
            || _BP_DAYS.filter(d => !_state.schedule[d].includes("swim") && !isLongDay(d))
                 .sort((a, b) => _state.schedule[a].length - _state.schedule[b].length)[0];
        }
        if (target) _state.schedule[target].push("swim");
      }
    }
    // Brick seed — TRAINING_PHILOSOPHY §6.1.1 placement rules + §6.3
    // (brick is required 1×/week in Build/Peak). Two hard constraints
    // compete: "no consecutive hard days" (§4.3) vs "brick must be
    // scheduled" (§6.3). When the user's long-day picks leave every
    // weekday adjacent to one of the long days, brick-required wins
    // — we accept the adjacency and place a (typically short) brick
    // rather than skipping it. The redundancy rule (no standalone
    // run or bike stacked with brick) is never relaxed — that would
    // just double-count volume.
    if (sports.includes("bike") && sports.includes("run")) {
      const hasBrick = _BP_DAYS.some(d => _state.schedule[d].includes("brick"));
      if (!hasBrick) {
        const isLongDay = d => _state.schedule[d].includes("run-long") || _state.schedule[d].includes("bike-long");
        const longDays = _BP_DAYS.filter(isLongDay);
        const adjacentToLong = d => longDays.some(ld => _areAdjacentDow(d, ld));
        const hasBareBike = d => _state.schedule[d].length === 1 && _state.schedule[d][0] === "bike";
        const hasBareRun = d => _state.schedule[d].length === 1 && _state.schedule[d][0] === "run";
        const hasRunOrBike = d => _state.schedule[d].some(c => c === "run" || c === "bike" || c === "run-long" || c === "bike-long");
        const isRest = d => _state.schedule[d].includes("rest");

        // Non-adjacent placements (ideal, preserves spacing):
        //   1. Replace a plain bike on a non-adjacent day.
        //   2. Replace a plain run on a non-adjacent day.
        //   3. Fresh on a fully empty non-adjacent day.
        //   4. Stack onto a non-adjacent day with only non-conflict sessions.
        let target =
          _BP_DAYS.find(d => !isLongDay(d) && !adjacentToLong(d) && hasBareBike(d)) ||
          _BP_DAYS.find(d => !isLongDay(d) && !adjacentToLong(d) && hasBareRun(d)) ||
          _BP_DAYS.find(d => !isLongDay(d) && !adjacentToLong(d) && _state.schedule[d].length === 0);
        if (!target) {
          const safeNonAdj = _BP_DAYS
            .filter(d => !isLongDay(d) && !adjacentToLong(d) && !isRest(d) && !hasRunOrBike(d))
            .sort((a, b) => _state.schedule[a].length - _state.schedule[b].length);
          if (safeNonAdj[0]) target = safeNonAdj[0];
        }

        // Adjacency fallback — user's anchors don't leave a non-adjacent
        // weekday. Brick still needs a home per §6.3. Walks the same
        // ladder with adjacency allowed:
        //   5. Adjacent empty day (prefer earliest).
        //   6. Adjacent bare bike → replace.
        //   7. Adjacent bare run → replace.
        //   8. Adjacent stack on non-conflict session.
        if (!target) {
          target =
            _BP_DAYS.find(d => !isLongDay(d) && _state.schedule[d].length === 0) ||
            _BP_DAYS.find(d => !isLongDay(d) && hasBareBike(d)) ||
            _BP_DAYS.find(d => !isLongDay(d) && hasBareRun(d));
          if (!target) {
            const safeAdj = _BP_DAYS
              .filter(d => !isLongDay(d) && !isRest(d) && !hasRunOrBike(d))
              .sort((a, b) => _state.schedule[a].length - _state.schedule[b].length);
            if (safeAdj[0]) target = safeAdj[0];
          }
        }

        // Last-resort: brick is philosophy-required for triathletes
        // (§6.1 Build/Peak). If every earlier ladder missed — which can
        // happen when the round-robin filled every weekday with
        // bike/run sessions before brick placement ran — force a brick
        // onto the least-loaded non-long day by replacing whatever bike
        // or run is there. If the day only has a swim/strength we stack.
        if (!target) {
          const nonLong = _BP_DAYS.filter(d => !isLongDay(d));
          nonLong.sort((a, b) => _state.schedule[a].length - _state.schedule[b].length);
          target = nonLong.find(d => hasRunOrBike(d)) || nonLong.find(d => _state.schedule[d].length < 2) || nonLong[0];
        }

        if (target) {
          // When placing fresh on an empty day or replacing a bare
          // bike/run, overwrite. When stacking onto a non-conflict
          // day (e.g. swim), push. If the day has bike/run mixed with
          // something else, replace the bike/run token with brick so we
          // don't double-count same-discipline volume.
          if (_state.schedule[target].length === 0 || hasBareBike(target) || hasBareRun(target)) {
            _state.schedule[target] = ["brick"];
          } else {
            const filtered = _state.schedule[target].filter(c => c !== "bike" && c !== "run" && c !== "bike-long" && c !== "run-long");
            filtered.push("brick");
            _state.schedule[target] = filtered;
          }
        }
      }
    }

    // Place strength sessions up to the requested count per §6.1.1
    // placement rule #4: "Place strength sessions on a cardio day per
    // §8.6 pairing. Prefer diverse pair types across multiple strength
    // sessions (e.g., one swim-pair + one bike-pair rather than two
    // run-pairs)." Priority:
    //   1. Swim day (§8.6: swim + pull/core — no interference)
    //   2. Bike day (§8.6: bike + legs/posterior chain)
    //   3. Run day, non-long (§8.6: run + core/hip stability)
    //   4. Rest day (upper body) — last choice
    //   NEVER stack on a long-run or long-ride day (hard session).
    //
    // Diversity: after placing on a swim day, penalize further swim
    // pairs so the second strength day prefers a different pair type.
    if (strength > 0 && sports.includes("strength")) {
      const isLongDay = d => _state.schedule[d].some(c => c === "run-long" || c === "bike-long");
      const hasSwim   = d => _state.schedule[d].includes("swim");
      const hasBike   = d => _state.schedule[d].some(c => c === "bike");
      const hasRun    = d => _state.schedule[d].some(c => c === "run");
      const hasBrick  = d => _state.schedule[d].includes("brick");
      const hasStr    = d => _state.schedule[d].includes("strength");
      const isRest    = d => _state.schedule[d].includes("rest");

      const pairTypeOf = d => {
        if (hasSwim(d))                  return "swim";
        if (hasBike(d) && !isLongDay(d)) return "bike";
        if (hasRun(d)  && !isLongDay(d)) return "run";
        return "rest";
      };

      const pairsUsed = { swim: 0, bike: 0, run: 0, rest: 0 };
      const DIVERSITY_PENALTY = 25;

      const scoreDay = d => {
        if (hasStr(d))    return -1;   // already has strength
        if (isLongDay(d)) return -1;   // never stack on long day
        if (hasBrick(d))  return -1;   // brick is self-contained (§6.1.1 rule #3)
        let base;
        if (hasSwim(d))              base = 100;
        else if (hasBike(d))         base = 80;
        else if (hasRun(d))          base = 45;
        else if (isRest(d))          base = 20;  // carve strength into rest day
        else                         base = 10;  // empty day, unlikely here
        const pt = pairTypeOf(d);
        return base - pairsUsed[pt] * DIVERSITY_PENALTY;
      };

      for (let i = 0; i < strength; i++) {
        const ranked = _BP_DAYS
          .map(d => ({ d, score: scoreDay(d) }))
          .filter(x => x.score >= 0)
          .sort((a, b) => b.score - a.score);
        if (!ranked.length) break;
        const target = ranked[0].d;
        // Rest day turning into a strength day: replace the rest token.
        if (isRest(target)) _state.schedule[target] = [];
        _state.schedule[target].push("strength");
        pairsUsed[pairTypeOf(target)]++;
      }
    }
    // Enforce rest days to match the user's `daysPerWeek` preference.
    // If they asked for 5 days, we carve 2 rest days from the lightest.
    // If they asked for 7, we force-clear any rest day we might have
    // accidentally seeded. Default to 5 training days if unset.
    const wantedTraining = Math.max(1, Math.min(7,
      parseInt(_state.planDetails.daysPerWeek, 10) || 5
    ));
    const restNeeded = 7 - wantedTraining;
    // Count current rest days (including implicitly empty days).
    const isRestDay = d => !_state.schedule[d].length || _state.schedule[d].includes("rest");
    const currentRest = _BP_DAYS.filter(isRestDay).length;

    if (currentRest < restNeeded) {
      // Carve rest days from the lightest non-long days. Sort priority:
      //   1. Fewer chips first (lightest day sheds least training stimulus).
      //   2. Adjacent-to-long next (§4.3 / spec §6 — rest flanking a long
      //      session serves a real recovery purpose; carving random mid-week
      //      days fragments the training block for no benefit).
      //   3. Later-in-week as the final tiebreak so we prefer Sunday over
      //      Monday when all else is equal — Monday is disproportionately
      //      often a day the athlete intends to train, and "lightest +
      //      earliest" was silently overwriting it.
      const isLongDay = d => _state.schedule[d].includes("run-long") || _state.schedule[d].includes("bike-long");
      const longDays = _BP_DAYS.filter(isLongDay);
      const adjacentToLong = d => longDays.some(ld => _areAdjacentDow(d, ld));
      const dowIdx = d => _BP_DAYS.indexOf(d);
      const carveCandidates = _BP_DAYS
        .filter(d => !isRestDay(d) && !isLongDay(d))
        .sort((a, b) => {
          const la = _state.schedule[a].length;
          const lb = _state.schedule[b].length;
          if (la !== lb) return la - lb;
          const aa = adjacentToLong(a) ? 0 : 1;
          const ab = adjacentToLong(b) ? 0 : 1;
          if (aa !== ab) return aa - ab;
          // Later in week wins (higher idx scored lower).
          return dowIdx(b) - dowIdx(a);
        });
      const toCarve = Math.min(restNeeded - currentRest, carveCandidates.length);
      for (let i = 0; i < toCarve; i++) {
        _state.schedule[carveCandidates[i]] = ["rest"];
      }
    } else if (currentRest > restNeeded && wantedTraining === 7) {
      // User wants to train every day — drop any implicit rest markers.
      _BP_DAYS.forEach(d => {
        if (_state.schedule[d].includes("rest")) _state.schedule[d] = [];
      });
      // Backfill empty days with round-robin endurance so they actually
      // get a session, otherwise days would render blank with just a +.
      if (endurance.length) {
        let idx = 0;
        _BP_DAYS.forEach(d => {
          if (_state.schedule[d].length === 0) {
            _state.schedule[d].push(endurance[idx % endurance.length]);
            idx++;
          }
        });
      }
    }

    // ── Spec-target enforcement (PLAN_GENERATOR_MASTER_SPEC §4) ─────────
    // After the round-robin scaffolding, ask the shared distribution matrix
    // how many sessions of each discipline this athlete actually needs in
    // BASE phase (the phase the template renders against by default) and
    // add whatever's missing — using doubles when the user's active days
    // aren't enough single-session slots. Keeps pre-fill and aligner using
    // the same source of truth so the onboarding screen shows what the
    // user will actually train.
    _enforceSpecTarget();
  }

  // ─── Spec-target enforcement for the Weekly Schedule template ─────────────
  // Derives athlete level from thresholds the same way planner.js does, looks
  // up PHASE_DISTRIBUTIONS_BY_LEVEL[sportProfile].Base[level], and adds
  // sessions to _state.schedule so the per-discipline counts match.
  //
  // Doubling rules match PlanSessionDistribution (§3a-iii):
  //   - Beginner: no doubles ever
  //   - Intermediate in Base: no doubles (budget 0)
  //   - Advanced: up to 3 doubles
  //   - Max 2 sessions per day
  //   - Preserve ≥1 rest day per week
  //   - Never double the day before a rest day
  //   - Non-hard sessions only get added as doubles (easy/strength)
  // Normalize goal strings across multiple historical enum shapes.
  // Current values: finish / get_faster / pr. Legacy values that may
  // still live in saved onboarding state get rewritten on read.
  function _normalizeGoal(g) {
    const s = String(g || "").toLowerCase();
    if (s === "just_finish") return "finish";
    if (s === "time_goal" || s === "time") return "get_faster";
    if (s === "pr_podium" || s === "podium") return "pr";
    if (s === "finish" || s === "get_faster" || s === "pr") return s;
    return "get_faster"; // default dial
  }

  function _enforceSpecTarget() {
    if (typeof window === "undefined") return;
    const PSD = window.PlanSessionDistribution;
    if (!PSD || !PSD.getDistribution) return;
    const race = _state.currentRace;
    if (!race || !race.type) return;

    const sportProfile = PSD.sportProfileForRaceType(race.type);
    if (!sportProfile) return;
    const level = _deriveAthleteLevel();

    // Prefer the new goal × level × distance matrix (SESSION_COUNT_MATRIX
    // per spec §4a-0). It varies by goal so Advanced/PR gets more sessions
    // than Advanced/Finish. Falls back to the legacy level-only matrix for
    // race types that aren't in the distance-specific table (hyrox, cycling
    // century). The legacy fallback is goal-agnostic and matches the old
    // behavior for plans predating the matrix rewrite.
    const goal = _normalizeGoal((race && race.goal) || "get_faster");
    let target = null;
    let sourceLabel = "legacy";
    if (typeof PSD.getSessionCount === "function") {
      const gm = PSD.getSessionCount(race.type, level, goal);
      if (gm) {
        target = gm;
        sourceLabel = "matrix";
      }
    }
    if (!target) target = PSD.getDistribution(sportProfile, "Base", level);
    if (!target) return;

    // Log so devtools shows what the pre-fill decided. Mirrors the planner's
    // "athlete level resolved to X via Y" trace so the two layers agree.
    try {
      console.log("[IronZ] pre-fill level=" + level + " goal=" + goal + " sport=" + sportProfile + " source=" + sourceLabel + " target:", target);
    } catch {}

    // When the matrix-derived target asks for more training days than the
    // user's selected daysPerWeek, bump daysPerWeek up to the matrix value
    // BEFORE placement so the scaffolding has room. We only ever bump up,
    // never down — the user's floor stands. Matrix-source only.
    //
    // For running-only athletes with no strength counter-load, hold the
    // ceiling at 6 days so we never auto-erase the weekly rest day. The
    // matrix's 7-day Advanced PR Ironman row doesn't apply here.
    const selectedNow = Array.isArray(_state.selectedSports) ? _state.selectedSports : [];
    const runOnly = selectedNow.length === 1 &&
      String(selectedNow[0] || "").toLowerCase() === "run";
    if (sourceLabel === "matrix" && typeof target.days === "number") {
      const cur = parseInt(_state.planDetails.daysPerWeek, 10) || 5;
      const desired = runOnly ? Math.min(target.days, 6) : target.days;
      if (desired > cur) {
        try { console.log("[IronZ] bumping daysPerWeek " + cur + " → " + desired + " to match matrix target"); } catch {}
        _state.planDetails.daysPerWeek = String(desired);
      }
    }

    // Count what the template already has, keyed by "canonical" discipline.
    const bucketOf = (code) => {
      const c = String(code || "").toLowerCase();
      if (c === "rest") return null;
      if (c.indexOf("strength") === 0 || c === "weightlifting" || c === "bodyweight") return "strength";
      if (c.indexOf("swim") === 0 || c.indexOf("pool") === 0 || c.indexOf("openwater") === 0) return "swim";
      if (c.indexOf("bike") === 0 || c.indexOf("cycle") === 0 || c.indexOf("cycling") === 0) return "bike";
      if (c.indexOf("run") === 0 || c.indexOf("walk") === 0) return "run";
      if (c.indexOf("brick") === 0) return "brick";
      if (c.indexOf("hyrox") === 0) return "hyrox";
      return null;
    };
    const currentCounts = () => {
      const n = { swim: 0, bike: 0, run: 0, strength: 0, brick: 0, hyrox: 0 };
      _BP_DAYS.forEach(d => {
        (_state.schedule[d] || []).forEach(code => {
          const b = bucketOf(code);
          if (b && n[b] != null) n[b]++;
        });
      });
      return n;
    };

    // Double budget per level+Base (matches plan-session-distribution.js).
    const doubleBudget = level === "advanced" ? 3 : 0;

    // Days already at max (2 slots), rest days, and "pre-rest" days that
    // shouldn't carry doubles.
    const isRestDay = (d) => (_state.schedule[d] || []).includes("rest");
    const restDays = _BP_DAYS.filter(isRestDay);
    const preRestDays = new Set();
    restDays.forEach(r => {
      const idx = _BP_DAYS.indexOf(r);
      if (idx > 0) preRestDays.add(_BP_DAYS[idx - 1]);
      // Wrap — Monday's "day before" is Sunday if Sun is rest.
      if (idx === 0 && _BP_DAYS.length > 1) preRestDays.add(_BP_DAYS[_BP_DAYS.length - 1]);
    });
    const isEmpty = (d) => (_state.schedule[d] || []).length === 0;
    // "Rest-like" = the day provides rest, either implicitly (no sessions)
    // or explicitly (user marked it Rest). Both count toward the ≥1 rest
    // day preservation rule, so a week with Mon marked Rest AND Fri empty
    // can fill Fri without violating the rest-day floor.
    const isRestLike = (d) => isEmpty(d) || isRestDay(d);

    // Helpers shared across placement attempts.
    const hasDisc = (d, disc) => (_state.schedule[d] || []).some(c => bucketOf(c) === disc);
    const adjHasDisc = (d, disc) => {
      const idx = _BP_DAYS.indexOf(d);
      const prev = _BP_DAYS[(idx - 1 + _BP_DAYS.length) % _BP_DAYS.length];
      const next = _BP_DAYS[(idx + 1) % _BP_DAYS.length];
      return hasDisc(prev, disc) || hasDisc(next, disc);
    };
    const MIDWEEK_ORDER = ["wed", "fri", "tue", "thu", "sat", "mon", "sun"];

    // Priority ladder per user request + spec constraints:
    //   1) Fill an empty day (non-last-rest-like)
    //   2) Promote a rest-marked day (user prefers daily training over
    //      doubling for the same target)
    //   3) Double on an existing day — NEVER same-discipline (user's own
    //      philosophy: can't do the same exercise twice in a day), never
    //      on a long-anchor day, never on the day before the remaining
    //      rest day
    let doublesUsed = 0;
    const placeOne = (disc) => {
      const code = disc === "strength" ? "strength-full" : disc;
      const empties     = _BP_DAYS.filter(d => isEmpty(d));
      const restMarked  = _BP_DAYS.filter(d => isRestDay(d));
      const restLikeCount = empties.length + restMarked.length;

      // 1) Empty day — prefer mid-week, avoid adjacent same-discipline.
      if (empties.length > 0 && restLikeCount > 1) {
        let target = MIDWEEK_ORDER.find(d => empties.includes(d) && !adjHasDisc(d, disc));
        if (!target) target = MIDWEEK_ORDER.find(d => empties.includes(d));
        if (target) { _state.schedule[target] = [code]; return true; }
      }

      // 2) Rest-marked day — the user's own note "would be better off just
      //    working out every day" over creating unnecessary doubles. Promote
      //    as long as at least one rest-like day (empty or still rest-marked)
      //    remains after the swap. If the week would otherwise hit zero rest
      //    days we fall through to doubling and accept that we may miss the
      //    target rather than deleting the last rest slot.
      if (restMarked.length > 0 && restLikeCount > 1) {
        let target = MIDWEEK_ORDER.find(d => restMarked.includes(d) && !adjHasDisc(d, disc));
        if (!target) target = MIDWEEK_ORDER.find(d => restMarked.includes(d));
        if (target) { _state.schedule[target] = [code]; return true; }
      }

      // 3) Double — last resort. Respects every spec + user constraint.
      if (doublesUsed >= doubleBudget) return false;
      // Recompute pre-rest days each call in case step 2 promoted a rest
      // day away (e.g. Mon promoted → Sun is no longer pre-rest).
      const liveRestDays = _BP_DAYS.filter(d => isRestDay(d) || isEmpty(d));
      const livePreRest  = new Set();
      liveRestDays.forEach(r => {
        const idx = _BP_DAYS.indexOf(r);
        if (idx > 0) livePreRest.add(_BP_DAYS[idx - 1]);
        if (idx === 0) livePreRest.add(_BP_DAYS[_BP_DAYS.length - 1]);
      });

      const doubleCandidates = _BP_DAYS.filter(d => {
        const slots = _state.schedule[d] || [];
        if (slots.length !== 1) return false;
        if (isRestDay(d)) return false;
        if (livePreRest.has(d)) return false;
        const existing = slots[0] || "";
        if (/-long$/.test(existing)) return false;
        // Hard rule: NEVER stack the same discipline on a single day.
        // Swim+swim, run+run, bike+bike are all banned regardless of load
        // labels. The user's philosophy: "can't do the same exercise twice
        // in a day."
        if (bucketOf(existing) === disc) return false;
        return true;
      });
      if (!doubleCandidates.length) return false;

      // Pairing preference — complementary muscle-group stacking per §3a-iii:
      //   strength is best paired with a cardio session (opposite-muscle)
      //   cardio is best paired with strength (not another endurance sport)
      doubleCandidates.sort((a, b) => {
        const aSport = bucketOf((_state.schedule[a] || [])[0] || "");
        const bSport = bucketOf((_state.schedule[b] || [])[0] || "");
        const aPref = (disc === "strength" && aSport !== "strength") ||
                      (disc !== "strength" && aSport === "strength") ? 0 : 1;
        const bPref = (disc === "strength" && bSport !== "strength") ||
                      (disc !== "strength" && bSport === "strength") ? 0 : 1;
        return aPref - bPref;
      });
      const day = doubleCandidates[0];
      _state.schedule[day].push(code);
      doublesUsed++;
      return true;
    };

    // Walk each discipline and bring counts up to the target. Order swim →
    // bike → run → strength → brick matches the aligner's so debugging is
    // consistent between the two layers.
    //
    // Scope enforcement to disciplines the user actually opted into via
    // selectedSports. Prior behavior auto-added strength (or any other
    // discipline in the spec target) even when the user never picked it,
    // so a runner who skipped strength during sport selection would see
    // 2 Full Body sessions appear on their Weekly Schedule preview.
    const selected = Array.isArray(_state.selectedSports) ? _state.selectedSports : [];
    const selectedBuckets = new Set();
    selected.forEach(s => {
      const k = String(s || "").toLowerCase();
      if (k === "swim") selectedBuckets.add("swim");
      else if (k === "bike" || k === "cycling") selectedBuckets.add("bike");
      else if (k === "run" || k === "running") selectedBuckets.add("run");
      else if (k === "strength" || k === "weightlifting" || k === "bodyweight") selectedBuckets.add("strength");
      else if (k === "brick") selectedBuckets.add("brick");
      else if (k === "hyrox") selectedBuckets.add("hyrox");
    });

    // Running-only cap: when the user has selected only run (no strength,
    // swim, bike), hold the week at 6 runs on 6 days — one rest day is
    // non-negotiable via the auto-generator. The matrix target may ask
    // for 7/8/10 runs (Advanced PR distances assume doubling), but for a
    // single-discipline athlete with no strength counter-load we never
    // erase the rest day. If the user wants a 7th run they can use
    // Add Session manually; Section 6c will show the "no rest day this
    // week" soft warning but won't block them.
    const isRunningOnly =
      selectedBuckets.size === 1 && selectedBuckets.has("run");
    const runCap = isRunningOnly ? 6 : null;

    ["swim", "bike", "run", "strength", "brick"].forEach(disc => {
      if (!selectedBuckets.has(disc)) return; // user didn't opt in — skip
      let want = target[disc] || 0;
      if (runCap != null && disc === "run") want = Math.min(want, runCap);
      let have = currentCounts()[disc] || 0;
      let safety = 0;
      while (have < want && safety < 14) {
        safety++;
        if (!placeOne(disc)) break;
        have = currentCounts()[disc] || 0;
      }
    });
  }

  // Derive athlete level the same way planner.js does so pre-fill and
  // generator agree. Priority: thresholds → race.level → profile.fitnessLevel
  // → default "intermediate".
  function _deriveAthleteLevel() {
    let level = "intermediate";
    try {
      const TZ = typeof window !== "undefined" ? window.TrainingZones : null;
      if (TZ) {
        // Pull from localStorage.trainingZones (the Training Zones UI's
        // actual store) plus legacy localStorage.thresholds. Falls back to
        // _state.thresholds for flows that haven't flushed to storage yet.
        let thresholds = {};
        if (typeof TZ.loadFromStorage === "function") {
          thresholds = TZ.loadFromStorage() || {};
        }
        if (_state.thresholds) {
          // In-memory onboarding state can override when the user is mid-flow.
          Object.assign(thresholds, _state.thresholds);
        }
        const weightKg = _state.profile && _state.profile.weight
          ? Number(_state.profile.weight) * 0.453592
          : null;
        const perSport = {
          run:  TZ.classifyRunning(thresholds),
          bike: TZ.classifyCycling(thresholds, weightKg),
          swim: TZ.classifySwim(thresholds),
        };
        const derived = TZ.overallLevel(perSport);
        if (derived) level = derived;
      }
    } catch {}
    if (_state.currentRace && _state.currentRace.level) {
      level = String(_state.currentRace.level).toLowerCase();
    }
    return level;
  }
  function _prettySport(s) {
    const map = {
      swim: "Swim", bike: "Bike", run: "Run", "run-long": "Long Run", "bike-long": "Long Ride",
      brick: "Brick",
      strength: "Strength", hiit: "HIIT", yoga: "Yoga", rowing: "Row", walking: "Walk",
      hyrox: "Hyrox", circuit: "Circuit", mobility: "Mobility", rest: "Rest",
    };
    return map[s] || s;
  }
  function _renderScheduleSummary() {
    const summary = document.getElementById("bp-v2-schedule-summary");
    if (!summary) return;
    let sessions = 0, restDays = 0, activeDays = 0;
    _BP_DAYS.forEach(d => {
      const slots = _state.schedule[d] || [];
      const nonRest = slots.filter(s => s !== "rest");
      if (nonRest.length) { sessions += nonRest.length; activeDays++; }
      if (slots.includes("rest") || !slots.length) restDays++;
    });
    summary.innerHTML =
      '<div class="ob-v2-summary-stat"><div class="ob-v2-summary-num">' + sessions + '</div><div class="ob-v2-summary-label">Sessions</div></div>' +
      '<div class="ob-v2-summary-stat"><div class="ob-v2-summary-num">' + activeDays + '</div><div class="ob-v2-summary-label">Training days</div></div>' +
      '<div class="ob-v2-summary-stat"><div class="ob-v2-summary-num">' + restDays + '</div><div class="ob-v2-summary-label">Rest days</div></div>';
    const warn = document.getElementById("bp-v2-rest-warning");
    if (warn) warn.style.display = restDays === 0 ? "" : "none";
  }
  // Remove a specific slot by its index in the day's array (so we can
  // distinguish duplicates of the same sport on the same day).
  function _removeSlotAt(day, idx) {
    if (!Array.isArray(_state.schedule[day])) return;
    _state.schedule[day].splice(idx, 1);
    _markScheduleTouched();
    _renderSchedule();
  }
  // Back-compat wrapper: delete first occurrence by sport name.
  function _removeSlot(day, sport) {
    const arr = _state.schedule[day] || [];
    const idx = arr.indexOf(sport);
    if (idx >= 0) { arr.splice(idx, 1); _markScheduleTouched(); _renderSchedule(); }
  }

  // Subtype picker catalog — when the user taps an existing chip
  // on the schedule grid, offer the variants for that sport so they
  // can lock in an "Interval Run" vs "Easy Run" etc. Stored slots
  // are replaced with the enriched code, which flows through to the
  // preview (via _enrichWeekTemplate's pass-through branch) and the
  // materialized calendar sessions (via _buildSessionForSport).
  const _SUBTYPE_OPTIONS = {
    run:  [["run-easy","Easy Run"], ["run-interval","Interval Run"], ["run-long","Long Run"], ["run-recovery","Recovery Run"]],
    bike: [["bike-easy","Easy Ride"], ["bike-interval","Interval Ride"], ["bike-long","Long Ride"]],
    swim: [["swim-endurance","Endurance Swim"], ["swim-css","CSS Swim"]],
    strength: [["strength-push","Push Day"], ["strength-pull","Pull Day"], ["strength-legs","Leg Day"], ["strength-upper","Upper Body"], ["strength-lower","Lower Body"], ["strength-full","Full Body"], ["strength-custom","Custom"]],
  };

  function _openSlotSubtypePicker(day, slotIdx, triggerChip) {
    _closeAddSlotPicker();
    if (!Array.isArray(_state.schedule[day])) return;
    const current = _state.schedule[day][slotIdx];
    if (!current) return;
    const bucket = _sportBucketFromEnriched(current);
    const options = _SUBTYPE_OPTIONS[bucket];
    if (!options) return; // e.g. brick / rest / yoga have no variants — no-op
    const chips = options.map(o =>
      '<button type="button" class="ob-v2-picker-chip' + (o[0] === current ? " is-selected" : "") + '" ' +
        'onclick="OnboardingV2._pickSlotSubtype(\'' + day + '\',' + slotIdx + ',\'' + o[0] + '\')">' +
        _escape(o[1]) +
      '</button>'
    ).join("");
    const tray = document.createElement("div");
    tray.className = "ob-v2-picker-tray";
    tray.innerHTML =
      '<div class="ob-v2-picker-head">Set focus for this ' + _escape(_prettySport(bucket)) + '</div>' +
      '<div class="ob-v2-picker-chips">' + chips + '</div>' +
      '<button type="button" class="ob-v2-picker-cancel" onclick="OnboardingV2._closeAddSlotPicker()">Cancel</button>';
    const dayRow = triggerChip ? triggerChip.closest(".ob-v2-schedule-day") : null;
    if (dayRow) dayRow.appendChild(tray);
    _activePicker = tray;
  }
  function _pickSlotSubtype(day, slotIdx, enrichedCode) {
    if (!Array.isArray(_state.schedule[day])) return;
    _state.schedule[day][slotIdx] = enrichedCode;
    _markScheduleTouched();
    _closeAddSlotPicker();
    _renderSchedule();
  }

  // Inline tap picker for adding a session to a day. Replaces the
  // ugly window.prompt() that used to pop up. Renders a row of
  // tappable sport chips right below the day, no modal.
  let _activePicker = null;
  function _openAddSlotPicker(day, triggerBtn) {
    _closeAddSlotPicker();
    const selected = _state.selectedSports || [];
    const sports = selected.concat(["strength"]);
    // Offer Brick whenever the user has both bike and run (i.e. triathletes
    // and duathletes). A brick is a single session that stacks a ride and
    // a run back-to-back — core triathlon-specific work.
    if (selected.includes("bike") && selected.includes("run")) sports.push("brick");
    sports.push("rest");
    const unique = Array.from(new Set(sports));
    const chips = unique.map(s =>
      '<button type="button" class="ob-v2-picker-chip ob-v2-slot-' + s.replace(/[^a-z0-9]/gi, "") + '" ' +
        'onclick="OnboardingV2._pickAddSlot(\'' + day + '\',\'' + s + '\')">' +
        _escape(_prettySport(s)) +
      '</button>'
    ).join("");
    const tray = document.createElement("div");
    tray.className = "ob-v2-picker-tray";
    tray.innerHTML =
      '<div class="ob-v2-picker-head">Add to ' + _BP_DAY_LABELS[day] + '</div>' +
      '<div class="ob-v2-picker-chips">' + chips + '</div>' +
      '<button type="button" class="ob-v2-picker-cancel" onclick="OnboardingV2._closeAddSlotPicker()">Cancel</button>';
    // Append tray to the day row so it shows contextually
    const dayRow = triggerBtn ? triggerBtn.closest(".ob-v2-schedule-day") : null;
    if (dayRow) dayRow.appendChild(tray);
    _activePicker = tray;
  }
  function _pickAddSlot(day, sport) {
    _addSlotToDay(day, sport);
    // The picker offers "strength" even when the user didn't pick it on
    // the sport grid. Sync selectedSports so the render filter keeps the
    // chip on subsequent re-renders (otherwise it gets silently stripped
    // and the user's lift day disappears).
    if (sport === "strength" && Array.isArray(_state.selectedSports) && !_state.selectedSports.includes("strength")) {
      _state.selectedSports.push("strength");
      _lsSet("selectedSports", _state.selectedSports);
    }
    _markScheduleTouched();
    _closeAddSlotPicker();
    _renderSchedule();
  }

  // Add a session to a day with rest/workout mutual exclusion AND
  // brick mutual exclusion:
  //   - adding "rest"  → drops every other session on that day
  //   - adding a workout → drops any "rest" marker already present
  //   - adding "brick" → drops any standalone bike/run/long/interval
  //     chips on the same day (a brick already includes a ride and a
  //     run; having both reads as double-counting)
  //   - adding bike/run on a day that already has brick → no-op (brick
  //     covers it)
  function _addSlotToDay(day, sport) {
    if (!Array.isArray(_state.schedule[day])) _state.schedule[day] = [];
    if (sport === "rest") {
      _state.schedule[day] = ["rest"];
      return;
    }
    _state.schedule[day] = _state.schedule[day].filter(s => s !== "rest");

    // Brick covers bike + run for the day. Strip any bike/run-family
    // chips when adding brick; ignore bike/run additions when brick
    // is already there. Bug 7: manual chip-add was bypassing the
    // dedup logic that auto-placement (_seedSchedule) already had.
    const _isBikeRunFamily = (s) =>
      s === "bike" || s === "run" ||
      s.indexOf("bike-") === 0 || s.indexOf("run-") === 0;
    if (sport === "brick") {
      _state.schedule[day] = _state.schedule[day].filter(s => !_isBikeRunFamily(s));
    } else if (_isBikeRunFamily(sport) && _state.schedule[day].includes("brick")) {
      // Brick already includes a ride + run — silently no-op so the
      // user doesn't end up with [Brick, Bike] on the same day.
      return;
    }

    // Avoid duplicate-same-sport spam (e.g., two Rests via drag).
    if (!_state.schedule[day].includes(sport)) _state.schedule[day].push(sport);
  }
  function _closeAddSlotPicker() {
    if (_activePicker && _activePicker.parentElement) _activePicker.parentElement.removeChild(_activePicker);
    _activePicker = null;
  }

  // Drag-and-drop: allow the user to move a slot from one day to
  // another by dragging it. Works on desktop with mouse; touch
  // drag-drop is not universally supported so tap-add remains the
  // fallback on mobile.
  function _slotDragStart(ev) {
    const el = ev.currentTarget;
    if (!el) return;
    const day = el.getAttribute("data-slot-day");
    const idx = el.getAttribute("data-slot-idx");
    const sport = el.getAttribute("data-slot-sport");
    try {
      ev.dataTransfer.effectAllowed = "move";
      ev.dataTransfer.setData("text/plain", JSON.stringify({ day, idx: Number(idx), sport }));
    } catch {}
    el.classList.add("ob-v2-slot-dragging");
  }
  function _slotDragEnd(ev) {
    const el = ev.currentTarget;
    if (el) el.classList.remove("ob-v2-slot-dragging");
    document.querySelectorAll(".ob-v2-schedule-day.ob-v2-drop-target")
      .forEach(d => d.classList.remove("ob-v2-drop-target"));
  }
  function _slotDragOver(ev) {
    ev.preventDefault();
    try { ev.dataTransfer.dropEffect = "move"; } catch {}
    ev.currentTarget.classList.add("ob-v2-drop-target");
  }
  function _slotDragLeave(ev) {
    ev.currentTarget.classList.remove("ob-v2-drop-target");
  }
  function _slotDrop(ev, targetDay) {
    ev.preventDefault();
    ev.currentTarget.classList.remove("ob-v2-drop-target");
    let payload = null;
    try { payload = JSON.parse(ev.dataTransfer.getData("text/plain") || "null"); } catch {}
    if (!payload || !payload.day) return;
    if (payload.day === targetDay) return;
    if (!Array.isArray(_state.schedule[payload.day])) return;
    const from = _state.schedule[payload.day];
    if (from[payload.idx] !== payload.sport) return;
    from.splice(payload.idx, 1);
    _addSlotToDay(targetDay, payload.sport);
    _markScheduleTouched();
    _renderSchedule();
  }
  function _saveScheduleAndContinue() {
    // Editing an existing plan → commit straight to disk and exit.
    // Skipping the preview is the whole point of the edit flow: the
    // user already has a plan, they're tweaking the weekly pattern.
    if (_state._editingPlanId) {
      _confirmAndSavePlan();
      return;
    }
    // New build → preview before final commit. Note: we do NOT write
    // _state.schedule into "workoutSchedule" here. That key holds the
    // materialized dated sessions (an array), not the weekly template
    // (an object) — _writeScheduleSessions in _confirmAndSavePlan is
    // what actually populates it.
    goTo("bp-v2-7");
    _renderPlanPreview();
  }

  // Given the weekly template (a 7-day map of sport buckets), produce
  // an enriched version where each slot carries a specific subtype like
  // "run-long", "run-interval", "run-recovery", "bike-interval",
  // "strength-push", "strength-pull", etc. The stored schedule keeps
  // simple sport buckets for editability; enrichment happens here once
  // and drives both the preview and the materialized calendar sessions.
  //
  // Rules (per week):
  //  - First run → Long Run if this day matches longDays.longRun,
  //    else Interval Run (hard day). Last run → Recovery Run.
  //    Middle runs → Easy Run.
  //  - First bike → Long Ride if longDays.longRide, else Interval Ride.
  //    Other bikes → Easy Ride.
  //  - Swim → CSS Swim for first, Endurance Swim for others.
  //  - Strength → rotate by split: PPL (push/pull/legs), UL (upper/lower),
  //    Full Body, or Custom (use strengthSetup.customMuscles).
  //  - Brick stays as "brick" (single label).
  function _enrichWeekTemplate() {
    const enriched = {};
    _BP_DAYS.forEach(d => { enriched[d] = []; });

    // First pass: split long-anchored sports out of the pool so we can
    // count the non-long sessions per sport for rotation logic.
    const runDays = _BP_DAYS.filter(d => (_state.schedule[d] || []).includes("run"));
    const bikeDays = _BP_DAYS.filter(d => (_state.schedule[d] || []).includes("bike"));
    const swimDays = _BP_DAYS.filter(d => (_state.schedule[d] || []).includes("swim"));

    const split = _state.strengthSetup && _state.strengthSetup.split || "ppl";
    const customMuscles = _state.strengthSetup && _state.strengthSetup.customMuscles || {};

    // Count strength days this week to pick a balanced rotation — straight
    // push/pull/legs cycling leaves legs at 1x/week when day count isn't a
    // multiple of 3. Uses PPLUL for odd counts so every pattern hits ≥2x.
    const strCount = _BP_DAYS.reduce((n, d) =>
      n + ((_state.schedule[d] || []).filter(s => s === "strength").length), 0);
    const PPL_PATTERNS = {
      1: ["full"],
      2: ["upper", "lower"],
      3: ["push", "pull", "legs"],
      4: ["push", "pull", "legs", "upper"],
      5: ["push", "pull", "legs", "upper", "lower"],
      6: ["push", "pull", "legs", "push", "pull", "legs"],
      7: ["push", "pull", "legs", "push", "pull", "legs", "full"],
    };
    const UL_PATTERNS = {
      1: ["full"],
      2: ["upper", "lower"],
      3: ["upper", "lower", "full"],
      4: ["upper", "lower", "upper", "lower"],
      5: ["upper", "lower", "upper", "lower", "full"],
      6: ["upper", "lower", "upper", "lower", "upper", "lower"],
      7: ["upper", "lower", "upper", "lower", "upper", "lower", "full"],
    };
    const STRENGTH_ROTATION = {
      ppl:      PPL_PATTERNS[strCount] || PPL_PATTERNS[3],
      ul:       UL_PATTERNS[strCount] || UL_PATTERNS[2],
      fullBody: Array(Math.max(1, strCount)).fill("full"),
    };

    // For custom split, map selected muscle groups to a pretty label.
    function _customDayLabel(dayIdx) {
      const muscles = Array.isArray(customMuscles[String(dayIdx)]) ? customMuscles[String(dayIdx)] : [];
      if (!muscles.length) return "custom";
      const pushSet = ["chest", "shoulders", "triceps"];
      const pullSet = ["back", "biceps"];
      const legsSet = ["quads", "hamstrings", "glutes", "calves"];
      const allPush = muscles.every(m => pushSet.includes(m));
      const allPull = muscles.every(m => pullSet.includes(m));
      const allLegs = muscles.every(m => legsSet.includes(m));
      if (allPush) return "push";
      if (allPull) return "pull";
      if (allLegs) return "legs";
      return "custom";
    }

    let strIdx = 0;
    let runIdx = 0;
    let bikeIdx = 0;
    let swimIdx = 0;

    _BP_DAYS.forEach(d => {
      const slots = _state.schedule[d] || [];
      const out = [];
      slots.forEach(s => {
        if (s === "run") {
          const isLong = _state.longDays && _state.longDays.longRun === d && runIdx === 0;
          const runTotal = runDays.length;
          // Quality-session slots depend on total run volume:
          //   ≥4 runs → [interval, tempo, ...easy..., recovery, long]
          //             (2 quality sessions — hits spec §4c get_faster Build/Peak)
          //   3 runs  → [interval, easy, recovery] (+ long if applicable)
          //   ≤2 runs → [interval, easy] (+ long)
          if (isLong) out.push("run-long");
          else if (runIdx === 0)                                   out.push("run-interval");
          else if (runIdx === 1 && runTotal >= 4)                  out.push("run-tempo");
          else if (runTotal >= 3 && runIdx === runTotal - 1)       out.push("run-recovery");
          else                                                     out.push("run-easy");
          runIdx++;
        } else if (s === "bike") {
          const isLong = _state.longDays && _state.longDays.longRide === d && bikeIdx === 0;
          if (isLong)             out.push("bike-long");
          else if (bikeIdx === 0) out.push("bike-interval");
          else                    out.push("bike-easy");
          bikeIdx++;
        } else if (s === "swim") {
          out.push(swimIdx === 0 ? "swim-css" : "swim-endurance");
          swimIdx++;
        } else if (s === "strength") {
          let focus;
          if (split === "custom") {
            // Preserve the day index so the renderer and the session
            // builder can look up the actual muscle selections for
            // this specific day. Produces codes like "strength-day1",
            // "strength-day2", ... — _enrichedLabel reads customMuscles
            // from state to format a label.
            focus = "day" + (strIdx + 1);
          } else {
            focus = (STRENGTH_ROTATION[split] || STRENGTH_ROTATION.ppl)[strIdx] || "full";
          }
          out.push("strength-" + focus);
          strIdx++;
        } else {
          // long-anchored or non-rotating types: brick, run-long, bike-long,
          // rest, yoga, hiit, etc. pass through unchanged.
          out.push(s);
        }
      });
      enriched[d] = out;
    });
    return enriched;
  }

  // Pretty label for enriched slot codes. Falls back to _prettySport().
  // Per-phase label overrides for the plan preview. Session placement
  // stays the same across phases (day layout is the user's choice); what
  // changes is the SESSION CHARACTER (easy vs tempo vs race-pace) and
  // whether certain sessions exist at all (no brick in Base; no long run
  // in Race week). Returns null for a code that doesn't apply in the
  // phase — the caller drops those from the preview.
  const _PHASE_LABELS = {
    base: {
      "run-long":      "Long Run",
      "run-interval":  "Easy Run",        // no intensity in Base
      "run-tempo":     "Easy Run",        // no intensity in Base
      "run-recovery":  "Recovery Run",
      "run-easy":      "Easy Run",
      "bike-long":     "Long Ride",
      "bike-interval": "Z2 Endurance",    // no intensity in Base
      "bike-easy":     "Z2 Endurance",
      "swim-css":      "Technique",       // no intensity in Base
      "swim-endurance":"Endurance Swim",
      // Brick is not a Base session per §6.1 (brick is introduced in Build).
      // Rather than dropping the day to Rest — which reads as "the app forgot
      // my preference" — substitute an aerobic bike session. Keeps the day
      // productive and preserves the brick slot for Build/Peak.
      "brick":         "Z2 Endurance",
    },
    build: {
      "run-long":      "Long Run",
      "run-interval":  "Interval Run",
      "run-tempo":     "Tempo Run",
      "run-recovery":  "Recovery Run",
      "run-easy":      "Easy Run",
      "bike-long":     "Long Ride",
      "bike-interval": "Sweet Spot",
      "bike-easy":     "Z2 Endurance",
      "swim-css":      "CSS Intervals",
      "swim-endurance":"Endurance Swim",
      "brick":         "Brick",
    },
    peak: {
      // Philosophy §6.1 keeps the long run/ride in Peak but at slightly
      // reduced volume so recovery capacity stays intact. The preview
      // label is the session TYPE — duration metadata conveys the
      // shorter length. "Long Run (short)" read as a contradiction.
      "run-long":      "Long Run",
      "run-interval":  "Race-Pace Run",
      "run-tempo":     "Tempo Run",
      "run-recovery":  "Recovery Run",
      "run-easy":      "Easy Run",
      "bike-long":     "Long Ride",
      "bike-interval": "Race-Pace Bike",
      "bike-easy":     "Z2 Endurance",
      "swim-css":      "Race-Pace Swim",
      "swim-endurance":"Endurance Swim",
      "brick":         "Brick (Race Sim)",
    },
    taper: {
      "run-long":      "Taper Long Run",
      "run-interval":  "Short Race-Pace",
      "run-tempo":     "Short Tempo",
      "run-recovery":  "Easy Run",
      "run-easy":      "Easy Run",
      "bike-long":     "Short Opener",
      "bike-interval": "Short Opener",
      "bike-easy":     "Easy Ride",
      "swim-css":      "Short Race-Pace",
      "swim-endurance":"Technique",
      "brick":         null,              // no brick in Taper
    },
    // Race Week — §6.1 updated (v1.7) from 3 sessions to 4–5. Coaches
    // typically prescribe short openers / shakeouts across most training
    // days in race week (race-pace strokes, strides, very short rides)
    // to keep neuromuscular readiness up without adding fatigue. Long
    // sessions (long_run, long_ride) and brick are dropped; intervals
    // and race-pace sessions become short openers; easy sessions become
    // shakeouts. The user's 1–2 days closest to the race should stay
    // rest — this is handled downstream when the schedule is written
    // out for the race week itself.
    race: {
      "run-long":      null,                            // no long run in race week
      "run-interval":  "Short Race-Pace Opener",        // 10-min race-pace primer
      "run-tempo":     "Shakeout Run",                   // no tempo in race week
      "run-recovery":  "Shakeout Run",
      "run-easy":      "Shakeout Run",
      "bike-long":     null,                            // no long ride in race week
      "bike-interval": "Short Opener w/ Strides",       // 30 min w/ 3x2min at race pace
      "bike-easy":     "Shakeout Bike",
      "swim-css":      "Race-Pace Openers",             // 400-600m w/ 4-6 race-pace strokes
      "swim-endurance":"Short Openers",
      "brick":         null,                            // no brick in race week
    },
  };

  function _enrichedLabel(code, phase) {
    if (phase && _PHASE_LABELS[phase] && Object.prototype.hasOwnProperty.call(_PHASE_LABELS[phase], code)) {
      const override = _PHASE_LABELS[phase][code];
      if (override === null) return null;       // session dropped in this phase
      if (override) return override;
    }
    // Strength sessions become "Maintenance" in Build/Peak, drop in Taper/Race.
    if (code.indexOf("strength-") === 0) {
      if (phase === "taper" || phase === "race") return null;
      if (phase === "build" || phase === "peak") return "Strength (Maint)";
    }
    const map = {
      "run-long":     "Long Run",
      "run-interval": "Interval Run",
      "run-tempo":    "Tempo Run",
      "run-recovery": "Recovery Run",
      "run-easy":     "Easy Run",
      "bike-long":    "Long Ride",
      "bike-interval":"Interval Ride",
      "bike-easy":    "Easy Ride",
      "swim-css":     "CSS Swim",
      "swim-endurance":"Endurance Swim",
      "strength-push":"Push Day",
      "strength-pull":"Pull Day",
      "strength-legs":"Leg Day",
      "strength-upper":"Upper Body",
      "strength-lower":"Lower Body",
      "strength-full":"Full Body",
      "strength-custom":"Strength",
      "brick":        "Brick",
    };
    if (map[code]) return map[code];
    // strength-dayN → look up the user's per-day muscle picks and
    // produce a "Chest + Shoulders" style label. Falls back to "Day N"
    // when the user didn't pick anything for that day.
    const dayMatch = /^strength-day(\d+)$/.exec(code);
    if (dayMatch) {
      const n = dayMatch[1];
      const muscles = (_state.strengthSetup && _state.strengthSetup.customMuscles && _state.strengthSetup.customMuscles[n]) || [];
      if (!muscles.length) return "Day " + n;
      const nameMap = {
        chest: "Chest", back: "Back", shoulders: "Shoulders",
        biceps: "Biceps", triceps: "Triceps", quads: "Quads",
        hamstrings: "Hamstrings", glutes: "Glutes", calves: "Calves",
        core: "Core", fullbody: "Full Body",
      };
      const labels = muscles.map(m => nameMap[m] || m);
      // Collapse common upper/lower groupings into a single name so
      // the label doesn't become an essay when the user picks every
      // push muscle, etc.
      const set = new Set(muscles);
      const all = (...xs) => xs.every(x => set.has(x));
      if (all("chest","shoulders","triceps") && set.size === 3) return "Push Day";
      if (all("back","biceps") && set.size === 2)               return "Pull Day";
      if (all("quads","hamstrings","glutes","calves") && set.size === 4) return "Leg Day";
      if (labels.length <= 3) return labels.join(" + ");
      return labels.slice(0, 2).join(" + ") + " +" + (labels.length - 2);
    }
    return _prettySport(code);
  }

  // Switch the plan preview's sample week to the clicked phase. Persists
  // the choice on _state so any re-render keeps the user's selection.
  function _selectPreviewPhase(phase) {
    if (!phase || typeof phase !== "string") return;
    _state._previewPhase = phase.toLowerCase();
    _renderPlanPreview();
  }

  function _renderPlanPreview() {
    const body = document.getElementById("bp-v2-preview-body");
    if (!body) return;
    const race = _state.currentRace;
    const hasRace = _state.trainingGoals.includes("race") && race && race.date;

    // Re-run spec-target enforcement on every preview render so users
    // who change goal / level after the schedule was first seeded still
    // see the matrix-correct session count. Idempotent — it only ADDS
    // missing sessions up to the matrix target, never removes.
    // Previously a user who selected PR goal and Advanced level AFTER
    // visiting the Weekly Schedule step saw a 5-session, 1-quality plan
    // because the schedule was seeded under the old intermediate
    // defaults and never re-enforced.
    try { _enforceSpecTarget(); } catch (e) { try { console.warn("[IronZ] preview enforce failed:", e.message); } catch {} }
    // Strength-only users don't follow a race-phased arc, so the
    // base/build/peak/taper timeline is irrelevant — skip it.
    const sports = _state.selectedSports || [];
    const strengthOnly = sports.length > 0 && sports.every(s => s === "strength");

    // "You are here" marker — computes the user's current position along
    // the plan so they can see which phase they're in at a glance. At
    // preview time (fresh plan) it sits at 0% (start of Base). If this
    // preview is ever reshown mid-plan, the marker advances proportionally.
    let markerPct = 0;
    let currentPhaseLabel = "Base";
    if (hasRace) {
      const raceMs = new Date(race.date + "T00:00:00").getTime();
      // Plan start = saved plan start, else today (preview case).
      const startMs = _state.planStartMs || Date.now();
      const totalMs = Math.max(1, raceMs - startMs);
      const elapsed = Math.max(0, Date.now() - startMs);
      markerPct = Math.min(100, Math.max(0, (elapsed / totalMs) * 100));
      // Base 0-35%, Build 35-70%, Peak 70-90%, Taper 90-98%, Race 98-100%.
      // `currentPhaseLabel` stays canonical (matches phase keys); we swap
      // the display string to "Race Week" at render time.
      currentPhaseLabel = markerPct < 35 ? "Base"
        : markerPct < 70 ? "Build"
        : markerPct < 90 ? "Peak"
        : markerPct < 98 ? "Taper"
        : "Race";
    }
    const markerDisplayPhase = currentPhaseLabel === "Race" ? "Race Week" : currentPhaseLabel;
    const markerHtml =
      '<div class="ob-v2-timeline-marker" style="left:' + markerPct.toFixed(1) + '%">' +
        '<div class="ob-v2-timeline-marker-dot"></div>' +
        '<div class="ob-v2-timeline-marker-label">You are here · ' + _escape(markerDisplayPhase) + '</div>' +
      '</div>';

    // Phase the user is previewing. Clicking a timeline segment swaps
    // the preview week to that phase's labels so they can see what
    // Base / Build / Peak / Taper / Race Week each look like before
    // committing. Defaults to the user's current position in the arc.
    const phases = ["base", "build", "peak", "taper", "race"];
    const phaseDisplayName = p => p === "race" ? "Race Week"
      : p.charAt(0).toUpperCase() + p.slice(1);
    const currentPhaseKey = currentPhaseLabel.toLowerCase();
    const previewPhase = _state._previewPhase && phases.includes(_state._previewPhase)
      ? _state._previewPhase
      : currentPhaseKey;
    const phaseSeg = p => '<span class="ob-v2-timeline-seg ob-v2-timeline-' + p +
      (previewPhase === p ? ' is-selected' : '') +
      '" onclick="OnboardingV2._selectPreviewPhase(\'' + p + '\')"></span>';
    const phaseLabel = p => '<span class="ob-v2-timeline-label' +
      (previewPhase === p ? ' is-selected' : '') +
      '" onclick="OnboardingV2._selectPreviewPhase(\'' + p + '\')">' +
      phaseDisplayName(p) + '</span>';

    const timelineHtml = hasRace
      ? '<div class="ob-v2-timeline-labels">' + phases.map(phaseLabel).join("") + '</div>' +
        '<div class="ob-v2-timeline-bar">' + phases.map(phaseSeg).join("") + markerHtml + '</div>'
      : '<div class="ob-v2-timeline-labels"><span>Week 1</span><span>Week 2</span><span>Week 3</span><span>Week 4</span></div>' +
        '<div class="ob-v2-timeline-bar">' +
          '<span class="ob-v2-timeline-seg ob-v2-timeline-base"></span><span class="ob-v2-timeline-seg ob-v2-timeline-build"></span><span class="ob-v2-timeline-seg ob-v2-timeline-peak"></span><span class="ob-v2-timeline-seg ob-v2-timeline-taper"></span>' +
          markerHtml +
        '</div>';
    const enriched = _enrichWeekTemplate();
    // Phase-adjusted labels only apply when we're showing the timeline
    // (race athletes with a live arc). Strength-only / no-race athletes
    // just see the raw session labels.
    const activePhase = hasRace && !strengthOnly ? previewPhase : null;
    // When previewing Race Week, substitute the day that falls on race
    // day with a RACE marker instead of a training session — having any
    // workout on race day is wrong and the user has flagged this.
    let raceDowKey = null;
    if (activePhase === "race" && hasRace && race && race.date) {
      const _DOW_TO_KEY = ["sun","mon","tue","wed","thu","fri","sat"];
      const raceDow = new Date(race.date + "T00:00:00").getDay();
      raceDowKey = _DOW_TO_KEY[raceDow];
    }
    const weekHtml = _BP_DAYS.map(d => {
      if (d === raceDowKey) {
        return '<div class="ob-v2-week-day-row"><div class="ob-v2-week-day-label">' + _BP_DAY_LABELS[d] + '</div><div class="ob-v2-week-day-workouts"><div class="ob-v2-mini-wk ob-v2-mini-race">RACE DAY</div></div></div>';
      }
      const slots = enriched[d] || [];
      const phaseSlots = slots
        .map(code => ({ code, label: _enrichedLabel(code, activePhase) }))
        .filter(s => s.label !== null);
      const mini = phaseSlots.length
        ? phaseSlots.map(s => {
            const bucket = _sportBucketFromEnriched(s.code);
            return '<div class="ob-v2-mini-wk ob-v2-mini-' + bucket.replace(/[^a-z0-9]/gi, "") + '">' +
              _escape(s.label) + '</div>';
          }).join("")
        : '<div class="ob-v2-mini-wk ob-v2-mini-rest">Rest</div>';
      return '<div class="ob-v2-week-day-row"><div class="ob-v2-week-day-label">' + _BP_DAY_LABELS[d] + '</div><div class="ob-v2-week-day-workouts">' + mini + '</div></div>';
    }).join("");
    // Only show the phase timeline when there's an actual race driving
    // the Base/Build/Peak/Taper arc. Strength-only users and no-race
    // endurance users just see the week preview — phases don't apply.
    const showTimeline = hasRace && !strengthOnly;
    const weekLabel = activePhase
      ? (activePhase === 'race'
          ? 'Race Week — Sample Schedule'
          : phaseDisplayName(activePhase) + ' Phase — Sample Week')
      : 'Plan Week 1';
    body.innerHTML =
      (showTimeline ? '<div class="ob-v2-preview-timeline">' + timelineHtml + '</div>' : "") +
      '<div class="ob-v2-section-label">' + _escape(weekLabel) + '</div>' +
      '<div class="ob-v2-week-preview">' + weekHtml + '</div>' +
      _renderPlanPhilosophyBlock(enriched);
    const anyTest = Object.values(_state.thresholds || {}).some(t => t && t.mode === "test");
    const callout = document.getElementById("bp-v2-test-callout");
    if (callout) callout.style.display = anyTest ? "" : "none";
  }

  // Strip the enriched suffix to the base sport bucket so we can reuse
  // the existing color/class naming (ob-v2-mini-run, ob-v2-slot-bike, etc.)
  function _sportBucketFromEnriched(code) {
    if (!code) return "";
    if (code.indexOf("run") === 0)      return "run";
    if (code.indexOf("bike") === 0)     return "bike";
    if (code.indexOf("swim") === 0)     return "swim";
    if (code.indexOf("strength") === 0) return "strength";
    return code;
  }

  // "Why this plan?" explainer — collapsible card under the week grid.
  // Explains the intent behind each session type using plain language,
  // so users can learn the why behind the structure. Copy is intentionally
  // short today; the user is going to expand the philosophy in a follow-up.
  function _renderPlanPhilosophyBlock(enriched) {
    // Collect unique enriched codes used this week so we only explain
    // what the user will actually see.
    const seen = new Set();
    _BP_DAYS.forEach(d => (enriched[d] || []).forEach(s => seen.add(s)));
    const EXPLAIN = {
      "run-long":     "Builds aerobic base and bone-tendon durability. Longest run of the week at conversational pace.",
      "run-interval": "Drives VO2max and lactate threshold up. Hard reps with full recovery so each one is quality.",
      "run-tempo":    "Sustained effort at comfortably-hard pace. Extends the speed you can hold aerobically — the engine behind a strong finish.",
      "run-recovery": "Flush day. Easy effort the day after your hardest session so your body absorbs the work.",
      "run-easy":     "Aerobic volume at conversational pace. 70–80% of your weekly run time should feel this easy.",
      "bike-long":    "Endurance base for cycling. Long, steady, fuel well — the foundation for everything else.",
      "bike-interval":"Sweet-spot or VO2 intervals on the bike. Raises your FTP ceiling.",
      "bike-easy":    "Easy spin to accumulate volume without digging a hole.",
      "swim-css":     "Threshold swim keyed to your CSS pace. The most time-efficient way to get faster in the pool.",
      "swim-endurance":"Volume-focused swim. Longer intervals with short rest to build aerobic capacity.",
      "strength-push":"Chest, shoulders, triceps. Barbell press + accessories.",
      "strength-pull":"Back and biceps. Vertical and horizontal pulling work.",
      "strength-legs":"Quads, hams, glutes, calves. Compound squat/hinge patterns.",
      "strength-upper":"Upper body — mix of push and pull in one session.",
      "strength-lower":"Lower body — squat, hinge, unilateral, accessories.",
      "strength-full":"Full-body day. One compound per movement pattern.",
      "strength-custom":"Your picked muscle focus for this day.",
      "brick":        "Bike-to-run transition training — the core triathlon-specific session. Teaches your legs to run off the bike.",
    };
    const items = Array.from(seen)
      .filter(s => EXPLAIN[s])
      .map(s =>
        '<li><strong>' + _escape(_enrichedLabel(s)) + '</strong> — ' + _escape(EXPLAIN[s]) + '</li>'
      )
      .join("");
    if (!items) return "";
    return '<details class="ob-v2-philosophy">' +
      '<summary>Why this plan?</summary>' +
      '<p class="ob-v2-philosophy-intro">Every session has a job. Here\'s what each one is doing for you:</p>' +
      '<ul class="ob-v2-philosophy-list">' + items + '</ul>' +
      '</details>';
  }

  // Persist Build Plan inputs AND materialize the weekly template into
  // dated sessions appended to the real `workoutSchedule` array. Previously
  // we overwrote `workoutSchedule` with the weekly-template OBJECT, which
  // corrupted it (calendar expects an array) and caused day-detail crashes.
  // We also no longer delegate to generateTrainingPlan for multi-sport
  // users — the user's explicit schedule is the source of truth.
  function _confirmAndSavePlan() {
    // TRAINING_PHILOSOPHY §4.8 — Half/Full Ironman recommend ≥5 training
    // days/week. If the schedule has fewer active days, explain why and
    // let the user choose whether to go back or keep their selection.
    // We respect the user's choice — no silent override downstream.
    const longCourseFloor = _minDaysForCurrentRaces();
    if (longCourseFloor > 1) {
      const activeDays = _BP_DAYS.filter(d => Array.isArray(_state.schedule[d]) && _state.schedule[d].length > 0).length;
      if (activeDays < longCourseFloor) {
        const proceed = confirm(
          `Heads up: Half and Full Ironman training usually needs at least ${longCourseFloor} days/week to reach the start line safely. ` +
          `You currently have ${activeDays} active day(s). ` +
          `\n\nYou can keep sessions short or easy on the days you're less ready for, but fewer than ${longCourseFloor} days risks undertraining for the distance. ` +
          `\n\nPress OK to keep your ${activeDays}-day plan as-is, or Cancel to go back and add days.`
        );
        if (!proceed) return;
      }
    }

    _lsSet("selectedSports", _state.selectedSports);
    _lsSet("trainingGoals", _state.trainingGoals);
    _lsSet("strengthRole", _state.strengthRole);
    _lsSet("raceEvents", _state.raceEvents);
    _lsSet("thresholds", _state.thresholds);
    _lsSet("strengthSetup", _state.strengthSetup);
    // Template (weekly pattern) lives in its own key; do NOT write to workoutSchedule here.
    _lsSet("buildPlanTemplate", _state.schedule);

    // Persist which weekdays the athlete picked to the profile so the
    // classifier + downstream plan generators honor the user's day
    // selection instead of falling back to hardcoded defaults. DOW index
    // matches surveyData.preferredDays: 0=Sun…6=Sat.
    try {
      const _BP_DOW_TO_IDX = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
      const activeDows = _BP_DAYS
        .filter(d => Array.isArray(_state.schedule[d]) && _state.schedule[d].length > 0)
        .map(d => _BP_DOW_TO_IDX[d])
        .filter(n => n != null)
        .sort((a, b) => a - b);
      const profile = _lsGet("profile", {}) || {};
      profile.daysPerWeek = activeDows.length || profile.daysPerWeek;
      if (activeDows.length > 0) profile.preferredDays = activeDows;
      _lsSet("profile", profile);
      if (typeof DB !== "undefined" && DB.profile && DB.profile.save) {
        DB.profile.save(profile).catch(() => {});
      }
    } catch (e) { console.warn("[OnboardingV2] failed to persist preferredDays", e); }

    // Map onboarding raceEvents into the legacy events shape so the
    // calendar / renderRaceEvents keep working unchanged. When the user
    // has built a weekly template in Training Inputs, attach it to the
    // race as `preferences` so the race plan generator can honor their
    // day-of-week sport assignments and preferred long day. Also stamp
    // daysPerWeek + longDay so phase-based load modulation lands on the
    // right days.
    const _activeDaysPerWeek = _BP_DAYS.filter(d => Array.isArray(_state.schedule[d]) && _state.schedule[d].length > 0).length;
    const _BP_LONG_RUN_DOW = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
    const _longDayName = _state.longDays && _state.longDays.longRun;
    const _longDayIdx = _longDayName ? _BP_LONG_RUN_DOW[_longDayName] : null;
    // Use the ENRICHED template (run → run-interval / run-tempo / run-long /
    // run-easy / run-recovery) instead of raw _state.schedule so the plan
    // generator sees the intended intensity distribution. Passing plain
    // "run" codes made every session default to easy in every phase — the
    // bug that produced all-Z2 get_faster plans. _enrichWeekTemplate is
    // pure (derives from _state.schedule + _state.longDays + strength
    // split, writes nothing), so calling it for preview is safe.
    let _enrichedForRace;
    try { _enrichedForRace = _enrichWeekTemplate(); }
    catch (e) { _enrichedForRace = { ...(_state.schedule || {}) }; }

    const _prefsForRace = {
      weeklyTemplate: _enrichedForRace,
      daysPerWeek: _activeDaysPerWeek || undefined,
      sessionLengthMin: parseInt(_state.planDetails.sessionLength, 10) || undefined,
      longDay: (_longDayIdx !== null && _longDayIdx !== undefined) ? _longDayIdx : undefined,
      source: "onboarding_v2",
    };
    const legacyEvents = _mapRacesToLegacyEvents(_state.raceEvents);
    if (legacyEvents.length) {
      // Attach preferences to each race so the generator picks them up.
      legacyEvents.forEach(r => { r.preferences = { ..._prefsForRace }; });
      const existing = _lsGet("events", []) || [];
      _lsSet("events", existing.concat(legacyEvents));
    }

    // Tag the generated sessions with the primary race's id so Active
    // Training Inputs can collapse "Race + Training Block" into one card
    // instead of showing both for what the user experiences as one plan.
    // Prefer A-priority race; fall back to the first race.
    const planRace = legacyEvents.find(e => (e.priority || "A").toUpperCase() === "A") || legacyEvents[0] || null;
    const raceIdForPlan = planRace ? planRace.id : null;

    // UNIFIED PLAN: if a race exists, generate the race plan (trainingPlan)
    // which spans today→race with philosophy-based phases AND honors the
    // athlete's preferences. Do NOT write separate workoutSchedule entries
    // — the race plan IS the schedule. Non-race path still materializes
    // workoutSchedule from the weekly template.
    if (planRace && typeof window !== "undefined" && typeof window._regeneratePlanForRace === "function") {
      try {
        window._regeneratePlanForRace(planRace);
      } catch (e) {
        console.warn("[OnboardingV2] race plan generation failed", e);
      }
    } else {
      try {
        _writeScheduleSessions(raceIdForPlan, planRace);
      } catch (e) {
        console.warn("[OnboardingV2] writing schedule sessions failed", e);
      }
    }

    // Bodyweight-only users: persist a permanent equipment restriction with
    // empty `available` so the existing filterByEquipment path strips every
    // barbell/dumbbell/cable/kettlebell exercise and falls through to the
    // BODYWEIGHT_LIBRARY substitute when rendering strength sessions.
    if (_state.gymAccess === "bodyweight") {
      let eqR = {};
      try { eqR = JSON.parse(localStorage.getItem("equipmentRestrictions")) || {}; } catch {}
      eqR["permanent"] = {
        available: [],
        note: "Bodyweight only (from Build a Plan)",
        permanent: true,
        createdAt: new Date().toISOString()
      };
      localStorage.setItem("equipmentRestrictions", JSON.stringify(eqR));
      if (typeof DB !== "undefined" && DB.syncKey) DB.syncKey("equipmentRestrictions");
    }

    _lsSet("surveyComplete", "1");
    if (_state.mode === "onboarding") _lsSet("hasOnboarded", "1");
    goTo("bp-v2-done");
  }

  // Expand the weekly `_state.schedule` template into real sessions on
  // the user's calendar for the next N weeks (planDetails.duration).
  // Appends to the existing `workoutSchedule` array without touching
  // past entries.
  function _writeScheduleSessions(raceIdForPlan, planRace) {
    // Phase 5A: respect coach-set plan freeze. When a coach picks
    // "Freeze AI plan from this date forward", isPlanFrozen() reads
    // true from the cache populated at auth-ready by
    // refreshPlanFreezeState. Skip generation entirely — the coach
    // owns the calendar from here.
    //
    // The user can override via Profile → "Take back plan control"
    // which writes unfrozen_at on the row + flips the cache. They
    // can then re-run Build Plan and it'll proceed.
    if (typeof window.isPlanFrozen === "function" && window.isPlanFrozen()) {
      const coachName = (() => {
        try {
          const meta = window.getPlanFrozenMeta && window.getPlanFrozenMeta();
          if (meta?.by && window._coachNameCache?.[meta.by]) return window._coachNameCache[meta.by];
        } catch {}
        return "your coach";
      })();
      alert(`AI plan generation is paused — ${coachName} is managing your schedule. Open Profile → "Take back plan control" if you want the AI to resume.`);
      console.log("[OnboardingV2] _writeScheduleSessions skipped — plan frozen");
      return;
    }

    // "indefinite" → materialize 12 weeks as a rolling window; numeric
    // strings like "11" or "12" parse cleanly; "custom" falls back to
    // customWeeks (set by the custom-weeks input).
    let weeks = 12;
    const dur = _state.planDetails.duration;
    const isIndefinite = dur === "indefinite";
    if (isIndefinite) weeks = (typeof INDEFINITE_PLAN_WEEKS !== "undefined") ? INDEFINITE_PLAN_WEEKS : 52;
    else if (dur === "custom") weeks = Math.max(1, Math.min(52, parseInt(_state.planDetails.customWeeks, 10) || 12));
    else weeks = Math.max(1, parseInt(dur, 10) || 12);
    const sessionLen = Math.max(15, parseInt(_state.planDetails.sessionLength, 10) || 60);

    // If this plan is tied to a race, materialize sessions all the way
    // through the race week — otherwise races >12 weeks out left every
    // day from week 13 onward as REST. Cap at 52 weeks for safety.
    if (planRace && planRace.date) {
      try {
        const raceDate = new Date(planRace.date + "T00:00:00");
        const startIsoForRace = _state.planDetails.startDate || _nextMondayISO();
        const startForRace = new Date(startIsoForRace + "T00:00:00");
        if (!isNaN(raceDate.getTime()) && !isNaN(startForRace.getTime())) {
          const weeksToRace = Math.ceil((raceDate - startForRace) / (86400000 * 7));
          if (weeksToRace > weeks) weeks = Math.min(52, weeksToRace);
        }
      } catch {}
    }
    // Reuse the planId we're editing so Training Inputs still groups
    // the refreshed sessions under the same card. Otherwise mint new.
    const planId = _state._editingPlanId || ("ob-v2-" + Date.now());

    // Use the user-picked start date, falling back to next Monday.
    const startIso = _state.planDetails.startDate || _nextMondayISO();
    const start = new Date(startIso + "T00:00:00");
    if (isNaN(start.getTime())) start.setTime(new Date().getTime());
    start.setHours(0, 0, 0, 0);

    const existing = (() => {
      try { return JSON.parse(localStorage.getItem("workoutSchedule")) || []; }
      catch { return []; }
    })();
    // Keep only array entries (defensive: previous bug wrote an object).
    // If we're editing, drop all future sessions for this planId so the
    // refreshed write replaces them cleanly.
    const todayIso = new Date().toISOString().slice(0, 10);
    const existingArr = (Array.isArray(existing) ? existing : []).filter(e => {
      if (!_state._editingPlanId) return true;
      if (e.planId !== _state._editingPlanId) return true;
      if (e.date < todayIso) return true; // keep past entries
      return false;
    });

    // Compute enriched codes per slot so materialized sessions get
    // richer names ("Interval Run", "Pull Day", "Long Ride") matching
    // what the preview showed. _enrichWeekTemplate rotates strength
    // days by split and labels runs/bikes by position.
    const enrichedTemplate = _enrichWeekTemplate();

    // §2.5.5 critical rule: fat_loss ("weight" goal) and cut goals
    // require a minimum of 2 strength sessions per week regardless of
    // whether the athlete picked strength. If the template has fewer,
    // inject strength-full into the lowest-load days to reach the floor.
    // We mutate only the ENRICHED copy so _state.schedule (and the
    // persisted buildPlanTemplate) remain as the athlete explicitly chose.
    const _goals = _state.trainingGoals || [];
    const _needsStrengthFloor = _goals.includes("weight") || _goals.includes("cut");
    if (_needsStrengthFloor) {
      const hasStrengthSlot = (slots) =>
        Array.isArray(slots) && slots.some(s => typeof s === "string" && s.indexOf("strength") === 0);
      const slotLoadWeight = (slots) => {
        if (!Array.isArray(slots) || slots.length === 0) return 0; // rest = best candidate
        if (slots.some(s => typeof s === "string" && /long/.test(s))) return 10;
        if (slots.some(s => typeof s === "string" && /interval|hard|css/.test(s))) return 8;
        return slots.length * 2;
      };
      let strengthDayCount = _BP_DAYS.filter(d => hasStrengthSlot(enrichedTemplate[d])).length;
      if (strengthDayCount < 2) {
        const candidates = _BP_DAYS
          .filter(d => !hasStrengthSlot(enrichedTemplate[d]))
          .map(d => ({ day: d, load: slotLoadWeight(enrichedTemplate[d]) }))
          .sort((a, b) => a.load - b.load);
        const needed = 2 - strengthDayCount;
        for (let i = 0; i < needed && i < candidates.length; i++) {
          const day = candidates[i].day;
          enrichedTemplate[day] = (enrichedTemplate[day] || []).concat(["strength-full"]);
        }
      }
    }

    // Anchor the weekly template to an actual Monday so template Mon → real
    // Mon, Tue → real Tue, etc. — previously idx=0 (Mon template) was placed
    // on the start date regardless of what day the user picked, which threw
    // off the whole week when start was mid-week (e.g. Thu start → Mon's
    // circuit landed on Thu). Skip template days that fall before the start
    // date so week 1 is correctly partial instead of back-dated.
    const startDow = start.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const daysBackToMon = startDow === 0 ? 6 : startDow - 1;
    const weekMonday = new Date(start);
    weekMonday.setDate(start.getDate() - daysBackToMon);

    // Any session that lands on a race date gets dropped — race day is
    // the race itself, not a training day. Covers the A race the plan
    // is built for plus any B races the user added in the Build Plan flow.
    const raceDateSet = new Set();
    (Array.isArray(_state.raceEvents) ? _state.raceEvents : [])
      .forEach(r => { if (r && r.date) raceDateSet.add(r.date); });

    // Whether this rolling-template plan is acting as the base arc for a
    // race. Only in that case do we compute phase per week — standalone
    // rolling plans (no race) stay phase-agnostic and get "base" reps.
    const _hasRaceArc = !!(planRace && planRace.date);

    const sessions = [];
    let counter = 0;
    for (let w = 0; w < weeks; w++) {
      const phaseKey = _hasRaceArc ? _phaseForWeek(w + 1, weeks) : "base";
      _BP_DAYS.forEach((day, idx) => {
        const slots = (enrichedTemplate[day] || []).filter(s => s && s !== "rest");
        slots.forEach(enrichedCode => {
          const d = new Date(weekMonday);
          d.setDate(weekMonday.getDate() + w * 7 + idx);
          if (d < start) return; // first week is partial when start is mid-week
          const dateStr = d.toISOString().slice(0, 10);
          if (raceDateSet.has(dateStr)) return; // race day — skip training session
          const session = _buildSessionForSport(enrichedCode, dateStr, sessionLen, w + 1, planId, counter++, phaseKey);
          if (session) {
            if (raceIdForPlan) session.raceId = raceIdForPlan;
            // Mark every session in an indefinite plan so the Training
            // Inputs card can render "Ongoing" instead of a hard end
            // date. Bug 14: the user picks indefinite, expects the plan
            // to roll, and the card was misrepresenting it as fixed-12-
            // weeks-then-stops.
            if (isIndefinite) session.indefinite = true;
            sessions.push(session);
          }
        });
      });
    }

    // Multi-race awareness: apply a micro-taper window around any
    // upcoming B races that fall inside this plan's window. Uses the
    // shared insertBRaceWindow helper from planner.js so the Build
    // Plan and the legacy survey flow agree on the taper math.
    try {
      const raceCalendar = (typeof prepareRaceCalendar === "function")
        ? prepareRaceCalendar(_lsGet("events", []) || [])
        : null;
      if (raceCalendar && raceCalendar.bRaces.length && typeof insertBRaceWindow === "function") {
        raceCalendar.bRaces.forEach(bRace => insertBRaceWindow(sessions, bRace, raceCalendar.aRace));
      }
    } catch (e) {
      console.warn("[OnboardingV2] B race window pass failed", e);
    }

    // Rule Engine Step 5 — constraint validator. Same as the race path.
    // Applies §4.3 global intensity rules: no adjacent hard days for
    // non-advanced, intensity cap per week, ≥1 rest day/week.
    if (sessions.length && typeof window !== "undefined" && window.PlanConstraintValidator) {
      try {
        let level = "intermediate";
        try {
          const profile = _lsGet("profile", {}) || {};
          const raw = profile.fitnessLevel || profile.fitness_level || profile.experience_level || profile.level;
          if (raw) level = String(raw).toLowerCase();
        } catch {}
        window.PlanConstraintValidator.validateAndFixPlan(sessions, level);
      } catch (e) {
        console.warn("[OnboardingV2] constraint validator failed:", e && e.message);
      }
    }

    const merged = existingArr.concat(sessions);
    localStorage.setItem("workoutSchedule", JSON.stringify(merged));
    if (typeof DB !== "undefined" && DB.syncKey) DB.syncKey("workoutSchedule");
  }

  // ── Slot templates (cowork-handoff/EXERCISE_DB_SPEC.md §Slot templates) ──
  //
  // Each focus maps to an ordered list of "slots". The planner fills slots
  // one at a time via ExerciseDB.pick(), passing previously-picked
  // exercises as diverseFrom so the next pick uses a different
  // specificGoal. This is what spreads a chest day across general /
  // upper-chest / chest-isolation instead of three incline variants.
  //
  // Sets/reps per slot role match the conservative defaults the legacy
  // _STRENGTH_TEMPLATES used. Weight is left blank ("") for the user
  // (or the per-exercise weight estimator) to fill.
  const _SLOT_TEMPLATES = {
    push: [
      { role: "main-horizontal", pattern: "horizontal-push", tier: ["primary"],            sets: 4, reps: "6-8" },
      { role: "main-vertical",   pattern: "vertical-push",   tier: ["primary"],            sets: 3, reps: "8-10" },
      { role: "secondary-push",  pattern: "horizontal-push", tier: ["secondary"],          sets: 3, reps: "10",   diverseFrom: ["main-horizontal"] },
      { role: "accessory-shldr", pattern: "vertical-push",   tier: ["secondary","tertiary"], sets: 3, reps: "12",   diverseFrom: ["main-vertical"] },
      { role: "tri-isolation",   pattern: "isolation-arms",  specificGoal: "triceps",      sets: 3, reps: "12" },
    ],
    pull: [
      { role: "main-hinge",      pattern: "hinge",           tier: ["primary"],            sets: 4, reps: "5" },
      { role: "main-h-pull",     pattern: "horizontal-pull", tier: ["primary"],            sets: 4, reps: "8" },
      { role: "main-v-pull",     pattern: "vertical-pull",   tier: ["primary","secondary"],sets: 4, reps: "AMRAP" },
      { role: "secondary-pull",  pattern: "horizontal-pull", tier: ["secondary","tertiary"], sets: 3, reps: "12",  diverseFrom: ["main-h-pull"] },
      { role: "bi-isolation",    pattern: "isolation-arms",  specificGoal: "biceps",       sets: 3, reps: "10" },
    ],
    legs: [
      { role: "main-squat",      pattern: "squat",           tier: ["primary"],            sets: 4, reps: "5-8" },
      { role: "main-hinge",      pattern: "hinge",           tier: ["primary"],            sets: 3, reps: "8" },
      { role: "secondary-squat", pattern: "squat",           tier: ["secondary"],          sets: 3, reps: "10",   diverseFrom: ["main-squat"] },
      { role: "leg-isolation",   pattern: "isolation-legs",                                sets: 3, reps: "12" },
      { role: "calves",          pattern: "isolation-legs",  specificGoal: "calves",       sets: 4, reps: "15" },
    ],
    upper: [
      { role: "main-h-push",     pattern: "horizontal-push", tier: ["primary"],            sets: 4, reps: "6-8" },
      { role: "main-h-pull",     pattern: "horizontal-pull", tier: ["primary"],            sets: 4, reps: "8" },
      { role: "main-v-push",     pattern: "vertical-push",   tier: ["primary"],            sets: 3, reps: "8-10" },
      { role: "main-v-pull",     pattern: "vertical-pull",   tier: ["primary","secondary"],sets: 3, reps: "AMRAP" },
      { role: "shldr-isolation", pattern: "vertical-push",   tier: ["tertiary"],           sets: 3, reps: "12" },
    ],
    lower: [
      { role: "main-squat",      pattern: "squat",           tier: ["primary"],            sets: 4, reps: "5-8" },
      { role: "main-hinge",      pattern: "hinge",           tier: ["primary"],            sets: 3, reps: "8" },
      { role: "secondary-squat", pattern: "squat",           tier: ["secondary"],          sets: 3, reps: "10",   diverseFrom: ["main-squat"] },
      { role: "ham-isolation",   pattern: "isolation-legs",  specificGoal: "hamstrings-knee-flexion", sets: 3, reps: "12" },
      { role: "calves",          pattern: "isolation-legs",  specificGoal: "calves",       sets: 4, reps: "15" },
    ],
    full: [
      { role: "main-squat",      pattern: "squat",           tier: ["primary"],            sets: 3, reps: "6-8" },
      { role: "main-h-push",     pattern: "horizontal-push", tier: ["primary"],            sets: 3, reps: "6-8" },
      { role: "main-h-pull",     pattern: "horizontal-pull", tier: ["primary"],            sets: 3, reps: "8" },
      { role: "main-v-push",     pattern: "vertical-push",   tier: ["primary"],            sets: 3, reps: "8" },
      { role: "core",            pattern: "core",            tier: ["primary","secondary"],sets: 3, reps: "45s" },
    ],
  };

  // Convert an N-rep-max entry to an estimated 1RM using Epley's formula:
  // 1RM ≈ w × (1 + reps/30). Accepts {weight, type:"1rm"|"5rm"|"10rm"}.
  function _oneRMFromEntry(entry) {
    if (!entry || !entry.weight) return null;
    const w = parseFloat(entry.weight);
    if (!(w > 0)) return null;
    const t = (entry.type || "1rm").toLowerCase();
    const reps = t === "5rm" ? 5 : t === "10rm" ? 10 : 1;
    return reps === 1 ? w : w * (1 + reps / 30);
  }

  // Working-set weight as a % of 1RM tuned to the rep target (Brzycki-style).
  // Uses the upper end of a range so the suggested weight matches what the
  // user can actually hit for every rep — conservative > aspirational.
  function _workingPctForReps(repsStr) {
    if (!repsStr) return 0.70;
    const m = String(repsStr).match(/(\d+)(?:\s*[-–]\s*(\d+))?/);
    if (!m) return 0.70;
    const hi = parseInt(m[2] || m[1], 10);
    if (hi <= 3) return 0.90;
    if (hi <= 5) return 0.85;
    if (hi <= 6) return 0.82;
    if (hi <= 8) return 0.78;
    if (hi <= 10) return 0.72;
    if (hi <= 12) return 0.67;
    return 0.60;
  }

  // Map an ExerciseDB name → strength-benchmark key. Only matches movements
  // the user actually logged a 1RM/5RM/10RM for; unmatched movements return
  // "" so the Weight column stays blank (better than a guessed number).
  function _benchmarkKeyForExercise(name) {
    if (!name) return null;
    const n = String(name).toLowerCase();
    // Row must be checked before "deadlift" since "Pendlay Row" shouldn't
    // match on a word boundary that isn't there.
    if (/\brow\b/.test(n) && !/upright/.test(n)) return "row";
    if (/\bbench\s*press\b/.test(n) && !/close[- ]?grip|incline|decline/.test(n)) return "bench";
    if (/\b(?:back\s*)?squat\b/.test(n) && !/front|goblet|split|pistol|box|hack|bulgarian/.test(n)) return "squat";
    if (/\bdeadlift\b/.test(n) && !/romanian|rdl|stiff|sumo|trap/.test(n)) return "deadlift";
    if (/\b(?:overhead|shoulder|military)\s*press\b|\bohp\b/.test(n) && !/dumbbell|landmine|seated/.test(n)) return "ohp";
    return null;
  }

  // Derive a per-exercise working weight from the user's strength benchmarks
  // in trainingZones.strength. Returns a pretty string like "135 lbs" or ""
  // when the user has no benchmark for this lift (we'd rather show blank
  // than mislead with an imaginary number).
  function _suggestWeightForExercise(name, repsStr) {
    const key = _benchmarkKeyForExercise(name);
    if (!key) return "";
    let zones = {};
    try { zones = JSON.parse(localStorage.getItem("trainingZones") || "{}") || {}; } catch {}
    const entry = zones.strength && zones.strength[key];
    const oneRM = _oneRMFromEntry(entry);
    if (!oneRM) return "";
    const pct = _workingPctForReps(repsStr);
    // Round to nearest 5 lbs — gym plates come in 2.5/5 increments and 5 is
    // the sensible default for big lifts; 2.5 would imply fractional plates.
    const lbs = Math.round((oneRM * pct) / 5) * 5;
    return lbs > 0 ? `${lbs} lbs` : "";
  }

  // Fill a slot template via ExerciseDB.pick with diverseFrom chaining.
  // Returns an array shaped like _STRENGTH_TEMPLATES entries:
  //   [{ name, sets, reps, weight }, ...]
  // Returns null when ExerciseDB isn't loaded OR when no slot can find a
  // matching exercise, so callers fall back to the legacy template.
  // BUGFIX 04-27 §3: see session-assembler.js for the canonical version of
  // this helper. This local copy keeps onboarding-v2 self-contained so the
  // 3-day exclusion fires regardless of which generator path runs.
  function _recentlyDoneExerciseIds() {
    const E = (typeof window !== "undefined" && window.ExerciseDB) || null;
    if (!E || typeof localStorage === "undefined") return [];
    let workoutsArr = [];
    try { workoutsArr = JSON.parse(localStorage.getItem("workouts") || "[]") || []; } catch { return []; }
    if (!Array.isArray(workoutsArr) || !workoutsArr.length) return [];
    const cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;
    const ids = new Set();
    for (const w of workoutsArr) {
      const dateStr = w.date || w.timestamp;
      if (!dateStr) continue;
      const t = new Date(dateStr).getTime();
      if (!isFinite(t) || t < cutoff) continue;
      const exs = Array.isArray(w.exercises) ? w.exercises : [];
      for (const ex of exs) {
        if (!ex || !ex.name) continue;
        const dbEx = E.getByName(ex.name);
        if (dbEx && dbEx.id) ids.add(dbEx.id);
      }
    }
    return Array.from(ids);
  }

  function _fillSlotTemplate(focus, userEquip) {
    const tpl = _SLOT_TEMPLATES[focus];
    const E = (typeof window !== "undefined" && window.ExerciseDB) || null;
    if (!tpl || !E) return null;
    const pickedByRole = {};
    const out = [];
    const recentIds = _recentlyDoneExerciseIds();
    for (const slot of tpl) {
      const filters = {
        ...(slot.pattern       ? { pattern: slot.pattern }             : {}),
        ...(slot.tier          ? { tier: slot.tier }                   : {}),
        ...(slot.specificGoal  ? { specificGoal: slot.specificGoal }   : {}),
        ...(Array.isArray(userEquip) && userEquip.length ? { equipment: userEquip } : {}),
        ...(recentIds.length ? { excludeIds: recentIds } : {}),
      };
      const diverseFrom = (slot.diverseFrom || [])
        .map(role => pickedByRole[role])
        .filter(Boolean);
      let chosen = E.pick(filters, 1, { diverseFrom })[0];
      // Relax tier on miss — better to ship A pick than skip the slot.
      if (!chosen && slot.tier) {
        const relaxed = { ...filters };
        delete relaxed.tier;
        chosen = E.pick(relaxed, 1, { diverseFrom })[0];
      }
      if (!chosen) continue;
      pickedByRole[slot.role] = chosen;
      out.push({
        name: chosen.name,
        sets: slot.sets,
        reps: slot.reps,
        weight: chosen.usesWeights
          ? _suggestWeightForExercise(chosen.name, slot.reps)
          : "Bodyweight",
      });
    }
    return out.length ? out : null;
  }

  // ─── STRENGTH ROLE PARAMETERS (Phase 2) ──────────────────────────────
  // Per TRAINING_PHILOSOPHY.md §2.5.3 / §7.6.2 / §7.6.3 / §7.6.4 / §8.5.
  // The role drives session length, exercise count, rep ranges, technique
  // bias, and sport-specific exercise overlays for race_performance.
  //
  // Rep-range notes:
  //   - race_performance uses phase-specific reps: heavy (3–6) in Base,
  //     moderate (6–10) in Build, maintenance in Peak/Taper.
  //   - injury_prevention uses muscular-endurance reps (12–15) with
  //     controlled tempo and a bias toward bodyweight/band/stability work.
  //   - hypertrophy uses traditional 8–12 hypertrophy range and permits
  //     drop sets / supersets on accessories for intermediate+.
  //   - minimal is a short bodyweight-circuit-style session (§2.5.3).
  const _STRENGTH_ROLE_PARAMS = {
    injury_prevention: {
      sessionLen: 35,         // 30–40 min; short so it doesn't interfere with key cardio
      exerciseCount: 5,       // 4–5 per session
      primaryReps: "12-15",
      accessoryReps: "12-15",
      primarySets: 3,
      accessorySets: 3,
      technique: "straight",  // §7.6.3 cut / injury_prevention avoid metabolic stress
      biasBodyweight: true,
      loadLevel: "easy",      // matches "place on easy cardio days" guidance
    },
    race_performance: {
      sessionLen: 50,         // 45–60 min; heavy compound work needs rest
      exerciseCount: 5,       // 4–6
      primaryReps: "3-6",     // Base phase default (§2.5.3)
      accessoryReps: "6-10",
      primarySets: 4,
      accessorySets: 3,
      buildPrimaryReps: "6-10",   // Build phase override
      buildAccessoryReps: "8-12",
      peakPrimaryReps: "5",       // Peak — maintenance only
      peakAccessoryReps: "8",
      technique: "straight",
      biasBodyweight: false,
      loadLevel: "moderate",  // KEY session per §2.5.3 — place strategically
    },
    hypertrophy: {
      // BUGFIX 04-27 §F4: dropped 55 → 48 to match observed reality.
      // The previous estimate budgeted ~10 min of unstated warmup time;
      // now that compound cards display warmup text explicitly, the
      // working-set portion accounts for less of the total.
      sessionLen: 48,         // 45–60 min; volume drives hypertrophy
      exerciseCount: 7,       // 6–8
      primaryReps: "8-12",
      accessoryReps: "10-12",
      primarySets: 4,
      accessorySets: 3,
      technique: "hypertrophy",   // drop sets / supersets permitted on accessories
      biasBodyweight: false,
      loadLevel: "moderate",  // endurance intensity should cap on these days
    },
    minimal: {
      sessionLen: 20,         // bodyweight circuit, ~20 min
      exerciseCount: 4,       // 3–4
      primaryReps: "10-12",
      accessoryReps: "10-12",
      primarySets: 2,
      accessorySets: 2,
      technique: "circuit",
      biasBodyweight: true,
      loadLevel: "easy",
    },
  };

  // How many strength sessions per week each role permits (§2.5.3 upper bounds).
  // Used by the fat_loss/cut floor logic to decide when to auto-add.
  // race_performance cap is phase-dependent (2 Base / 1 Build+); we keep
  // the cap at 2 and let the phase controller handle the Build reduction
  // if/when that layer is added.
  const _ROLE_FREQUENCY_CAP = {
    injury_prevention: 2,
    race_performance:  2,
    hypertrophy:       3,
    minimal:           1,
  };

  // §8.5 Sport-specific strength overlays for race_performance. Replaces
  // the default _STRENGTH_TEMPLATES slot contents when the athlete is
  // training for a race in that sport. Keyed by (sportBucket, focus).
  // Sport buckets: "running" | "cycling" | "swimming" | "triathlon".
  // Triathlon is a superset — legs get cycling emphasis, pull gets swim
  // emphasis, core + single-leg from running.
  const _SPORT_STRENGTH_EXERCISES = {
    running: {
      // Single-leg dominant + hip extension + ankle stiffness + core.
      // BUGFIX 04-27 §F1: stripped pull/core movements from `push` and core
      // movements from `pull` — those leak into the wrong day. Anti-rotation
      // / dead-bug work goes to upper/full where mixing is intentional.
      legs:  ["Bulgarian Split Squat", "Romanian Deadlift", "Hip Thrust", "Walking Lunges", "Standing Calf Raise"],
      lower: ["Bulgarian Split Squat", "Romanian Deadlift", "Step-up", "Walking Lunges", "Standing Calf Raise"],
      full:  ["Bulgarian Split Squat", "Hip Thrust", "Pallof Press", "Dead Bug", "Standing Calf Raise"],
      upper: ["Push-up", "Pull-up", "Pallof Press", "Dead Bug"],
      push:  ["Push-up", "Overhead Press", "Dumbbell Bench Press", "Tricep Pushdown"],
      pull:  ["Pull-up", "Face Pull", "Barbell Row", "Pallof Press"],
    },
    cycling: {
      // Max force + hip extension + unilateral pedaling symmetry
      legs:  ["Back Squat", "Leg Press", "Romanian Deadlift", "Single-leg Deadlift", "Hip Thrust"],
      lower: ["Back Squat", "Leg Press", "Single-leg Deadlift", "Hip Thrust", "Glute Bridge"],
      full:  ["Back Squat", "Hip Thrust", "Plank", "Dead Bug", "Standing Calf Raise"],
      upper: ["Bench Press", "Barbell Row", "Plank", "Dead Bug"],
      push:  ["Bench Press", "Overhead Press", "Dumbbell Bench Press", "Tricep Pushdown"],
      pull:  ["Barbell Row", "Face Pull", "Pull-up", "Lat Pulldown"],
    },
    swimming: {
      // Pull-dominant + shoulder stability + core anti-rotation
      legs:  ["Back Squat", "Romanian Deadlift", "Walking Lunges", "Standing Calf Raise"],
      lower: ["Back Squat", "Romanian Deadlift", "Walking Lunges", "Standing Calf Raise"],
      full:  ["Lat Pulldown", "Face Pull", "Pallof Press", "Back Squat", "Tricep Pushdown"],
      upper: ["Lat Pulldown", "Pull-up", "Face Pull", "Tricep Pushdown", "Pallof Press"],
      push:  ["Overhead Press", "Tricep Pushdown", "Push-up", "Dumbbell Bench Press"],
      pull:  ["Lat Pulldown", "Pull-up", "Face Pull", "Barbell Row", "Pallof Press"],
    },
    triathlon: {
      // Blend: cycling legs + swim pull + running core/single-leg
      legs:  ["Back Squat", "Romanian Deadlift", "Bulgarian Split Squat", "Hip Thrust", "Standing Calf Raise"],
      lower: ["Back Squat", "Single-leg Deadlift", "Bulgarian Split Squat", "Hip Thrust", "Standing Calf Raise"],
      full:  ["Back Squat", "Lat Pulldown", "Hip Thrust", "Pallof Press", "Dead Bug"],
      upper: ["Lat Pulldown", "Pull-up", "Face Pull", "Pallof Press", "Dead Bug"],
      push:  ["Overhead Press", "Push-up", "Dumbbell Bench Press", "Tricep Pushdown"],
      pull:  ["Lat Pulldown", "Pull-up", "Face Pull", "Barbell Row", "Pallof Press"],
    },
  };

  // Role-specific exercise overlays. Applied by _applyStrengthRoleToSession
  // before the generic rep/set rewrite so the athlete gets movements that
  // match the role intent:
  //   - injury_prevention: stability, glutes, band/bodyweight pulling, core
  //     anti-rotation. NEVER heavy bench/squat as the primary slot (§2.5.3).
  //   - minimal: pure bodyweight circuit (§2.5.3).
  const _INJURY_PREV_EXERCISES = {
    legs:  ["Glute Bridge", "Single-leg Deadlift", "Walking Lunges", "Standing Calf Raise", "Plank"],
    lower: ["Glute Bridge", "Single-leg Deadlift", "Walking Lunges", "Standing Calf Raise", "Plank"],
    full:  ["Glute Bridge", "Push-up", "Band Row", "Pallof Press", "Dead Bug"],
    upper: ["Push-up", "Band Row", "Face Pull", "Pallof Press", "Dead Bug"],
    // BUGFIX 04-27 §F1: Band Row and Face Pull are pull patterns; do not
    // surface them on push days. Push lifts here lean light/stability so
    // the role intent (avoid heavy compound stress) is preserved.
    push:  ["Push-up", "Overhead Press", "Tricep Pushdown", "Dumbbell Bench Press"],
    pull:  ["Band Row", "Face Pull", "Pallof Press", "Dead Bug"],
  };
  const _MINIMAL_EXERCISES = {
    legs:  ["Bodyweight Squat", "Walking Lunges", "Glute Bridge", "Plank"],
    lower: ["Bodyweight Squat", "Walking Lunges", "Glute Bridge", "Plank"],
    full:  ["Bodyweight Squat", "Push-up", "Inverted Row", "Plank"],
    upper: ["Push-up", "Inverted Row", "Pike Push-up", "Plank"],
    // BUGFIX 04-27 §F1: Plank is core, not a push/pull pattern. Replace
    // with bodyweight pattern-appropriate movements; Plank stays on full
    // and upper where mixing core is intentional.
    push:  ["Push-up", "Pike Push-up", "Dip", "Diamond Push-up"],
    pull:  ["Inverted Row", "Pull-up", "Chin-up"],
  };

  // Pick a single "sport bucket" for race_performance exercise overlay.
  // Triathlon wins if present; otherwise the first endurance sport selected.
  function _sportBucketForRacePerf(selectedSports) {
    const sports = Array.isArray(selectedSports) ? selectedSports : [];
    if (sports.includes("triathlon")) return "triathlon";
    const set = new Set(sports);
    const hasSwim = set.has("swim"), hasBike = set.has("bike"), hasRun = set.has("run");
    if (hasSwim && hasBike && hasRun) return "triathlon";
    if (hasRun) return "running";
    if (hasBike) return "cycling";
    if (hasSwim) return "swimming";
    return null;
  }

  // Derive the training phase from (weekNumber, totalWeeks) for race-
  // driven plans. Same breakpoints used by _renderPlanPreview's timeline
  // so the generator and the preview agree on which phase a given week
  // belongs to. Returns "base" | "build" | "peak" | "taper" | "race".
  function _phaseForWeek(weekNumber, totalWeeks) {
    if (!(totalWeeks > 1)) return "base";
    const frac = (weekNumber - 1) / (totalWeeks - 1);
    if (frac < 0.35) return "base";
    if (frac < 0.70) return "build";
    if (frac < 0.90) return "peak";
    if (frac < 0.98) return "taper";
    return "race";
  }

  // Apply the strength role to a generated session IN PLACE. Runs AFTER
  // the base session.exercises array has been built (by ExerciseDB,
  // slot template, or the hardcoded fallback). Adjusts session length,
  // exercise count, and sets/reps per the role's parameters.
  // For race_performance, also swaps exercise names to the sport-specific
  // §8.5 list when one is available for the session's focus.
  function _applyStrengthRoleToSession(session, focus, role, phaseKey, selectedSports) {
    if (!session || !role || !_STRENGTH_ROLE_PARAMS[role]) return;
    const p = _STRENGTH_ROLE_PARAMS[role];

    // Session length — role overrides the generic planDetails.sessionLength
    // because these sessions have a job (stability vs hypertrophy vs heavy
    // compound) and the right duration differs per job.
    session.duration = p.sessionLen;

    // Rep range: race_performance varies by phase; others are phase-agnostic.
    let primaryReps = p.primaryReps;
    let accessoryReps = p.accessoryReps;
    if (role === "race_performance") {
      if (phaseKey === "build") {
        primaryReps = p.buildPrimaryReps;
        accessoryReps = p.buildAccessoryReps;
      } else if (phaseKey === "peak" || phaseKey === "taper") {
        primaryReps = p.peakPrimaryReps;
        accessoryReps = p.peakAccessoryReps;
      }
    }

    // Pick the correct exercise overlay for this role + focus. Each role
    // has its own table (injury_prevention favors stability, minimal is
    // pure bodyweight, race_performance follows §8.5 by sport). If no
    // overlay matches, fall through and we just rewrite the existing
    // exercises' reps/sets below.
    let overlay = null;
    if (role === "injury_prevention" && focus) {
      overlay = _INJURY_PREV_EXERCISES[focus] || null;
    } else if (role === "minimal" && focus) {
      overlay = _MINIMAL_EXERCISES[focus] || null;
    } else if (role === "race_performance" && focus) {
      const bucket = _sportBucketForRacePerf(selectedSports);
      overlay = bucket && _SPORT_STRENGTH_EXERCISES[bucket] && _SPORT_STRENGTH_EXERCISES[bucket][focus];
    }
    if (overlay && overlay.length) {
      const _isBodyweightName = (n) => /plank|dead bug|pallof|glute bridge|push-up|pull-up|bodyweight|inverted row|pike|band|walking lunge|standing calf/i.test(n);
      session.exercises = overlay.map((name, idx) => ({
        name,
        sets: idx === 0 ? p.primarySets : p.accessorySets,
        reps: idx === 0 ? primaryReps : accessoryReps,
        weight: (p.biasBodyweight || _isBodyweightName(name))
          ? "Bodyweight"
          : (typeof _suggestWeightForExercise === "function"
              ? _suggestWeightForExercise(name, idx === 0 ? primaryReps : accessoryReps)
              : ""),
      }));
    }

    // Walk the exercises and rewrite sets/reps. Preserves names + weights
    // that earlier layers (ExerciseDB or hardcoded templates) picked. For
    // minimal role, also force weight to "Bodyweight" since the session
    // is meant to be a bodyweight circuit.
    if (Array.isArray(session.exercises) && session.exercises.length) {
      session.exercises = session.exercises.map((ex, idx) => {
        const isPrimary = idx === 0;
        const newReps = isPrimary ? primaryReps : accessoryReps;
        const newSets = isPrimary ? p.primarySets : p.accessorySets;
        const newWeight = role === "minimal"
          ? "Bodyweight"
          : ex.weight;
        return {
          ...ex,
          sets: newSets,
          reps: newReps,
          weight: newWeight,
        };
      });
      // Trim to role's exercise count (keep the primary compound first).
      if (session.exercises.length > p.exerciseCount) {
        session.exercises = session.exercises.slice(0, p.exerciseCount);
      }
    }

    // Stamp the role on the session so the calendar / editor can show it.
    session.strengthRole = role;
    session.load = p.loadLevel;
  }

  // Canonical strength exercise templates keyed by focus. These are
  // hand-picked baseline splits — not prescriptive per-set loads, just
  // movement patterns so the materialized session has SOMETHING to do.
  // Users can edit from the calendar card like any other scheduled
  // workout. Rep targets are intentionally conservative defaults.
  // Used as fallback when ExerciseDB isn't loaded or no slot can find
  // a matching exercise (see _fillSlotTemplate).
  const _STRENGTH_TEMPLATES = {
    push: [
      { name: "Barbell Bench Press",   sets: 4, reps: "6-8",  weight: "" },
      { name: "Overhead Press",        sets: 3, reps: "8-10", weight: "" },
      { name: "Incline Dumbbell Press",sets: 3, reps: "10",   weight: "" },
      { name: "Lateral Raise",         sets: 3, reps: "12",   weight: "" },
      { name: "Tricep Pushdown",       sets: 3, reps: "12",   weight: "" },
    ],
    pull: [
      { name: "Deadlift",              sets: 4, reps: "5",    weight: "" },
      { name: "Barbell Row",           sets: 4, reps: "8",    weight: "" },
      { name: "Pull-ups",              sets: 4, reps: "AMRAP",weight: "Bodyweight" },
      { name: "Face Pull",             sets: 3, reps: "15",   weight: "" },
      { name: "Barbell Curl",          sets: 3, reps: "10",   weight: "" },
    ],
    legs: [
      { name: "Back Squat",            sets: 4, reps: "5-8",  weight: "" },
      { name: "Romanian Deadlift",     sets: 3, reps: "8",    weight: "" },
      { name: "Leg Press",             sets: 3, reps: "10",   weight: "" },
      { name: "Walking Lunges",        sets: 3, reps: "12/leg", weight: "" },
      { name: "Standing Calf Raise",   sets: 4, reps: "15",   weight: "" },
    ],
    upper: [
      { name: "Bench Press",           sets: 4, reps: "6-8",  weight: "" },
      { name: "Barbell Row",           sets: 4, reps: "8",    weight: "" },
      { name: "Overhead Press",        sets: 3, reps: "8-10", weight: "" },
      { name: "Pull-ups",              sets: 3, reps: "AMRAP",weight: "Bodyweight" },
      { name: "Lateral Raise",         sets: 3, reps: "12",   weight: "" },
    ],
    lower: [
      { name: "Back Squat",            sets: 4, reps: "5-8",  weight: "" },
      { name: "Romanian Deadlift",     sets: 3, reps: "8",    weight: "" },
      { name: "Bulgarian Split Squat", sets: 3, reps: "10/leg", weight: "" },
      { name: "Leg Curl",              sets: 3, reps: "12",   weight: "" },
      { name: "Standing Calf Raise",   sets: 4, reps: "15",   weight: "" },
    ],
    full: [
      { name: "Back Squat",            sets: 3, reps: "6-8",  weight: "" },
      { name: "Bench Press",           sets: 3, reps: "6-8",  weight: "" },
      { name: "Barbell Row",           sets: 3, reps: "8",    weight: "" },
      { name: "Overhead Press",        sets: 3, reps: "8",    weight: "" },
      { name: "Plank",                 sets: 3, reps: "45s",  weight: "Bodyweight" },
    ],
  };

  // Build a single calendar session object in the shape other parts
  // of the app (calendar, day detail, planner) already expect. Takes
  // an enriched slot code (e.g. "run-interval", "strength-push") and
  // produces the matching rich session, including exercise templates
  // for strength variants so the card isn't empty on the calendar.
  function _buildSessionForSport(code, dateStr, sessionLen, weekNumber, planId, idx, phaseKey) {
    const base = {
      id: planId + "-" + idx,
      date: dateStr,
      weekNumber: weekNumber,
      planId: planId,
      duration: sessionLen,
      source: "onboarding_v2",
    };
    const map = {
      // Legacy bare sport buckets (kept for back-compat / defensive)
      "run":           { type: "running",      discipline: "run",  sessionName: "Easy Run",       load: "easy" },
      "bike":          { type: "cycling",      discipline: "bike", sessionName: "Easy Ride",      load: "easy" },
      "swim":          { type: "swimming",     discipline: "swim", sessionName: "Easy Swim",      load: "easy" },
      "strength":      { type: "weightlifting",discipline: "strength", sessionName: "Strength",   load: "moderate", _strengthFocus: "full" },
      // Enriched run variants
      "run-long":      { type: "running",      discipline: "run",  sessionName: "Long Run",       load: "long",    duration: Math.round(sessionLen * 1.5) },
      "run-interval":  { type: "running",      discipline: "run",  sessionName: "Interval Run",   load: "hard" },
      "run-tempo":     { type: "running",      discipline: "run",  sessionName: "Tempo Run",      load: "moderate" },
      "run-recovery":  { type: "running",      discipline: "run",  sessionName: "Recovery Run",   load: "easy",    duration: Math.max(20, Math.round(sessionLen * 0.7)) },
      "run-easy":      { type: "running",      discipline: "run",  sessionName: "Easy Run",       load: "easy" },
      // Enriched bike variants
      "bike-long":     { type: "cycling",      discipline: "bike", sessionName: "Long Ride",      load: "long",    duration: Math.round(sessionLen * 1.8) },
      "bike-interval": { type: "cycling",      discipline: "bike", sessionName: "Interval Ride",  load: "hard" },
      "bike-easy":     { type: "cycling",      discipline: "bike", sessionName: "Easy Ride",      load: "easy" },
      // Enriched swim variants
      "swim-css":      { type: "swimming",     discipline: "swim", sessionName: "CSS Swim",       load: "hard" },
      "swim-endurance":{ type: "swimming",     discipline: "swim", sessionName: "Endurance Swim", load: "moderate" },
      // Enriched strength variants
      "strength-push": { type: "weightlifting",discipline: "strength", sessionName: "Push Day",    load: "moderate", _strengthFocus: "push" },
      "strength-pull": { type: "weightlifting",discipline: "strength", sessionName: "Pull Day",    load: "moderate", _strengthFocus: "pull" },
      "strength-legs": { type: "weightlifting",discipline: "strength", sessionName: "Leg Day",     load: "moderate", _strengthFocus: "legs" },
      "strength-upper":{ type: "weightlifting",discipline: "strength", sessionName: "Upper Body",  load: "moderate", _strengthFocus: "upper" },
      "strength-lower":{ type: "weightlifting",discipline: "strength", sessionName: "Lower Body",  load: "moderate", _strengthFocus: "lower" },
      "strength-full": { type: "weightlifting",discipline: "strength", sessionName: "Full Body",   load: "moderate", _strengthFocus: "full" },
      "strength-custom":{type: "weightlifting",discipline: "strength", sessionName: "Strength",    load: "moderate", _strengthFocus: "full" },
      // Other disciplines
      "brick":         { type: "triathlon",    discipline: "brick", sessionName: "Brick (Bike → Run)", load: "moderate", duration: Math.round(sessionLen * 1.3) },
      "hiit":          { type: "hiit",         discipline: "hiit",  sessionName: "HIIT",      load: "hard", duration: Math.max(20, Math.round(sessionLen * 0.5)) },
      "yoga":          { type: "yoga",         discipline: "yoga",  sessionName: "Yoga",      load: "easy" },
      "mobility":      { type: "mobility",     discipline: "mobility", sessionName: "Mobility", load: "easy", duration: 20 },
      "walking":       { type: "walking",      discipline: "walk",  sessionName: "Walk",      load: "easy" },
      "rowing":        { type: "rowing",       discipline: "row",   sessionName: "Row",       load: "moderate" },
      "hyrox":         { type: "hiit",         discipline: "hyrox", sessionName: "Hyrox",     load: "hard" },
      "circuit":       { type: "hiit",         discipline: "circuit", sessionName: "Circuit", load: "hard" },
    };
    let spec = map[code];
    // strength-dayN (custom split) — synthesize a spec from the user's
    // per-day muscle selections. Name reflects the actual muscles,
    // exercises come from the per-muscle template lookup below.
    let customDayIdx = null;
    const dayMatch = /^strength-day(\d+)$/.exec(code);
    if (!spec && dayMatch) {
      customDayIdx = dayMatch[1];
      spec = {
        type: "weightlifting",
        discipline: "strength",
        sessionName: _enrichedLabel(code),
        load: "moderate",
        _strengthFocus: "custom",
      };
    }
    if (!spec) return null;
    const { _strengthFocus, ...cleanSpec } = spec;
    const session = Object.assign({}, base, cleanSpec);
    // Read user's equipment profile so the slot-template picks honor it.
    // Falls back to no filtering when the profile is empty or the helper
    // isn't loaded — full library, gym assumed.
    const _userEquip = (typeof window !== "undefined" && window.ExerciseDB && window.ExerciseDB.getUserEquipment)
      ? (window.ExerciseDB.getUserEquipment() || [])
      : [];
    if (customDayIdx && _state.strengthSetup && _state.strengthSetup.customMuscles) {
      const muscles = _state.strengthSetup.customMuscles[customDayIdx] || [];
      session.exercises = _strengthExercisesForMuscles(muscles, _userEquip);
    } else if (_strengthFocus) {
      // Try ExerciseDB-backed slot template first; fall back to the
      // hardcoded baseline if the DB isn't loaded or returns nothing.
      const fallback = (_STRENGTH_TEMPLATES[_strengthFocus] || []).map(ex => ({
        ...ex,
        // Only override empty weights — bodyweight entries already set "Bodyweight".
        weight: ex.weight || _suggestWeightForExercise(ex.name, ex.reps),
      }));
      session.exercises = _fillSlotTemplate(_strengthFocus, _userEquip) || fallback;
    }

    // Walking / rowing / yoga / mobility get a matching aiSession
    // interval structure so they render with an intensity strip and
    // duration badge — matches the "Walk — 45 min" card that the
    // Quick Add path produces. Without this the Build Plan walk
    // card was showing a bare "Walk / Walking" with no badge.
    if (session.type === "walking") {
      session.sessionName = `Walk — ${session.duration} min`;
      session.aiSession = {
        title: session.sessionName,
        intervals: [{
          name: "Walk",
          duration: session.duration + " min",
          effort: "Z1",
          details: "Brisk walk, comfortable and conversational — this is active recovery, not a run.",
        }],
      };
    }
    // Persist strengthFocus on the saved session so the calendar
    // equipment-restriction filter can look it up by field instead
    // of parsing the id. Legacy cards used a `weightlifting-<focus>`
    // id pattern; ob-v2 ids are planId-based, so without this the
    // focus would be null and the filter silently skipped.
    if (_strengthFocus) session.strengthFocus = _strengthFocus;

    // Phase 2 — apply the hybrid strength role (§2.5.3 / §7.6 / §8.5) to
    // any strength-family session. Role is set on the Goals screen for
    // hybrid athletes; null for standalone strength or standalone endurance.
    // When null, the session falls through with its default shape.
    if (session.type === "weightlifting" && _state.strengthRole) {
      _applyStrengthRoleToSession(
        session,
        _strengthFocus || "full",
        _state.strengthRole,
        phaseKey || "base",
        _state.selectedSports || []
      );
    }
    return session;
  }

  // Produce a 4-6 exercise list targeting the given muscle groups.
  // Used by _buildSessionForSport for strength-dayN (custom split)
  // sessions. Caps at 6 exercises so the session stays ~45-60 min.
  //
  // Phase 4: when ExerciseDB is loaded, query it for muscle-matched
  // exercises (respecting userEquip) with sub-target diversity. Falls
  // back to the hardcoded _EX_BY_MUSCLE lookup when the DB isn't
  // available or returns nothing — keeps strength sessions populated
  // even if exercise-data.js fails to load.
  function _strengthExercisesForMuscles(muscles, userEquip) {
    if (!Array.isArray(muscles) || muscles.length === 0) {
      return _fillSlotTemplate("full", userEquip || [])
        || _STRENGTH_TEMPLATES.full.map(ex => ({
          ...ex,
          weight: ex.weight || _suggestWeightForExercise(ex.name, ex.reps),
        }));
    }
    // ExerciseDB path — pick 1-2 exercises per muscle category, deduped
    // by name, capped at 6 total.
    const E = (typeof window !== "undefined" && window.ExerciseDB) || null;
    if (E) {
      const equip = (Array.isArray(userEquip) && userEquip.length) ? userEquip : null;
      const out = [];
      const seen = new Set();
      // Map onboarding muscle keys → muscleCategory tokens used in EXERCISE_DB
      const muscleMap = {
        chest: "chest", back: "back", shoulders: "shoulders",
        biceps: "biceps", triceps: "triceps",
        quads: "quads", hamstrings: "hamstrings", glutes: "glutes",
        calves: "calves", core: "core", fullbody: "full-body",
      };
      const recentIds = _recentlyDoneExerciseIds();
      for (const m of muscles) {
        const cat = muscleMap[m] || m;
        const filters = { muscle: cat };
        if (equip) filters.equipment = equip;
        if (recentIds.length) filters.excludeIds = recentIds;
        const picked = E.pick(filters, 2, { diverseFrom: out });
        for (const ex of picked) {
          if (seen.has(ex.name) || out.length >= 6) continue;
          seen.add(ex.name);
          // Heuristic sets/reps by tier so larger compounds get more sets.
          const sets = ex.tier === "primary" ? 4 : 3;
          const reps = ex.tier === "tertiary" ? "12-15" : ex.tier === "primary" ? "6-8" : "8-12";
          out.push({
            name: ex.name,
            sets,
            reps,
            weight: ex.usesWeights
              ? _suggestWeightForExercise(ex.name, reps)
              : "Bodyweight",
          });
        }
      }
      if (out.length) return out;
    }
    // Legacy fallback — hardcoded muscle → exercise lookup.
    const _EX_BY_MUSCLE = {
      chest:      [{ name: "Barbell Bench Press",      sets: 4, reps: "6-8",  weight: "" }, { name: "Incline Dumbbell Press", sets: 3, reps: "10", weight: "" }],
      back:       [{ name: "Barbell Row",              sets: 4, reps: "8",    weight: "" }, { name: "Lat Pulldown",           sets: 3, reps: "10-12", weight: "" }],
      shoulders:  [{ name: "Overhead Press",           sets: 4, reps: "6-8",  weight: "" }, { name: "Lateral Raise",          sets: 3, reps: "12-15", weight: "" }],
      biceps:     [{ name: "Barbell Curl",             sets: 3, reps: "10",   weight: "" }, { name: "Hammer Curl",            sets: 3, reps: "12", weight: "" }],
      triceps:    [{ name: "Close Grip Bench Press",   sets: 3, reps: "8-10", weight: "" }, { name: "Tricep Pushdown",        sets: 3, reps: "12", weight: "" }],
      quads:      [{ name: "Back Squat",               sets: 4, reps: "5-8",  weight: "" }, { name: "Leg Press",              sets: 3, reps: "10", weight: "" }],
      hamstrings: [{ name: "Romanian Deadlift",        sets: 4, reps: "8",    weight: "" }, { name: "Lying Leg Curl",         sets: 3, reps: "12", weight: "" }],
      glutes:     [{ name: "Hip Thrust",               sets: 4, reps: "10",   weight: "" }, { name: "Bulgarian Split Squat",  sets: 3, reps: "10/leg", weight: "" }],
      calves:     [{ name: "Standing Calf Raise",      sets: 4, reps: "15",   weight: "" }],
      core:       [{ name: "Plank",                    sets: 3, reps: "45s",  weight: "Bodyweight" }, { name: "Hanging Leg Raise", sets: 3, reps: "12", weight: "Bodyweight" }],
      fullbody:   [{ name: "Deadlift",                 sets: 4, reps: "5",    weight: "" }, { name: "Farmer's Carry",         sets: 3, reps: "40m", weight: "" }],
    };
    const out = [];
    const seen = new Set();
    muscles.forEach(m => {
      (_EX_BY_MUSCLE[m] || []).forEach(e => {
        if (seen.has(e.name) || out.length >= 6) return;
        seen.add(e.name);
        out.push({
          ...e,
          weight: e.weight || _suggestWeightForExercise(e.name, e.reps),
        });
      });
    });
    return out.length ? out : _STRENGTH_TEMPLATES.full.map(ex => ({
      ...ex,
      weight: ex.weight || _suggestWeightForExercise(ex.name, ex.reps),
    }));
  }
  function _mapRacesToLegacyEvents(races) {
    const typeMap = {
      sprint: "sprint", olympic: "olympic", halfIronman: "halfIronman", ironman: "ironman",
      "5k": "5k", "10k": "10k", halfMarathon: "halfMarathon", marathon: "marathon", ultra: "ultra",
      century: "century", granFondo: "granFondo", crit: "crit", stage: "stage",
      hyrox: "hyrox", custom: "other",
    };
    return (races || []).filter(r => r && r.date).map(r => ({
      id: "race-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
      name: r.name || r.type,
      type: typeMap[r.type] || r.type || "other",
      date: r.date,
      priority: r.priority || "A",
      level: "intermediate",
    }));
  }
  function _goToTrainingTab() {
    _closeBuildPlanOverlay();
    _closeOverlay();
    // Re-render training tab UI so newly generated plan shows up.
    try {
      if (typeof renderRaceEvents === "function") renderRaceEvents();
      if (typeof renderTrainingInputs === "function") renderTrainingInputs();
      if (typeof renderCalendar === "function") renderCalendar();
    } catch {}
    if (typeof showTab === "function") showTab("training");
  }
  // End-of-survey preferred destination — home tab shows the calendar
  // and day detail, which is what users actually want to see after
  // finishing Build Plan. _goToTrainingTab is still exported for any
  // legacy callers that explicitly want the Training tab.
  function _goToHomeTab() {
    _closeBuildPlanOverlay();
    _closeOverlay();
    try {
      if (typeof renderRaceEvents === "function") renderRaceEvents();
      if (typeof renderTrainingInputs === "function") renderTrainingInputs();
      if (typeof renderCalendar === "function") renderCalendar();
    } catch {}
    if (typeof showTab === "function") showTab("home");
    // Coach invite link Phase B — fire after the home tab renders so
    // the Accept modal opens cleanly on top of the calendar instead of
    // racing the bp overlay close transition. Safe no-op when there's
    // no pending invite.
    //
    // We pick this hook (and not _writeScheduleSessions exit) because
    // every onboarding completion path funnels through goTo("bp-v2-done")
    // → user taps "Go to Home" → _goToHomeTab(). Firing earlier would
    // interrupt the "You're Ready" celebration screen. The defensive
    // fallback for any path that skips this (app kill, crash) is the
    // auth.js post-init checkPendingInvite() call, which fires on the
    // NEXT sign-in. checkPendingInvite is idempotent so duplicate calls
    // are safe.
    if (typeof window.checkPendingInvite === "function") {
      try { window.checkPendingInvite(); } catch (e) { console.warn("OnboardingV2: checkPendingInvite error", e); }
    }
  }

  if (typeof window !== "undefined" && window.OnboardingV2) {
    Object.assign(window.OnboardingV2, {
      _bpBack,
      _toggleSport, _applySportSideEffects, _selectGym, _saveSportsAndContinue,
      _toggleGoal, _toggleStrengthRole, _addStrengthFromRecommendation, _saveGoalsAndContinue, _renderGoalCards,
      _updateRaceTypes, _updateWeeksCallout, _selectRaceGoal, _selectRacePriority, _applyRacePrioritySection, _applyRaceCategoryDefault, _selectLeadInPhase, _adjustLeadIn, _saveRaceAndContinue,
      _selectPlanOption, _setCustomDuration, _adjustDaysPerWeek, _setStartDate, _saveNoraceAndContinue,
      _renderThresholdSections, _toggleTestMe, _changeThresholdMethod, _saveThresholdsAndContinue, _testMeForEverythingAndContinue, _editThreshold,
      _adjustStrengthCount, _applyStrengthCountSideEffects, _selectSplit, _toggleMuscle,
      _renderCustomDayList, _toggleMuscleForDay,
      _selectStrLength, _selectStrDuration, _selectStrRefresh, _setCustomRefresh, _saveStrengthAndContinue,
      _shouldShowLongDays, _renderLongDayBlocks, _selectLongDay, _saveLongDaysAndContinue,
      _renderSchedule, _removeSlot, _removeSlotAt,
      _openAddSlotPicker, _pickAddSlot, _closeAddSlotPicker,
      _openSlotSubtypePicker, _pickSlotSubtype,
      _slotDragStart, _slotDragEnd, _slotDragOver, _slotDragLeave, _slotDrop,
      _saveScheduleAndContinue,
      _renderPlanPreview, _confirmAndSavePlan, _mapRacesToLegacyEvents, _goToTrainingTab, _goToHomeTab, _renderBRaceReview, _goToBRaceInCalendar,
    });
  }

})();
