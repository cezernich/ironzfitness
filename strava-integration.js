// strava-integration.js — Strava OAuth Integration
// Phase 4.2: Connect Strava, import activities, map to IronZ types.

/* =====================================================================
   CONFIGURATION
   ===================================================================== */

// User must register a Strava API application at https://www.strava.com/settings/api
// and fill in these values.
const STRAVA_CONFIG = {
  clientId: "",       // Your Strava app client ID
  clientSecret: "",   // Your Strava app client secret
  redirectUri: window.location.origin + window.location.pathname,
  scope: "activity:read_all",
};

/* =====================================================================
   AUTH STATE
   ===================================================================== */

function getStravaAuth() {
  try { return JSON.parse(localStorage.getItem("stravaAuth") || "null"); } catch { return null; }
}

function saveStravaAuth(auth) {
  localStorage.setItem("stravaAuth", JSON.stringify(auth));
}

function isStravaConnected() {
  const auth = getStravaAuth();
  return auth && auth.access_token;
}

function getStravaAthlete() {
  const auth = getStravaAuth();
  return auth?.athlete || null;
}

/* =====================================================================
   OAUTH2 FLOW
   ===================================================================== */

function connectStrava() {
  if (!STRAVA_CONFIG.clientId) {
    alert("Strava API credentials not configured. Go to strava-integration.js and add your Client ID and Secret from https://www.strava.com/settings/api");
    return;
  }

  // Generate state for CSRF protection
  const state = generateId("strava");
  localStorage.setItem("stravaOauthState", state);

  const authUrl = `https://www.strava.com/oauth/authorize?client_id=${STRAVA_CONFIG.clientId}&redirect_uri=${encodeURIComponent(STRAVA_CONFIG.redirectUri)}&response_type=code&scope=${STRAVA_CONFIG.scope}&state=${state}`;

  window.location.href = authUrl;
}

/**
 * Handle the OAuth callback. Call this on page load to check for auth code in URL.
 */
async function handleStravaCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");

  if (!code || !state) return false;

  // Verify state
  const savedState = localStorage.getItem("stravaOauthState");
  if (state !== savedState) {
    console.error("Strava OAuth state mismatch");
    return false;
  }
  localStorage.removeItem("stravaOauthState");

  // Clean URL
  window.history.replaceState({}, document.title, window.location.pathname);

  // Exchange code for token
  try {
    const response = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: STRAVA_CONFIG.clientId,
        client_secret: STRAVA_CONFIG.clientSecret,
        code: code,
        grant_type: "authorization_code",
      }),
    });

    if (!response.ok) throw new Error("Token exchange failed");

    const data = await response.json();
    saveStravaAuth({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
      athlete: data.athlete,
    });

    renderStravaStatus();
    await importStravaActivities();
    return true;
  } catch (err) {
    console.error("Strava auth error:", err);
    return false;
  }
}

/**
 * Refresh the access token if expired.
 */
async function refreshStravaToken() {
  const auth = getStravaAuth();
  if (!auth || !auth.refresh_token) return false;

  const now = Math.floor(Date.now() / 1000);
  if (auth.expires_at && auth.expires_at > now + 300) return true; // Still valid

  try {
    const response = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: STRAVA_CONFIG.clientId,
        client_secret: STRAVA_CONFIG.clientSecret,
        refresh_token: auth.refresh_token,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) return false;

    const data = await response.json();
    auth.access_token = data.access_token;
    auth.refresh_token = data.refresh_token;
    auth.expires_at = data.expires_at;
    saveStravaAuth(auth);
    return true;
  } catch {
    return false;
  }
}

function disconnectStrava() {
  if (!confirm("Disconnect Strava? Imported activities will remain in your history.")) return;
  localStorage.removeItem("stravaAuth");
  localStorage.removeItem("stravaOauthState");
  localStorage.removeItem("stravaLastSync");
  renderStravaStatus();
}

/* =====================================================================
   ACTIVITY IMPORT
   ===================================================================== */

