// app.js — General app initialization and tab navigation

// App version — included in every client_error report via error-reporting.js
// so we can tell which build a bug came from. Bump on each meaningful release.
const IRONZ_VERSION = "1.0.0";

// "Indefinite" plan duration. Used by every plan-generation entry
// point that surfaces an "indefinite" option (Build Plan triathlon
// path, lifting plan, life-training endurance plan). The three
// previously disagreed (12 / 104 / 12 weeks) — picking one here
// stops the wall-at-3-months bug Build-Plan users were hitting.
// 52 weeks materializes a year of sessions; refresh blocks pick
// new variants as the user advances.
const INDEFINITE_PLAN_WEEKS = 52;
if (typeof window !== "undefined") window.IRONZ_VERSION = IRONZ_VERSION;

// Health-disclaimer gate. Required on first launch per App Store
// Guideline 5.1.1(ix). Shown before onboarding so the user sees it first.
// Idempotent via localStorage.healthDisclaimerAck — once acknowledged,
// subsequent launches skip it (the text lives permanently in Settings →
// About so it's still reachable).
function maybeShowHealthDisclaimer(onDone) {
  const cb = typeof onDone === "function" ? onDone : () => {};
  if (localStorage.getItem("healthDisclaimerAck") === "1") { cb(); return; }
  const overlay = document.getElementById("health-disclaimer-overlay");
  if (!overlay) { cb(); return; }
  overlay._onAck = cb;
  overlay.style.display = "flex";
}

function ackHealthDisclaimer() {
  localStorage.setItem("healthDisclaimerAck", "1");
  const overlay = document.getElementById("health-disclaimer-overlay");
  if (!overlay) return;
  overlay.style.display = "none";
  const cb = overlay._onAck;
  overlay._onAck = null;
  if (typeof cb === "function") cb();
}

