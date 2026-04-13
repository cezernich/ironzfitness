// strava-integration.js — Strava OAuth + sync (server-side flow)
//
// Replaces the old client-side OAuth implementation that embedded the
// client secret in the browser. All token exchange + refresh + activity
// fetching now runs in Supabase Edge Functions (strava-auth,
// strava-callback, strava-sync). The client only:
//   - Calls strava-auth to get the authorize URL, then redirects
//   - Reads strava_tokens / strava_activities for connected state + history
//   - Mirrors synced activities into localStorage.workouts so calendar +
//     history render them alongside manually-logged workouts

const STRAVA_TYPE_MAP = {
  Run:            "running",
  TrailRun:       "running",
  VirtualRun:     "running",
  Walk:           "running",
  Hike:           "running",
  Ride:           "cycling",
  VirtualRide:    "cycling",
  EBikeRide:      "cycling",
  MountainBikeRide: "cycling",
  GravelRide:     "cycling",
  Swim:           "swimming",
  WeightTraining: "weightlifting",
  Workout:        "weightlifting",
  Crossfit:       "hiit",
  HighIntensityIntervalTraining: "hiit",
  Yoga:           "yoga",
  Elliptical:     "general",
  StairStepper:   "stairstepper",
  Rowing:         "rowing",
};

function _stravaClient() {
  return (typeof window !== "undefined" && window.supabaseClient) || null;
}

async function _stravaUserId() {
  const sb = _stravaClient();
  if (!sb) return null;
  try {
    const { data } = await sb.auth.getSession();
    return data?.session?.user?.id || null;
  } catch { return null; }
}

async function _stravaAccessToken() {
  const sb = _stravaClient();
  if (!sb) return null;
  try {
    const { data } = await sb.auth.getSession();
    return data?.session?.access_token || null;
  } catch { return null; }
}

/* =====================================================================
   CONNECTED STATE — reads strava_tokens
   ===================================================================== */

async function getStravaTokenRow() {
  const sb = _stravaClient();
  if (!sb) return null;
  const userId = await _stravaUserId();
  if (!userId) return null;
  try {
    const { data } = await sb
      .from("strava_tokens")
      .select("athlete_id, athlete_firstname, athlete_lastname, athlete_avatar, connected_at, last_sync_at")
      .eq("user_id", userId)
      .maybeSingle();
    return data || null;
  } catch (e) {
    console.warn("[Strava] token lookup failed:", e.message || e);
    return null;
  }
}

async function isStravaConnected() {
  const row = await getStravaTokenRow();
  return !!row;
}

/* =====================================================================
   OAUTH FLOW — delegates to strava-auth edge function
   ===================================================================== */

async function connectStrava() {
  const sb = _stravaClient();
  if (!sb) { alert("Not connected to database."); return; }
  const accessToken = await _stravaAccessToken();
  if (!accessToken) { alert("Please log in first."); return; }

  const btn = document.querySelector(".btn-strava");
  if (btn) { btn.disabled = true; btn.textContent = "Connecting…"; }

  try {
    // Explicitly pass the session access_token as a Bearer header.
    // supabase.functions.invoke() DOES NOT automatically substitute the
    // session token for the anon key — it sends whatever Authorization
    // header was set on client creation (the anon key). Without this
    // explicit header the edge function's getUser() returns null and
    // the function 401s.
    const { data, error } = await sb.functions.invoke("strava-auth", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (error) throw error;
    if (!data || !data.authorize_url) throw new Error("No authorize URL returned");

    // Redirect the whole page to Strava's authorize screen. Strava will
    // redirect back to strava-callback, which (after exchanging the code)
    // sends us to https://ironz.fit/?strava=connected.
    window.location.href = data.authorize_url;
  } catch (e) {
    console.error("[Strava] connect error:", e);
    if (btn) { btn.disabled = false; btn.textContent = "Connect with Strava"; }
    if (typeof reportCaughtError === "function") reportCaughtError(e, { context: "strava", action: "connect" });
    alert("Couldn't start the Strava connect flow. " + (e.message || e));
  }
}

/**
 * Called on app load. If the URL contains ?strava=connected, the user has
 * just come back from the callback flow — fire the connected analytics
 * event, kick off an initial sync, and clean the URL.
 */
async function handleStravaReturn() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("strava")) return;

  const val = params.get("strava");
  // Clean the URL so refreshing doesn't re-trigger.
  const cleanUrl = window.location.pathname + window.location.hash;
  history.replaceState(null, "", cleanUrl);

  if (val === "connected") {
    if (typeof trackEvent === "function") {
      trackEvent("strava_connected", {});
    }
    _showStravaToast("Strava connected! Syncing your activities…");
    await syncStravaNow({ silent: false });
    renderStravaStatus();
  } else if (val === "error") {
    const reason = params.get("reason") || "unknown";
    _showStravaToast("Strava connect failed: " + reason);
  }
}

/* =====================================================================
   SYNC — delegates to strava-sync edge function
   ===================================================================== */

