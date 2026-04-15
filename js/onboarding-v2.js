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
    raceEvents: [],
    currentRace: { name: "", category: "triathlon", type: "ironman", date: "", goal: "finish", priority: "A", leadIn: null },
    leadInCount: 4,
    planDetails: { duration: "12", sessionLength: "60", daysPerWeek: "5" },
    thresholds: {},
    strengthSetup: { sessionsPerWeek: 3, split: "ppl", customMuscles: [], sessionLength: 45 },
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
      _state.selectedSports = Array.from(new Set([..._state.selectedSports, "run", "strength"]));
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
    try { zones = JSON.parse(localStorage.getItem("trainingZones") || "{}") || {}; }
    catch { zones = {}; }
    // Also read the user's last saved Build Plan thresholds — the
    // previous run may have captured inputs (e.g. a CSS Test's 400m/
    // 200m times) that don't have a simple trainingZones equivalent.
    // Those should come back pre-filled the next time Build Plan opens.
    try { prior = JSON.parse(localStorage.getItem("thresholds") || "{}") || {}; }
    catch { prior = {}; }
    const result = {};
    if (zones.running) {
      const tp = zones.running.thresholdPace || zones.running.threshold_pace;
      if (tp) result.run = { mode: "known", method: "pace", threshPace: String(tp) };
    }
    if (zones.biking && zones.biking.ftp) {
      result.bike = { mode: "known", method: "ftp", ftp: String(zones.biking.ftp) };
    }
    if (zones.swimming && (zones.swimming.css || zones.swimming.cssPace)) {
      const css = zones.swimming.cssPace || zones.swimming.css;
      result.swim = { mode: "known", method: "pace", cssPace: String(css) };
    }
    if (zones.strength) {
      const s = zones.strength;
      const out = { mode: "known" };
      if (s.squat && s.squat.weight)    out.squat = String(s.squat.weight);
      if (s.bench && s.bench.weight)    out.bench = String(s.bench.weight);
      if (s.deadlift && s.deadlift.weight) out.dead = String(s.deadlift.weight);
      if (out.squat || out.bench || out.dead) result.strength = out;
    }
    // Layer the prior Build Plan thresholds over the trainingZones-derived
    // defaults. The prior run wins because it captures method-specific
    // inputs (CSS Test times, 20-min bike test watts, race results) that
    // trainingZones only records in collapsed form.
    Object.keys(prior || {}).forEach(key => {
      const p = prior[key];
      if (!p || typeof p !== "object") return;
      // If the prior entry has any actual values beyond mode, prefer it.
      const hasValues = Object.keys(p).some(k => k !== "mode" && p[k] != null && p[k] !== "");
      if (hasValues) result[key] = { ...(result[key] || {}), ...p };
    });
    return result;
  }

  // Reset every Build Plan state field back to its default.
  // Profile/onboarding fields are left alone.
  function _resetBuildPlanState() {
    _state.selectedSports = [];
    _state.gymAccess = "full";
    _state.trainingGoals = [];
    _state.raceEvents = [];
    _state.currentRace = { name: "", category: "triathlon", type: "ironman", date: "", goal: "finish", priority: "A", leadIn: null };
    _state.leadInCount = 4;
    _state.planDetails = { duration: "12", sessionLength: "60", daysPerWeek: "5", startDate: _nextMondayISO() };
    _state.thresholds = {};
    _state.strengthSetup = { sessionsPerWeek: 3, split: "ppl", customMuscles: [], sessionLength: 45 };
    _state.longDays = { longRun: null, longRide: null };
    _state.schedule = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
    _state._editingPlanId = null;
  }

  // Default start = the Monday on or after today (ISO yyyy-mm-dd).
  function _nextMondayISO() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const dow = d.getDay();
    const daysToMon = (dow === 0 ? 1 : (8 - dow) % 7);
    d.setDate(d.getDate() + daysToMon);
    return d.toISOString().slice(0, 10);
  }

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
    const bday = document.getElementById("ob-v2-bday");
    if (bday && p.birthday) bday.value = p.birthday;
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

  // Goal catalog. Each entry lists which sport buckets it's relevant
  // to. Using "*" means "always show". Strength-specific goals only
  // appear when "strength" is selected; endurance goals when at least
  // one cardio sport is selected.
  const _GOAL_CATALOG = [
    { id: "race",      icon: "flag",     text: "Train for a Race",      buckets: ["endurance"] },
    { id: "speed",     icon: "zap",      text: "Get Faster",             buckets: ["endurance"] },
    { id: "endurance", icon: "activity", text: "Build Endurance",        buckets: ["endurance"] },
    { id: "stronger",  icon: "trophy",   text: "Get Stronger",           buckets: ["strength"] },
    { id: "bulk",      icon: "weights",  text: "Bulk",                   buckets: ["strength"] },
    { id: "cut",       icon: "flame",    text: "Cut",                    buckets: ["strength"] },
    { id: "weight",    icon: "flame",    text: "Lose Weight",            buckets: ["*"] },
    { id: "general",   icon: "target",   text: "General Fitness",        buckets: ["*"] },
  ];

  function _renderGoalCards() {
    const host = document.getElementById("bp-v2-goal-cards");
    if (!host) return;
    const sports = _state.selectedSports || [];
    const hasStrength = sports.includes("strength");
    const hasEndurance = sports.some(s => ["run", "bike", "swim", "hyrox", "rowing"].includes(s));
    const relevant = _GOAL_CATALOG.filter(g => {
      if (g.buckets.includes("*")) return true;
      if (g.buckets.includes("strength") && hasStrength) return true;
      if (g.buckets.includes("endurance") && hasEndurance) return true;
      return false;
    });
    host.innerHTML = relevant.map(g =>
      '<button type="button" class="ob-v2-goal-card" data-goal="' + g.id + '" onclick="OnboardingV2._toggleGoal(this)">' +
        '<span class="ob-v2-goal-icon" data-ob-icon="' + g.icon + '"></span>' +
        '<span class="ob-v2-goal-text">' + _escape(g.text) + '</span>' +
        '<span class="ob-v2-goal-check">&#10003;</span>' +
      '</button>'
    ).join("");
    _hydrateIcons(host);
    // Reapply any previously-selected goals (e.g. when user goes back)
    (_state.trainingGoals || []).forEach(id => {
      const el = host.querySelector('[data-goal="' + id + '"]');
      if (el) el.classList.add("is-selected");
    });
    // Contextual subtitle
    const sub = document.getElementById("bp-v2-goal-subtitle");
    if (sub) {
      if (hasStrength && !hasEndurance)      sub.textContent = "Select all that apply. These shape your strength volume and recovery.";
      else if (!hasStrength && hasEndurance) sub.textContent = "Select all that apply. These shape your cardio intensity and volume.";
      else                                    sub.textContent = "Select all that apply. These shape how your plan balances cardio and strength.";
    }
  }

  function _toggleGoal(btn) { if (btn) btn.classList.toggle("is-selected"); }
  function _saveGoalsAndContinue() {
    const goals = Array.from(document.querySelectorAll("#bp-v2-2 .is-selected"))
      .map(el => el.getAttribute("data-goal"));
    _state.trainingGoals = goals;
    _lsSet("trainingGoals", goals);
    if (goals.includes("race")) { goTo("bp-v2-3-race"); _applyRacePrioritySection(); return; }
    // Strength-only users skip the generic Plan Details screen — the
    // same fields (block length, session length, days per week) live
    // on bp-v2-6 Strength Setup to avoid asking twice.
    const sports = _state.selectedSports || [];
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
  function _updateWeeksCallout() {
    const date = document.getElementById("bp-v2-race-date")?.value;
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
    const diffDays = Math.max(0, Math.ceil((new Date(date) - new Date()) / 86400000));
    const weeks = Math.ceil(diffDays / 7);
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
    // and jump straight to the done screen.
    if (priority === "B") {
      try {
        _persistBRaceAndReshape(race);
      } catch (e) {
        console.warn("[OnboardingV2] B race short-circuit save failed", e);
      }
      goTo("bp-v2-done");
      return;
    }

    goTo("bp-v2-4");
    _renderThresholdSections();
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
  function _adjustDaysPerWeek(delta) {
    const cur = parseInt(_state.planDetails.daysPerWeek, 10) || 5;
    const next = Math.max(1, Math.min(7, cur + delta));
    _state.planDetails.daysPerWeek = String(next);
    const el = document.getElementById("bp-v2-days-count");
    if (el) el.textContent = String(next);
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
    if (sports.includes("strength")) sections.push(_strengthThresholdSection());
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
    });
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
  }

  function _toggleTestMe(btn) {
    if (!btn) return;
    const key = btn.getAttribute("data-threshold-key");
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
    const count = _state.strengthSetup.sessionsPerWeek;
    const rest = document.getElementById("bp-v2-strength-rest");
    if (rest) rest.style.display = count === 0 ? "none" : "";
    const rec = document.getElementById("bp-v2-split-rec");
    if (rec) {
      if (count <= 2) rec.textContent = "Full Body recommended for your frequency.";
      else if (count === 3) rec.textContent = "Push / Pull / Legs is the sweet spot for 3 days.";
      else rec.textContent = "PPL recommended. Upper / Lower also works for 4+ days.";
    }
    // Block-length + start-date section only appears when the user is
    // strength-only. Endurance / mixed users answer those questions on
    // bp-v2-3-norace instead, so showing them twice would be redundant.
    const blockSection = document.getElementById("bp-v2-strength-block-section");
    if (blockSection) {
      const sports = _state.selectedSports || [];
      const strengthOnly = sports.length > 0 && sports.every(s => s === "strength");
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
  }
  function _selectLongDay(btn, which) {
    if (!btn) return;
    const attr = which === "longRun" ? "data-longrun" : "data-longride";
    const group = btn.parentElement;
    if (!group) return;
    group.querySelectorAll('[' + attr + ']').forEach(el => el.classList.remove("is-selected"));
    btn.classList.add("is-selected");
    _state.longDays[which] = btn.getAttribute(attr);
  }
  function _saveLongDaysAndContinue() {
    goTo("bp-v2-5");
    _renderSchedule();
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
    // Seed whenever the schedule is entirely empty (first entry to bp-5)
    const allEmpty = _BP_DAYS.every(d => _state.schedule[d].length === 0);
    if (allEmpty) _seedSchedule();
    // Sync the start-date input with state, seeding the default if unset.
    const dateInput = document.getElementById("bp-v2-start-date");
    if (dateInput) {
      if (!_state.planDetails.startDate) _state.planDetails.startDate = _nextMondayISO();
      dateInput.value = _state.planDetails.startDate;
      // Cap min to today so users can't backdate
      const today = new Date(); today.setHours(0,0,0,0);
      dateInput.min = today.toISOString().slice(0, 10);
    }
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
    const endurance = sports.filter(s => ["run", "bike", "swim"].includes(s));
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
    // Distribute remaining endurance sports round-robin across remaining days
    if (endurance.length) {
      let idx = 0;
      _BP_DAYS.forEach(d => {
        if (_state.schedule[d].length) return;
        _state.schedule[d].push(endurance[idx % endurance.length]);
        idx++;
      });
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
        const candidates = _BP_DAYS.filter(d =>
          !_state.schedule[d].includes("swim") &&
          !_state.schedule[d].includes("rest") &&
          !isLongDay(d)
        );
        // Prefer candidates that only have a single session so we don't
        // cram swim on top of strength + something else.
        candidates.sort((a, b) => _state.schedule[a].length - _state.schedule[b].length);
        const target = candidates[0]
          || _BP_DAYS.filter(d => !_state.schedule[d].includes("swim") && !isLongDay(d))
               .sort((a, b) => _state.schedule[a].length - _state.schedule[b].length)[0];
        if (target) _state.schedule[target].push("swim");
      }
    }
    // Brick seed: triathletes / duathletes (bike + run both selected)
    // should get at least one brick session per week. Preference order:
    // the day with a standalone bike that isn't the long ride, so we
    // convert it to a brick. If none, stack a brick onto the lightest
    // non-long, non-rest day.
    if (sports.includes("bike") && sports.includes("run")) {
      const hasBrick = _BP_DAYS.some(d => _state.schedule[d].includes("brick"));
      if (!hasBrick) {
        const isLongDay = d => _state.schedule[d].includes("run-long") || _state.schedule[d].includes("bike-long");
        // Prefer a day that currently has a plain bike — upgrade it to a brick.
        let target = _BP_DAYS.find(d =>
          !isLongDay(d) && _state.schedule[d].length === 1 && _state.schedule[d][0] === "bike"
        );
        if (target) {
          _state.schedule[target] = ["brick"];
        } else {
          // Otherwise pick the lightest non-long, non-rest day and add brick there.
          const candidates = _BP_DAYS
            .filter(d => !isLongDay(d) && !_state.schedule[d].includes("rest"))
            .sort((a, b) => _state.schedule[a].length - _state.schedule[b].length);
          if (candidates[0]) _state.schedule[candidates[0]].push("brick");
        }
      }
    }

    // Place strength sessions up to the requested count.
    // Gated on strength actually being a selected sport — otherwise
    // the stale default sessionsPerWeek=3 from initial state leaks
    // through and seeds strength days for users who never picked it.
    // First pass: alternate days (Mon/Wed/Fri/Sun) to spread load.
    // Second pass: fill remaining days if the user asked for >4 days,
    // so a 5/6/7-day request actually lands the full count.
    if (strength > 0 && sports.includes("strength")) {
      let placed = 0;
      for (let i = 0; i < _BP_DAYS.length && placed < strength; i += 2) {
        const d = _BP_DAYS[i];
        if (_state.schedule[d].length < 2) {
          _state.schedule[d].push("strength");
          placed++;
        }
      }
      if (placed < strength) {
        for (let i = 1; i < _BP_DAYS.length && placed < strength; i += 2) {
          const d = _BP_DAYS[i];
          if (!_state.schedule[d].includes("strength") && _state.schedule[d].length < 2) {
            _state.schedule[d].push("strength");
            placed++;
          }
        }
      }
      // Last resort: stack onto any day that doesn't already have strength.
      if (placed < strength) {
        for (let i = 0; i < _BP_DAYS.length && placed < strength; i++) {
          const d = _BP_DAYS[i];
          if (!_state.schedule[d].includes("strength")) {
            _state.schedule[d].push("strength");
            placed++;
          }
        }
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
      // Carve rest days from the lightest non-long days.
      const isLongDay = d => _state.schedule[d].includes("run-long") || _state.schedule[d].includes("bike-long");
      const carveCandidates = _BP_DAYS
        .filter(d => !isRestDay(d) && !isLongDay(d))
        .sort((a, b) => _state.schedule[a].length - _state.schedule[b].length);
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
    _renderSchedule();
  }
  // Back-compat wrapper: delete first occurrence by sport name.
  function _removeSlot(day, sport) {
    const arr = _state.schedule[day] || [];
    const idx = arr.indexOf(sport);
    if (idx >= 0) { arr.splice(idx, 1); _renderSchedule(); }
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
    strength: [["strength-push","Push Day"], ["strength-pull","Pull Day"], ["strength-legs","Leg Day"], ["strength-upper","Upper Body"], ["strength-lower","Lower Body"], ["strength-full","Full Body"]],
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
    if (!Array.isArray(_state.schedule[day])) _state.schedule[day] = [];
    _state.schedule[day].push(sport);
    _closeAddSlotPicker();
    _renderSchedule();
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
    if (!Array.isArray(_state.schedule[targetDay])) _state.schedule[targetDay] = [];
    _state.schedule[targetDay].push(payload.sport);
    _renderSchedule();
  }
  function _saveScheduleAndContinue() {
    _lsSet("workoutSchedule", _state.schedule);
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

    // Strength rotation templates keyed by split type.
    const STRENGTH_ROTATION = {
      ppl:      ["push", "pull", "legs", "push", "pull", "legs", "push"],
      ul:       ["upper", "lower", "upper", "lower", "upper", "lower", "upper"],
      fullBody: ["full", "full", "full", "full", "full", "full", "full"],
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
          if (isLong) out.push("run-long");
          else if (runTotal >= 3 && runIdx === runTotal - 1) out.push("run-recovery");
          else if (runIdx === 0)                              out.push("run-interval");
          else                                                out.push("run-easy");
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
  function _enrichedLabel(code) {
    const map = {
      "run-long":     "Long Run",
      "run-interval": "Interval Run",
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

  function _renderPlanPreview() {
    const body = document.getElementById("bp-v2-preview-body");
    if (!body) return;
    const race = _state.currentRace;
    const hasRace = _state.trainingGoals.includes("race") && race && race.date;
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
      // Base 0-35%, Build 35-70%, Peak 70-90%, Taper 90-100%.
      currentPhaseLabel = markerPct < 35 ? "Base" : markerPct < 70 ? "Build" : markerPct < 90 ? "Peak" : "Taper";
    }
    const markerHtml =
      '<div class="ob-v2-timeline-marker" style="left:' + markerPct.toFixed(1) + '%">' +
        '<div class="ob-v2-timeline-marker-dot"></div>' +
        '<div class="ob-v2-timeline-marker-label">You are here · ' + _escape(currentPhaseLabel) + '</div>' +
      '</div>';

    const timelineHtml = hasRace
      ? '<div class="ob-v2-timeline-labels"><span>Base</span><span>Build</span><span>Peak</span><span>Taper</span><span>Race</span></div>' +
        '<div class="ob-v2-timeline-bar">' +
          '<span class="ob-v2-timeline-seg ob-v2-timeline-base"></span><span class="ob-v2-timeline-seg ob-v2-timeline-build"></span><span class="ob-v2-timeline-seg ob-v2-timeline-peak"></span><span class="ob-v2-timeline-seg ob-v2-timeline-taper"></span><span class="ob-v2-timeline-seg ob-v2-timeline-race"></span>' +
          markerHtml +
        '</div>'
      : '<div class="ob-v2-timeline-labels"><span>Week 1</span><span>Week 2</span><span>Week 3</span><span>Week 4</span></div>' +
        '<div class="ob-v2-timeline-bar">' +
          '<span class="ob-v2-timeline-seg ob-v2-timeline-base"></span><span class="ob-v2-timeline-seg ob-v2-timeline-build"></span><span class="ob-v2-timeline-seg ob-v2-timeline-peak"></span><span class="ob-v2-timeline-seg ob-v2-timeline-taper"></span>' +
          markerHtml +
        '</div>';
    const enriched = _enrichWeekTemplate();
    const weekHtml = _BP_DAYS.map(d => {
      const slots = enriched[d] || [];
      const mini = slots.length
        ? slots.map(s => {
            const bucket = _sportBucketFromEnriched(s);
            return '<div class="ob-v2-mini-wk ob-v2-mini-' + bucket.replace(/[^a-z0-9]/gi, "") + '">' +
              _escape(_enrichedLabel(s)) + '</div>';
          }).join("")
        : '<div class="ob-v2-mini-wk ob-v2-mini-rest">Rest</div>';
      return '<div class="ob-v2-week-day-row"><div class="ob-v2-week-day-label">' + _BP_DAY_LABELS[d] + '</div><div class="ob-v2-week-day-workouts">' + mini + '</div></div>';
    }).join("");
    // Only show the phase timeline when there's an actual race driving
    // the Base/Build/Peak/Taper arc. Strength-only users and no-race
    // endurance users just see the week preview — phases don't apply.
    const showTimeline = hasRace && !strengthOnly;
    body.innerHTML =
      (showTimeline ? '<div class="ob-v2-preview-timeline">' + timelineHtml + '</div>' : "") +
      '<div class="ob-v2-section-label">Plan Week 1</div>' +
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
    _lsSet("selectedSports", _state.selectedSports);
    _lsSet("trainingGoals", _state.trainingGoals);
    _lsSet("raceEvents", _state.raceEvents);
    _lsSet("thresholds", _state.thresholds);
    _lsSet("strengthSetup", _state.strengthSetup);
    // Template (weekly pattern) lives in its own key; do NOT write to workoutSchedule here.
    _lsSet("buildPlanTemplate", _state.schedule);

    // Map onboarding raceEvents into the legacy events shape so the
    // calendar / renderRaceEvents keep working unchanged.
    const legacyEvents = _mapRacesToLegacyEvents(_state.raceEvents);
    if (legacyEvents.length) {
      const existing = _lsGet("events", []) || [];
      _lsSet("events", existing.concat(legacyEvents));
    }

    // Materialize dated sessions from the weekly template.
    try {
      _writeScheduleSessions();
    } catch (e) {
      console.warn("[OnboardingV2] writing schedule sessions failed", e);
    }

    _lsSet("surveyComplete", "1");
    if (_state.mode === "onboarding") _lsSet("hasOnboarded", "1");
    goTo("bp-v2-done");
  }

  // Expand the weekly `_state.schedule` template into real sessions on
  // the user's calendar for the next N weeks (planDetails.duration).
  // Appends to the existing `workoutSchedule` array without touching
  // past entries.
  function _writeScheduleSessions() {
    // "indefinite" → materialize 12 weeks as a rolling window; numeric
    // strings like "11" or "12" parse cleanly; "custom" falls back to
    // customWeeks (set by the custom-weeks input).
    let weeks = 12;
    const dur = _state.planDetails.duration;
    if (dur === "indefinite") weeks = 12;
    else if (dur === "custom") weeks = Math.max(1, Math.min(52, parseInt(_state.planDetails.customWeeks, 10) || 12));
    else weeks = Math.max(1, parseInt(dur, 10) || 12);
    const sessionLen = Math.max(15, parseInt(_state.planDetails.sessionLength, 10) || 60);
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

    const sessions = [];
    let counter = 0;
    for (let w = 0; w < weeks; w++) {
      _BP_DAYS.forEach((day, idx) => {
        const slots = (enrichedTemplate[day] || []).filter(s => s && s !== "rest");
        slots.forEach(enrichedCode => {
          const d = new Date(start);
          d.setDate(start.getDate() + w * 7 + idx);
          const dateStr = d.toISOString().slice(0, 10);
          const session = _buildSessionForSport(enrichedCode, dateStr, sessionLen, w + 1, planId, counter++);
          if (session) sessions.push(session);
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

    const merged = existingArr.concat(sessions);
    localStorage.setItem("workoutSchedule", JSON.stringify(merged));
    if (typeof DB !== "undefined" && DB.syncKey) DB.syncKey("workoutSchedule");
  }

  // Canonical strength exercise templates keyed by focus. These are
  // hand-picked baseline splits — not prescriptive per-set loads, just
  // movement patterns so the materialized session has SOMETHING to do.
  // Users can edit from the calendar card like any other scheduled
  // workout. Rep targets are intentionally conservative defaults.
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
  function _buildSessionForSport(code, dateStr, sessionLen, weekNumber, planId, idx) {
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
    if (customDayIdx && _state.strengthSetup && _state.strengthSetup.customMuscles) {
      const muscles = _state.strengthSetup.customMuscles[customDayIdx] || [];
      session.exercises = _strengthExercisesForMuscles(muscles);
    } else if (_strengthFocus && _STRENGTH_TEMPLATES[_strengthFocus]) {
      session.exercises = _STRENGTH_TEMPLATES[_strengthFocus].map(ex => ({ ...ex }));
    }
    return session;
  }

  // Produce a 4-6 exercise list targeting the given muscle groups.
  // Used by _buildSessionForSport for strength-dayN (custom split)
  // sessions. Caps at 6 exercises so the session stays ~45-60 min.
  function _strengthExercisesForMuscles(muscles) {
    if (!Array.isArray(muscles) || muscles.length === 0) {
      return _STRENGTH_TEMPLATES.full.map(ex => ({ ...ex }));
    }
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
        out.push({ ...e });
      });
    });
    return out.length ? out : _STRENGTH_TEMPLATES.full.map(ex => ({ ...ex }));
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
  }

  if (typeof window !== "undefined" && window.OnboardingV2) {
    Object.assign(window.OnboardingV2, {
      _bpBack,
      _toggleSport, _applySportSideEffects, _selectGym, _saveSportsAndContinue,
      _toggleGoal, _saveGoalsAndContinue, _renderGoalCards,
      _updateRaceTypes, _updateWeeksCallout, _selectRaceGoal, _selectRacePriority, _applyRacePrioritySection, _selectLeadInPhase, _adjustLeadIn, _saveRaceAndContinue,
      _selectPlanOption, _setCustomDuration, _adjustDaysPerWeek, _setStartDate, _saveNoraceAndContinue,
      _renderThresholdSections, _toggleTestMe, _changeThresholdMethod, _saveThresholdsAndContinue, _testMeForEverythingAndContinue,
      _adjustStrengthCount, _applyStrengthCountSideEffects, _selectSplit, _toggleMuscle,
      _renderCustomDayList, _toggleMuscleForDay,
      _selectStrLength, _selectStrDuration, _saveStrengthAndContinue,
      _shouldShowLongDays, _renderLongDayBlocks, _selectLongDay, _saveLongDaysAndContinue,
      _renderSchedule, _removeSlot, _removeSlotAt,
      _openAddSlotPicker, _pickAddSlot, _closeAddSlotPicker,
      _openSlotSubtypePicker, _pickSlotSubtype,
      _slotDragStart, _slotDragEnd, _slotDragOver, _slotDragLeave, _slotDrop,
      _saveScheduleAndContinue,
      _renderPlanPreview, _confirmAndSavePlan, _mapRacesToLegacyEvents, _goToTrainingTab, _goToHomeTab,
    });
  }

})();
