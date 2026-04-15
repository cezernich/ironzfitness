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
    _clearBuildPlanScreens();
    _openBuildPlanOverlay();
    goTo("bp-v2-1");
  }

  // Read the user's existing Training Zones & Strength Benchmarks
  // from localStorage.trainingZones and convert to the internal
  // _state.thresholds shape used by bp-v2-4. This lets the threshold
  // screen pre-fill inputs and pre-select the appropriate method,
  // so users who've already set their numbers just keep them.
  function _loadExistingThresholds() {
    let zones = {};
    try { zones = JSON.parse(localStorage.getItem("trainingZones") || "{}") || {}; }
    catch { zones = {}; }
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
    _state.planDetails = { duration: "12", sessionLength: "60", daysPerWeek: "5" };
    _state.thresholds = {};
    _state.strengthSetup = { sessionsPerWeek: 3, split: "ppl", customMuscles: [], sessionLength: 45 };
    _state.longDays = { longRun: "sun", longRide: "sat" };
    _state.schedule = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
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
    { id: "muscle",    icon: "weights",  text: "Build Muscle",           buckets: ["strength"] },
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
    // Skip the race path entirely if the user didn't pick "race".
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

    // Biking — FTP round-trip; compute zones if the helper is available.
    const b = thresholds.bike;
    if (b && b.mode === "known" && b.ftp) {
      const ftp = parseInt(b.ftp, 10);
      if (ftp > 0) {
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

    // Swimming — CSS pace (seconds per 100m).
    const s = thresholds.swim;
    if (s && s.mode === "known" && s.cssPace) {
      const css = parseInt(s.cssPace, 10);
      if (css > 0) {
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
    grid.innerHTML = _BP_DAYS.map(day => {
      const slots = _state.schedule[day] || [];
      const chipsHtml = slots.map(s => {
        const cls = s.replace(/[^a-z0-9]/gi, "");
        return '<span class="ob-v2-slot-chip ob-v2-slot-' + cls + '">' +
          _escape(_prettySport(s)) +
          '<button type="button" class="ob-v2-slot-remove" onclick="OnboardingV2._removeSlot(\'' + day + '\',\'' + s + '\')">&times;</button>' +
          '</span>';
      }).join("");
      return '<div class="ob-v2-schedule-day">' +
        '<div class="ob-v2-day-name">' + _BP_DAY_LABELS[day] + '</div>' +
        '<div class="ob-v2-day-slots">' + chipsHtml +
          '<button type="button" class="ob-v2-add-slot" onclick="OnboardingV2._promptAddSlot(\'' + day + '\')">+</button>' +
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
    // Sprinkle strength sessions on alternating days, capped at requested count
    if (strength > 0) {
      let placed = 0;
      for (let i = 0; i < _BP_DAYS.length && placed < strength; i += 2) {
        const d = _BP_DAYS[i];
        if (_state.schedule[d].length < 2) {
          _state.schedule[d].push("strength");
          placed++;
        }
      }
    }
    // If the user ended up with zero rest days, carve one from the lightest day.
    if (!Object.values(_state.schedule).some(arr => !arr.length || arr.includes("rest"))) {
      const lightest = _BP_DAYS.slice().sort((a, b) => _state.schedule[a].length - _state.schedule[b].length)[0];
      if (lightest) _state.schedule[lightest] = ["rest"];
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
    const weeks = Math.max(1, parseInt(_state.planDetails.duration, 10) || 12);
    const sessionLen = Math.max(15, parseInt(_state.planDetails.sessionLength, 10) || 60);
    const planId = "ob-v2-" + Date.now();

    // Find the Monday on or after today
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const dow = start.getDay(); // 0=Sun..6=Sat
    const daysToMon = (dow === 0 ? 1 : (8 - dow) % 7);
    start.setDate(start.getDate() + daysToMon);

    const existing = (() => {
      try { return JSON.parse(localStorage.getItem("workoutSchedule")) || []; }
      catch { return []; }
    })();
    // Keep only array entries (defensive: previous bug wrote an object)
    const existingArr = Array.isArray(existing) ? existing : [];

    const sessions = [];
    let counter = 0;
    for (let w = 0; w < weeks; w++) {
      _BP_DAYS.forEach((day, idx) => {
        const slots = (_state.schedule[day] || []).filter(s => s && s !== "rest");
        slots.forEach(sport => {
          const d = new Date(start);
          d.setDate(start.getDate() + w * 7 + idx);
          const dateStr = d.toISOString().slice(0, 10);
          const session = _buildSessionForSport(sport, dateStr, sessionLen, w + 1, planId, counter++);
          if (session) sessions.push(session);
        });
      });
    }

    const merged = existingArr.concat(sessions);
    localStorage.setItem("workoutSchedule", JSON.stringify(merged));
    if (typeof DB !== "undefined" && DB.syncKey) DB.syncKey("workoutSchedule");
  }

  // Build a single calendar session object in the shape other
  // parts of the app (calendar, day detail, planner) already expect.
  function _buildSessionForSport(sport, dateStr, sessionLen, weekNumber, planId, idx) {
    const base = {
      id: planId + "-" + idx,
      date: dateStr,
      weekNumber: weekNumber,
      planId: planId,
      duration: sessionLen,
      source: "onboarding_v2",
    };
    const map = {
      "run":      { type: "running",      discipline: "run",   sessionName: "Run",       load: "easy" },
      "run-long": { type: "running",      discipline: "run",   sessionName: "Long Run",  load: "long",    duration: Math.round(sessionLen * 1.5) },
      "bike":     { type: "cycling",      discipline: "bike",  sessionName: "Ride",      load: "easy" },
      "bike-long":{ type: "cycling",      discipline: "bike",  sessionName: "Long Ride", load: "long",    duration: Math.round(sessionLen * 1.8) },
      "swim":     { type: "swimming",     discipline: "swim",  sessionName: "Swim",      load: "easy" },
      "strength": { type: "weightlifting",discipline: "strength", sessionName: "Strength", load: "moderate" },
      "hiit":     { type: "hiit",         discipline: "hiit",  sessionName: "HIIT",      load: "hard",    duration: Math.max(20, Math.round(sessionLen * 0.5)) },
      "yoga":     { type: "yoga",         discipline: "yoga",  sessionName: "Yoga",      load: "easy" },
      "mobility": { type: "mobility",     discipline: "mobility", sessionName: "Mobility", load: "easy",  duration: 20 },
      "walking":  { type: "walking",      discipline: "walk",  sessionName: "Walk",      load: "easy" },
      "rowing":   { type: "rowing",       discipline: "row",   sessionName: "Row",       load: "moderate" },
      "hyrox":    { type: "hiit",         discipline: "hyrox", sessionName: "Hyrox",     load: "hard" },
      "circuit":  { type: "hiit",         discipline: "circuit", sessionName: "Circuit", load: "hard" },
    };
    const spec = map[sport];
    if (!spec) return null;
    return Object.assign({}, base, spec);
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

  if (typeof window !== "undefined" && window.OnboardingV2) {
    Object.assign(window.OnboardingV2, {
      _bpBack,
      _toggleSport, _applySportSideEffects, _selectGym, _saveSportsAndContinue,
      _toggleGoal, _saveGoalsAndContinue, _renderGoalCards,
      _updateRaceTypes, _updateWeeksCallout, _selectRaceGoal, _selectLeadInPhase, _adjustLeadIn, _saveRaceAndContinue,
      _selectPlanOption, _saveNoraceAndContinue,
      _renderThresholdSections, _toggleTestMe, _changeThresholdMethod, _saveThresholdsAndContinue, _testMeForEverythingAndContinue,
      _adjustStrengthCount, _applyStrengthCountSideEffects, _selectSplit, _toggleMuscle, _selectStrLength, _saveStrengthAndContinue,
      _shouldShowLongDays, _renderLongDayBlocks, _selectLongDay, _saveLongDaysAndContinue,
      _renderSchedule, _removeSlot, _promptAddSlot, _saveScheduleAndContinue,
      _renderPlanPreview, _confirmAndSavePlan, _mapRacesToLegacyEvents, _goToTrainingTab,
    });
  }

})();
