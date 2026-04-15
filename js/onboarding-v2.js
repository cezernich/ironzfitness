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
    longDays: { longRun: "sun", longRide: "sat" },
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

  function goTo(screenId) {
    const root = document.getElementById("ob-v2-root");
    if (!root) return;
    root.querySelectorAll(".ob-v2-screen").forEach(s => s.classList.remove("is-active"));
    const target = document.getElementById(screenId);
    if (!target) {
      console.warn("[OnboardingV2] goTo: unknown screen", screenId);
      return;
    }
    target.classList.add("is-active");
    _state.currentScreen = screenId;
    _updateProgress(screenId);
    _hydrateIcons(target);
    // Scroll the container to top so long screens start at the top
    const container = root.querySelector(".ob-v2-screen-container");
    if (container) container.scrollTop = 0;
  }

  function _updateProgress(screenId) {
    const meta = _progressBySreen[screenId];
    if (!meta) return;
    const fill = document.getElementById("ob-v2-progress-fill");
    const label = document.getElementById("ob-v2-progress-label");
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

  // Standalone Build Plan entry point — pre-fills from stored state
  // and enters at bp-v2-1 skipping the ob-* screens.
  function openBuildPlan() {
    _openOverlay();
    _state.mode = "buildplan";
    _prefillFromStoredBuildPlan();
    goTo("bp-v2-1");
    _rehydrateBuildPlanScreens();
  }

  function _prefillFromStoredBuildPlan() {
    const sports = _lsGet("selectedSports", null);
    if (Array.isArray(sports)) _state.selectedSports = sports;
    const goals = _lsGet("trainingGoals", null);
    if (Array.isArray(goals)) _state.trainingGoals = goals;
    const races = _lsGet("raceEvents", null);
    if (Array.isArray(races)) _state.raceEvents = races;
    const thresholds = _lsGet("thresholds", null);
    if (thresholds && typeof thresholds === "object") _state.thresholds = thresholds;
    const strengthSetup = _lsGet("strengthSetup", null);
    if (strengthSetup && typeof strengthSetup === "object") _state.strengthSetup = { ..._state.strengthSetup, ...strengthSetup };
    const schedule = _lsGet("workoutSchedule", null);
    if (schedule && typeof schedule === "object") _state.schedule = { ..._state.schedule, ...schedule };
  }

  function _rehydrateBuildPlanScreens() {
    document.querySelectorAll("#bp-v2-sport-grid [data-sport]").forEach(el => {
      el.classList.toggle("is-selected", _state.selectedSports.includes(el.getAttribute("data-sport")));
    });
    if (typeof _applySportSideEffects === "function") _applySportSideEffects();
    document.querySelectorAll("#bp-v2-2 [data-goal]").forEach(el => {
      el.classList.toggle("is-selected", _state.trainingGoals.includes(el.getAttribute("data-goal")));
    });
    const strCount = document.getElementById("bp-v2-strength-count");
    if (strCount) strCount.textContent = String(_state.strengthSetup.sessionsPerWeek);
    if (typeof _applyStrengthCountSideEffects === "function") _applyStrengthCountSideEffects();
  }

  function _openOverlay() {
    const root = document.getElementById("ob-v2-root");
    if (!root) {
      console.warn("[OnboardingV2] #ob-v2-root missing from DOM");
      return;
    }
    root.classList.add("is-active");
    root.setAttribute("aria-hidden", "false");
    document.body.classList.add("ob-v2-lock");
  }

  function _closeOverlay() {
    const root = document.getElementById("ob-v2-root");
    if (!root) return;
    root.classList.remove("is-active");
    root.setAttribute("aria-hidden", "true");
    document.body.classList.remove("ob-v2-lock");
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
        _finishOnboarding(true);
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

  // Final completion handler. Sets hasOnboarded=1, closes the overlay,
  // and routes the user to their next destination:
  //   - buildPlan=true → legacy openSurvey() (Phase 3 replaces with bp-1)
  //   - buildPlan=false → the requested manual starting surface
  function _finishOnboarding(buildPlan, manualTarget) {
    _lsSet("hasOnboarded", "1");
    // Kick the home/training tab render so any profile-dependent UI
    // (greeting, stats) picks up the new data.
    try {
      if (typeof loadProfileIntoForm === "function") loadProfileIntoForm();
      if (typeof updateNavInitials === "function") updateNavInitials();
      if (typeof renderGreeting === "function") renderGreeting();
    } catch {}

    _closeOverlay();

    if (buildPlan) {
      // TEMP Phase 2 bridge: reuse the legacy Build Plan survey
      // (openSurvey in js/onboarding-legacy.js). Phase 3 replaces
      // this with the new bp-* flow.
      if (typeof openSurvey === "function") {
        setTimeout(openSurvey, 300);
      } else {
        console.warn("[OnboardingV2] openSurvey() not found — legacy onboarding may not be loaded");
      }
      return;
    }

    // Manual path — route to the requested surface, default to home.
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
      if (_state.mode === "buildplan") { _closeOverlay(); return; }
      goTo("ob-v2-6");
      return;
    }
    if (currentScreen === "bp-v2-4") {
      goTo(_state.trainingGoals.includes("race") ? "bp-v2-3-race" : "bp-v2-3-norace");
      return;
    }
    if (currentScreen === "bp-v2-5") {
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
    goTo("bp-v2-2");
  }

  function _toggleGoal(btn) { if (btn) btn.classList.toggle("is-selected"); }
  function _saveGoalsAndContinue() {
    const goals = Array.from(document.querySelectorAll("#bp-v2-2 .is-selected"))
      .map(el => el.getAttribute("data-goal"));
    _state.trainingGoals = goals;
    _lsSet("trainingGoals", goals);
    goTo(goals.includes("race") ? "bp-v2-3-race" : "bp-v2-3-norace");
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
    if (!date) {
      text.textContent = "Pick a race date to see your timeline.";
      const gap = document.getElementById("bp-v2-gap-fill-section");
      if (gap) gap.style.display = "none";
      return;
    }
    const diffDays = Math.max(0, Math.ceil((new Date(date) - new Date()) / 86400000));
    const weeks = Math.ceil(diffDays / 7);
    const raceType = document.getElementById("bp-v2-race-type")?.value || "ironman";
    const planMax = _planWeeksForType(raceType);
    text.textContent = weeks + " weeks until your race. Recommended plan length: " + planMax[0] + "-" + planMax[1] + " weeks.";
    const gap = document.getElementById("bp-v2-gap-fill-section");
    if (gap) gap.style.display = weeks > planMax[1] ? "" : "none";
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
  function _saveRaceAndContinue() {
    const name = document.getElementById("bp-v2-race-name")?.value.trim() || "";
    const category = document.getElementById("bp-v2-race-category")?.value || "triathlon";
    const type = document.getElementById("bp-v2-race-type")?.value || "ironman";
    const date = document.getElementById("bp-v2-race-date")?.value || "";
    const goal = document.querySelector("#bp-v2-3-race [data-race-goal].is-selected")?.getAttribute("data-race-goal") || "finish";
    const leadInPhase = document.querySelector("#bp-v2-gap-fill-section [data-leadin-phase].is-selected")?.getAttribute("data-leadin-phase") || null;
    const gapVisible = document.getElementById("bp-v2-gap-fill-section")?.style.display !== "none";
    const leadIn = gapVisible && leadInPhase ? { phase: leadInPhase, daysPerWeek: _state.leadInCount } : null;
    const race = { name: name || type, category, type, date, priority: "A", goal, leadIn };
    _state.currentRace = race;
    _state.raceEvents = [race];
    _lsSet("raceEvents", _state.raceEvents);
    goTo("bp-v2-4");
    _renderThresholdSections();
  }

  function _selectPlanOption(btn, field) {
    if (!btn) return;
    const group = btn.parentElement;
    if (!group) return;
    group.querySelectorAll(".ob-v2-chip").forEach(el => el.classList.remove("is-selected"));
    btn.classList.add("is-selected");
    const val = btn.getAttribute("data-duration") || btn.getAttribute("data-session-length") || btn.getAttribute("data-days");
    _state.planDetails[field] = val;
  }
  function _saveNoraceAndContinue() {
    _state.raceEvents = [];
    _lsSet("raceEvents", []);
    goTo("bp-v2-4");
    _renderThresholdSections();
  }

  function _renderThresholdSections() {
    const container = document.getElementById("bp-v2-thresholds-container");
    if (!container) return;
    const sports = _state.selectedSports || [];
    const sections = [];
    if (sports.includes("swim"))     sections.push(_thresholdSection("swim", "Swimming", "swim", [{ id: "swim-css", label: "CSS pace (seconds per 100m)", placeholder: "85" }]));
    if (sports.includes("bike"))     sections.push(_thresholdSection("bike", "Cycling", "bike", [{ id: "bike-ftp", label: "FTP (watts)", placeholder: "250" }]));
    if (sports.includes("run"))      sections.push(_thresholdSection("run", "Running", "run", [{ id: "run-pace", label: "Threshold pace (min/mile, e.g. 7:30)", placeholder: "7:30" }]));
    if (sports.includes("strength")) sections.push(_thresholdSection("strength", "Strength", "weights", [
      { id: "str-squat", label: "Squat 1RM (lbs)", placeholder: "225" },
      { id: "str-bench", label: "Bench Press 1RM (lbs)", placeholder: "185" },
      { id: "str-dead",  label: "Deadlift 1RM (lbs)", placeholder: "315" },
    ]));
    if (sports.includes("hyrox"))    sections.push(_thresholdSection("hyrox", "Hyrox", "trophy", [{ id: "hyrox-time", label: "Recent Hyrox finish time (minutes)", placeholder: "75" }]));
    container.innerHTML = sections.join("");
    _hydrateIcons(container);
  }
  function _thresholdSection(key, label, iconKey, fields) {
    const inputsHtml = fields.map(f =>
      '<div class="ob-v2-form-group">' +
        '<label for="bp-v2-' + f.id + '">' + _escape(f.label) + '</label>' +
        '<input type="text" id="bp-v2-' + f.id + '" placeholder="' + _escape(f.placeholder) + '" data-threshold-field="' + key + '" data-threshold-input="' + f.id + '" />' +
      '</div>'
    ).join("");
    return '<div class="ob-v2-threshold-section" data-threshold="' + key + '">' +
      '<div class="ob-v2-threshold-header">' +
        '<span class="ob-v2-threshold-icon" data-ob-icon="' + iconKey + '"></span>' +
        '<span class="ob-v2-threshold-name">' + _escape(label) + '</span>' +
        '<button type="button" class="ob-v2-test-me" data-threshold-key="' + key + '" onclick="OnboardingV2._toggleTestMe(this)">Test me</button>' +
      '</div>' +
      '<div class="ob-v2-threshold-inputs" data-threshold-inputs="' + key + '">' + inputsHtml + '</div>' +
    '</div>';
  }
  function _toggleTestMe(btn) {
    if (!btn) return;
    const key = btn.getAttribute("data-threshold-key");
    const isOn = btn.classList.toggle("is-active");
    const inputs = document.querySelector('[data-threshold-inputs="' + key + '"]');
    if (inputs) inputs.style.display = isOn ? "none" : "";
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
      result[key] = Object.keys(vals).length ? Object.assign({ mode: "known" }, vals) : { mode: "test" };
    });
    _state.thresholds = result;
    _lsSet("thresholds", result);
    if (!_state.selectedSports.includes("strength")) {
      if (_shouldShowLongDays()) { goTo("bp-v2-4b"); _renderLongDayBlocks(); }
      else { goTo("bp-v2-5"); _renderSchedule(); }
      return;
    }
    goTo("bp-v2-6");
    _applyStrengthCountSideEffects();
  }
  function _testMeForEverythingAndContinue() {
    document.querySelectorAll("#bp-v2-thresholds-container .ob-v2-test-me").forEach(btn => {
      if (!btn.classList.contains("is-active")) btn.click();
    });
    _saveThresholdsAndContinue();
  }

  function _adjustStrengthCount(delta) {
    const cur = _state.strengthSetup.sessionsPerWeek;
    const next = Math.max(0, Math.min(6, cur + delta));
    _state.strengthSetup.sessionsPerWeek = next;
    const el = document.getElementById("bp-v2-strength-count");
    if (el) el.textContent = String(next);
    _applyStrengthCountSideEffects();
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
  }
  function _selectSplit(btn) {
    if (!btn) return;
    document.querySelectorAll("#bp-v2-split-chips .ob-v2-chip").forEach(el => el.classList.remove("is-selected"));
    btn.classList.add("is-selected");
    _state.strengthSetup.split = btn.getAttribute("data-split");
    const customBlock = document.getElementById("bp-v2-custom-muscles");
    if (customBlock) customBlock.style.display = _state.strengthSetup.split === "custom" ? "" : "none";
  }
  function _toggleMuscle(btn) { if (btn) btn.classList.toggle("is-selected"); }
  function _selectStrLength(btn) {
    if (!btn) return;
    const group = btn.parentElement;
    if (!group) return;
    group.querySelectorAll(".ob-v2-chip").forEach(el => el.classList.remove("is-selected"));
    btn.classList.add("is-selected");
    _state.strengthSetup.sessionLength = parseInt(btn.getAttribute("data-str-length"), 10) || 45;
  }
  function _saveStrengthAndContinue() {
    const customMuscles = Array.from(document.querySelectorAll("#bp-v2-custom-muscles .ob-v2-chip.is-selected"))
      .map(el => el.getAttribute("data-muscle"));
    _state.strengthSetup.customMuscles = customMuscles;
    _lsSet("strengthSetup", _state.strengthSetup);
    if (_shouldShowLongDays()) { goTo("bp-v2-4b"); _renderLongDayBlocks(); }
    else { goTo("bp-v2-5"); _renderSchedule(); }
  }

  function _shouldShowLongDays() {
    const sports = _state.selectedSports;
    if (!sports.includes("run") && !sports.includes("bike")) return false;
    const race = _state.currentRace;
    const longTypes = ["halfIronman", "ironman", "marathon", "halfMarathon", "ultra", "century", "granFondo"];
    return !!race && longTypes.includes(race.type);
  }
  function _renderLongDayBlocks() {
    const run = document.getElementById("bp-v2-longrun-block");
    const ride = document.getElementById("bp-v2-longride-block");
    const sports = _state.selectedSports;
    if (run)  run.style.display  = sports.includes("run")  ? "" : "none";
    if (ride) ride.style.display = sports.includes("bike") ? "" : "none";
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
    if (_BP_DAYS.every(d => !_state.schedule[d] || _state.schedule[d].length === 0)) _seedSchedule();
    grid.innerHTML = _BP_DAYS.map(day => {
      const slots = _state.schedule[day] || [];
      const chipsHtml = slots.map(s =>
        '<span class="ob-v2-slot-chip ob-v2-slot-' + s.replace(/[^a-z0-9]/gi, "") + '">' + _escape(_prettySport(s)) +
        '<button type="button" class="ob-v2-slot-remove" onclick="OnboardingV2._removeSlot(\'' + day + '\',\'' + s + '\')">&times;</button>' +
        '</span>'
      ).join("");
      return '<div class="ob-v2-schedule-day"><div class="ob-v2-day-name">' + _BP_DAY_LABELS[day] + '</div><div class="ob-v2-day-slots">' +
        chipsHtml +
        '<button type="button" class="ob-v2-add-slot" onclick="OnboardingV2._promptAddSlot(\'' + day + '\')">+</button>' +
        '</div></div>';
    }).join("");
    _renderScheduleSummary();
  }
  function _seedSchedule() {
    const sports = _state.selectedSports;
    const strength = _state.strengthSetup.sessionsPerWeek || 0;
    const pattern = [];
    if (sports.includes("run"))  pattern.push("run");
    if (sports.includes("bike")) pattern.push("bike");
    if (sports.includes("swim")) pattern.push("swim");
    let strLeft = strength;
    _BP_DAYS.forEach((d, i) => {
      _state.schedule[d] = [];
      if (sports.includes("run") && _state.longDays.longRun === d) _state.schedule[d].push("run-long");
      else if (sports.includes("bike") && _state.longDays.longRide === d) _state.schedule[d].push("bike-long");
      else if (pattern.length) _state.schedule[d].push(pattern[i % pattern.length]);
      if (strLeft > 0 && i % 2 === 0 && _state.schedule[d].length < 2) {
        _state.schedule[d].push("strength");
        strLeft--;
      }
    });
    if (!Object.values(_state.schedule).some(arr => arr.includes("rest"))) {
      const empty = _BP_DAYS.find(d => _state.schedule[d].length === 0);
      if (empty) _state.schedule[empty] = ["rest"];
    }
  }
  function _prettySport(s) {
    const map = {
      swim: "Swim", bike: "Bike", run: "Run", "run-long": "Long Run", "bike-long": "Long Ride",
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
  function _removeSlot(day, sport) {
    _state.schedule[day] = (_state.schedule[day] || []).filter(s => s !== sport);
    _renderSchedule();
  }
  function _promptAddSlot(day) {
    const sports = _state.selectedSports.concat(["strength", "rest"]);
    const unique = Array.from(new Set(sports));
    const lines = unique.map((s, i) => (i + 1) + ". " + _prettySport(s)).join("\n");
    const choice = window.prompt("Add to " + _BP_DAY_LABELS[day] + ":\n" + lines + "\n\nEnter number or sport name:");
    if (!choice) return;
    const idx = parseInt(choice, 10);
    let picked = null;
    if (!isNaN(idx) && unique[idx - 1]) picked = unique[idx - 1];
    else picked = unique.find(s => s.toLowerCase() === choice.toLowerCase() || _prettySport(s).toLowerCase() === choice.toLowerCase());
    if (!picked) return;
    _state.schedule[day] = _state.schedule[day] || [];
    _state.schedule[day].push(picked);
    _renderSchedule();
  }
  function _saveScheduleAndContinue() {
    _lsSet("workoutSchedule", _state.schedule);
    goTo("bp-v2-7");
    _renderPlanPreview();
  }

  function _renderPlanPreview() {
    const body = document.getElementById("bp-v2-preview-body");
    if (!body) return;
    const race = _state.currentRace;
    const hasRace = _state.trainingGoals.includes("race") && race && race.date;
    const timelineHtml = hasRace
      ? '<div class="ob-v2-timeline-labels"><span>Base</span><span>Build</span><span>Peak</span><span>Taper</span><span>Race</span></div>' +
        '<div class="ob-v2-timeline-bar"><span class="ob-v2-timeline-seg ob-v2-timeline-base"></span><span class="ob-v2-timeline-seg ob-v2-timeline-build"></span><span class="ob-v2-timeline-seg ob-v2-timeline-peak"></span><span class="ob-v2-timeline-seg ob-v2-timeline-taper"></span><span class="ob-v2-timeline-seg ob-v2-timeline-race"></span></div>'
      : '<div class="ob-v2-timeline-labels"><span>Week 1</span><span>Week 2</span><span>Week 3</span><span>Week 4</span></div>' +
        '<div class="ob-v2-timeline-bar"><span class="ob-v2-timeline-seg ob-v2-timeline-base"></span><span class="ob-v2-timeline-seg ob-v2-timeline-build"></span><span class="ob-v2-timeline-seg ob-v2-timeline-peak"></span><span class="ob-v2-timeline-seg ob-v2-timeline-taper"></span></div>';
    const weekHtml = _BP_DAYS.map(d => {
      const slots = _state.schedule[d] || [];
      const mini = slots.length
        ? slots.map(s => '<div class="ob-v2-mini-wk ob-v2-mini-' + s.replace(/[^a-z0-9]/gi, "") + '">' + _escape(_prettySport(s)) + '</div>').join("")
        : '<div class="ob-v2-mini-wk ob-v2-mini-rest">Rest</div>';
      return '<div class="ob-v2-week-day-row"><div class="ob-v2-week-day-label">' + _BP_DAY_LABELS[d] + '</div><div class="ob-v2-week-day-workouts">' + mini + '</div></div>';
    }).join("");
    body.innerHTML =
      '<div class="ob-v2-preview-timeline">' + timelineHtml + '</div>' +
      '<div class="ob-v2-section-label">Plan Week 1</div>' +
      '<div class="ob-v2-week-preview">' + weekHtml + '</div>';
    const anyTest = Object.values(_state.thresholds || {}).some(t => t && t.mode === "test");
    const callout = document.getElementById("bp-v2-test-callout");
    if (callout) callout.style.display = anyTest ? "" : "none";
  }

  function _confirmAndSavePlan() {
    _lsSet("selectedSports", _state.selectedSports);
    _lsSet("trainingGoals", _state.trainingGoals);
    _lsSet("raceEvents", _state.raceEvents);
    _lsSet("thresholds", _state.thresholds);
    _lsSet("strengthSetup", _state.strengthSetup);
    _lsSet("workoutSchedule", _state.schedule);
    const legacyEvents = _mapRacesToLegacyEvents(_state.raceEvents);
    if (legacyEvents.length) {
      const existing = _lsGet("events", []) || [];
      _lsSet("events", existing.concat(legacyEvents));
    }
    let plan = null;
    const race = legacyEvents[0];
    if (typeof generateTrainingPlan === "function" && race) {
      try { plan = generateTrainingPlan(race); }
      catch (e) { console.warn("[OnboardingV2] generateTrainingPlan threw", e); }
    }
    if (plan) {
      _lsSet("trainingPlan", plan);
      if (typeof storeGeneratedPlan === "function") {
        try {
          storeGeneratedPlan({
            plan_data: plan,
            plan_metadata: {
              philosophy_modules_used: [],
              module_versions: {},
              plan_version: "1.0",
              generated_at: new Date().toISOString(),
            },
            assumptions: [],
            inputs: {
              selectedSports: _state.selectedSports,
              trainingGoals: _state.trainingGoals,
              raceEvents: _state.raceEvents,
              thresholds: _state.thresholds,
              strengthSetup: _state.strengthSetup,
              schedule: _state.schedule,
            },
          }, "onboarding_v2");
        } catch (e) { console.warn("[OnboardingV2] storeGeneratedPlan threw", e); }
      }
    }
    _lsSet("surveyComplete", "1");
    if (_state.mode === "onboarding") _lsSet("hasOnboarded", "1");
    goTo("bp-v2-done");
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
    _closeOverlay();
    if (typeof showTab === "function") showTab("training");
  }

  if (typeof window !== "undefined" && window.OnboardingV2) {
    Object.assign(window.OnboardingV2, {
      _bpBack,
      _toggleSport, _applySportSideEffects, _selectGym, _saveSportsAndContinue,
      _toggleGoal, _saveGoalsAndContinue,
      _updateRaceTypes, _updateWeeksCallout, _selectRaceGoal, _selectLeadInPhase, _adjustLeadIn, _saveRaceAndContinue,
      _selectPlanOption, _saveNoraceAndContinue,
      _renderThresholdSections, _toggleTestMe, _saveThresholdsAndContinue, _testMeForEverythingAndContinue,
      _adjustStrengthCount, _applyStrengthCountSideEffects, _selectSplit, _toggleMuscle, _selectStrLength, _saveStrengthAndContinue,
      _shouldShowLongDays, _renderLongDayBlocks, _selectLongDay, _saveLongDaysAndContinue,
      _renderSchedule, _removeSlot, _promptAddSlot, _saveScheduleAndContinue,
      _renderPlanPreview, _confirmAndSavePlan, _mapRacesToLegacyEvents, _goToTrainingTab,
    });
  }

})();
