// analytics.js — Lightweight event tracking to Supabase analytics_events table
// Fire-and-forget: never blocks UI, never throws to caller.

/* =====================================================================
   SESSION + PLATFORM
   ===================================================================== */

function _getAnalyticsSessionId() {
  let sid = sessionStorage.getItem("analytics_session_id");
  if (!sid) {
    sid = crypto.randomUUID();
    sessionStorage.setItem("analytics_session_id", sid);
  }
  return sid;
}

function _getAnalyticsPlatform() {
  return (window.Capacitor && window.Capacitor.isNativePlatform()) ? "ios" : "web";
}

// Debug mode: when `localStorage.ironz_debug === "true"`, every tracked event
// is mirrored to the browser console so devs can verify wiring without having
// to query the analytics_events table in Supabase.
function _isAnalyticsDebug() {
  try { return localStorage.getItem("ironz_debug") === "true"; } catch { return false; }
}

/* =====================================================================
   CORE: trackEvent
   ===================================================================== */

function trackEvent(name, properties) {
  try {
    if (_isAnalyticsDebug()) {
      try { console.log("trackEvent:", name, properties || {}); } catch {}
    }

    const client = window.supabaseClient;
    if (!client) return;

    client.auth.getSession().then(({ data }) => {
      const userId = data?.session?.user?.id;
      if (!userId) return;

      client.from("analytics_events").insert({
        user_id: userId,
        event_name: name,
        properties: properties || {},
        session_id: _getAnalyticsSessionId(),
        platform: _getAnalyticsPlatform(),
      }).then(() => {}, () => {}); // swallow errors silently
    }).catch(() => {});
  } catch {
    // never throw
  }
}

// Shim for the modern workout-sharing flow and saved-workouts-library, which
// call `window.IronZAnalytics.track(event, payload)`. Delegates to trackEvent
// so both call sites land in analytics_events.
if (typeof window !== "undefined") {
  window.IronZAnalytics = window.IronZAnalytics || {
    track: (event, payload) => trackEvent(event, payload),
  };
}

// Fires once per browser session (sessionStorage flag). Call from app init
// after auth lands. A re-invocation within the same session is a no-op.
function trackSessionStarted() {
  try {
    if (sessionStorage.getItem("analytics_session_started") === "1") return;
    sessionStorage.setItem("analytics_session_started", "1");
    trackEvent("session_started", { platform: _getAnalyticsPlatform() });
  } catch {
    // never throw
  }
}

/* =====================================================================
   PROFILE UPDATES
   ===================================================================== */

// Mirror the current local state of the nutrition / hydration / fueling
// toggles into profiles.feature_toggles. Call after flipping any toggle —
// reads fresh values from localStorage so the caller doesn't need to pass
// anything in. The whole JSON object is replaced on each write.
function syncFeatureToggles() {
  try {
    const toggles = {
      nutrition: localStorage.getItem("nutritionEnabled") !== "0",
      hydration: localStorage.getItem("hydrationEnabled") !== "0",
      fueling:   localStorage.getItem("fuelingEnabled")   !== "0",
    };

    if (_isAnalyticsDebug()) {
      try { console.log("syncFeatureToggles:", toggles); } catch {}
    }

    const client = window.supabaseClient;
    if (!client) return;

    client.auth.getSession().then(({ data }) => {
      const userId = data?.session?.user?.id;
      if (!userId) return;

      client.from("profiles").update({
        feature_toggles: toggles,
      }).eq("id", userId).then(() => {}, () => {});
    }).catch(() => {});
  } catch {
    // never throw
  }
}

function updateLastActive() {
  try {
    const client = window.supabaseClient;
    if (!client) return;

    client.auth.getSession().then(({ data }) => {
      const userId = data?.session?.user?.id;
      if (!userId) return;

      client.from("profiles").update({
        last_active_at: new Date().toISOString(),
      }).eq("id", userId).then(() => {}, () => {});
    }).catch(() => {});
  } catch {
    // never throw
  }
}

function _incrementProfileCounter(field, extraUpdates) {
  try {
    const client = window.supabaseClient;
    if (!client) return;

    client.auth.getSession().then(({ data }) => {
      const userId = data?.session?.user?.id;
      if (!userId) return;

      // Read current value, increment, write back
      client.from("profiles").select(field).eq("id", userId).single().then(({ data: row }) => {
        const current = (row && row[field]) || 0;
        const updates = { [field]: current + 1, ...(extraUpdates || {}) };
        client.from("profiles").update(updates).eq("id", userId).then(() => {}, () => {});
      }).catch(() => {});
    }).catch(() => {});
  } catch {
    // never throw
  }
}

/* =====================================================================
   STREAK CALCULATION
   ===================================================================== */

function _updateWorkoutStreak() {
  try {
    const client = window.supabaseClient;
    if (!client) return;

    client.auth.getSession().then(({ data }) => {
      const userId = data?.session?.user?.id;
      if (!userId) return;

      // Calculate streak from local workoutSchedule data
      const schedule = JSON.parse(localStorage.getItem("workoutSchedule") || "[]");
      const workouts = JSON.parse(localStorage.getItem("workouts") || "[]");

      // Combine completed dates
      const completedDates = new Set();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      schedule.forEach(w => {
        if (w.date && new Date(w.date) <= today) completedDates.add(w.date);
      });
      workouts.forEach(w => {
        if (w.date) completedDates.add(w.date);
      });

      // Count streak backwards from today
      let streak = 0;
      const d = new Date(today);
      while (true) {
        const ds = d.toISOString().slice(0, 10);
        if (completedDates.has(ds)) {
          streak++;
          d.setDate(d.getDate() - 1);
        } else {
          break;
        }
      }

      // Update profile
      client.from("profiles").select("streak_longest").eq("id", userId).single().then(({ data: row }) => {
        const longest = Math.max(row?.streak_longest || 0, streak);
        client.from("profiles").update({
          streak_current: streak,
          streak_longest: longest,
        }).eq("id", userId).then(() => {}, () => {});
      }).catch(() => {});
    }).catch(() => {});
  } catch {
    // never throw
  }
}

/* =====================================================================
   CONVENIENCE: post-workout tracking
   ===================================================================== */

function trackWorkoutLogged(properties) {
  trackEvent("workout_logged", properties);
  _incrementProfileCounter("total_workouts_logged", {
    last_workout_logged: new Date().toISOString(),
  });
  _updateWorkoutStreak();
}

function trackWorkoutShared(properties) {
  trackEvent("workout_shared", properties);
  _incrementProfileCounter("total_workouts_shared", {
    last_workout_shared: new Date().toISOString(),
  });
}

// Plan generation — called from Build a Plan (workouts.js), Custom Plan save,
// and the philosophy plan generator. `plan_type` is one of "gym" | "custom" |
// "race" | "philosophy"; `duration_weeks` is optional when unknown.
function trackPlanGenerated(properties) {
  trackEvent("plan_generated", properties || {});
}