// Global helper: compute age from birthday string (YYYY-MM-DD)
function _calcAgeFromBirthday(dateStr) {
  if (!dateStr) return 0;
  var birth = new Date(dateStr);
  var today = new Date();
  var age = today.getFullYear() - birth.getFullYear();
  var m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

// Global helper: get age from profile (prefers birthday, falls back to stored age)
function getProfileAge() {
  try {
    var p = JSON.parse(localStorage.getItem("profile") || "{}");
    if (p.birthday) return _calcAgeFromBirthday(p.birthday);
    return parseInt(p.age) || 0;
  } catch { return 0; }
}

// ── Body scroll lock — freezes the page under any open modal ────────────────
//
// Without this, every modal (Log a Meal, Edit Workout, photo log, the
// build-plan overlays, etc.) lets the user scroll the page underneath
// because iOS treats the body's overflow chain as the scrollable
// element. The "modal floats while page slides" effect is jarring.
//
// Strategy:
//   - MutationObserver watches every known overlay element for class
//     changes. When any overlay enters its open state (.is-open or
//     .visible depending on the convention), we count up. When it
//     leaves the open state we count down.
//   - When the count is > 0 we set body { position: fixed; top:
//     -scrollY }. iOS's touch-scroll chain hits the fixed body and
//     stops there; the overlay's own scroll container still scrolls
//     internally.
//   - When the count returns to 0 we unlock and restore the saved
//     scroll position.
//
// One gotcha on iOS: setting position: fixed snaps scrollTop to 0,
// so we have to remember it via -top:Ypx and restore via
// window.scrollTo on unlock. That's the standard "body-scroll-lock"
// pattern and works in WKWebView.
(function _wireBodyScrollLock() {
  if (typeof document === "undefined") return;
  // Selector → class that signals "open" on that overlay variant.
  const OVERLAYS = [
    { sel: ".quick-entry-overlay",         cls: "is-open" },
    { sel: ".survey-overlay",              cls: "is-open" },
    { sel: ".live-tracker-overlay",        cls: "visible" },
    { sel: ".rating-modal-overlay",        cls: "visible" },
    { sel: ".strava-share-prompt-overlay", cls: "is-open" },
    { sel: ".swim-builder-overlay",        cls: "is-open" },
    { sel: ".circuit-modal-overlay",       cls: "is-open" },
    { sel: ".bp-v2-overlay",               cls: "is-open" },
    { sel: ".share-action-sheet-overlay",  cls: "is-open" },
    { sel: ".share-modal-overlay",         cls: "is-open" },
    { sel: ".share-sheet-overlay",         cls: "is-open" },
    { sel: ".gear-sheet-overlay",          cls: "is-open" },
    { sel: ".send-modal-overlay",          cls: "is-open" },
    { sel: ".premium-upsell-overlay",      cls: "is-open" },
    { sel: ".move-session-modal-overlay",  cls: "is-open" },
    { sel: ".sw-modal-overlay",            cls: "is-open" },
  ];
  let savedScrollY = 0;
  let bodyLocked = false;

  function _anyOverlayOpen() {
    return OVERLAYS.some(o => {
      const els = document.querySelectorAll(o.sel + "." + o.cls);
      // .visible needs a display check — live-tracker-overlay starts
      // hidden via display:none; .visible alone doesn't mean visible.
      for (const el of els) {
        const s = el.style;
        if (s.display === "none") continue;
        return true;
      }
      return false;
    });
  }

  function _applyLock() {
    if (bodyLocked) return;
    savedScrollY = window.scrollY || window.pageYOffset || 0;
    const body = document.body;
    body.style.position = "fixed";
    body.style.top = `-${savedScrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    bodyLocked = true;
  }

  function _releaseLock() {
    if (!bodyLocked) return;
    const body = document.body;
    body.style.position = "";
    body.style.top = "";
    body.style.left = "";
    body.style.right = "";
    body.style.width = "";
    body.style.overflow = "";
    window.scrollTo(0, savedScrollY);
    bodyLocked = false;
  }

  function _sync() {
    if (_anyOverlayOpen()) _applyLock();
    else _releaseLock();
  }

  // Single global observer — class/style changes anywhere in the tree
  // re-trigger _sync (rAF-throttled so the per-mutation cost is bounded
  // even during heavy re-renders like calendar refreshes).
  let _syncQueued = false;
  function _scheduleSync() {
    if (_syncQueued) return;
    _syncQueued = true;
    requestAnimationFrame(() => {
      _syncQueued = false;
      _sync();
    });
  }
  const obs = new MutationObserver(_scheduleSync);
  obs.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style"],
    subtree: true,
  });
  // Initial pass on load in case a modal is already open at script init.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _sync);
  } else {
    _sync();
  }
})();

// ── PWA: Unregister stale service worker ────────────────────────────────────
//
// The old PWA cache was trapping users on stale JS across deploys — every
// fix required a manual DevTools → Unregister to take effect. Until we have
// a proper cache-busting build pipeline, the service worker is more harmful
// than useful. On every page load we:
//   1. Find any registered SW and unregister it
//   2. Delete every Cache Storage entry it left behind
// This runs once and then silently no-ops on future loads.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
      if (window.caches && caches.keys) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      if (regs.length && typeof console !== "undefined") {
        console.info("[IronZ] Unregistered stale service worker + cleared caches.");
      }
    } catch {}
  });
}

// ── PWA: Handle shortcut actions from URL params ────────────────────────────
(function _handlePwaAction() {
  const action = new URLSearchParams(window.location.search).get("action");
  if (!action) return;
  // Clear the URL param to prevent re-triggering on refresh
  window.history.replaceState({}, "", window.location.pathname);
  window.addEventListener("load", () => {
    setTimeout(() => {
      if (action === "hydration") {
        if (typeof logWater === "function") logWater("water");
      } else if (action === "meal-manual") {
        if (typeof showTab === "function") showTab("nutrition");
      } else if (action === "today") {
        if (typeof showTab === "function") showTab("home");
      }
    }, 500);
  });
})();

/* =====================================================================
   COLLAPSIBLE SECTIONS
   ===================================================================== */

function toggleSection(id) {
  const section = document.getElementById(id);
  if (section) section.classList.toggle("is-collapsed");
}

/* =====================================================================
   BUILD-A-PLAN SUB-TABS
   ===================================================================== */

function switchBuildPlanTab(tabName) {
  document.querySelectorAll('.build-plan-panel').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.build-plan-tab').forEach(b => b.classList.remove('build-plan-tab--active'));
  const panel = document.getElementById('bp-panel-' + tabName);
  if (panel) panel.style.display = '';
  const btn = document.querySelector('.build-plan-tab[data-bptab="' + tabName + '"]');
  if (btn) btn.classList.add('build-plan-tab--active');
}

function openBuildPlanTab(tabName) {
  const wrapper = document.getElementById('section-build-plan');
  if (wrapper) wrapper.classList.remove('is-collapsed');
  switchBuildPlanTab(tabName);
  if (wrapper) wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Opens the legacy custom-plan builder inside a dedicated modal
// overlay (#custom-plan-overlay). #section-custom-plan is moved into
// the modal's host on open and moved back to #bp-panel-custom on
// close — this preserves all the ids, event listeners, and state
// that js/custom-plan.js registers directly against those elements.
function openCustomPlanBuilder() {
  const overlay = document.getElementById('custom-plan-overlay');
  const host    = document.getElementById('custom-plan-host');
  const section = document.getElementById('section-custom-plan');
  if (!overlay || !host || !section) return;
  if (section.parentElement !== host) host.appendChild(section);
  overlay.classList.add('is-active');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('ob-v2-lock');
  try {
    if (typeof initCustomPlan === 'function') initCustomPlan();
    if (typeof renderCustomPlanBuilder === 'function') renderCustomPlanBuilder();
  } catch (e) { console.warn('[IronZ] custom plan render failed', e); }
}

function closeCustomPlanBuilder() {
  const overlay = document.getElementById('custom-plan-overlay');
  const section = document.getElementById('section-custom-plan');
  const panel   = document.getElementById('bp-panel-custom');
  if (!overlay) return;
  overlay.classList.remove('is-active');
  overlay.setAttribute('aria-hidden', 'true');
  // Move the section back to its original home so listeners + state
  // survive for future opens.
  if (section && panel && section.parentElement !== panel) panel.appendChild(section);
  const bp = document.getElementById('bp-v2-overlay');
  const ob = document.getElementById('ob-v2-root');
  const anyOpen = (bp && bp.classList.contains('is-active')) || (ob && ob.classList.contains('is-active'));
  if (!anyOpen) document.body.classList.remove('ob-v2-lock');
}

/* =====================================================================
   TAB NAVIGATION
   ===================================================================== */

function showTab(name) {
  document.querySelectorAll(".tab-content").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".bottom-nav-tab[data-tab]").forEach(btn => btn.classList.remove("active"));

  const tabEl = document.getElementById(`tab-${name}`);
  if (tabEl) tabEl.classList.add("active");

  // Highlight the matching bottom-nav tab. Tabs that don't have their own
  // nav entry (inbox, saved-library, admin, nutrition when disabled, etc.)
  // map to the closest peer so users keep a visible anchor.
  const navTabFor = {
    home: "home",
    training: "training",
    nutrition: "nutrition",
    stats: "stats",
    community: "community",
    settings: "settings",
    // Secondary destinations highlight a peer
    "saved-library": "training",
    inbox: "community",
    admin: "settings",
    coach: "settings",
  };
  const bottomTabName = navTabFor[name] || name;
  const bottomBtn = document.querySelector(`.bottom-nav-tab[data-tab="${bottomTabName}"]`);
  if (bottomBtn) bottomBtn.classList.add("active");

  localStorage.setItem("activeTab", name);
  if (typeof trackEvent === "function") trackEvent("tab_viewed", { tab: name });

  // Refresh calendar + today panel when returning home — always jump to today
  if (name === "home") {
    if (typeof currentWeekStart !== "undefined" && typeof getWeekStart === "function") {
      currentWeekStart = getWeekStart(new Date());
    }
    if (typeof selectDay === "function") {
      selectDay(getTodayString());
    } else {
      renderCalendar();
    }
    if (typeof renderHydration === "function") renderHydration();
  }

  // Refresh race list when opening Training tab
  if (name === "training") {
    renderRaceEvents();
    if (typeof renderGoals === "function") renderGoals();
    if (typeof renderTrainingConflicts === "function") renderTrainingConflicts();
    if (typeof renderZones === "function") renderZones();
    if (typeof renderTrainingBlocksSection === "function") renderTrainingBlocksSection();
    if (typeof initCustomPlan === "function") initCustomPlan();
  }

  // Load profile values when opening settings
  if (name === "settings") {
    loadProfileIntoForm();
    updateStorageDisplay();
    renderRunningZones();
    if (typeof renderThemePicker === "function") renderThemePicker();
    applyNutritionToggle();
    if (typeof applyFuelingToggle === "function") applyFuelingToggle();
    if (typeof applyCoachingInsightsToggle === "function") applyCoachingInsightsToggle();
    applyMeasurementToggle();
    applyPoolSizeToggle();
    if (typeof renderNotifSettings === "function") renderNotifSettings();
    if (typeof renderTrustCenter === "function") renderTrustCenter();
    if (typeof renderSubscriptionStatus === "function") renderSubscriptionStatus();
    if (typeof renderStravaStatus === "function") renderStravaStatus();
    if (typeof renderPushNotifPrefs === "function") renderPushNotifPrefs();
  }

  // Refresh nutrition dashboard when opening Nutrition tab
  if (name === "nutrition") {
    if (typeof initNutritionDashboard === "function") initNutritionDashboard();
    if (typeof renderWeekMealPlanner === "function") renderWeekMealPlanner();
  }

  // Render stats when opening Stats tab — always reset to Stats sub-view
  if (name === "stats") {
    selectStatsView("stats");
    if (typeof renderLevelProgress === "function") renderLevelProgress();
  }

  // Legacy saved-workouts tab → redirect to unified saved-library
  if (name === "saved-workouts") {
    showTab("saved-library");
    return;
  }

  // Render community workouts + challenges
  if (name === "community") {
    if (typeof renderCommunityWorkouts === "function") renderCommunityWorkouts();
    if (typeof renderChallenges === "function") renderChallenges();
  }

  // Workout sharing — Inbox tab
  if (name === "inbox") {
    if (window.InboxTabView && window.InboxTabView.renderInboxTab) {
      window.InboxTabView.renderInboxTab("tab-inbox-content");
    }
  }

  // Workout sharing — Saved Library tab
  if (name === "saved-library") {
    if (window.SavedLibraryTabView && window.SavedLibraryTabView.renderSavedLibraryTab) {
      window.SavedLibraryTabView.renderSavedLibraryTab("tab-saved-library-content");
    }
  }
}

// Every bottom-nav tap lands at the top of the destination screen —
// matches iOS's "tap a tab again to scroll up" pattern. Delegated at
// document level so all six nav buttons (and any future ones) get it
// without per-button wiring; capture phase so it runs alongside the
// inline `onclick="showTab(...)"`. RAF defer lets showTab swap the
// .active tab-content first so we scroll the new tab, not the old one.
if (typeof document !== "undefined" && !document.__bottomNavScrollWired) {
  document.__bottomNavScrollWired = true;
  document.addEventListener("click", (e) => {
    const btn = e.target && e.target.closest && e.target.closest(".bottom-nav-tab");
    if (!btn) return;
    requestAnimationFrame(() => {
      try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch { window.scrollTo(0, 0); }
      const active = document.querySelector(".tab-content.active");
      if (active && active !== document.body) {
        try { active.scrollTo({ top: 0, behavior: "smooth" }); } catch { active.scrollTop = 0; }
      }
    });
  }, true);
}

/* =====================================================================
   STATS TAB VIEW SWITCHER
   ===================================================================== */

function selectStatsView(view) {
  const statsEl   = document.getElementById("stats-view-stats");
  const histEl    = document.getElementById("stats-view-history");
  const statsBtn  = document.getElementById("stats-view-btn-stats");
  const histBtn   = document.getElementById("stats-view-btn-history");
  if (!statsEl || !histEl) return;

  if (view === "history") {
    statsEl.style.display  = "none";
    histEl.style.display   = "";
    statsBtn.classList.remove("is-active");
    histBtn.classList.add("is-active");
    if (typeof renderWorkoutHistory === "function") renderWorkoutHistory();
  } else {
    histEl.style.display   = "none";
    statsEl.style.display  = "";
    histBtn.classList.remove("is-active");
    statsBtn.classList.add("is-active");
    renderStats();
  }
}

/* =====================================================================
   PROFILE DROPDOWN NAV
   ===================================================================== */

function getNavInitials() {
  try {
    const profile = JSON.parse(localStorage.getItem("profile")) || {};
    const name = (profile.name || "").trim();
    if (!name) return "?";
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
  } catch { return "?"; }
}

function updateNavInitials() {
  const initials = getNavInitials();
  const el = document.getElementById("bottom-nav-initials");
  if (el) el.textContent = initials;
}

const SUPPORT_EMAIL = "ironzsupport@gmail.com";

function openSupportEmail() {
  const profile = JSON.parse(localStorage.getItem("profile") || "{}");
  const name    = profile.full_name || "";
  const subject = encodeURIComponent("IronZ Support Request");
  const body    = encodeURIComponent(`Hi IronZ Support,\n\n[Please describe your issue here]\n\n---\nName: ${name}`);
  window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
}

/* =====================================================================
   NUTRITION TOGGLE
   ===================================================================== */

function isNutritionEnabled() {
  return localStorage.getItem("nutritionEnabled") !== "0";
}

function setNutritionEnabled(enabled) {
  localStorage.setItem("nutritionEnabled", enabled ? "1" : "0"); if (typeof DB !== 'undefined') DB.syncKey('nutritionEnabled');
  if (typeof trackEvent === "function") trackEvent("feature_toggled", { feature: "nutrition", enabled });
  if (typeof syncFeatureToggles === "function") syncFeatureToggles();
  applyNutritionToggle();
  // Re-render day detail if open so nutrition sections appear/disappear immediately
  if (typeof selectedDate !== "undefined" && selectedDate && typeof renderDayDetail === "function") {
    renderDayDetail(selectedDate);
  }
}

function applyNutritionToggle() {
  const enabled = isNutritionEnabled();
  const bottomNutritionBtn = document.getElementById("bottom-nav-nutrition");
  const toggle             = document.getElementById("pref-nutrition-toggle");
  if (bottomNutritionBtn) bottomNutritionBtn.style.display = enabled ? "" : "none";
  if (toggle)             toggle.checked                    = enabled;
  // The legacy #section-todays-summary card ("X meals logged today" +
  // 4 macro boxes) is intentionally not unhidden anymore — the rich
  // Today's Nutrition dashboard at the top of the page already shows
  // these numbers in progress bars + macro rings, so the bottom card
  // was duplicate visual noise. Markup left in place (display:none in
  // index.html) so renderTodaysSummary() can keep writing to it as a
  // dead target without throwing — see nutrition.js for the guard.
}

function getMeasurementSystem() {
  return localStorage.getItem("measurementSystem") || "imperial";
}
function getDistanceUnit() {
  return getMeasurementSystem() === "metric" ? "km" : "mi";
}
function setMeasurementSystem(system) {
  localStorage.setItem("measurementSystem", system); if (typeof DB !== 'undefined') DB.syncKey('measurementSystem');
  applyMeasurementToggle();
}
function applyMeasurementToggle() {
  const sel = document.getElementById("pref-measurement-select");
  if (sel) sel.value = getMeasurementSystem();
}

// Pool size — stored on profile.pool_size (same key the swim generators
// already read). Moved from the Athlete Profile form into Preferences
// next to Measurement System since it's a device-level default, not
// biographical data.
function getPoolSize() {
  try {
    const p = JSON.parse(localStorage.getItem("profile") || "{}");
    return p.pool_size || p.poolSize || "25m";
  } catch { return "25m"; }
}
function setPoolSize(value) {
  if (!value) return;
  let profile = {};
  try { profile = JSON.parse(localStorage.getItem("profile") || "{}"); } catch {}
  profile.pool_size = value;
  localStorage.setItem("profile", JSON.stringify(profile));
  if (typeof DB !== 'undefined' && DB.profile && DB.profile.save) DB.profile.save(profile).catch(() => {});
  applyPoolSizeToggle();
}
function applyPoolSizeToggle() {
  const sel = document.getElementById("pref-pool-size-select");
  if (sel) sel.value = getPoolSize();
}

/* =====================================================================
   INITIALIZATION
   ===================================================================== */

// Remove orphaned completion records at startup:
// 1. isCompletion workouts with no matching completedSessions entry
// 2. isCompletion workouts whose completedSessionId points to a session that no longer exists
// 3. completedSessions entries whose source session no longer exists
function cleanupOrphanedCompletions() {
  try {
    const meta = JSON.parse(localStorage.getItem("completedSessions") || "{}");
    const validWorkoutIds = new Set(Object.values(meta).map(e => String(e.workoutId)));

    // Build set of existing session IDs (scheduled + plan)
    const scheduled = JSON.parse(localStorage.getItem("workoutSchedule") || "[]");
    const plan = JSON.parse(localStorage.getItem("trainingPlan") || "[]");
    const existingSessionIds = new Set();
    scheduled.forEach(s => existingSessionIds.add(`session-sw-${s.id}`));
    plan.forEach(p => existingSessionIds.add(`session-plan-${p.date}-${p.raceId}`));
    // Logged workouts are also valid completion targets
    const logged = JSON.parse(localStorage.getItem("workouts") || "[]");
    logged.forEach(w => { if (!w.isCompletion) existingSessionIds.add(`session-log-${w.id}`); });

    let workouts = JSON.parse(localStorage.getItem("workouts") || "[]");
    const before = workouts.length;
    const removedIds = [];
    workouts = workouts.filter(w => {
      if (!w.isCompletion) return true;
      // Remove if no matching completedSessions entry
      if (!validWorkoutIds.has(String(w.id))) { removedIds.push(String(w.id)); return false; }
      // Remove if the source session no longer exists
      if (w.completedSessionId && !existingSessionIds.has(w.completedSessionId)) { removedIds.push(String(w.id)); return false; }
      return true;
    });
    if (workouts.length !== before) {
      localStorage.setItem("workouts", JSON.stringify(workouts)); if (typeof DB !== 'undefined') DB.syncWorkouts();
    }

    // Clean up ratings for removed workout IDs
    if (removedIds.length) {
      try {
        const ratings = JSON.parse(localStorage.getItem("workoutRatings") || "{}");
        let ratingsChanged = false;
        for (const id of removedIds) {
          if (ratings[id]) { delete ratings[id]; ratingsChanged = true; }
        }
        if (ratingsChanged) localStorage.setItem("workoutRatings", JSON.stringify(ratings)); if (typeof DB !== 'undefined') DB.syncKey('workoutRatings');
      } catch {}
    }

    // Also clean up completedSessions entries for sessions that no longer exist
    let metaChanged = false;
    for (const sessionId of Object.keys(meta)) {
      if (!existingSessionIds.has(sessionId)) {
        delete meta[sessionId];
        metaChanged = true;
      }
    }
    if (metaChanged) {
      localStorage.setItem("completedSessions", JSON.stringify(meta)); if (typeof DB !== 'undefined') DB.syncKey('completedSessions');
    }
  } catch {}
}

function init() {
  // One-time migration: derive profile.bodyCompGoal from legacy signals
  // (trainingGoals / strengthRole). Idempotent — no-op once set. This
  // ensures every user has a body-comp value the new nutrition path
  // can read without falling through to the legacy fallback branch.
  if (typeof migrateBodyCompGoal === "function") {
    try { migrateBodyCompGoal(); } catch (e) { console.warn("[IronZ] bodyCompGoal migration:", e); }
  }

  // End-of-day target freeze: snapshot past-day nutrition targets so
  // changing profile / bodyCompGoal / weight tomorrow doesn't warp
  // yesterday's "% of target" display. Today stays live; only past
  // dates with logged meals get locked. See planner.js freezePastTargets
  // for the full rationale.
  if (typeof freezePastTargets === "function") {
    try { freezePastTargets(); } catch (e) { console.warn("[IronZ] target freeze:", e); }
  }
  // Same Garmin-style snapshot for hydration. See hydration.js
  // freezePastHydrationTargets for the rationale — also fixes the
  // separate stats-panel bug where every historical day was held to
  // today's hydration target.
  if (typeof freezePastHydrationTargets === "function") {
    try { freezePastHydrationTargets(); } catch (e) { console.warn("[IronZ] hydration freeze:", e); }
  }

  // PR 3b: when a coach edits this client's training inputs, the RPC
  // stamps a pendingPlanRegen flag on user_data. Consume it here —
  // regenerates the plan against the new inputs if there's an
  // upcoming A-race, then clears the flag.
  if (typeof consumePendingPlanRegen === "function") {
    try { consumePendingPlanRegen(); } catch (e) { console.warn("[IronZ] pendingPlanRegen:", e); }
  }

  // Load philosophy engine modules (non-blocking)
  if (typeof loadPhilosophyModules === 'function') {
    loadPhilosophyModules().catch(e => console.warn('[IronZ] Philosophy module load:', e.message));
  }
  if (typeof loadExerciseLibrary === 'function') {
    loadExerciseLibrary().catch(e => console.warn('[IronZ] Exercise library load:', e.message));
  }
  // Prefetch the admin-curated workout library so the plan generator can
  // query synchronously when the user hits "Generate & Schedule Plan".
  if (typeof WorkoutLibrary !== 'undefined' && WorkoutLibrary._ensureLoaded) {
    WorkoutLibrary._ensureLoaded().catch(e => console.warn('[IronZ] Workout library load:', e.message));
  }

  // Refresh all caches from Supabase (non-blocking)
  if (typeof DB !== 'undefined') {
    DB.profile.get().catch(() => {});
    DB.refreshAllKeys().catch(() => {});
  }

  // Cross-device sync: re-pull data when user returns to the tab
  // Throttled to prevent thrashing if user tab-switches rapidly
  let _lastVisibilityRefresh = 0;
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState !== "visible") return;
    // iOS screenshots briefly background the tab; if the live tracker is open,
    // skip the re-render so the user's scroll position in the workout view
    // isn't thrown back to the top.
    if (document.getElementById("live-tracker-overlay")) return;
    const now = Date.now();
    if (now - _lastVisibilityRefresh < 5000) return; // throttle to once per 5s
    _lastVisibilityRefresh = now;
    if (typeof DB === 'undefined' || !DB.refreshAllKeys) return;
    try {
      // Flush any writes THIS tab scheduled but hasn't pushed yet BEFORE
      // pulling remote. Without this, a user who logs a completion on
      // this tab, switches away, and comes back can lose the write when
      // refreshAllKeys overwrites local with stale Supabase data.
      if (DB.replayPendingSyncs) await DB.replayPendingSyncs();
      await DB.refreshAllKeys();
      if (typeof renderCalendar === "function") renderCalendar();
      if (typeof selectedDate !== "undefined" && selectedDate && typeof renderDayDetail === "function") {
        renderDayDetail(selectedDate);
      }
      // Second-device scenario: user finished a workout on phone,
      // switched to laptop. Home / history / stats tabs must reflect
      // the new completion without a full relaunch.
      if (typeof renderWorkoutHistory === "function") renderWorkoutHistory();
      if (typeof renderStats === "function") renderStats();
      // Cross-device stack: data may have arrived showing all three
      // pillars hit. recordStackIfHit + maybeFireStackCelebration are
      // idempotent and gate on stackCelebratedFor, so this is safe.
      if (window.StackUX) {
        try {
          window.StackUX.recordStackIfHit();
          window.StackUX.maybeFireStackCelebration();
        } catch {}
      }
      if (typeof renderGreeting === "function") renderGreeting();
    } catch (e) { console.warn("[IronZ] visibility refresh failed:", e); }
  });

  // Cross-device realtime — db.js subscribes to user_data row changes
  // and dispatches `ironz:data-refresh` with the changed keys (already
  // written to localStorage by the realtime handler before this fires).
  // Re-render the surfaces those keys feed; the renders read from
  // localStorage so they pick up the new values immediately.
  document.addEventListener("ironz:data-refresh", (e) => {
    const keys = (e.detail && e.detail.keys) || [];
    try {
      if (typeof renderDailyRings === "function") renderDailyRings();
      if (typeof renderGreeting === "function") renderGreeting();
      if (keys.includes("meals")) {
        if (typeof updateNutritionDashboard === "function") updateNutritionDashboard();
        if (typeof renderTodaysSummary       === "function") renderTodaysSummary();
        if (typeof renderNutritionHistory    === "function") renderNutritionHistory();
      }
      if (keys.includes("hydrationLog") && typeof renderHydration === "function") renderHydration();
      if ((keys.includes("completedSessions") || keys.includes("workoutSchedule") || keys.includes("workouts"))
          && typeof renderCalendar === "function") renderCalendar();
      if (typeof selectedDate !== "undefined" && selectedDate && typeof renderDayDetail === "function") {
        renderDayDetail(selectedDate);
      }
      // Stack reconcile if any pillar key changed — covers the case
      // where the other device deleted a meal that took today out of
      // stack-eligibility.
      const stackKeys = ["meals", "hydrationLog", "completedSessions", "stackedDayHistory"];
      if (window.StackUX && keys.some(k => stackKeys.includes(k))) {
        if (window.StackUX.reconcileStack) window.StackUX.reconcileStack();
        if (window.StackUX.maybeFireStackCelebration) window.StackUX.maybeFireStackCelebration();
      }
    } catch (err) {
      console.warn("[IronZ] data-refresh handler error:", err);
    }
  });

  // Keyboard-aware tab bar. iOS doesn't shrink window.innerHeight when
  // the keyboard appears, so `position: fixed; bottom: 0` on
  // #bottom-nav stays anchored to the BELOW-keyboard area — which from
  // the user's perspective means nav icons overlap the text input they
  // were trying to type into. visualViewport IS keyboard-aware; watch
  // it and hide the nav when the viewport shrinks by enough that we
  // can attribute it to the keyboard.
  if (window.visualViewport) {
    const nav = document.getElementById("bottom-nav");
    if (nav) {
      // Track the tallest height we've ever seen, not just the current
      // height at init — the nav can initialize with the keyboard
      // already up (e.g. during a hot reload) and latch the wrong
      // baseline.
      let baselineHeight = window.visualViewport.height;
      const onViewportChange = () => {
        baselineHeight = Math.max(baselineHeight, window.visualViewport.height);
        const delta = baselineHeight - window.visualViewport.height;
        // >150px delta is almost always a software keyboard. Below
        // that we could be seeing iOS address-bar animation or a
        // landscape rotation — leave the nav alone.
        if (delta > 150) nav.classList.add("nav-hidden-keyboard");
        else nav.classList.remove("nav-hidden-keyboard");
      };
      window.visualViewport.addEventListener("resize", onViewportChange);
      window.visualViewport.addEventListener("scroll", onViewportChange);
    }
  }

  if (typeof trackSessionStarted === "function") trackSessionStarted();
  if (typeof updateLastActive === "function") updateLastActive();

  // Inbox badge — refresh now and every 60s so the dot appears without a tab switch.
  if (window.InboxTabView && window.InboxTabView.refreshBadge) {
    try { window.InboxTabView.refreshBadge(); } catch {}
    if (!window._inboxBadgeInterval) {
      window._inboxBadgeInterval = setInterval(() => {
        try { window.InboxTabView.refreshBadge(); } catch {}
      }, 60000);
    }
  }

  cleanupOrphanedCompletions();
  const today = getTodayString();
  document.getElementById("log-date").value  = today;
  document.getElementById("meal-date").value = today;

  // Default plan start date to next Monday (or today if today is Monday)
  const planStartEl = document.getElementById("plan-start-date");
  if (planStartEl) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const dow = d.getDay(); // 0=Sun, 1=Mon
    const daysToMon = dow === 1 ? 0 : (dow === 0 ? 1 : 8 - dow);
    d.setDate(d.getDate() + daysToMon);
    planStartEl.value = d.toISOString().slice(0, 10);
  }

  // Default life training start date to next Monday
  const ltStartEl = document.getElementById("life-start-date");
  if (ltStartEl) {
    const lt = new Date();
    lt.setHours(0, 0, 0, 0);
    const ltDow = lt.getDay();
    const ltDaysToMon = ltDow === 1 ? 0 : (ltDow === 0 ? 1 : 8 - ltDow);
    lt.setDate(lt.getDate() + ltDaysToMon);
    ltStartEl.value = lt.toISOString().slice(0, 10);
  }

  // Default custom plan start date to next Monday
  const cpStartEl = document.getElementById("custom-plan-start");
  if (cpStartEl) {
    const cp = new Date();
    cp.setHours(0, 0, 0, 0);
    const cpDow = cp.getDay();
    const cpDaysToMon = cpDow === 1 ? 0 : (cpDow === 0 ? 1 : 8 - cpDow);
    cp.setDate(cp.getDate() + cpDaysToMon);
    cpStartEl.value = cp.toISOString().slice(0, 10);
    const importStartEl = document.getElementById("import-start-date");
    if (importStartEl) importStartEl.value = cp.toISOString().slice(0, 10);
  }

  // Initialize strength plan split preview
  if (typeof updateSplitPreview === "function") updateSplitPreview();

  addExerciseRow();
  addLogSegmentRow();

  // Log a Workout: only allow past dates (missed workouts)
  const logDateEl = document.getElementById("log-date");
  if (logDateEl) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    logDateEl.max = yesterday.toISOString().slice(0, 10);
  }

  if (typeof renderRaceForm === "function") renderRaceForm();
  if (typeof initGymStrengthToggle === "function") initGymStrengthToggle();
  if (typeof renderThemePicker === "function") renderThemePicker();

  applyNutritionToggle();
  applyMeasurementToggle();
  if (typeof initHydration === "function") initHydration();
  renderWorkoutHistory();
  if (isNutritionEnabled()) renderTodaysSummary();
  if (isNutritionEnabled()) renderNutritionHistory();
  renderFoodPreferences();
  updateNavInitials();
  renderGreeting();
  if (typeof renderTrainingConflicts === "function") renderTrainingConflicts();
  if (typeof renderTrainingInputs === "function") renderTrainingInputs();
  if (typeof renderAvoidedExercisesList === "function") renderAvoidedExercisesList();
  if (typeof renderWeekMealPlanner === "function") renderWeekMealPlanner();

  // Home tab: render calendar then auto-show today's plan
  renderCalendar();
  selectDay(today); // pre-populate today's workout + nutrition panel

  // Restore last active tab (default to "home")
  const savedTab = localStorage.getItem("activeTab") || "home";
  showTab(savedTab);

  // Check for level-up on app start
  if (typeof checkLevelUp === "function") checkLevelUp();

  // First-launch health disclaimer (App Store 5.1.1(ix)). Shown before any
  // onboarding wizard so the acknowledgment isn't buried behind survey
  // questions. maybeShowHealthDisclaimer chains into onboarding on dismiss.
  maybeShowHealthDisclaimer(() => {
    if (!localStorage.getItem("hasOnboarded")) {
      if (typeof OnboardingV2 !== "undefined" && OnboardingV2.maybeStart) {
        setTimeout(() => OnboardingV2.maybeStart(), 200);
      } else if (typeof showOnboarding === "function") {
        setTimeout(showOnboarding, 200);
      }
    }
  });

  // Weekly check-in prompt (Sunday)
  if (typeof shouldShowWeeklyCheckin === "function" && shouldShowWeeklyCheckin()) {
    setTimeout(openWeeklyCheckin, 800);
  }

  // Initialize notification timers
  if (typeof initNotificationTimers === "function") initNotificationTimers();

  // Check for Strava OAuth return (new server-side flow) or legacy callback
  if (typeof handleStravaReturn === "function") handleStravaReturn();
  if (typeof handleStravaCallback === "function") handleStravaCallback();

  // API key UI removed — AI calls route through server-side proxy

  // Check for outdated philosophy plan
  if (typeof isPlanOutdated === 'function' && isPlanOutdated()) {
    const banner = document.getElementById('philosophy-plan-outdated');
    if (banner) banner.style.display = '';
  }

  // Handle ?import=TOKEN from share preview CTA
  _handleImportParam();
}

async function _handleImportParam() {
  const params = new URLSearchParams(window.location.search);
  const importToken = params.get("import");
  if (!importToken) return;

  // Clean the URL so refreshing doesn't re-trigger
  const cleanUrl = window.location.pathname + window.location.hash;
  history.replaceState(null, "", cleanUrl);

  const sb = window.supabaseClient;
  if (!sb) return;

  // Check auth — if not logged in, stash and prompt
  let userId = null;
  try {
    const { data } = await sb.auth.getUser();
    userId = data && data.user && data.user.id;
  } catch {}
  if (!userId) {
    // Stash the token for after login
    try { localStorage.setItem("ironz_pending_import", importToken); } catch {}
    alert("Sign in to save this workout to your library.");
    return;
  }

  // Resolve via WorkoutLinkService so we get the joined sender profile and
  // the standard error classification (REVOKED / EXPIRED / NOT_FOUND).
  const Link = window.WorkoutLinkService;
  let resolved = null;
  if (Link && Link.resolveToken) {
    resolved = await Link.resolveToken(importToken);
  } else {
    // Fallback to a direct read if WorkoutLinkService isn't loaded.
    const { data: row } = await sb
      .from("shared_workouts")
      .select("share_token, variant_id, sport_id, session_type_id, share_note, created_at, expires_at, revoked_at, sender_user_id")
      .eq("share_token", importToken)
      .maybeSingle();
    if (!row) resolved = { error: "NOT_FOUND" };
    else if (row.revoked_at) resolved = { error: "REVOKED" };
    else if (row.expires_at && new Date(row.expires_at) < new Date()) resolved = { error: "EXPIRED" };
    else resolved = {
      shareToken: row.share_token, variantId: row.variant_id, sportId: row.sport_id,
      sessionTypeId: row.session_type_id, shareNote: row.share_note,
      createdAt: row.created_at, expiresAt: row.expires_at,
      senderUserId: row.sender_user_id, senderDisplayName: null, senderAvatarUrl: null,
    };
  }

  if (resolved.error) {
    if (resolved.error === "REVOKED") _showShareToast("This share link was revoked.");
    else if (resolved.error === "EXPIRED") _showShareToast("This share link has expired.");
    else _showShareToast("Workout not found or link expired.");
    return;
  }

  // Drop the share into the inbox so it survives if the user dismisses
  // the modal without acting.
  const Inbox = window.SharedWorkoutsInbox;
  if (Inbox && Inbox.upsertEntry) {
    try {
      await Inbox.upsertEntry({
        shareToken: resolved.shareToken,
        senderUserId: resolved.senderUserId,
        senderDisplayName: resolved.senderDisplayName,
        senderAvatarUrl: resolved.senderAvatarUrl,
        variantId: resolved.variantId,
        sportId: resolved.sportId,
        sessionTypeId: resolved.sessionTypeId,
        shareNote: resolved.shareNote,
        received_at: new Date().toISOString(),
        status: "unread",
      });
    } catch (e) { console.warn("[IronZ] inbox upsert failed", e); }
  }

  // Open the preview modal with Save / Schedule actions wired up.
  const PreviewModal = window.SharedWorkoutPreviewModal;
  if (PreviewModal && PreviewModal.open) {
    PreviewModal.open({
      sharedWorkout: resolved,
      onSave: async () => {
        const Saved = window.SavedWorkoutsLibrary;
        if (Saved && Saved.saveFromShare) {
          await Saved.saveFromShare({
            shareToken: resolved.shareToken,
            variantId: resolved.variantId,
            sportId: resolved.sportId,
            sessionTypeId: resolved.sessionTypeId,
            senderUserId: resolved.senderUserId,
          });
          if (Inbox && Inbox.markAsSaved) try { await Inbox.markAsSaved(resolved.shareToken); } catch {}
          _showShareToast("Workout saved!");
          if (typeof showTab === "function") showTab("saved-library");
        }
      },
      onSchedule: async () => {
        const ScheduleCalendar = window.ScheduleCalendarModal;
        if (ScheduleCalendar && ScheduleCalendar.open) {
          ScheduleCalendar.open({
            sharedWorkout: resolved,
            scaledWorkout: { sport_id: resolved.sportId, session_type_id: resolved.sessionTypeId, variant_id: resolved.variantId },
            onPick: async ({ date }) => {
              let schedule = [];
              try { schedule = JSON.parse(localStorage.getItem("workoutSchedule") || "[]"); } catch {}
              schedule.push({
                id: "shared-" + resolved.shareToken + "-" + Date.now(),
                date,
                type: resolved.sessionTypeId,
                sessionName: resolved.variantId,
                variant_id: resolved.variantId,
                sport_id: resolved.sportId,
                shared_from_token: resolved.shareToken,
                source: "shared",
              });
              try {
                localStorage.setItem("workoutSchedule", JSON.stringify(schedule));
                if (typeof DB !== "undefined" && DB.syncSchedule) DB.syncSchedule();
              } catch {}
              if (Inbox && Inbox.markAsScheduled) try { await Inbox.markAsScheduled(resolved.shareToken, date); } catch {}
              _showShareToast("Added to your plan!");
              if (typeof renderCalendar === "function") renderCalendar();
            },
          });
        }
      },
    });
  } else {
    // No modal available — fall back to silent save so behavior degrades gracefully.
    const Saved = window.SavedWorkoutsLibrary;
    if (Saved && Saved.saveFromShare) {
      await Saved.saveFromShare({
        shareToken: resolved.shareToken,
        variantId: resolved.variantId,
        sportId: resolved.sportId,
        sessionTypeId: resolved.sessionTypeId,
        senderUserId: resolved.senderUserId,
      });
      _showShareToast("Workout saved!");
      if (typeof showTab === "function") showTab("saved-library");
    }
  }
}

// Check for a stashed import after login completes
function _checkPendingImport() {
  try {
    const token = localStorage.getItem("ironz_pending_import");
    if (token) {
      localStorage.removeItem("ironz_pending_import");
      _handleImportParam.call(null);
      // Re-trigger by temporarily setting the param
      const url = new URL(window.location);
      url.searchParams.set("import", token);
      history.replaceState(null, "", url);
      _handleImportParam();
    }
  } catch {}
}

function _showShareToast(msg) {
  const existing = document.getElementById("ironz-toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.id = "ironz-toast";
  toast.className = "ironz-toast";
  toast.textContent = msg;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("visible"));
  setTimeout(() => { toast.classList.remove("visible"); setTimeout(() => toast.remove(), 220); }, 2000);
}

window.onload = init;

/* ── Philosophy Engine UI Glue ─────────────────────────────────────────── */

async function generatePhilosophyPlan() {
  if (window.Subscription && typeof window.Subscription.requirePremium === "function") {
    const allowed = await window.Subscription.requirePremium("ai_plan");
    if (!allowed) return;
  }
  const msg = document.getElementById('plan-save-msg');
  if (msg) { msg.textContent = 'Generating philosophy-based plan...'; msg.style.color = 'var(--color-accent)'; }

  try {
    const result = await philosophyGeneratePlan({ type: 'standard' });
    if (result && result.plan) {
      displayPhilosophyPlan(result);
      if (msg) { msg.textContent = 'Plan generated!'; msg.style.color = 'var(--color-success)'; }
    } else {
      if (msg) { msg.textContent = 'Failed to generate plan.'; msg.style.color = 'var(--color-danger)'; }
    }
  } catch (e) {
    console.error('[IronZ] Philosophy plan generation failed:', e);
    if (msg) { msg.textContent = 'Error: ' + e.message; msg.style.color = 'var(--color-danger)'; }
  }
  setTimeout(() => { if (msg) msg.textContent = ''; }, 5000);
}

async function regeneratePhilosophyPlan() {
  const banner = document.getElementById('philosophy-plan-outdated');
  if (banner) banner.style.display = 'none';
  await generatePhilosophyPlan();
}

function displayPhilosophyPlan(result) {
  const plan = result.plan;
  const container = document.getElementById('generated-plan');
  if (!container) return;

  let html = '<div style="margin-top:16px; padding-top:16px; border-top:1px solid var(--color-border);">';
  html += `<strong style="font-size:0.95rem;">Philosophy Engine Plan — ${plan.plan_structure?.split_type || 'Custom'} (${plan.athlete_summary?.level || ''})</strong>`;

  // Show validation flags if any
  if (result.flags && result.flags.length > 0) {
    html += '<div style="margin:8px 0; padding:8px; background:var(--color-surface); border-radius:6px; font-size:0.82rem;">';
    html += '<strong>Validation adjustments:</strong><ul style="margin:4px 0; padding-left:18px;">';
    for (const f of result.flags) {
      html += `<li>${f.flag}</li>`;
    }
    html += '</ul></div>';
  }

  // Weekly template
  const template = plan.weekly_template || {};
  const dayOrder = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  for (const day of dayOrder) {
    const session = template[day];
    if (!session) continue;
    html += `<div style="margin:10px 0; padding:10px; background:var(--color-surface); border-radius:8px;">`;
    html += `<strong style="text-transform:capitalize">${day}</strong>: `;
    html += `<span style="color:var(--color-accent)">${session.session_type}</span>`;
    html += ` — ${session.purpose}`;
    if (session.zone) html += ` <span class="hint">(${session.zone})</span>`;
    if (session.duration) html += ` <span class="hint">${session.duration}</span>`;

    if (session.exercises && session.exercises.length > 0) {
      html += '<div style="margin-top:6px; padding-left:12px; font-size:0.85rem;">';
      for (const ex of session.exercises) {
        html += `<div style="margin:3px 0">${ex.name}: ${ex.sets}x${ex.reps} — rest ${ex.rest_seconds}s`;
        if (ex.rpe_target) html += ` (RPE ${ex.rpe_target})`;
        html += '</div>';
      }
      html += '</div>';
    }
    html += '</div>';
  }

  // Nutrition summary
  if (plan.nutrition_strategy?.daily_targets) {
    const nt = plan.nutrition_strategy.daily_targets;
    html += '<div style="margin:12px 0; padding:10px; background:var(--color-surface); border-radius:8px;">';
    html += `<strong>Daily Nutrition Targets:</strong> ${nt.calories} kcal | ${nt.protein_g}g protein | ${nt.carbs_g}g carbs | ${nt.fat_g}g fat`;
    if (plan.nutrition_strategy.training_day_adjustments) {
      html += `<br><span class="hint">${plan.nutrition_strategy.training_day_adjustments}</span>`;
    }
    html += '</div>';
  }

  // Progression
  if (plan.progression_logic) {
    html += `<div style="margin:8px 0; font-size:0.85rem;"><strong>Progression:</strong> ${plan.progression_logic}</div>`;
  }

  html += '</div>';
  container.innerHTML = html;

  // Show rationale
  const rationaleDiv = document.getElementById('philosophy-rationale');
  const rationaleText = document.getElementById('philosophy-rationale-text');
  const modulesUsed = document.getElementById('philosophy-modules-used');
  if (rationaleDiv && rationaleText) {
    rationaleText.textContent = plan.rationale || '';
    if (modulesUsed && plan.plan_metadata?.philosophy_modules_used) {
      modulesUsed.textContent = 'Modules: ' + plan.plan_metadata.philosophy_modules_used.join(', ');
    }
    rationaleDiv.style.display = '';
  }
}


/* =====================================================================
   SETTINGS — PROFILE
   ===================================================================== */

function saveProfile() {
  // Convert ft/in to total inches for height
  const feet = parseInt(document.getElementById("profile-height-feet")?.value) || 0;
  const inches = parseInt(document.getElementById("profile-height-inches")?.value) || 0;
  const totalInches = feet * 12 + inches;
  // Preserve any fields saved through non-form paths (CSS, VDOT, etc.)
  let existing = {};
  try { existing = JSON.parse(localStorage.getItem("profile")) || {}; } catch {}

  // Strength 1RMs used to live here too, but that duplicated the Training
  // Zones → Strength form — which is the canonical place. The spread of
  // `existing` below preserves any legacy profile.squat1RM / bench1RM /
  // deadlift1RM values a prior save wrote, so we don't clobber them.
  const profile = {
    ...existing,
    name:   document.getElementById("profile-name").value.trim(),
    birthday: document.getElementById("profile-birthday").value,
    age:    document.getElementById("profile-birthday").value ? String(_calcAgeFromBirthday(document.getElementById("profile-birthday").value)) : "",
    weight: document.getElementById("profile-weight").value,
    height: String(totalInches || ""),
    gender: document.getElementById("profile-gender").value,
    goal:   document.getElementById("profile-goal").value,
    bodyCompGoal: document.getElementById("profile-bodycomp")?.value || existing.bodyCompGoal || "maintain",
  };

  localStorage.setItem("profile", JSON.stringify(profile));
  if (typeof DB !== 'undefined') DB.profile.save(profile).catch(() => {});
  updateNavInitials();
  renderGreeting();
  // Goal / weight changes feed into nutrition target math, which feeds
  // the dashboard ring. Without this refresh the ring stayed pinned to
  // the previous goal's percentage until the next page navigation.
  if (typeof renderDailyRings === "function") renderDailyRings();

  const msg = document.getElementById("profile-save-msg");
  msg.style.color = "var(--color-success)";
  msg.textContent = "Profile saved!";
  setTimeout(() => { msg.textContent = ""; }, 3000);
}

async function loadProfileIntoForm() {
  // Populate the birthday Month/Day/Year option lists IMMEDIATELY,
  // before any await — otherwise users tapping the selects during the
  // (potentially slow) DB.profile.get() round-trip see iOS's "No
  // Options" picker. _initBdayPicker is idempotent so repeated calls
  // are safe; the value-set step below still runs after the profile
  // arrives.
  if (typeof window._initBdayPicker === "function") {
    try { window._initBdayPicker("profile-birthday"); } catch {}
  }
  try {
    // Try fetching from Supabase first (populates localStorage as cache)
    let profile = null;
    if (typeof DB !== 'undefined') {
      try { profile = await DB.profile.get(); } catch {}
    }
    if (!profile || !profile.name) {
      profile = JSON.parse(localStorage.getItem("profile")) || {};
    }
    if (profile.name)   document.getElementById("profile-name").value   = profile.name;
    // Birthday picker uses three Month/Day/Year selects (Bug 18) —
    // initialize the option lists then set the saved value via the
    // helper. Falls back to plain assignment if the selects aren't
    // present (other settings pages might still use type="date").
    if (typeof window._initBdayPicker === "function") {
      window._initBdayPicker("profile-birthday");
    }
    if (profile.birthday) {
      if (typeof window._setBdayPickerValue === "function") {
        window._setBdayPickerValue("profile-birthday", profile.birthday);
      } else {
        document.getElementById("profile-birthday").value = profile.birthday;
      }
    } else if (profile.age) {
      document.getElementById("profile-birthday").value = ""; // legacy: had age but no birthday
    }
    if (profile.weight) document.getElementById("profile-weight").value = profile.weight;
    if (profile.height) {
      const h = parseInt(profile.height);
      if (!isNaN(h) && h > 0) {
        const feetEl = document.getElementById("profile-height-feet");
        const inchesEl = document.getElementById("profile-height-inches");
        if (feetEl) feetEl.value = Math.floor(h / 12);
        if (inchesEl) inchesEl.value = h % 12;
      }
    }
    if (profile.gender) document.getElementById("profile-gender").value = profile.gender;
    if (profile.goal)   document.getElementById("profile-goal").value   = profile.goal;
    const bcEl = document.getElementById("profile-bodycomp");
    if (bcEl) bcEl.value = profile.bodyCompGoal || "maintain";
  } catch { /* ignore */ }
}


/* =====================================================================
   SETTINGS — TRAINING ZONES
   ===================================================================== */

function saveTrainingZonesSettings() {
  let zones = {};
  try { zones = JSON.parse(localStorage.getItem("trainingZones")) || {}; } catch {}

  // Threshold refresh tracking (SPEC §3.4): stamp the profile with per-
  // threshold *Updated timestamps so the staleness banner can show
  // ages-ago numbers without duplicating zone storage.
  const nowIso = new Date().toISOString();
  let profile = {};
  try { profile = JSON.parse(localStorage.getItem("profile")) || {}; } catch {}
  let profileTouched = false;

  const easy = document.getElementById("zone-run-easy")?.value.trim();
  const tempo = document.getElementById("zone-run-tempo")?.value.trim();
  const vo2 = document.getElementById("zone-run-vo2")?.value.trim();
  if (easy || tempo || vo2) {
    zones.running = zones.running || {};
    zones.running.easy = easy || "";
    zones.running.tempo = tempo || "";
    zones.running.vo2max = vo2 || "";
    zones.running.source = "settings";
    zones.running.lastUpdated = new Date().toISOString().slice(0, 10);
    profile.thresholdPaceUpdated = nowIso;
    profileTouched = true;
  }

  const ftp = document.getElementById("zone-ftp")?.value;
  if (ftp) {
    zones.biking = zones.biking || {};
    zones.biking.ftp = parseInt(ftp) || null;
    zones.biking.source = "settings";
    zones.biking.lastUpdated = new Date().toISOString().slice(0, 10);
    profile.ftpUpdated = nowIso;
    profileTouched = true;
  }

  const maxHr = document.getElementById("zone-hr-max")?.value;
  const restHr = document.getElementById("zone-hr-rest")?.value;
  if (maxHr || restHr) {
    zones.heartRate = {
      max: parseInt(maxHr) || null,
      resting: parseInt(restHr) || null,
      source: "settings",
      lastUpdated: new Date().toISOString().slice(0, 10),
    };
    // Calculate 5-zone model using Karvonen formula
    if (zones.heartRate.max && zones.heartRate.resting) {
      const hrr = zones.heartRate.max - zones.heartRate.resting;
      zones.heartRate.zones = {
        z1: { min: Math.round(zones.heartRate.resting + hrr * 0.50), max: Math.round(zones.heartRate.resting + hrr * 0.60) },
        z2: { min: Math.round(zones.heartRate.resting + hrr * 0.60), max: Math.round(zones.heartRate.resting + hrr * 0.70) },
        z3: { min: Math.round(zones.heartRate.resting + hrr * 0.70), max: Math.round(zones.heartRate.resting + hrr * 0.80) },
        z4: { min: Math.round(zones.heartRate.resting + hrr * 0.80), max: Math.round(zones.heartRate.resting + hrr * 0.90) },
        z5: { min: Math.round(zones.heartRate.resting + hrr * 0.90), max: zones.heartRate.max },
      };
    }
  }

  localStorage.setItem("trainingZones", JSON.stringify(zones)); if (typeof DB !== 'undefined') DB.syncKey('trainingZones');
  if (profileTouched) {
    try { localStorage.setItem("profile", JSON.stringify(profile)); } catch {}
    if (typeof DB !== "undefined" && DB.profile && DB.profile.save) DB.profile.save(profile).catch(() => {});
  }
  const msg = document.getElementById("zones-save-msg");
  if (msg) { msg.style.color = "var(--color-success)"; msg.textContent = "Zones saved!"; setTimeout(() => { msg.textContent = ""; }, 3000); }
}

function loadZonesIntoForm() {
  try {
    const zones = JSON.parse(localStorage.getItem("trainingZones")) || {};
    if (zones.running) {
      if (zones.running.easy) document.getElementById("zone-run-easy").value = zones.running.easy;
      if (zones.running.tempo) document.getElementById("zone-run-tempo").value = zones.running.tempo;
      if (zones.running.vo2max) document.getElementById("zone-run-vo2").value = zones.running.vo2max;
    }
    if (zones.biking?.ftp) document.getElementById("zone-ftp").value = zones.biking.ftp;
    if (zones.heartRate?.max) document.getElementById("zone-hr-max").value = zones.heartRate.max;
    if (zones.heartRate?.resting) document.getElementById("zone-hr-rest").value = zones.heartRate.resting;
  } catch {}
}


/* =====================================================================
   SETTINGS — API KEY (removed — AI calls route through server-side proxy)
   ===================================================================== */


/* =====================================================================
   SETTINGS — DATA MANAGEMENT
   ===================================================================== */

function _refreshAllViews() {
  if (typeof renderRaceForm       === "function") renderRaceForm();
  if (typeof renderRaceEvents     === "function") renderRaceEvents();
  if (typeof renderTrainingInputs === "function") renderTrainingInputs();
  if (typeof renderTrainingConflicts === "function") renderTrainingConflicts();
  if (typeof renderCalendar       === "function") renderCalendar();
  if (typeof selectDay            === "function") selectDay(getTodayString());
  if (typeof renderWorkoutHistory === "function") renderWorkoutHistory();
  if (typeof isNutritionEnabled === "function" && isNutritionEnabled() && typeof renderTodaysSummary === "function") renderTodaysSummary();
  if (typeof isNutritionEnabled === "function" && isNutritionEnabled() && typeof renderNutritionHistory === "function") renderNutritionHistory();
  if (typeof renderFoodPreferences  === "function") renderFoodPreferences();
  if (typeof renderZones          === "function") renderZones();
  if (typeof renderGreeting       === "function") renderGreeting();
  updateStorageDisplay();
}

function clearFutureWorkouts() {
  const today = getTodayString();
  const todayCompleted = typeof hasAnyCompletedSession === "function" && hasAnyCompletedSession(today);
  const cutoff = todayCompleted ? today : (() => { const d = new Date(today + "T00:00:00"); d.setDate(d.getDate() - 1); return localDateStr(d); })();
  const label = todayCompleted ? "tomorrow" : "today";

  if (!confirm(`Remove all scheduled workouts from ${label} onward? This cannot be undone.`)) return;

  // workoutSchedule — keep up to cutoff
  try {
    const ws = JSON.parse(localStorage.getItem("workoutSchedule") || "[]");
    localStorage.setItem("workoutSchedule", JSON.stringify(ws.filter(w => w.date <= cutoff))); if (typeof DB !== 'undefined') DB.syncSchedule();
  } catch {}

  // trainingPlan — keep up to cutoff
  try {
    const tp = JSON.parse(localStorage.getItem("trainingPlan") || "[]");
    localStorage.setItem("trainingPlan", JSON.stringify(tp.filter(p => p.date <= cutoff))); if (typeof DB !== 'undefined') DB.syncTrainingPlan();
  } catch {}

  _refreshAllViews();
  showClearMsg("Future workouts removed.");
}

function clearRacesAndPlan() {
  if (!confirm("Delete all races and training plans? This cannot be undone.")) return;
  ["events", "trainingPlan", "workoutSchedule"].forEach(k => localStorage.removeItem(k));
  if (typeof initGymStrengthToggle === "function") initGymStrengthToggle();
  _refreshAllViews();
  showClearMsg("Races and training plan cleared.");
}

function clearAllData() {
  if (!confirm("Delete ALL data (workouts, meals, races, profile)? This cannot be undone.")) return;
  ["workouts", "meals", "events", "trainingPlan", "workoutSchedule", "trainingNotes",
   "profile", "foodPreferences", "nutritionAdjustments", "surveyComplete",
   "gymStrengthEnabled", "dayRestrictions", "personalRecords", "runningZones", "trainingZones",
   "hasOnboarded", "onboardingData", "hydrationEnabled", "nutritionEnabled",
   "hydrationLog", "hydrationSettings", "hydrationDailyTargetOz", "userLevel",
   "checkinHistory", "completedSessions", "savedWorkouts", "workoutRatings",
   "trainingPreferences", "commHiddenIds", "userSharedWorkouts", "importedPlans",
   "calendarSync", "_calPkceVerifier", "equipmentRestrictions", "yogaTypes",
   "fitnessGoals", "uxLevelOverride", "measurementSystem", "activeTab",
   "theme", "notifSettings", "notifLog", "adherenceDismissed",
   "subscription", "recentScans", "stravaAuth", "stravaLastSync",
   "stravaOauthState", "savedMealPlans", "activeChallenges",
   "completedChallenges", "workoutEffortFeedback", "calibrationSignals"].forEach(k => localStorage.removeItem(k));
  if (typeof initGymStrengthToggle === "function") initGymStrengthToggle();
  loadProfileIntoForm();
  _refreshAllViews();
  showClearMsg("All data cleared.");
}

function showClearMsg(text) {
  const msg = document.getElementById("settings-clear-msg");
  if (!msg) return;
  msg.style.color = "var(--color-success)";
  msg.textContent = text;
  setTimeout(() => { msg.textContent = ""; }, 3000);
}

function updateStorageDisplay() {
  try {
    let bytes = 0;
    for (const key of Object.keys(localStorage)) {
      bytes += (localStorage.getItem(key) || "").length * 2; // UTF-16
    }
    const kb = (bytes / 1024).toFixed(1);
    document.getElementById("storage-size").textContent = `${kb} KB used`;
  } catch { /* ignore */ }
}


/* =====================================================================
   DAILY GREETING
   ===================================================================== */

const DAILY_GREETINGS = [
  "Let's get after it",
  "Time to put in the work",
  "Ready to crush today",
  "Let's make today count",
  "Champions are built on days like this",
  "Your best session is ahead of you",
  "Let's build something great today",
  "Another day, another chance to improve",
  "Keep showing up — it pays off",
  "Do the work today, feel it tomorrow",
  "Every rep and every mile matters",
  "Push a little further today",
  "Consistency beats perfection",
  "No days off from becoming better",
  "You've got this",
  "Trust the process",
  "Today's effort is tomorrow's result",
  "Let's earn it today",
  "Good things come to those who train",
  "A little progress every day adds up",
  "Show up, work hard, repeat",
  "Let's go make it happen",
];

function renderGreeting() {
  const el = document.getElementById("home-greeting");
  if (!el) return;

  let name = "";
  try {
    const profile = JSON.parse(localStorage.getItem("profile")) || {};
    if (profile.name) name = `, ${profile.name}`;
  } catch { /* ignore */ }

  const now = new Date();
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  const msg = DAILY_GREETINGS[dayOfYear % DAILY_GREETINGS.length];

  let greetingHtml = `<span>${escHtml(msg + name + ".")}</span>`;
  if (typeof buildConsistencyBadge === "function") {
    greetingHtml += buildConsistencyBadge();
  }
  el.innerHTML = greetingHtml;
}


/* =====================================================================
   SETTINGS — TRAINING ZONES (Running · Biking · Swimming)
   ===================================================================== */

let _activeZonesSport = "running";

// ── Running: Jack Daniels VDOT method ─────────────────────────────────────────
const ZONE_CONFIG = [
  { num: 1, name: "Recovery",  pcts: [0.54, 0.62], desc: "Warmup · Cooldown · Very easy miles" },
  { num: 2, name: "Easy",      pcts: [0.62, 0.70], desc: "Base miles · Aerobic development" },
  { num: 3, name: "Tempo",     pcts: [0.83, 0.88], desc: "Comfortably hard · RPE 6–7" },
  { num: 4, name: "Threshold", pcts: [0.95, 1.00], desc: "Hard intervals · RPE 8" },
  { num: 5, name: "Speed",     pcts: [1.05, 1.15], desc: "Short reps · Race-specific" },
  { num: 6, name: "Max Sprint", pcts: [1.15, 1.30], desc: "All-out sprints · Neuromuscular" },
];

const ZONE_DISTANCES = {
  "Mile":          1609.344,
  "5K":            5000,
  "10K":           10000,
  "Half Marathon": 21097.5,
  "Marathon":      42195,
};

// ── Biking: FTP-based power zones ─────────────────────────────────────────────
const BIKING_ZONE_CONFIG = [
  { num: 1, name: "Recovery",    ftpPcts: [0,    0.55], desc: "Active recovery · Easy spinning" },
  { num: 2, name: "Endurance",   ftpPcts: [0.55, 0.75], desc: "Aerobic base · All-day effort" },
  { num: 3, name: "Tempo",       ftpPcts: [0.75, 0.90], desc: "Sustained effort · RPE 6–7" },
  { num: 4, name: "Threshold",   ftpPcts: [0.90, 1.05], desc: "Near FTP · RPE 8" },
  { num: 5, name: "VO2 Max",     ftpPcts: [1.05, 1.20], desc: "Hard intervals · RPE 9" },
];

// ── Swimming: CSS / T-Pace method ──────────────────────────────────────────────
// T-Pace = pace you can sustain for ~1500m; zones are multiples of T-Pace (per 100m)
const SWIMMING_ZONE_CONFIG = [
  { num: 1, name: "Recovery",   factor: [1.20, 9.99], desc: "Easy technical work · Warm-up · Cool-down" },
  { num: 2, name: "Endurance",  factor: [1.08, 1.20], desc: "Comfortable aerobic effort" },
  { num: 3, name: "Tempo",      factor: [1.03, 1.08], desc: "Sustained effort · RPE 6–7" },
  { num: 4, name: "Threshold",  factor: [1.00, 1.03], desc: "Near CSS / T-Pace · RPE 8" },
  { num: 5, name: "Race",       factor: [0.90, 1.00], desc: "Race speed · High intensity" },
];

// ── Storage ────────────────────────────────────────────────────────────────────
function loadTrainingZones(sport) {
  try {
    const all = JSON.parse(localStorage.getItem("trainingZones")) || {};
    // Migrate from legacy runningZones key
    if (!all.running) {
      const old = JSON.parse(localStorage.getItem("runningZones"));
      if (old) { all.running = old; localStorage.setItem("trainingZones", JSON.stringify(all)); if (typeof DB !== 'undefined') DB.syncKey('trainingZones'); }
    }
    // Backfill Z6 if running zones exist but z6 is missing
    if (all.running && all.running.zones && !all.running.zones.z6 && all.running.vdot) {
      const vdot = all.running.vdot;
      const z6Cfg = ZONE_CONFIG.find(z => z.num === 6);
      if (z6Cfg) {
        const T = 30; // dummy race duration — only vdot matters for velocity inversion
        const vo2 = vdot; // vdot ≈ VO2max for this purpose
        const a = 0.000104, b = 0.182258;
        const velAt = (p) => { const c = -(4.60 + p * vdot); return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a); };
        const toPace = (vel) => 1609.344 / vel;
        const fmt = (mp) => { let m = Math.floor(mp); let s = Math.round((mp - m) * 60); if (s >= 60) { m++; s -= 60; } return `${m}:${s < 10 ? "0" : ""}${s}`; };
        const vFast = velAt(z6Cfg.pcts[1]);
        const vSlow = velAt(z6Cfg.pcts[0]);
        all.running.zones.z6 = { paceRange: `${fmt(toPace(vFast))}–${fmt(toPace(vSlow))} /mi` };
        localStorage.setItem("trainingZones", JSON.stringify(all));
        if (typeof DB !== 'undefined') DB.syncKey('trainingZones');
      }
    }
    return all[sport] || null;
  } catch { return null; }
}

function saveTrainingZonesData(sport, data) {
  let all = {};
  try { all = JSON.parse(localStorage.getItem("trainingZones")) || {}; } catch {}
  const nowIso = new Date().toISOString();

  // Archive the PREVIOUS entry to history before overwriting — that
  // way the user's historical record shows the actual value they had
  // before, stamped with the date it was originally recorded. The
  // new entry does NOT go to history on save; it's the current
  // record until the next update, at which point it'll be archived.
  const previous = all[sport];
  if (previous && typeof previous === "object") {
    const wasChanged = _zoneEntryMaterialDiff(previous, data);
    if (wasChanged) {
      const prevDate = previous.calculatedAt || previous.updatedAt || previous.lastUpdated || nowIso;
      _appendZoneHistoryAt(sport, previous, prevDate);
    }
  }

  // MERGE rather than replace — partial updates from the Build Plan
  // threshold screen (e.g. only thresholdPace) shouldn't wipe out
  // fields the full Training Zones form set (referenceDist, vdot,
  // paceRange zones, etc). Spread existing first, new on top, then
  // stamp lastUpdated so the staleness banner respects the write.
  const merged = Object.assign({}, previous || {}, data, { lastUpdated: nowIso });
  all[sport] = merged;
  localStorage.setItem("trainingZones", JSON.stringify(all));
  // Flush to Supabase without the 2s debounce. Zones drive pacing
  // across every generator, so losing the most recent edit to a
  // refresh race means plans get built against stale thresholds. The
  // async flush is fire-and-forget here; callers that need a strong
  // guarantee (the save button's onSave) can `await DB.flushKey` after
  // calling this function.
  if (typeof DB !== 'undefined') {
    if (DB.flushKey) DB.flushKey('trainingZones');
    else DB.syncKey('trainingZones');
  }

  // Mirror the stamp onto the profile's per-sport field so the reminder's
  // primary candidate (profile.*Updated) is populated too.
  try {
    const profile = JSON.parse(localStorage.getItem("profile") || "{}");
    const profileField = {
      biking: "ftpUpdated",
      running: "thresholdPaceUpdated",
      swimming: "cssTimeUpdated",
      strength: "strengthThresholdUpdatedAt",
    }[sport];
    if (profileField) {
      profile[profileField] = nowIso;
      localStorage.setItem("profile", JSON.stringify(profile));
      if (typeof DB !== 'undefined') {
        if (DB.flushKey) DB.flushKey('profile');
        else DB.syncKey('profile');
      }
    }
  } catch {}
}

// Returns true if the incoming data materially differs from the prior
// entry on any threshold-relevant field. Used by saveTrainingZonesData
// to decide whether the previous entry is worth archiving. Ignores
// `lastUpdated` / `calculatedAt` / `source` so re-saves with the same
// values don't spam history.
function _zoneEntryMaterialDiff(prev, next) {
  const fields = [
    "thresholdPace", "vdot", "referenceDist", "referenceTime",
    "ftp", "css", "cssPace", "tPaceSec", "tPaceStr",
    // strength lifts are objects themselves — compare via JSON
    "squat", "bench", "deadlift", "ohp", "row",
  ];
  for (const f of fields) {
    const a = prev ? prev[f] : undefined;
    const b = next ? next[f] : undefined;
    // If the new save doesn't mention this field, it's preserved via the
    // Object.assign merge in saveTrainingZonesData — that isn't a change
    // from the user's perspective. Previously this counted as a diff and
    // caused the survey (which saves with a smaller field set than the
    // Training Zones UI) to archive a new history row on every Confirm,
    // producing 20+ duplicate entries with identical values.
    if (b === undefined) continue;
    if (a === undefined && b === undefined) continue;
    const as = typeof a === "object" ? JSON.stringify(a) : String(a == null ? "" : a);
    const bs = typeof b === "object" ? JSON.stringify(b) : String(b == null ? "" : b);
    if (as !== bs) return true;
  }
  return false;
}

// Push a historical snapshot with an explicit date (rather than "now").
// Used when archiving a previous zone entry so the history shows the
// date the value was actually recorded, not the moment we replaced it.
function _appendZoneHistoryAt(sport, data, dateIso) {
  let history = [];
  try { history = JSON.parse(localStorage.getItem("trainingZonesHistory")) || []; } catch {}
  // entry.date is the EFFECTIVE date of the previous values (when they
  // were originally recorded). entry.archivedAt is when the archival
  // happened (i.e., when the user replaced those values with new ones).
  // Coach views need archivedAt to filter "updates since this client
  // joined me" — without it, an athlete who joins a coach in April but
  // updates their bench in May, where the previous values dated to
  // March, would never surface in the coach's history feed because
  // entry.date (March) predates the coaching relationship (April).
  history.push({
    sport,
    date: dateIso || new Date().toISOString(),
    archivedAt: new Date().toISOString(),
    data: JSON.parse(JSON.stringify(data)),
  });
  localStorage.setItem("trainingZonesHistory", JSON.stringify(history));
  if (typeof DB !== 'undefined') DB.syncKey('trainingZonesHistory');
}

function _appendZoneHistory(sport, data) {
  let history = [];
  try { history = JSON.parse(localStorage.getItem("trainingZonesHistory")) || []; } catch {}
  const entry = {
    sport,
    date: new Date().toISOString(),
    data: JSON.parse(JSON.stringify(data)),
  };
  history.push(entry);
  localStorage.setItem("trainingZonesHistory", JSON.stringify(history));
  if (typeof DB !== 'undefined') DB.syncKey('trainingZonesHistory');
}

function _getZoneHistory(sport) {
  let history = [];
  try { history = JSON.parse(localStorage.getItem("trainingZonesHistory")) || []; } catch {}
  const sorted = history.filter(h => h.sport === sport).sort((a, b) => new Date(b.date) - new Date(a.date));

  // Collapse consecutive identical snapshots into one. An older version of
  // _zoneEntryMaterialDiff treated "field missing in new save" as a change
  // and archived a duplicate on every survey Confirm; those duplicates are
  // still in storage even after the diff check was fixed. Hiding them from
  // render avoids 20+ identical rows without a destructive cleanup pass.
  const fp = (entry) => {
    const d = entry && entry.data || {};
    return JSON.stringify({
      thresholdPace: d.thresholdPace, vdot: d.vdot,
      referenceDist: d.referenceDist, referenceTime: d.referenceTime,
      ftp: d.ftp, css: d.css, cssPace: d.cssPace,
      tPaceSec: d.tPaceSec, tPaceStr: d.tPaceStr,
      squat: d.squat, bench: d.bench, deadlift: d.deadlift, ohp: d.ohp, row: d.row,
    });
  };
  const out = [];
  let lastFp = null;
  for (const h of sorted) {
    const f = fp(h);
    if (f === lastFp) continue;
    out.push(h);
    lastFp = f;
  }
  return out;
}

function deleteZoneHistoryEntry(dateISO) {
  let history = [];
  try { history = JSON.parse(localStorage.getItem("trainingZonesHistory")) || []; } catch {}
  history = history.filter(h => h.date !== dateISO);
  localStorage.setItem("trainingZonesHistory", JSON.stringify(history));
  if (typeof DB !== 'undefined') DB.syncKey('trainingZonesHistory');

  // Remove the row from the DOM in place and update the counter,
  // rather than calling renderZones() which rebuilds the section
  // and collapses the Zone History expander on every click.
  const section = document.querySelector(".zone-history-section");
  if (!section) { renderZones(); return; }
  const rows = section.querySelectorAll(".zone-history-row");
  for (const row of rows) {
    const btn = row.querySelector(".zone-history-delete");
    if (btn && btn.getAttribute("onclick") && btn.getAttribute("onclick").indexOf(dateISO) >= 0) {
      row.remove();
      break;
    }
  }
  const remaining = section.querySelectorAll(".zone-history-row").length;
  const header = section.querySelector(".zone-history-header span:first-child");
  if (header) header.textContent = "Zone History (" + remaining + ")";
  // If nothing left, drop the whole section so it doesn't linger empty.
  if (remaining === 0) section.remove();
}

function _renderZoneHistoryRow(entry) {
  const d = new Date(entry.date);
  const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const data = entry.data;
  let detail = "";

  if (entry.sport === "running") {
    detail = `${data.referenceDist} in ${data.referenceTime} &middot; VDOT ${data.vdot}`;
  } else if (entry.sport === "biking") {
    detail = `FTP: ${data.ftp} W`;
  } else if (entry.sport === "swimming") {
    detail = `T-Pace: ${data.tPaceStr} /100m (${data.referenceDist} in ${data.referenceTime})`;
  } else if (entry.sport === "strength") {
    const lifts = ["bench","squat","deadlift","ohp","row"]
      .filter(k => data[k]?.weight)
      .map(k => {
        const labels = { bench: "BP", squat: "SQ", deadlift: "DL", ohp: "OHP", row: "Row" };
        return `${labels[k]} ${data[k].weight}`;
      });
    detail = lifts.join(" / ") || "No lifts recorded";
  }

  const safeDate = entry.date.replace(/'/g, "\\'");
  return `<div class="zone-history-row">
    <span class="zone-history-date">${dateStr}</span>
    <span class="zone-history-detail">${detail}</span>
    <button class="zone-history-delete" title="Remove" onclick="event.stopPropagation(); deleteZoneHistoryEntry('${safeDate}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4c0-1.1.9-2 2-2h4a2 2 0 012 2v2"/><path d="M19 6v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button>
  </div>`;
}

function _buildZoneHistoryHTML(sport) {
  const history = _getZoneHistory(sport);
  // _appendZoneHistoryAt only archives PREVIOUS values during a save —
  // nothing in trainingZonesHistory ever represents the current entry.
  // The earlier slice(1) here was leftover from a deprecated path that
  // also pushed a "current" snapshot, so for sports with a single
  // archived entry (typical right after a first update — e.g. strength
  // archived once when the user updated bench from 275 → 285) the
  // section rendered empty even though one valid past row existed.
  if (!history.length) return "";

  const rows = history.slice(0, 20).map(e => _renderZoneHistoryRow(e)).join("");
  return `
    <div class="zone-history-section">
      <div class="zone-history-header" onclick="this.parentElement.classList.toggle('is-expanded')">
        <span>Zone History (${history.length})</span>
        <span class="card-chevron">▾</span>
      </div>
      <div class="zone-history-list">${rows}</div>
    </div>`;
}

// Keep legacy functions so calendar.js still works
function loadRunningZones() { return loadTrainingZones("running"); }
function saveRunningZonesData(data) { saveTrainingZonesData("running", data); }

/**
 * Computes Z1–Z5 training pace ranges (min/mile) from a race performance
 * using the Jack Daniels VDOT method.
 */
function computeRunningZones(distMeters, totalSeconds) {
  const T   = totalSeconds / 60;
  const v   = distMeters / T;  // m/min
  const vo2 = -4.60 + 0.182258 * v + 0.000104 * v * v;
  const pct = 0.8 + 0.1894393 * Math.exp(-0.012778 * T) + 0.2989558 * Math.exp(-0.1932605 * T);
  const vdot = vo2 / pct;

  // Invert the VO2-velocity curve: solve 0.000104v² + 0.182258v − (4.60 + p·VDOT) = 0
  function velocityAt(p) {
    const a = 0.000104, b = 0.182258, c = -(4.60 + p * vdot);
    return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
  }

  function toPacePerMile(vel) { return 1609.344 / vel; }

  function fmt(minPerMile) {
    let m = Math.floor(minPerMile);
    let s = Math.round((minPerMile - m) * 60);
    if (s >= 60) { m += 1; s -= 60; }
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  }

  const zones = {};
  for (const z of ZONE_CONFIG) {
    // Higher % = faster pace; lower % = slower pace
    const vFast = velocityAt(z.pcts[1]);
    const vSlow = velocityAt(z.pcts[0]);
    zones[`z${z.num}`] = {
      paceRange: `${fmt(toPacePerMile(vFast))}–${fmt(toPacePerMile(vSlow))} /mi`,
    };
  }

  return { vdot: Math.round(vdot * 10) / 10, zones };
}

/** Biking: derives Z1–Z5 watt ranges from FTP */
function computeBikingZones(ftp) {
  const zones = {};
  for (const z of BIKING_ZONE_CONFIG) {
    const lo = Math.round(ftp * z.ftpPcts[0]);
    const hi = z.ftpPcts[1] >= 9 ? null : Math.round(ftp * z.ftpPcts[1]);
    zones[`z${z.num}`] = {
      wattRange: lo === 0 ? `< ${Math.round(ftp * z.ftpPcts[1])} W` :
                 hi === null ? `> ${lo} W` :
                 `${lo}–${hi} W`,
    };
  }
  return { ftp, zones };
}

/** Swimming: derives Z1–Z5 pace ranges (per 100m) from a 400m swim time */
function computeSwimmingZones(swim400Seconds) {
  // T-Pace = 400m time / 4 (seconds per 100m)
  const tPaceSec = swim400Seconds / 4;

  function fmtPace(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  }

  const zones = {};
  for (const z of SWIMMING_ZONE_CONFIG) {
    const fast = tPaceSec * z.factor[0];
    const slow = z.factor[1] >= 9 ? null : tPaceSec * z.factor[1];
    zones[`z${z.num}`] = {
      paceRange: slow === null
        ? `> ${fmtPace(fast)} /100m`
        : `${fmtPace(fast)}–${fmtPace(slow)} /100m`,
    };
  }
  return { tPaceSec, zones };
}

function selectZonesSport(sport) {
  _activeZonesSport = sport;
  renderZones();
}

function renderRunningZones() { renderZones(); } // legacy alias

// Seed zone history with existing data on first render (one-time migration)
function _seedZoneHistoryIfNeeded() {
  if (localStorage.getItem("_zoneHistorySeeded")) return;
  let all = {};
  try { all = JSON.parse(localStorage.getItem("trainingZones")) || {}; } catch {}
  for (const sport of ["running", "biking", "swimming", "strength"]) {
    if (all[sport]) {
      const existing = _getZoneHistory(sport);
      if (existing.length === 0) {
        const date = all[sport].calculatedAt || all[sport].updatedAt || new Date().toISOString();
        let history = [];
        try { history = JSON.parse(localStorage.getItem("trainingZonesHistory")) || []; } catch {}
        history.push({ sport, date, data: JSON.parse(JSON.stringify(all[sport])) });
        localStorage.setItem("trainingZonesHistory", JSON.stringify(history));
      }
    }
  }
  localStorage.setItem("_zoneHistorySeeded", "true");
}

function renderZones() {
  _seedZoneHistoryIfNeeded();
  const el = document.getElementById("zones-content");
  if (!el) return;

  const sport = _activeZonesSport;
  const sportLabels = { running: "Running", biking: "Biking", swimming: "Swimming", strength: "Strength" };

  const tabs = ["running", "biking", "swimming", "strength"].map(s => `
    <button class="zones-tab ${sport === s ? "is-active" : ""}" onclick="selectZonesSport('${s}')">${sportLabels[s]}</button>
  `).join("");

  // ── Strength tab ────────────────────────────────────────────────────────────
  if (sport === "strength") {
    const stored = loadTrainingZones("strength");
    const lifts = [
      { key: "bench",    label: "Bench Press" },
      { key: "squat",    label: "Back Squat" },
      { key: "deadlift", label: "Deadlift" },
      { key: "ohp",      label: "Overhead Press" },
      { key: "row",      label: "Barbell Row" },
    ];

    if (!stored) {
      el.innerHTML = `
        <div class="zones-tabs">${tabs}</div>
        <p class="hint" style="margin:16px 0">Enter your reference lifts so IronZ can recommend accurate weights when generating workouts.</p>
        <button class="btn-primary" onclick="openUpdateZonesForm()">Set Lifts</button>
        <div id="zones-form-area"></div>`;
      return;
    }

    const rows = lifts.map(l => {
      const d = stored[l.key];
      if (!d || !d.weight) return "";
      return `<div class="zone-row">
        <div class="zone-row-info"><span class="zone-row-name">${l.label}</span></div>
        <span class="zone-row-pace">${getMeasurementSystem() === "metric" ? (Math.round(d.weight * 0.453592 / 2) * 2) + " kg" : (Math.round(d.weight / 5) * 5) + " lbs"} &nbsp;·&nbsp; ${d.type === "1rm" ? "1-rep max" : d.type === "5rm" ? "5-rep max" : "10-rep max"}</span>
      </div>`;
    }).join("");

    const dateLabel = stored.updatedAt
      ? new Date(stored.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "";

    el.innerHTML = `
      <div class="zones-tabs">${tabs}</div>
      ${dateLabel ? `<div class="zones-ref-line">Updated ${dateLabel}</div>` : ""}
      <div class="zones-table">${rows || "<p class='hint'>No lifts recorded yet.</p>"}</div>
      <button class="btn-secondary zones-update-btn" onclick="openUpdateZonesForm()">Update Lifts</button>
      <div id="zones-form-area"></div>
      ${_buildZoneHistoryHTML("strength")}`;
    return;
  }

  const stored = loadTrainingZones(sport);

  const emptyMsg = {
    running:  "Enter a recent race or time trial to calculate running pace zones.",
    biking:   "Enter your FTP (Functional Threshold Power) to calculate cycling power zones.",
    swimming: "Enter a 400m swim time to calculate training pace zones.",
  }[sport];

  if (!stored) {
    el.innerHTML = `
      <div class="zones-tabs">${tabs}</div>
      <p class="hint" style="margin:16px 0">${emptyMsg}</p>
      <button class="btn-primary" onclick="openUpdateZonesForm()">Set Zones</button>
      <div id="zones-form-area"></div>`;
    return;
  }

  // Build zone rows based on sport
  const configs = sport === "biking" ? BIKING_ZONE_CONFIG : sport === "swimming" ? SWIMMING_ZONE_CONFIG : ZONE_CONFIG;
  const zoneRows = configs.map(z => {
    const zData = stored.zones[`z${z.num}`] || {};
    const val = zData.paceRange || zData.wattRange || "—";
    return `
      <div class="zone-row">
        <span class="zone-row-badge zone-${z.num}">Z${z.num}</span>
        <div class="zone-row-info">
          <span class="zone-row-name">${z.name}</span>
          <span class="zone-row-desc">${z.desc}</span>
        </div>
        <span class="zone-row-pace">${val}</span>
      </div>`;
  }).join("");

  const dateLabel = stored.calculatedAt
    ? new Date(stored.calculatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "";

  let refLine = "";
  if (sport === "running")  refLine = `Based on ${stored.referenceDist} in ${stored.referenceTime} &nbsp;·&nbsp; VDOT ${stored.vdot}`;
  if (sport === "biking")   refLine = `FTP: ${stored.ftp} W`;
  if (sport === "swimming") refLine = `T-Pace: ${stored.tPaceStr} /100m (from ${stored.referenceDist})`;
  if (dateLabel) refLine += ` &nbsp;·&nbsp; Updated ${dateLabel}`;

  el.innerHTML = `
    <div class="zones-tabs">${tabs}</div>
    <div class="zones-ref-line">${refLine}</div>
    <div class="zones-table">${zoneRows}</div>
    <button class="btn-secondary zones-update-btn" onclick="openUpdateZonesForm()">Update Zones</button>
    <div id="zones-form-area"></div>
    ${_buildZoneHistoryHTML(sport)}`;
}

function openUpdateZonesForm() {
  const area = document.getElementById("zones-form-area");
  if (!area) return;

  const sport = _activeZonesSport;

  if (sport === "strength") {
    const stored = loadTrainingZones("strength") || {};
    const lifts = [
      { key: "bench",    label: "Bench Press" },
      { key: "squat",    label: "Back Squat" },
      { key: "deadlift", label: "Deadlift" },
      { key: "ohp",      label: "Overhead Press" },
      { key: "row",      label: "Barbell Row" },
    ];
    const typeOpts = (sel) => ["1rm","5rm","10rm"].map(v =>
      `<option value="${v}" ${sel === v ? "selected" : ""}>${v === "1rm" ? "1-rep max" : v === "5rm" ? "5-rep max" : "10-rep max"}</option>`
    ).join("");

    const rows = lifts.map(l => {
      const d = stored[l.key] || {};
      return `<div class="strength-ref-row">
        <span class="strength-ref-label">${l.label}</span>
        <input type="number" id="sref-${l.key}" placeholder="lbs" min="0" max="2000"
          value="${d.weight || ""}" class="zones-time-field" style="width:80px" />
        <select id="sref-type-${l.key}" style="width:120px">${typeOpts(d.type || "1rm")}</select>
      </div>`;
    }).join("");

    area.innerHTML = `
      <div class="zones-form" style="margin-top:16px">
        <p class="hint" style="margin-bottom:12px">Leave blank any lifts you don't track.</p>
        ${rows}
        <div class="zones-form-actions" style="margin-top:16px">
          <button class="btn-primary" onclick="saveZonesFromForm()">Save Lifts</button>
          <button class="btn-secondary" onclick="document.getElementById('zones-form-area').innerHTML=''">Cancel</button>
        </div>
        <p id="zones-calc-msg" class="save-msg" style="margin-top:8px"></p>
      </div>`;
    return;
  }

  if (sport === "biking") {
    area.innerHTML = `
      <div class="zones-form">
        <div class="form-row">
          <label>FTP (Functional Threshold Power)</label>
          <div class="zones-time-inputs">
            <input type="number" id="zones-ftp" min="50" max="600" placeholder="e.g. 250"
              class="zones-time-field" style="width:100px" />
            <span class="zones-time-sep" style="margin-left:6px">W</span>
          </div>
          <p class="hint" style="margin-top:4px">Your average power you can sustain for ~1 hour. Use a 20-min test × 0.95 if needed.</p>
        </div>
        <div class="zones-form-actions">
          <button class="btn-primary" onclick="saveZonesFromForm()">Calculate &amp; Save</button>
          <button class="btn-secondary" onclick="document.getElementById('zones-form-area').innerHTML=''">Cancel</button>
        </div>
        <p id="zones-calc-msg" class="save-msg" style="margin-top:8px"></p>
      </div>`;
    return;
  }

  if (sport === "swimming") {
    area.innerHTML = `
      <div class="zones-form">
        <div class="form-row">
          <label>400m swim time</label>
          <div class="zones-time-inputs">
            <input type="number" id="zones-m" min="0" max="59" placeholder="mm" class="zones-time-field" />
            <span class="zones-time-sep">:</span>
            <input type="number" id="zones-s" min="0" max="59" placeholder="ss" class="zones-time-field" />
          </div>
          <p class="hint" style="margin-top:4px">Swim 400m at a strong, sustained effort. T-pace is derived automatically.</p>
        </div>
        <div class="zones-form-actions">
          <button class="btn-primary" onclick="saveZonesFromForm()">Calculate &amp; Save</button>
          <button class="btn-secondary" onclick="document.getElementById('zones-form-area').innerHTML=''">Cancel</button>
        </div>
        <p id="zones-calc-msg" class="save-msg" style="margin-top:8px"></p>
      </div>`;
    return;
  }

  // Running (default)
  const distOpts = Object.keys(ZONE_DISTANCES).map(d => `<option value="${d}">${d}</option>`).join("");
  area.innerHTML = `
    <div class="zones-form">
      <div class="form-row">
        <label>Race or time trial distance</label>
        <select id="zones-dist-select" onchange="zonesUpdateTimeFields()">${distOpts}</select>
      </div>
      <div class="form-row">
        <label>Finish time</label>
        <div class="zones-time-inputs">
          <input type="number" id="zones-h" min="0" max="9" placeholder="h"
            class="zones-time-field zones-time-field--h" style="display:none" />
          <input type="number" id="zones-m" min="0" max="59" placeholder="mm" class="zones-time-field" />
          <span class="zones-time-sep">:</span>
          <input type="number" id="zones-s" min="0" max="59" placeholder="ss" class="zones-time-field" />
        </div>
      </div>
      <div class="zones-form-actions">
        <button class="btn-primary" onclick="saveZonesFromForm()">Calculate &amp; Save</button>
        <button class="btn-secondary" onclick="document.getElementById('zones-form-area').innerHTML=''">Cancel</button>
      </div>
      <p id="zones-calc-msg" class="save-msg" style="margin-top:8px"></p>
    </div>`;
  zonesUpdateTimeFields();
}

function zonesUpdateTimeFields() {
  const dist = document.getElementById("zones-dist-select")?.value;
  const hEl  = document.getElementById("zones-h");
  if (!hEl) return;
  hEl.style.display = (dist === "Half Marathon" || dist === "Marathon") ? "inline-block" : "none";
}

// Spec §6: within 30 days of an A race, logging a threshold test is
// allowed but gets a soft warning. Testing this close to race day costs
// more in fatigue than it gains in data. Returns days until race, or
// null when there's no A race in the next 30 days.
function _daysToNearestARaceForThresholds() {
  let events = [];
  try { events = JSON.parse(localStorage.getItem("events") || "[]") || []; } catch {}
  if (!Array.isArray(events) || events.length === 0) return null;
  const todayMs = new Date().setHours(0, 0, 0, 0);
  let nearest = null;
  for (const ev of events) {
    if (!ev || !ev.date) continue;
    const priority = String(ev.priority || "A").toUpperCase();
    if (priority !== "A") continue;
    const raceMs = new Date(ev.date + "T00:00:00").setHours(0, 0, 0, 0);
    const days = Math.floor((raceMs - todayMs) / 86400000);
    if (days >= 0 && days <= 30) {
      if (nearest == null || days < nearest) nearest = days;
    }
  }
  return nearest;
}

function saveZonesFromForm() {
  const msg  = document.getElementById("zones-calc-msg");
  const sport = _activeZonesSport;

  // Soft warning: A race within 30 days. User can proceed — this isn't
  // a block, just an advisory. Surfaced for every sport except strength
  // (strength lifts don't carry the same race-day fatigue cost).
  if (sport !== "strength") {
    const daysToRace = _daysToNearestARaceForThresholds();
    if (daysToRace != null) {
      const whenLabel = daysToRace === 0 ? "race day" :
                        daysToRace === 1 ? "tomorrow" :
                        `in ${daysToRace} days`;
      const proceed = confirm(
        "You're within 30 days of race day (" + whenLabel + "). " +
        "Threshold testing this close to your race may cost more in fatigue than you gain in data. " +
        "Your current zones are solid — trust your training.\n\n" +
        "Log this test anyway?"
      );
      if (!proceed) {
        if (msg) { msg.style.color = "var(--color-text-muted)"; msg.textContent = "Test cancelled — your zones stay as they were."; }
        return;
      }
    }
  }

  if (sport === "strength") {
    const lifts = ["bench","squat","deadlift","ohp","row"];
    const data = { updatedAt: new Date().toISOString() };
    lifts.forEach(k => {
      const w = parseInt(document.getElementById(`sref-${k}`)?.value || "0");
      if (w > 0) {
        data[k] = {
          weight: w,
          type: document.getElementById(`sref-type-${k}`)?.value || "1rm",
        };
      }
    });
    saveTrainingZonesData("strength", data);
    renderZones();
    // BUGFIX 04-25 §2: PR change → re-derive weights on every planned
    // strength session from today onward. Only auto-generated weights
    // get refreshed; user edits are preserved.
    if (typeof window.recomputePlannedStrengthSessions === "function") {
      try {
        const touched = window.recomputePlannedStrengthSessions();
        if (touched > 0 && msg) {
          msg.style.color = "var(--color-success)";
          msg.textContent = `Updated ${touched} upcoming session${touched === 1 ? "" : "s"} with your new max.`;
        }
      } catch (e) { console.warn("[IronZ] recompute strength sessions failed:", e && e.message); }
    }
    return;
  }

  if (sport === "biking") {
    const ftp = parseInt(document.getElementById("zones-ftp")?.value || "0");
    if (!ftp || ftp < 50) {
      if (msg) { msg.style.color = "var(--color-danger)"; msg.textContent = "Please enter a valid FTP (50–600 W)."; }
      return;
    }
    const { zones } = computeBikingZones(ftp);
    saveTrainingZonesData("biking", { ftp, zones, calculatedAt: new Date().toISOString() });
    renderZones();
    if (typeof renderCalendar === "function") renderCalendar();
    if (typeof selectedDate !== "undefined" && selectedDate && typeof selectDay === "function") selectDay(selectedDate);
    return;
  }

  if (sport === "swimming") {
    const mEl = document.getElementById("zones-m");
    const sEl = document.getElementById("zones-s");
    const m = parseInt(mEl?.value || "0") || 0;
    const s = parseInt(sEl?.value || "0") || 0;
    const totalSeconds = m * 60 + s;
    if (totalSeconds < 30) {
      if (msg) { msg.style.color = "var(--color-danger)"; msg.textContent = "Please enter a valid 400m swim time."; }
      return;
    }
    const { tPaceSec, zones } = computeSwimmingZones(totalSeconds);
    const tMin = Math.floor(tPaceSec / 60);
    const tSec = Math.round(tPaceSec % 60);
    const tPaceStr = `${tMin}:${tSec < 10 ? "0" : ""}${tSec}`;
    const mStr = String(m), sStr = String(s).padStart(2, "0");
    saveTrainingZonesData("swimming", {
      referenceDist: "400m", referenceTime: `${mStr}:${sStr}`, tPaceSec, tPaceStr, zones,
      // Mirror to `css` so consumers that only check swimming.css
      // (threshold-reminders, sport-levels, swim-workout-generator default
      // path) see the same value as consumers that read tPaceSec.
      css: tPaceSec, cssPace: tPaceSec,
      calculatedAt: new Date().toISOString(),
    });
    renderZones();
    if (typeof renderCalendar === "function") renderCalendar();
    if (typeof selectedDate !== "undefined" && selectedDate && typeof selectDay === "function") selectDay(selectedDate);
    return;
  }

  // Running
  const dist = document.getElementById("zones-dist-select")?.value;
  const hEl  = document.getElementById("zones-h");
  const mEl  = document.getElementById("zones-m");
  const sEl  = document.getElementById("zones-s");
  if (!dist || !mEl || !sEl) return;
  const h = parseInt(hEl?.value || "0") || 0;
  const m = parseInt(mEl.value  || "0") || 0;
  const s = parseInt(sEl.value  || "0") || 0;
  const totalSeconds = h * 3600 + m * 60 + s;
  if (totalSeconds < 60) {
    if (msg) { msg.style.color = "var(--color-danger)"; msg.textContent = "Please enter a valid finish time."; }
    return;
  }
  const distMeters = ZONE_DISTANCES[dist];
  if (!distMeters) return;
  const { vdot, zones } = computeRunningZones(distMeters, totalSeconds);
  const hStr = h > 0 ? `${h}:` : "";
  const mStr = h > 0 ? String(m).padStart(2, "0") : String(m);
  const sStr = String(s).padStart(2, "0");
  saveTrainingZonesData("running", {
    referenceDist: dist, referenceTime: `${hStr}${mStr}:${sStr}`, vdot, zones,
    calculatedAt: new Date().toISOString(),
  });
  renderZones();
  if (typeof renderCalendar === "function") renderCalendar();
  if (typeof selectedDate !== "undefined" && selectedDate && typeof selectDay === "function") selectDay(selectedDate);
}