const STRAVA_TYPE_MAP = {
  Run: "run",
  Trail_Run: "run",
  VirtualRun: "run",
  Ride: "bike",
  VirtualRide: "bike",
  Swim: "swim",
  Walk: "run",
  Hike: "run",
  WeightTraining: "strength",
  Crossfit: "hiit",
  Yoga: "yoga",
  Workout: "general",
};

/**
 * Import recent Strava activities (last 30 days).
 */
async function importStravaActivities() {
  const valid = await refreshStravaToken();
  if (!valid) return;

  const auth = getStravaAuth();
  const thirtyDaysAgo = Math.floor((Date.now() - 30 * 86400000) / 1000);

  try {
    const response = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?after=${thirtyDaysAgo}&per_page=50`,
      { headers: { Authorization: `Bearer ${auth.access_token}` } }
    );

    if (!response.ok) throw new Error("Failed to fetch activities");

    const activities = await response.json();
    let imported = 0;

    let workouts = [];
    try { workouts = JSON.parse(localStorage.getItem("workouts") || "[]"); } catch {}

    // Check for existing Strava imports to prevent duplicates
    const existingStravaIds = new Set(
      workouts.filter(w => w.stravaId).map(w => String(w.stravaId))
    );

    activities.forEach(activity => {
      if (existingStravaIds.has(String(activity.id))) return;

      const type = STRAVA_TYPE_MAP[activity.type] || "general";
      const date = activity.start_date_local
        ? activity.start_date_local.slice(0, 10)
        : new Date(activity.start_date).toISOString().slice(0, 10);

      const workout = {
        id: generateId("strava"),
        stravaId: activity.id,
        date: date,
        name: activity.name,
        type: type,
        notes: `Imported from Strava`,
        source: "strava",
        duration: Math.round((activity.moving_time || 0) / 60),
        distance: activity.distance ? (activity.distance / 1000).toFixed(2) : null,
        segments: [],
        exercises: [],
      };

      // Add distance as a segment for cardio activities
      if (activity.distance && ["run", "bike", "swim"].includes(type)) {
        workout.segments = [{
          name: activity.name,
          duration: `${Math.round((activity.moving_time || 0) / 60)} min`,
          effort: "Z2",
          distance: (activity.distance / 1000).toFixed(2),
        }];
      }

      workouts.unshift(workout);
      imported++;
    });

    if (imported > 0) {
      localStorage.setItem("workouts", JSON.stringify(workouts));
      localStorage.setItem("stravaLastSync", new Date().toISOString());

      // Refresh UI
      if (typeof renderCalendar === "function") renderCalendar();
      if (typeof selectDay === "function") selectDay(getTodayString());
      if (typeof renderWorkoutHistory === "function") renderWorkoutHistory();
    }

    renderStravaStatus();
    return imported;
  } catch (err) {
    console.error("Strava import error:", err);
    return 0;
  }
}

/* =====================================================================
   UI
   ===================================================================== */

function renderStravaStatus() {
  const container = document.getElementById("strava-status");
  if (!container) return;

  if (isStravaConnected()) {
    const athlete = getStravaAthlete();
    const lastSync = localStorage.getItem("stravaLastSync");
    const syncLabel = lastSync
      ? `Last sync: ${new Date(lastSync).toLocaleDateString()}`
      : "Not synced yet";

    container.innerHTML = `
      <div class="strava-connected">
        <div class="strava-user">
          ${athlete ? `Connected as <strong>${escHtml(athlete.firstname)} ${escHtml(athlete.lastname)}</strong>` : "Connected"}
        </div>
        <div class="strava-sync-info">${escHtml(syncLabel)}</div>
        <div class="strava-actions">
          <button class="btn-primary btn-sm" onclick="importStravaActivities()">Sync Now</button>
          <button class="btn-secondary btn-sm" onclick="disconnectStrava()">Disconnect</button>
        </div>
      </div>`;
  } else {
    container.innerHTML = `
      <div class="strava-connect-prompt">
        <p class="hint">Connect Strava to automatically import your runs, rides, and swims. We only read your activity data — we never post to your Strava account.</p>
        <button class="btn-strava" onclick="connectStrava()">Connect with Strava</button>
      </div>`;
  }
}