async function syncStravaNow(opts) {
  opts = opts || {};
  const sb = _stravaClient();
  if (!sb) return 0;
  const accessToken = await _stravaAccessToken();
  if (!accessToken) return 0;

  if (!opts.silent) _showStravaToast("Syncing Strava…");

  try {
    // Same explicit Bearer header fix as strava-auth: .invoke() doesn't
    // auto-substitute the session token for the anon key.
    const { data, error } = await sb.functions.invoke("strava-sync", {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: {},
    });
    if (error) throw error;
    const synced = (data && data.synced) || 0;
    const activities = (data && data.activities) || [];

    // Mirror synced activities into localStorage.workouts so calendar +
    // history render them alongside manually-logged workouts. Dedup by
    // stravaId so repeat syncs don't create duplicates.
    _mergeStravaIntoLocalWorkouts(activities);

    if (typeof trackEvent === "function") {
      trackEvent("strava_sync_completed", { synced });
    }

    if (typeof renderCalendar === "function") renderCalendar();
    if (typeof renderWorkoutHistory === "function") renderWorkoutHistory();
    if (typeof renderStats === "function") renderStats();
    renderStravaStatus();

    if (!opts.silent) {
      _showStravaToast(synced > 0 ? `Synced ${synced} activit${synced === 1 ? "y" : "ies"}` : "Strava is up to date");
    }
    return synced;
  } catch (e) {
    console.error("[Strava] sync error:", e);
    if (typeof reportCaughtError === "function") reportCaughtError(e, { context: "strava", action: "sync" });
    if (!opts.silent) _showStravaToast("Sync failed. Try again later.");
    return 0;
  }
}

function _mergeStravaIntoLocalWorkouts(activities) {
  if (!activities || !activities.length) return;
  let workouts = [];
  try { workouts = JSON.parse(localStorage.getItem("workouts") || "[]"); } catch {}
  const existingByStravaId = {};
  workouts.forEach(w => { if (w.stravaId) existingByStravaId[String(w.stravaId)] = w; });

  let added = 0;
  activities.forEach(a => {
    const key = String(a.id);
    const localType = STRAVA_TYPE_MAP[a.type] || "general";
    const date = (a.start_date_local || a.start_date || "").slice(0, 10);
    if (!date) return;

    const durationMin = Math.round((a.moving_time || 0) / 60);
    const distanceKm = a.distance ? (a.distance / 1000) : null;
    const distanceStr = distanceKm ? `${distanceKm.toFixed(2)} km` : null;

    const workout = {
      id: "strava-" + a.id,
      stravaId: a.id,
      date,
      name: a.name || "Strava activity",
      type: localType,
      notes: "Imported from Strava",
      source: "strava",
      duration: durationMin ? String(durationMin) : null,
      distance: distanceStr,
      avgWatts: null,
    };

    if (a.average_heartrate) workout.avgHr = Math.round(a.average_heartrate);
    if (a.suffer_score)      workout.sufferScore = a.suffer_score;
    if (a.map_summary_polyline) workout.mapPolyline = a.map_summary_polyline;

    if (existingByStravaId[key]) {
      // Update in place — keeps ordering stable
      Object.assign(existingByStravaId[key], workout);
    } else {
      workouts.unshift(workout);
      added++;
    }
  });

  localStorage.setItem("workouts", JSON.stringify(workouts));
  if (typeof DB !== "undefined" && DB.syncWorkouts) DB.syncWorkouts();
  localStorage.setItem("stravaLastLocalSync", new Date().toISOString());
}

/* =====================================================================
   DISCONNECT
   ===================================================================== */

async function disconnectStrava() {
  if (!confirm("Disconnect Strava? Already-imported activities stay in your history.")) return;
  const sb = _stravaClient();
  if (!sb) return;
  const userId = await _stravaUserId();
  if (!userId) return;

  try {
    const { error } = await sb.from("strava_tokens").delete().eq("user_id", userId);
    if (error) throw error;
    if (typeof trackEvent === "function") trackEvent("strava_disconnected", {});
    _showStravaToast("Strava disconnected");
    renderStravaStatus();
  } catch (e) {
    console.error("[Strava] disconnect error:", e);
    if (typeof reportCaughtError === "function") reportCaughtError(e, { context: "strava", action: "disconnect" });
    alert("Disconnect failed: " + (e.message || e));
  }
}

/* =====================================================================
   UI
   ===================================================================== */

function _showStravaToast(msg) {
  if (typeof _showShareToast === "function") { _showShareToast(msg); return; }
  const t = document.createElement("div");
  t.className = "ironz-toast visible";
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.classList.remove("visible"); setTimeout(() => t.remove(), 300); }, 3000);
}

function _formatStravaDate(iso) {
  if (!iso) return "Never";
  try {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    if (diffMs < 60_000) return "just now";
    if (diffMs < 3600_000) return `${Math.round(diffMs/60000)}m ago`;
    if (diffMs < 86400_000) return `${Math.round(diffMs/3600000)}h ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch { return "Never"; }
}

async function renderStravaStatus() {
  const container = document.getElementById("strava-status");
  if (!container) return;

  container.innerHTML = `<p class="hint" style="margin:0">Checking Strava connection…</p>`;
  const row = await getStravaTokenRow();

  if (row) {
    const name = [row.athlete_firstname, row.athlete_lastname].filter(Boolean).join(" ") || "Connected";
    const sync = _formatStravaDate(row.last_sync_at);
    container.innerHTML = `
      <div class="strava-connected">
        <div class="strava-user">
          Connected as <strong>${_escStrava(name)}</strong>
        </div>
        <div class="strava-sync-info">Last sync: ${_escStrava(sync)}</div>
        <div class="strava-actions">
          <button class="btn-primary btn-sm" onclick="syncStravaNow()">Sync Now</button>
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

function _escStrava(s) {
  if (s == null) return "";
  const d = document.createElement("div");
  d.textContent = String(s);
  return d.innerHTML;
}

// Run the return handler on page load. auth.js defers app init until
// after session confirmation so supabaseClient is available by then.
if (typeof window !== "undefined") {
  window.handleStravaReturn = handleStravaReturn;
  window.connectStrava = connectStrava;
  window.syncStravaNow = syncStravaNow;
  window.disconnectStrava = disconnectStrava;
  window.renderStravaStatus = renderStravaStatus;
  // For back-compat with any old code calling importStravaActivities()
  window.importStravaActivities = syncStravaNow;
}
