// js/onboarding-v2.js — Onboarding Survey v2 + standalone Build Plan
//
// Implements the onboarding flow and Build Plan wizard per
// cowork-handoff/IronZ_Onboarding_BuildPlan_Implementation_Spec.docx.
//
// This file is the replacement for the legacy onboarding in
// js/onboarding-legacy.js (renamed from js/onboarding.js). The legacy
// file is kept around as a tombstone for reference but is no longer
// loaded.
//
// Architecture notes:
//
// - Vanilla JS, no bundler, no ES modules. Exports go on
//   window.OnboardingV2 at the bottom of this file.
// - Script load order: AFTER js/planner.js (for DISCIPLINE_ICONS and
//   generateTrainingPlan) and AFTER js/philosophy-planner.js (for
//   storeGeneratedPlan), BEFORE js/app.js (so app.js init() can call
//   OnboardingV2.maybeStart() on first login).
// - All user input is stored localStorage-first, then synced to
//   Supabase via DB.syncKey(...). Profile data goes through
//   DB.profile.save() which handles field-name mapping.
// - Plan generation routes through window.generateTrainingPlan(race)
//   followed by window.storeGeneratedPlan(planData, source) — never
//   written directly to Supabase and never to the zombie
//   training_plans table. See docs/TRAINING_PLAN_STORAGE.md.
// - CSS classes are namespaced .ob-v2-* to avoid collisions with any
//   existing onboarding / survey styles.

(function () {
  "use strict";

  // ── State ──────────────────────────────────────────────────────────
  //
  // _state is the in-flight onboarding/build-plan state before anything
  // gets written to localStorage. When the user completes a phase we
  // flush the relevant subset into localStorage via DB.syncKey so the
  // data survives reloads mid-flow.
  const _state = {
    currentScreen: null,
    mode: null, // "onboarding" | "buildplan"
    profile: {},
    preferences: {},
    injuries: [],
    connectedApps: [],
    notifSettings: {},
    selectedSports: [],
    trainingGoals: [],
    raceEvents: [],
    thresholds: {},
    strengthSetup: {},
    schedule: {},
  };

  // ── Utilities ──────────────────────────────────────────────────────

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

  // ── Public API ─────────────────────────────────────────────────────
  //
  // These are stubs for Phase 1 — the real implementations land in
  // Phases 2-4. The empty exports are here so app.js can safely
  // reference window.OnboardingV2.maybeStart() without throwing.

  // Called from app.js init() after auth is confirmed. If the user
  // hasn't completed onboarding yet, kick off the ob-1 screen. Otherwise
  // returns false so the normal app boot continues.
  function maybeStart() {
    const done = localStorage.getItem("hasOnboarded") === "1";
    if (done) return false;
    // Phase 2 will call openOnboarding() here. For now just log.
    console.log("[OnboardingV2] maybeStart: user needs onboarding (Phase 2 will handle)");
    return false;
  }

  // Called from the Training tab's "Build My Plan" button. Opens the
  // standalone Build Plan wizard directly at bp-1, skipping the
  // ob-* screens and pre-filling any fields we already have data for.
  function openBuildPlan() {
    console.log("[OnboardingV2] openBuildPlan: Phase 4 will handle");
  }

  // Explicit onboarding kick-off (used by a "Reset onboarding" debug
  // action in Settings, if/when we add one).
  function openOnboarding() {
    console.log("[OnboardingV2] openOnboarding: Phase 2 will handle");
  }

  if (typeof window !== "undefined") {
    window.OnboardingV2 = {
      maybeStart,
      openBuildPlan,
      openOnboarding,
      // Expose internals for future phases and tests
      _state,
      _lsSet,
      _lsGet,
      _escape,
    };
  }
})();
