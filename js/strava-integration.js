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

// gotrue-js can deadlock its internal lock during a refresh, leaving
// auth.getSession() pending forever. When that happens here, the live
// tracker's post-finish Strava prompt and the share-sheet "Share to
// Strava" button both hang silently — the await never resolves, no
// upload, no toast, no modal. Race every getSession() call against a
// short timeout so callers never block on a stuck lock. Same pattern
// the callAI helper uses (config.js _getSessionWithTimeout); kept
// inline here to avoid load-order coupling between scripts.
async function _stravaGetSession(ms) {
  const sb = _stravaClient();
  if (!sb) return null;
  try {
    return await Promise.race([
      sb.auth.getSession(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("auth_lock_timeout")), ms || 4000)),
    ]);
  } catch (e) {
    if (e && e.message === "auth_lock_timeout") {
      console.warn("[Strava] getSession hung — attempting refreshSession");
      try {
        return await Promise.race([
          sb.auth.refreshSession(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("refresh_timeout")), 3000)),
        ]);
      } catch (refreshErr) {
        console.warn("[Strava] refreshSession also hung:", refreshErr && refreshErr.message);
        return null;
      }
    }
    return null;
  }
}

async function _stravaUserId() {
  const result = await _stravaGetSession(4000);
  return result?.data?.session?.user?.id || null;
}

async function _stravaAccessToken() {
  const sb = _stravaClient();
  if (!sb) return null;
  const result = await _stravaGetSession(4000);
  let tok = result?.data?.session?.access_token || null;
  // If the timed getSession() returned nothing, force a refresh once
  // — also raced — to break a stuck lock and re-read from storage.
  if (!tok && sb.auth.refreshSession) {
    try {
      const r = await Promise.race([
        sb.auth.refreshSession(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("refresh_timeout")), 3000)),
      ]);
      tok = r?.data?.session?.access_token || null;
    } catch {}
  }
  return tok;
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
      .select("athlete_id, athlete_firstname, athlete_lastname, athlete_avatar, connected_at, last_sync_at, scope")
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

// True if the user's Strava connection has the activity:write scope and
// can therefore push uploads. Read-only legacy connections (scope=NULL or
// scope=activity:read_all only) return false.
async function hasStravaWriteScope() {
  const row = await getStravaTokenRow();
  if (!row) return false;
  const scope = String(row.scope || "");
  return scope.includes("activity:write");
}

/* =====================================================================
   OAUTH FLOW — delegates to strava-auth edge function
   ===================================================================== */

async function connectStrava() {
  const sb = _stravaClient();
  if (!sb) { alert("Not connected to database."); return; }
  const accessToken = await _stravaAccessToken();

  // Debug log — visible in the browser devtools Console tab so we can
  // verify the token is actually being sent. Logs only the first 20
  // chars to avoid leaking the full JWT.
  console.log("[Strava] connect — access token:",
    accessToken ? accessToken.slice(0, 20) + "… (len=" + accessToken.length + ")" : "NO TOKEN");

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
    //
    // Also: strava-auth MUST be deployed with --no-verify-jwt because
    // Supabase's platform-level JWT verification (enabled by default)
    // runs BEFORE the function code and rejects valid session tokens
    // in some edge runtime versions, short-circuiting to 401 before
    // our manual getUser() check can even run. Manual verification is
    // already wired up inside the function.
    const { data, error } = await sb.functions.invoke("strava-auth", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    console.log("[Strava] connect — invoke result:", { data, error });
    if (error) throw error;
    if (!data || !data.authorize_url) throw new Error("No authorize URL returned");

    // Parse the scope out of the returned authorize URL and log it so we
    // can tell at a glance whether the deployed edge function is
    // requesting read_all+write or still the old read_all only.
    try {
      const parsedUrl = new URL(data.authorize_url);
      const urlScope = parsedUrl.searchParams.get("scope");
      console.log("[Strava] connect — authorize URL scope:", urlScope);
      if (urlScope && !urlScope.includes("activity:write")) {
        console.warn(
          "[Strava] The deployed strava-auth function is requesting scope:",
          urlScope,
          "— expected 'activity:read_all,activity:write'. Redeploy the function:\n" +
          "  supabase functions deploy strava-auth --no-verify-jwt"
        );
      }
    } catch (e) {
      console.warn("[Strava] couldn't parse authorize URL:", e);
    }

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

    // Dump the freshly-stored scope to the console so we can verify
    // reconnect flows immediately. If this logs a scope without
    // "activity:write", the deployed strava-callback is NOT writing
    // the scope column — redeploy the function.
    try {
      const row = await getStravaTokenRow();
      console.log("[Strava] post-callback stored scope:", row?.scope || "(null)",
        "— hasWrite:", String(row?.scope || "").includes("activity:write"));
    } catch {}

    await syncStravaNow({ silent: false });
    renderStravaStatus();
  } else if (val === "error") {
    const reason = params.get("reason") || "unknown";
    _renderStravaConnectError(reason);
  }
}

// Map a Strava callback error reason to a user-facing message + UI
// treatment. Quota exhaustion gets a dedicated modal because the
// fallback message is long enough that a 3-second toast would clip it.
// Everything else falls back to a brief toast with the raw reason —
// good enough for ad-hoc Strava errors we haven't seen before.
function _renderStravaConnectError(reason) {
  // quota_exceeded — Strava's "limit of connected athletes exceeded".
  // The default Strava API quota is 1 athlete; we sit on the higher
  // tier once their review goes through. This message is the friendly
  // fallback during the wait. Update copy when the quota lands.
  if (reason === "quota_exceeded") {
    if (typeof trackEvent === "function") {
      try { trackEvent("strava_connect_quota_exceeded", {}); } catch {}
    }
    _showStravaConnectErrorModal({
      title: "Strava connection temporarily unavailable",
      body: "We've hit our temporary Strava API limit while we wait for an increase to land. " +
            "We'll have this back online soon — your data will be there waiting when it does. " +
            "No action needed on your end.",
    });
    return;
  }
  // access_denied — user tapped Cancel on Strava's authorize page.
  // Don't blame anyone; just reassure them they can try again.
  if (reason === "access_denied") {
    _showStravaToast("Connect cancelled. Tap Connect Strava again any time.");
    return;
  }
  // network_error / save_failed / token_exchange_failed — short toast.
  if (reason === "network_error") {
    _showStravaToast("Couldn't reach Strava. Check your connection and try again.");
    return;
  }
  if (reason === "save_failed") {
    _showStravaToast("Couldn't save your Strava connection. Try again, or contact support.");
    return;
  }
  // Default: surface the raw reason for ad-hoc visibility.
  _showStravaToast("Strava connect failed: " + reason);
}

// Modal for the quota-exceeded path — body text is too long for a
// toast and the user benefits from a clear "OK got it" dismissal.
// Built inline (no markup in index.html) so deploying this fix is a
// single-file change. Re-uses the rating-modal-overlay class so the
// look matches existing dialogs.
function _showStravaConnectErrorModal(opts) {
  opts = opts || {};
  const id = "strava-connect-error-overlay";
  const old = document.getElementById(id);
  if (old) old.remove();

  const overlay = document.createElement("div");
  overlay.id = id;
  overlay.className = "rating-modal-overlay";
  overlay.style.cssText = "position:fixed;inset:0;background:rgba(10,12,18,0.55);z-index:11500;display:flex;align-items:center;justify-content:center;padding:24px;";
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  const _esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

  overlay.innerHTML = `
    <div style="background:#fff;color:#1a1a1a;border-radius:14px;max-width:420px;width:100%;padding:24px;box-shadow:0 12px 40px rgba(0,0,0,0.25)">
      <h3 style="margin:0 0 12px;font-size:1.1rem">${_esc(opts.title || "Strava connection unavailable")}</h3>
      <p style="margin:0 0 20px;font-size:0.95rem;line-height:1.5;color:#444">${_esc(opts.body || "")}</p>
      <button class="btn-primary" style="width:100%"
        onclick="document.getElementById('${id}').remove()">OK</button>
    </div>`;
  document.body.appendChild(overlay);
}

/* =====================================================================
   SYNC — delegates to strava-sync edge function
   ===================================================================== */

async function syncStravaNow(opts) {
  opts = opts || {};
  const sb = _stravaClient();
  if (!sb) return 0;
  const accessToken = await _stravaAccessToken();

  console.log("[Strava] sync — access token:",
    accessToken ? accessToken.slice(0, 20) + "… (len=" + accessToken.length + ")" : "NO TOKEN");

  if (!accessToken) return 0;

  if (!opts.silent) _showStravaToast("Syncing Strava…");

  try {
    // Same explicit Bearer header fix as strava-auth: .invoke() doesn't
    // auto-substitute the session token for the anon key. strava-sync
    // should also be deployed with --no-verify-jwt for the same reason
    // as strava-auth.
    const { data, error } = await sb.functions.invoke("strava-sync", {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: {},
    });
    console.log("[Strava] sync — invoke result:", { synced: data?.synced, error });
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
  // Round-trip prevention: any local workout we previously pushed to
  // Strava has its returned activity id stored as `stravaUploadId`. The
  // next sync will see that same activity coming back from Strava — skip
  // those so we don't duplicate.
  const uploadedStravaIds = new Set();
  workouts.forEach(w => {
    if (w.stravaId) existingByStravaId[String(w.stravaId)] = w;
    if (w.stravaUploadId) uploadedStravaIds.add(String(w.stravaUploadId));
  });

  // Strava imports are completed by definition — Strava only logs activities
  // the athlete actually did. Mirror that into the same completedSessions
  // localStorage entry that manual completions write to so calendar.js
  // isSessionComplete() returns true and the green session-card--completed
  // styling kicks in.
  let completionMeta = {};
  try { completionMeta = JSON.parse(localStorage.getItem("completedSessions") || "{}"); } catch {}

  let added = 0;
  activities.forEach(a => {
    const key = String(a.id);
    if (uploadedStravaIds.has(key)) return; // round-trip skip
    const localType = STRAVA_TYPE_MAP[a.type] || "general";
    const date = (a.start_date_local || a.start_date || "").slice(0, 10);
    if (!date) return;

    const durationMin = Math.round((a.moving_time || 0) / 60);
    const distanceKm = a.distance ? (a.distance / 1000) : null;
    const distanceStr = distanceKm ? `${distanceKm.toFixed(2)} km` : null;
    // Use the Strava activity's own start time as the completion timestamp
    // when available, else the date midnight.
    const completedAt = a.start_date_local || a.start_date || (date + "T00:00:00.000Z");

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
      // Mark complete on the workout object itself for any reader that
      // walks workouts[] directly instead of going through completedSessions.
      completed: true,
      completedAt,
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

    // Tag the corresponding session card as complete. The card id matches
    // calendar.js buildLoggedWorkoutCard (`session-log-${w.id}`).
    const cardId = `session-log-${workout.id}`;
    completionMeta[cardId] = {
      completedAt,
      duration: workout.duration || null,
      source: "strava",
    };
  });

  localStorage.setItem("workouts", JSON.stringify(workouts));
  if (typeof DB !== "undefined" && DB.syncWorkouts) DB.syncWorkouts();
  localStorage.setItem("completedSessions", JSON.stringify(completionMeta));
  if (typeof DB !== "undefined" && DB.syncKey) DB.syncKey("completedSessions");
  localStorage.setItem("stravaLastLocalSync", new Date().toISOString());
}

/* =====================================================================
   PUSH-TO-STRAVA — upload completed IronZ workouts as Strava activities
   ===================================================================== */

// IronZ workout type → Strava activity type. Strava's canonical names are
// PascalCase; anything not in this map falls back to "Workout" which Strava
// accepts as a generic activity.
const IRONZ_TO_STRAVA_TYPE = {
  running:        "Run",
  run:            "Run",
  cycling:        "Ride",
  bike:           "Ride",
  swimming:       "Swim",
  swim:           "Swim",
  weightlifting:  "WeightTraining",
  strength:       "WeightTraining",
  bodyweight:     "WeightTraining",
  hiit:           "HighIntensityIntervalTraining",
  yoga:           "Yoga",
  rowing:         "Rowing",
  walking:        "Walk",
  walk:           "Walk",
  hike:           "Hike",
  hiking:         "Hike",
  stairstepper:   "StairStepper",
  elliptical:     "Elliptical",
  brick:          "Workout",
  triathlon:      "Workout",
  general:        "Workout",
};

// Running-workout-generator emits `type` as the template id (e.g.
// "tempo_threshold", "long_run") — not "running". We still want these
// treated as runs for Strava uploads, descriptions, and the share prompt's
// defaults, so map every known sub-type back to its parent discipline.
const RUN_SUBTYPES = new Set([
  "easy_recovery", "endurance", "long_run", "tempo_threshold",
  "track_workout", "speed_work", "hills", "fun_social",
  "recovery_run", "base_run", "progression_run",
]);
const BIKE_SUBTYPES = new Set([
  "bike_endurance", "bike_tempo", "bike_threshold", "bike_intervals",
  "bike_vo2", "bike_recovery", "bike_long", "bike_sweetspot",
]);
const SWIM_SUBTYPES = new Set([
  "swim_endurance", "swim_technique", "swim_css_intervals", "swim_speed",
  "swim_threshold", "swim_recovery", "swim_long",
]);

function _parentDiscipline(type) {
  const t = (type || "").toLowerCase();
  if (!t) return "";
  if (RUN_SUBTYPES.has(t))  return "running";
  if (BIKE_SUBTYPES.has(t)) return "cycling";
  if (SWIM_SUBTYPES.has(t)) return "swimming";
  return t;
}

function _stravaTypeForWorkout(w) {
  const parent = _parentDiscipline(w.type);
  return IRONZ_TO_STRAVA_TYPE[parent] || "Workout";
}

// Auto-share toggle — local-only, per device. Defaults to off.
function isStravaAutoShareEnabled() {
  try { return localStorage.getItem("stravaAutoShare") === "1"; }
  catch { return false; }
}
function setStravaAutoShareEnabled(enabled) {
  try { localStorage.setItem("stravaAutoShare", enabled ? "1" : "0"); }
  catch {}
  renderStravaStatus();
}

/* =====================================================================
   SHARE CARD CUSTOMIZATION — per-field toggles saved per workout type
   ===================================================================== */

// Default field inclusion per workout type. Users can override any of
// these via the share prompt, and their choices are remembered for the
// next workout of the same type via `stravaCardPrefs` in localStorage.
// body/stats/notes/hiitMeta/footer — one toggle each in the share prompt.
// `typeLabel` and `distance` were removed as toggles: the workout type is
// baked into the activity title now (_buildStravaTitle), and distance is
// part of the title (cardio) or stats line (swim), not a standalone line.
const _STRAVA_CARD_DEFAULTS_BY_TYPE = {
  weightlifting: { body: true,  stats: true, hiitMeta: false, notes: false, footer: true },
  bodyweight:    { body: true,  stats: true, hiitMeta: false, notes: false, footer: true },
  hiit:          { body: true,  stats: true, hiitMeta: true,  notes: false, footer: true },
  running:       { body: true,  stats: true, hiitMeta: false, notes: false, footer: true },
  cycling:       { body: true,  stats: true, hiitMeta: false, notes: false, footer: true },
  swimming:      { body: true,  stats: true, hiitMeta: false, notes: false, footer: true },
  yoga:          { body: true,  stats: true, hiitMeta: false, notes: true,  footer: true },
  rowing:        { body: true,  stats: true, hiitMeta: false, notes: false, footer: true },
  walking:       { body: false, stats: true, hiitMeta: false, notes: false, footer: true },
  hiking:        { body: false, stats: true, hiitMeta: false, notes: false, footer: true },
  general:       { body: true,  stats: true, hiitMeta: false, notes: false, footer: true },
};
const _STRAVA_CARD_DEFAULT = { body: true, stats: true, hiitMeta: false, notes: false, footer: true };

function _normalizeWorkoutTypeKey(type) {
  const parent = _parentDiscipline(type);
  if (parent === "run") return "running";
  if (parent === "bike") return "cycling";
  if (parent === "swim") return "swimming";
  if (parent === "walk") return "walking";
  if (parent === "hike") return "hiking";
  return parent || "general";
}

function getStravaCardPrefs(type) {
  const key = _normalizeWorkoutTypeKey(type);
  const fallback = _STRAVA_CARD_DEFAULTS_BY_TYPE[key] || _STRAVA_CARD_DEFAULT;
  let stored = {};
  try {
    const raw = JSON.parse(localStorage.getItem("stravaCardPrefs") || "{}");
    stored = (raw && typeof raw === "object" && raw[key]) || {};
  } catch {}
  return { ...fallback, ...stored };
}

function setStravaCardPrefs(type, prefs) {
  const key = _normalizeWorkoutTypeKey(type);
  let raw = {};
  try { raw = JSON.parse(localStorage.getItem("stravaCardPrefs") || "{}") || {}; } catch {}
  raw[key] = { ...(raw[key] || {}), ...prefs };
  try { localStorage.setItem("stravaCardPrefs", JSON.stringify(raw)); } catch {}
}

// ── Name cleanup helpers ─────────────────────────────────────────────────
//
// IronZ workouts sometimes land with low-quality names like
//   "chest, back — min" (duration placeholder left blank)
//   "legs — 45 min"     (duration redundantly baked into the name)
//   "upper body push"   (lowercase)
// These helpers normalize them before they hit Strava so posts look sharp.

function _stripDurationSuffix(name) {
  if (!name) return name;
  // Strip " — X min", " — min", " - X min", " – X min", with or without the number
  return String(name)
    .replace(/\s*[—–-]\s*\d*\s*min\s*$/i, "")
    .trim();
}

function _titleCaseWorkoutName(name) {
  if (!name) return name;
  const s = String(name).trim();
  // Preserve names that already have any uppercase letter (user intent)
  // except the fully-lowercase case which is the common auto-generated form.
  if (/[A-Z]/.test(s)) return s;
  return s.replace(/\b([a-z])([a-z]*)/g, (_, first, rest) => first.toUpperCase() + rest);
}

function _cleanWorkoutName(name, fallback) {
  let out = _stripDurationSuffix(name || "");
  out = _titleCaseWorkoutName(out);
  return out || fallback || "Workout";
}

// ── Workout title builder (per discipline) ──────────────────────────────
//
// Produces the Strava activity name — the one that shows up as the headline
// on the post. Each discipline gets its own format per
// SPEC_strava_share_titles.md (and the follow-up):
//
//   Strength:  "Upper Body Push + Core"        (just the name, no suffix)
//   Running:   "45 min Tempo Run"              (duration + label)
//   Cycling:   "60 min Zone 2 Ride"            (duration + label)
//   Swimming:  "2,300m Swim — Endurance"       (distance + label)
//   Circuit:   "Murph" or "Circuit — For Time" (benchmark name or fallback)
//
// When a duration isn't available (old imports) we drop the prefix and
// just emit the label. Same for distance on swim — falls back to
// "Swim — Endurance".

// Map IronZ sub-types to the short label we want in the title. Kept
// separate from _stravaWorkoutTypeLabel (which produces "Run"/"Ride"/
// "Swim") so we can carry sub-type flavor into the title.
const _RUN_TITLE_LABEL = {
  easy_recovery:   "Easy Run",
  endurance:       "Endurance Run",
  long_run:        "Long Run",
  tempo_threshold: "Tempo Run",
  track_workout:   "Track Workout",
  speed_work:      "Speed Work",
  hills:           "Hill Workout",
  fun_social:      "Easy Run",
  recovery_run:    "Recovery Run",
  base_run:        "Base Run",
  progression_run: "Progression Run",
};
const _BIKE_TITLE_LABEL = {
  bike_endurance:  "Zone 2 Ride",
  bike_tempo:      "Tempo Ride",
  bike_threshold:  "Threshold Ride",
  bike_intervals:  "Interval Ride",
  bike_vo2:        "VO2 Ride",
  bike_recovery:   "Recovery Ride",
  bike_long:       "Long Ride",
  bike_sweetspot:  "Sweet Spot Ride",
};
const _SWIM_TITLE_LABEL = {
  swim_endurance:      "Endurance",
  swim_technique:      "Technique",
  swim_css_intervals:  "CSS Intervals",
  swim_speed:          "Speed",
  swim_threshold:      "Threshold",
  swim_recovery:       "Recovery",
  swim_long:           "Long",
};

function _isGenericSessionName(name) {
  if (!name) return true;
  return /^(running|cycling|swimming|bike|run|swim|yoga|strength|bodyweight|workout|hiit)\s+session$/i.test(name.trim());
}

// Strip IronZ-internal junk from a session name that leaks into Strava:
// "— Workout" / "— Continuous —" / "(Tempo)" / trailing "Session" / etc.
// The session library sometimes stores names like "Tempo — Continuous —
// Workout" which makes a terrible Strava headline. This function cleans
// those up aggressively so we can still accept a user-custom name without
// leaking the template vocabulary.
function _stripInternalLabels(name) {
  if (!name) return "";
  let s = String(name);
  // Drop known internal suffix/segment words between em-dashes or spaces.
  const JUNK = [
    "continuous", "workout", "session", "run", "ride", "swim",
    "standard", "default", "main set", "main", "warmup", "warm-up",
    "cooldown", "cool-down",
  ];
  // Split on em-dash / en-dash / hyphen-dash to get parts.
  const parts = s.split(/\s*[\u2014\u2013\u2012\u2010-]\s+/);
  const filtered = parts.filter(p => {
    const low = p.trim().toLowerCase();
    return low && !JUNK.includes(low);
  });
  s = filtered.join(" — ");
  // Collapse doubled whitespace.
  return s.replace(/\s+/g, " ").trim();
}

function _buildStravaTitle(w) {
  if (!w) return "IronZ Workout";
  const rawName = w.name || w.sessionName || "";
  const cleanName = _stripInternalLabels(_cleanWorkoutName(rawName, ""));
  const discipline = _parentDiscipline(w.type);
  const durationMin = _plannedDurationMin(w);
  const typeKey = String(w.type || "").toLowerCase();

  // Strength family: muscle-group name only. Prefer w.muscleGroups if set,
  // else the cleaned session name, else a generic fallback.
  const STRENGTH = new Set(["weightlifting", "bodyweight", "hiit", "yoga", "strength"]);
  if (STRENGTH.has(discipline)) {
    if (w.muscleGroups) {
      const mg = Array.isArray(w.muscleGroups) ? w.muscleGroups.join(", ") : String(w.muscleGroups);
      if (mg.trim()) return mg.trim();
    }
    return cleanName || "Strength Session";
  }

  // Circuit: benchmark name if it looks like one, else "Circuit — <goal>".
  if (w.type === "circuit" || w.circuit) {
    const goalMap = { for_time: "For Time", amrap: "AMRAP", standard: "Standard" };
    const goal = goalMap[w.goal || w.circuit?.goal || "standard"];
    if (cleanName && !_isGenericSessionName(cleanName) && !/^circuit$/i.test(cleanName)) {
      return cleanName;
    }
    return goal ? `Circuit — ${goal}` : "Circuit";
  }

  // Running: prefer the canonical type label; only use cleanName when the
  // session type doesn't map to one (e.g. user-renamed workouts). Inverted
  // from the old order so "Tempo — Continuous — Workout" can't leak through.
  if (discipline === "running") {
    const label = _RUN_TITLE_LABEL[typeKey]
      || (!_isGenericSessionName(cleanName) && cleanName)
      || "Run";
    return durationMin ? `${durationMin} min ${label}` : label;
  }

  // Cycling: same pattern as running — type label wins.
  if (discipline === "cycling") {
    const label = _BIKE_TITLE_LABEL[typeKey]
      || (!_isGenericSessionName(cleanName) && cleanName)
      || "Ride";
    return durationMin ? `${durationMin} min ${label}` : label;
  }

  // Swimming: "{distance} Swim — <type>" — distance with comma formatting.
  if (discipline === "swimming") {
    const distM = _swimTotalDistanceM(w);
    const distStr = distM > 0 ? _formatSwimDistance(distM, _swimPoolUnit(w)) : "";
    const typeLabel = _SWIM_TITLE_LABEL[typeKey]
      || (!_isGenericSessionName(cleanName) && cleanName)
      || "";
    if (distStr && typeLabel) return `${distStr} Swim — ${typeLabel}`;
    if (distStr)              return `${distStr} Swim`;
    if (typeLabel)            return `Swim — ${typeLabel}`;
    return "Swim";
  }

  // Walk / Hike / Row / generic cardio — fall back to "{duration} min <label>".
  const typeLabel = _stravaWorkoutTypeLabel(w);
  if (durationMin && typeLabel) return `${durationMin} min ${typeLabel}`;
  return cleanName || typeLabel || "Workout";
}

// ── Swim helpers ─────────────────────────────────────────────────────────
//
// Swim workouts store a canonical step tree on w.aiSession.steps (or
// w.steps) with total_distance_m precomputed. We use those directly; the
// legacy intervals array is a fallback.
function _swimStepsForWorkout(w) {
  if (!w) return null;
  const ai = w.aiSession || {};
  if (Array.isArray(ai.steps) && ai.steps.length) return ai.steps;
  if (Array.isArray(w.steps) && w.steps.length) return w.steps;
  return null;
}

function _swimTotalDistanceM(w) {
  if (!w) return 0;
  // BUGFIX: a completed swim that explicitly tagged distance_unit:"yd"
  // (user picked the yd toggle on Mark as Complete) wins over any
  // total_distance_m carried forward from the source template — the
  // template was authored in meters and would otherwise mis-display the
  // logged yardage as meters in the Strava preview.
  if (w.distance != null && _swimPoolUnit(w) === "yd") {
    const s = String(w.distance).trim();
    const num = parseFloat(s.replace(/,/g, ""));
    if (num > 0) return Math.round(num * 0.9144); // yd → m
  }
  const explicit = w.total_distance_m ?? w.aiSession?.total_distance_m;
  if (explicit && explicit > 0) return explicit;
  const steps = _swimStepsForWorkout(w);
  if (steps && typeof window !== "undefined" && window.SwimWorkoutModel?.totalDistance) {
    const n = window.SwimWorkoutModel.totalDistance(steps);
    if (n > 0) return n;
  }
  // Last resort: a bare "2300" or "2300m" stored on w.distance — parse it as meters.
  if (w.distance != null) {
    const s = String(w.distance).trim();
    const num = parseFloat(s.replace(/,/g, ""));
    if (num > 0) return Math.round(num);
  }
  return 0;
}

function _formatSwimDistance(m, poolUnit) {
  if (!m || m <= 0) return "";
  const unit = poolUnit === "yd" ? "yd" : "m";
  const val = unit === "yd" ? Math.round(m * 1.09361) : Math.round(m);
  return `${val.toLocaleString()}${unit}`;
}

// BUGFIX: prefer a completion's explicit distance_unit ("yd") over the
// source template's pool_unit ("m"). Logging a swim with the yd toggle
// otherwise stayed mis-labeled because the source CSS Swim template
// carried forward pool_unit:"m" via _carryForward in saveSessionCompletion.
function _swimPoolUnit(w) {
  if (!w) return "m";
  if (w.distance_unit === "yd") return "yd";
  if (w.distance_unit === "m") return "m";
  return (w.aiSession?.pool_unit || w.pool_unit || "m") === "yd" ? "yd" : "m";
}

// Format an arbitrary distance value for the "Distance:" description line.
// Accepts bare numbers (respecting w.distance_unit when provided — "mi" /
// "km" / "m" / "yd"), or pre-formatted strings like "5 mi" (returned as-is).
function _formatCardioDistanceLine(dist, unit) {
  if (dist == null) return "";
  const s = String(dist).trim();
  if (!s) return "";
  // Already has a unit suffix? Add thousands separators if the number is big.
  const withUnit = s.match(/^(\d[\d,\.]*)\s*([a-zA-Z]+)$/);
  if (withUnit) {
    const num = parseFloat(withUnit[1].replace(/,/g, ""));
    const u = withUnit[2].toLowerCase();
    if (num > 0) {
      const out = num >= 100 ? Math.round(num).toLocaleString() : num.toString();
      return `${out} ${u}`;
    }
    return s;
  }
  // Pre-formatted free text (e.g. "5 mi, 10 km") — leave alone
  if (/[a-zA-Z]/.test(s)) return s;
  // Bare number — use the declared unit if we have one; else assume meters.
  const n = parseFloat(s);
  if (!(n > 0)) return s;
  const u = (unit || "m").toLowerCase();
  if (u === "mi" || u === "km") {
    // Distances in mi/km are small floats — preserve decimals, no commas
    return `${n} ${u}`;
  }
  // Meters / yards — integer, thousands separator
  return `${Math.round(n).toLocaleString()} ${u}`;
}

// ── Duration pre-fill ────────────────────────────────────────────────────
//
// Users sometimes log a completed workout without filling in duration.
// Before falling back to 30 min (Strava requires elapsed_time), try to
// pull from the originally planned session so the post is accurate.
function _plannedDurationMin(w) {
  if (!w) return null;
  const candidates = [
    w.duration,
    w.plannedDuration,
    w.generatedSession?.duration,
    w.aiSession?.duration,
    w.aiSession?.totalMinutes,
  ];
  for (const c of candidates) {
    const n = parseInt(c, 10);
    if (n > 0) return n;
  }
  // Sum aiSession.intervals durations as a last resort
  const intervals = w.aiSession?.intervals;
  if (Array.isArray(intervals) && intervals.length) {
    let total = 0;
    intervals.forEach(iv => {
      const reps = parseInt(iv.reps, 10) || 1;
      const parseMin = (s) => {
        const str = String(s || "").toLowerCase();
        if (/sec|\bs\b/.test(str) && !/min/.test(str)) {
          const v = parseFloat(str); return v > 0 ? v / 60 : 0;
        }
        const v = parseFloat(str); return v > 0 ? v : 0;
      };
      const main = parseMin(iv.duration);
      const rest = parseMin(iv.restDuration);
      total += reps * main + Math.max(0, reps - 1) * rest;
    });
    if (total > 0) return Math.round(total);
  }
  return null;
}

// ── Workout enrichment (pull structured body from source entry) ─────────
//
// The share prompt can be triggered on a thin "completion record" that
// only has name / duration / distance — e.g. older completions logged
// before saveSessionCompletion started carrying forward aiSession/phases.
// In that case, if the record has a completedSessionId pointing at the
// original planned session, we look up that source and merge its body
// structure onto the workout in memory before rendering the preview.
// This is a non-destructive merge — the live workout in localStorage is
// untouched.
function _enrichWorkoutWithSource(workout) {
  if (!workout) return workout;
  // If the workout already has a body source we can render, skip the lookup.
  if (_bodySourceForWorkout(workout)) return workout;
  const sid = workout.completedSessionId || "";
  if (!sid) return workout;
  let source = null;
  try {
    if (sid.startsWith("session-sw-")) {
      const rawId = sid.slice("session-sw-".length);
      const sched = JSON.parse(localStorage.getItem("workoutSchedule") || "[]");
      source = sched.find(s => String(s.id) === rawId) || null;
    } else if (sid.startsWith("session-plan-")) {
      const rest = sid.slice("session-plan-".length);
      const dashIdx = rest.indexOf("-", 11);
      const planDate = dashIdx > 0 ? rest.slice(0, dashIdx) : rest;
      const raceId   = dashIdx > 0 ? rest.slice(dashIdx + 1) : "";
      const plan = JSON.parse(localStorage.getItem("trainingPlan") || "[]");
      source = plan.find(p => p.date === planDate && String(p.raceId) === raceId) || null;
    } else if (sid.startsWith("session-log-")) {
      const rawId = sid.slice("session-log-".length);
      const logged = JSON.parse(localStorage.getItem("workouts") || "[]");
      source = logged.find(w => String(w.id) === rawId) || null;
    }
  } catch {}
  if (!source) return workout;
  // Non-destructive merge — only fill in fields the workout doesn't
  // already have, so user-entered completion data wins.
  const enriched = { ...workout };
  if (!enriched.aiSession       && source.aiSession)       enriched.aiSession       = source.aiSession;
  if (!enriched.generatedSession && source.generatedSession) enriched.generatedSession = source.generatedSession;
  if (!enriched.phases          && source.phases)          enriched.phases          = source.phases;
  if (!enriched.hiitMeta        && source.hiitMeta)        enriched.hiitMeta        = source.hiitMeta;
  if (!enriched.steps           && source.steps)           enriched.steps           = source.steps;
  if (!enriched.total_distance_m && source.total_distance_m) enriched.total_distance_m = source.total_distance_m;
  if (!enriched.pool_size_m     && source.pool_size_m)     enriched.pool_size_m     = source.pool_size_m;
  if (!enriched.pool_unit       && source.pool_unit)       enriched.pool_unit       = source.pool_unit;
  return enriched;
}

// ── Body-source detection ───────────────────────────────────────────────
//
// A workout can carry its structured body in one of several shapes:
//   w.exercises                       (strength/HIIT)
//   w.aiSession.intervals             (cardio — legacy + AddRunningSessionFlow)
//   w.aiSession.steps                 (swim canonical tree)
//   w.steps                           (swim canonical tree, top-level)
//   w.phases                          (running-workout-generator raw phases)
//   w.generatedSession.intervals      (Ask IronZ cardio quick entry)
//   w.generatedSession.exercises      (Ask IronZ strength quick entry)
//   w.segments                        (legacy cardio segments)
// Returns { kind, data } for the first one found, or null. Used by the
// share prompt's availability check + the description body renderer.
function _bodySourceForWorkout(w) {
  if (!w) return null;
  // Circuit workouts first — they may have a top-level `exercises` array
  // (legacy) but the canonical shape lives on w.circuit.steps as a step
  // tree with repeat blocks, cardio, exercise, rest nodes.
  if ((w.type === "circuit" || w.circuit) && w.circuit && Array.isArray(w.circuit.steps) && w.circuit.steps.length) {
    return { kind: "circuit_steps", data: w.circuit.steps, circuit: w.circuit };
  }
  if (w.exercises && w.exercises.length) return { kind: "exercises", data: w.exercises };
  const ai = w.aiSession || {};
  if (Array.isArray(ai.steps) && ai.steps.length) return { kind: "swim_steps", data: ai.steps };
  if (Array.isArray(ai.intervals) && ai.intervals.length) return { kind: "intervals", data: ai.intervals };
  if (Array.isArray(w.steps) && w.steps.length && _parentDiscipline(w.type) === "swimming") {
    return { kind: "swim_steps", data: w.steps };
  }
  if (Array.isArray(w.phases) && w.phases.length) return { kind: "phases", data: w.phases };
  const gs = w.generatedSession || {};
  if (Array.isArray(gs.intervals) && gs.intervals.length) return { kind: "intervals", data: gs.intervals };
  if (Array.isArray(gs.exercises) && gs.exercises.length) return { kind: "exercises", data: gs.exercises };
  if (Array.isArray(w.segments) && w.segments.length) return { kind: "segments", data: w.segments };
  return null;
}

// Render a circuit step tree into description lines. Matches the style
// of the calendar circuit card: repeat blocks headed by "Nx", rest rows
// as "Rest Ns", exercise/cardio rows as "name: detail".
function _formatCircuitSteps(steps, indent) {
  indent = indent || "";
  const lines = [];
  (steps || []).forEach(step => {
    if (!step) return;
    if (step.kind === "rest") {
      const dur = step.duration_sec ? `${Math.round(step.duration_sec)}s` : "—";
      lines.push(`${indent}Rest ${dur}`);
      return;
    }
    if (step.kind === "repeat") {
      const count = step.count;
      const emom = step.interval_min ? ` (EMOM ${step.interval_min} min/round)` : "";
      const header = count == null ? "AMRAP:" : `${count}×${emom}`;
      lines.push(`${indent}${header}`);
      _formatCircuitSteps(step.children || [], indent + "  ").forEach(l => lines.push(l));
      return;
    }
    const name = step.name || "Step";
    const parts = [];
    if (step.reps != null) parts.push(step.per_side ? `${step.reps}/side` : `${step.reps} reps`);
    if (step.distance_display) parts.push(step.distance_display);
    else if (step.distance_m) parts.push(`${step.distance_m}m`);
    if (step.duration_sec && !step.distance_m && step.reps == null) {
      parts.push(`${Math.round(step.duration_sec / 60)} min`);
    }
    if (step.weight != null) parts.push(`${step.weight} ${step.weight_unit || "lbs"}`);
    lines.push(parts.length ? `${indent}${name}: ${parts.join(" · ")}` : `${indent}${name}`);
  });
  return lines;
}

// Convert a running-workout-generator `phases` array into the same
// interval shape `_formatInterval` expects. Mirrors
// add-running-session-flow.js:_phasesToIntervals — kept inline so the
// Strava module doesn't depend on AddRunningSessionFlow being loaded.
function _phasesToIntervalsForStrava(phases) {
  if (!Array.isArray(phases)) return [];
  const nameMap = {
    warmup: "Warm Up", cooldown: "Cool Down", main: "Main Set",
    main_set: "Main Set", main_cruise_intervals: "Cruise Intervals",
    optional_finish: "M-Pace Finish", optional_mp_finish: "M-Pace Finish",
  };
  const intensityMap = {
    z1: "Z1", z2: "Z2", z3: "Z3", z4: "Z4", z5: "Z5", z6: "Z6",
    z4_effort: "Z4", easy: "Z1", moderate: "Z2", tempo: "Z3",
    threshold: "Z4", hard: "Z4", vo2: "Z5", sprint: "Z5",
    rest: "RW", rw: "RW", walk: "RW",
  };
  return phases.map(p => {
    let dur;
    if (p.rep_count && p.rep_count > 1 && p.rep_distance) dur = p.rep_distance;
    else if (p.rep_duration_min) dur = `${p.rep_duration_min} min`;
    else dur = p.duration_min ? `${p.duration_min} min` : (p.distance_m ? `${p.distance_m}m` : "");
    const repCount = p.rep_count || p.reps || 0;
    return {
      name: nameMap[p.phase] || String(p.phase || "Interval").replace(/_/g, " "),
      duration: dur,
      effort: intensityMap[String(p.intensity || "").toLowerCase()] || p.intensity || "",
      details: p.instruction || p.target || "",
      ...(repCount > 1 ? { reps: repCount } : {}),
      ...(p.rest_sec ? { restDuration: `${p.rest_sec}s` } : {}),
    };
  });
}

// ── Interval / phase formatting (cardio description body) ───────────────
//
// Format: "Phase Name: <duration> @ Zx"
//   plain:             "Warm-up: 10 min @ Z1"
//   reps:              "Intervals: 8 × 400m @ Z4"
//   reps + rest:       "Intervals: 8 × 400m @ Z4 w/ 90s rest"
//
// We do NOT include the generator's free-text `details` field — it's
// noisy, already zone-tagged (causing double prints), and a Strava post
// reads cleanest with just "duration @ zone". If you want more detail,
// look at the activity on Strava which shows HR/pace/map anyway.
function _normalizePhaseName(name) {
  if (!name) return "Interval";
  const map = {
    "warmup": "Warm-up", "warm up": "Warm-up", "warm-up": "Warm-up", "wu": "Warm-up",
    "cooldown": "Cool-down", "cool down": "Cool-down", "cool-down": "Cool-down", "cd": "Cool-down",
    "main set": "Main Set", "mainset": "Main Set", "main": "Main Set",
    "tempo": "Tempo", "threshold": "Threshold",
    "intervals": "Intervals", "interval": "Interval",
    "recovery": "Recovery", "rest": "Rest",
  };
  const key = String(name).trim().toLowerCase();
  return map[key] || name;
}

function _formatInterval(iv) {
  const name = _normalizePhaseName(iv.name);
  const zone = iv.effort || iv.intensity || iv.zone || "";
  const reps = parseInt(iv.reps, 10) || 1;

  // Build the "body" — the duration/distance chunk to the right of the colon.
  const parts = [];
  const dist = iv.distance || iv.distance_display || "";
  const dur  = iv.duration || "";
  // Only prefix "N ×" when we have more than 1 rep AND a per-rep magnitude.
  if (reps > 1 && (dist || dur)) {
    parts.push(`${reps} × ${dist || dur}`);
  } else if (dur) {
    parts.push(dur);
  } else if (dist) {
    parts.push(dist);
  }

  // Normalize zone: if the generator gave us "Easy"/"Hard"/etc, coerce to
  // a Z-label so the format stays consistent.
  const zoneStr = _normalizeZoneLabel(zone);
  if (zoneStr) parts.push(`@ ${zoneStr}`);
  if (iv.restDuration) parts.push(`w/ ${_formatRestDuration(iv.restDuration)} rest`);

  if (!parts.length) return name;
  return `${name}: ${parts.join(" ")}`;
}

function _normalizeZoneLabel(zone) {
  if (!zone) return "";
  const s = String(zone).trim();
  if (/^Z[1-6]$/i.test(s)) return s.toUpperCase();
  const map = {
    easy: "Z1", recovery: "Z1", rw: "Z1",
    aerobic: "Z2", steady: "Z2", moderate: "Z2",
    tempo: "Z3", "sweet spot": "Z3", sweetspot: "Z3",
    threshold: "Z4", hard: "Z4",
    vo2: "Z5", sprint: "Z5", max: "Z5", maximal: "Z5",
  };
  return map[s.toLowerCase()] || s;
}

function _formatRestDuration(rd) {
  if (rd == null) return "";
  const s = String(rd).trim();
  if (!s) return "";
  // "90s" → "90s"; "2 min" → "2 min"; "90" (bare seconds) → "90s"
  if (/^\d+\s*$/.test(s)) return `${s}s`;
  return s;
}

// Render a swim step tree as description lines. Handles nested repeats,
// and for repeat blocks where every inner interval shares the same shape
// (e.g. "Main 100m @ 1:30/100m" repeated 8 times with 15s rest) we emit
// a compact single line like "8× 100m @ 1:30/100m w/ 15s rest" instead
// of unrolling the block.
// Swim stroke → capitalized display label.
const _SWIM_STROKE_LABEL = {
  freestyle:    "Freestyle",
  free:         "Freestyle",
  backstroke:   "Backstroke",
  back:         "Backstroke",
  breaststroke: "Breaststroke",
  breast:       "Breaststroke",
  butterfly:    "Butterfly",
  fly:          "Butterfly",
  im:           "IM",
  choice:       "Choice",
};

// Swim pace_target → effort zone. The canonical swim workouts use relative
// pace tokens (easy / CSS / CSS-5s / max) rather than Z-labels, so we map
// them onto the same Z1-Z5 scale the run/bike cards use.
function _swimPaceToZone(pace) {
  if (!pace) return "Z2";
  const s = String(pace).trim().toLowerCase();
  if (/easy|recovery|warm|cool/.test(s))           return "Z1";
  if (/aerobic|build|steady/.test(s))              return "Z2";
  if (/css\s*\+\s*\d/.test(s))                     return "Z2";
  if (/^css$|css\s*pace|threshold|tempo/.test(s))  return "Z3";
  if (/css\s*-\s*\d/.test(s))                      return "Z4";
  if (/hard|fast|race/.test(s))                    return "Z4";
  if (/max|sprint|all\s*out/.test(s))              return "Z5";
  // Numeric pace like "1:30/100m" — no zone inference, leave blank.
  return "";
}

function _formatSwimInterval(step) {
  const parts = [];
  if (step.distance_m) parts.push(`${step.distance_m}m`);
  const stroke = _SWIM_STROKE_LABEL[String(step.stroke || "").toLowerCase()];
  if (stroke) parts.push(stroke);
  const zone = _swimPaceToZone(step.pace_target || step.pace);
  if (zone) parts.push(`@ ${zone}`);
  return parts.join(" ");
}

// Try to compress a repeat block into "<name>: N × <dist> <stroke> @ Zx w/ <rest>".
// Returns a string on success, null if the block is heterogeneous and
// must be unrolled by the caller.
function _compressSwimRepeat(step) {
  const count = Number(step.count) || 1;
  const kids = step.children || [];
  const intervals = kids.filter(k => k && k.kind === "interval");
  const rests     = kids.filter(k => k && k.kind === "rest");
  const nested    = kids.filter(k => k && k.kind === "repeat");
  if (nested.length) return null;
  if (intervals.length !== 1) return null;
  if (rests.length > 1) return null;
  const iv = intervals[0];
  if (!iv.distance_m) return null;

  const stroke = _SWIM_STROKE_LABEL[String(iv.stroke || "").toLowerCase()] || "Freestyle";
  const zone = _swimPaceToZone(iv.pace_target || iv.pace);
  const restSec = rests[0] ? Number(rests[0].duration_sec) || 0 : 0;

  // Phase label — prefer the repeat block's own name, else the inner
  // interval's name, else "Main Set".
  const label = _normalizePhaseName(step.name || iv.name || "Main Set");

  let body = `${count} × ${iv.distance_m}m ${stroke}`;
  if (zone) body += ` @ ${zone}`;
  if (restSec > 0) body += ` w/ ${restSec}s rest`;
  return `${label}: ${body}`;
}

function _formatSwimSteps(steps, prefix) {
  prefix = prefix || "";
  const out = [];
  (steps || []).forEach(step => {
    if (!step) return;
    if (step.kind === "interval") {
      const body = _formatSwimInterval(step);
      const label = _normalizePhaseName(step.name || "Swim");
      if (body) out.push(`${prefix}${label}: ${body}`);
      else out.push(`${prefix}${label}`);
    } else if (step.kind === "rest") {
      const sec = Number(step.duration_sec) || 0;
      // Skip short intra-set rests — they're already implied by the set
      // notation ("8 × 100m w/ 15s rest"). Only surface meaningful breaks
      // (30s+) that aren't covered by a parent repeat.
      if (sec >= 30) out.push(`${prefix}Rest ${sec}s`);
    } else if (step.kind === "repeat") {
      const compact = _compressSwimRepeat(step);
      if (compact) {
        out.push(`${prefix}${compact}`);
      } else {
        const count = Number(step.count) || 1;
        out.push(`${prefix}${count}× Round${count === 1 ? "" : "s"}:`);
        const inner = _formatSwimSteps(step.children || [], prefix + "  ");
        out.push(...inner);
      }
    }
  });
  return out;
}

/**
 * Build the multi-line Strava activity description from an IronZ workout.
 * Per-field inclusion is controlled by `prefs` which comes from
 * getStravaCardPrefs(workout.type) by default, but the share prompt
 * lets the user override any field at upload time. Keys are:
 *
 *   typeLabel  — (legacy, ignored) title is now the Strava activity name
 *   body       — exercise list / interval list / segment list
 *   stats      — "52 min · 24 sets · 6 exercises" line
 *   distance   — explicit distance line (cardio only, if available)
 *   hiitMeta   — HIIT format / rounds / rest line
 *   notes      — user's workout notes field
 *   footer     — "Built with IronZ — ironz.fit" branding
 *
 * Note: we no longer prepend the workout name — Strava already shows it
 * as the activity title, so a duplicate line wastes vertical space.
 */
function _buildStravaDescription(w, prefs) {
  prefs = prefs || getStravaCardPrefs(w.type);
  const lines = [];

  const isSwim = _parentDiscipline(w.type) === "swimming";
  const bodySource = _bodySourceForWorkout(w);
  // `exercises` / `intervals` are kept as local refs for the stats line
  // below (needs exercise count + set count + interval count).
  const exercises = bodySource?.kind === "exercises" ? bodySource.data : null;
  const intervals = bodySource?.kind === "intervals" ? bodySource.data
                  : bodySource?.kind === "phases"    ? _phasesToIntervalsForStrava(bodySource.data)
                  : null;

  if (prefs.body && bodySource) {
    if (bodySource.kind === "exercises") {
      bodySource.data.forEach(ex => {
        const name = ex.name || "Exercise";
        const parts = [];
        if (ex.sets && ex.reps) parts.push(`${ex.sets} × ${ex.reps}`);
        else if (ex.sets) parts.push(`${ex.sets} sets`);
        else if (ex.reps) parts.push(`${ex.reps} reps`);
        if (ex.weight) parts.push(`@ ${ex.weight}`);
        if (ex.duration) parts.push(ex.duration);
        lines.push(parts.length ? `${name}: ${parts.join(" ")}` : name);
      });
    } else if (bodySource.kind === "swim_steps") {
      // Swim canonical step tree — render each phase with full set notation.
      _formatSwimSteps(bodySource.data).forEach(l => lines.push(l));
    } else if (bodySource.kind === "intervals" || bodySource.kind === "phases") {
      // Cardio: running/cycling/rowing. Running sessions generated by the
      // new flow carry their original `phases` array — convert to the
      // interval shape first so `_formatInterval` produces the "Phase Name:
      // details @ zone" format we want in Strava posts.
      intervals.forEach(iv => lines.push(_formatInterval(iv)));
    } else if (bodySource.kind === "segments") {
      bodySource.data.forEach(s => {
        const parts = [];
        if (s.duration) parts.push(s.duration);
        if (s.effort || s.intensity || s.zone) parts.push(s.effort || s.intensity || s.zone);
        lines.push(`${s.name || "Segment"}${parts.length ? ` — ${parts.join(" · ")}` : ""}`);
      });
    } else if (bodySource.kind === "circuit_steps") {
      // Circuit workouts — render the step tree with indented repeat blocks.
      // Prepend the goal line above the body ("Goal: For Time" /
      // "Goal: AMRAP · 20 min") so the reader knows how to interpret the
      // step list.
      const c = bodySource.circuit || {};
      const goalMap = { for_time: "For Time", amrap: "AMRAP", emom: "EMOM", standard: "Standard" };
      const goalLabel = goalMap[c.goal || "standard"];
      if (goalLabel) {
        const v = c.goal === "amrap" && c.goal_value
          ? ` · ${c.goal_value} min`
          : c.goal === "emom" && c.goal_value
            ? ` · ${c.goal_value} min/round`
            : "";
        lines.push(`Goal: ${goalLabel}${v}`);
        lines.push("");
      }
      _formatCircuitSteps(bodySource.data).forEach(l => lines.push(l));
    }
  }

  // HIIT metadata line (format · rounds · rest)
  if (prefs.hiitMeta && w.hiitMeta) {
    const m = w.hiitMeta;
    const fmtLabels = { circuit: "Circuit", tabata: "Tabata", emom: "EMOM", amrap: "AMRAP", "for-time": "For Time" };
    const mParts = [fmtLabels[m.format] || m.format || "HIIT"];
    if (m.rounds) mParts.push(`${m.rounds} rounds`);
    if (m.restBetweenRounds) mParts.push(`${m.restBetweenRounds} rest`);
    lines.push("");
    lines.push(mParts.join(" · "));
  }

  // Notes (user workout notes)
  if (prefs.notes && w.notes) {
    lines.push("");
    lines.push(String(w.notes));
  }

  // Stats line — format differs per discipline:
  //   Strength: "52 min · 24 sets · 6 exercises"
  //   Running/Cycling: "45 min" (distance is in the title)
  //   Swimming: "2,300m · 45 min" (distance first, time second)
  if (prefs.stats) {
    const statParts = [];
    const durMin = _plannedDurationMin(w);
    if (isSwim) {
      const distM = _swimTotalDistanceM(w);
      if (distM > 0) statParts.push(_formatSwimDistance(distM, _swimPoolUnit(w)));
      if (durMin > 0) statParts.push(`${durMin} min`);
    } else {
      if (durMin > 0) statParts.push(`${durMin} min`);
      if (exercises) {
        const totalSets = exercises.reduce((s, e) => s + (parseInt(e.sets, 10) || 0), 0);
        if (totalSets) statParts.push(`${totalSets} set${totalSets === 1 ? "" : "s"}`);
        statParts.push(`${exercises.length} exercise${exercises.length === 1 ? "" : "s"}`);
      }
    }
    if (statParts.length) {
      if (lines.length) lines.push("");
      lines.push(statParts.join(" · "));
    }
  }

  // Footer — branding
  if (prefs.footer) {
    lines.push("");
    lines.push("Built with IronZ — ironz.fit");
  }

  return lines.join("\n");
}

function _stravaWorkoutTypeLabel(w) {
  // Always resolve sub-types (tempo_threshold, swim_endurance, ...) to
  // their parent discipline so labels stay consistent across all code
  // paths that touch the Strava share prompt.
  const t = _parentDiscipline(w.type);
  const labels = {
    running: "Run", run: "Run",
    cycling: "Ride", bike: "Ride",
    swimming: "Swim", swim: "Swim",
    weightlifting: "Strength Training",
    bodyweight: "Bodyweight",
    hiit: "HIIT",
    yoga: "Yoga",
    rowing: "Rowing",
    walking: "Walk", walk: "Walk",
    hike: "Hike", hiking: "Hike",
    stairstepper: "Stair Stepper",
    brick: "Brick",
    triathlon: "Triathlon",
    general: "Workout",
  };
  return labels[t] || "Workout";
}

// Build the start_date_local in Strava's expected format: ISO 8601 with
// no trailing Z (Strava interprets it in the user's local time zone).
function _stravaStartDateLocal(w) {
  // Prefer an explicit completedAt timestamp, else compose from the date
  // string + 8am as a sensible default.
  if (w.completedAt) {
    try {
      const d = new Date(w.completedAt);
      // YYYY-MM-DDTHH:mm:ss with no Z
      return d.toISOString().replace("Z", "").slice(0, 19);
    } catch {}
  }
  const date = w.date || new Date().toISOString().slice(0, 10);
  return `${date}T08:00:00`;
}

function _stravaElapsedSeconds(w) {
  const min = _plannedDurationMin(w);
  if (min > 0) return min * 60;
  // Fallback: 30 minutes if we don't know
  return 30 * 60;
}

/**
 * Upload an IronZ workout to Strava. Returns { ok, strava_id?, reason? }.
 *
 * Caller responsibility:
 *   - Confirm the user wants to share (don't surprise them)
 *   - Show the resulting toast / error
 *
 * The upload edge function handles auth, scope check, token refresh,
 * the actual Strava POST, and mirroring the new activity into
 * strava_activities for round-trip prevention.
 *
 * On success, the local workout gets `stravaUploadId` set so the next
 * Strava sync will skip the round-trip.
 */
async function uploadWorkoutToStrava(workout, opts) {
  opts = opts || {};
  const sb = _stravaClient();
  if (!sb) return { ok: false, reason: "no_client" };

  // Same enrichment as the share prompt — makes the silent auto-share path
  // produce the same rich description as the manual share path.
  workout = _enrichWorkoutWithSource(workout);

  const accessToken = await _stravaAccessToken();
  if (!accessToken) return { ok: false, reason: "not_logged_in" };

  // Pre-flight scope check so we can surface the reconnect prompt
  // without burning a round-trip.
  const hasWrite = await hasStravaWriteScope();
  if (!hasWrite) {
    if (!opts.silent) _showStravaToast("Reconnect Strava to enable uploads");
    return { ok: false, reason: "missing_write_scope" };
  }

  // Caller can pass explicit card prefs (e.g. from the share prompt's
  // toggles); otherwise fall back to the user's saved prefs for this
  // workout type, which fall back to sensible defaults.
  const cardPrefs = opts.cardPrefs || getStravaCardPrefs(workout.type);

  // Description: prefer the user's hand-edited text from the share prompt
  // if they provided one, otherwise build it from the workout structure.
  const description = (typeof opts.descriptionOverride === "string" && opts.descriptionOverride.length > 0)
    ? opts.descriptionOverride
    : _buildStravaDescription(workout, cardPrefs);

  const payload = {
    name: _buildStravaTitle(workout),
    type: _stravaTypeForWorkout(workout),
    start_date_local: _stravaStartDateLocal(workout),
    elapsed_time: _stravaElapsedSeconds(workout),
    description,
    trainer: workout.type === "weightlifting" || workout.type === "bodyweight" || workout.type === "hiit",
  };

  // For swim, also send the total distance so Strava shows it on the card.
  if ((workout.type === "swim" || workout.type === "swimming")) {
    const distM = _swimTotalDistanceM(workout);
    if (distM > 0) payload.distance = distM;
  }

  if (!opts.silent) _showStravaToast("Posting to Strava…");

  try {
    const { data, error } = await sb.functions.invoke("strava-upload", {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: payload,
    });
    console.log("[Strava] upload — invoke result:", { data, error });
    if (error) throw error;
    if (!data || !data.ok) {
      const reason = (data && data.reason) || "unknown";
      if (!opts.silent) _showStravaToast(`Strava upload failed (${reason})`);
      return { ok: false, reason };
    }

    // Stamp the local workout with the returned Strava id so the next
    // sync skips it (round-trip prevention).
    try {
      const list = JSON.parse(localStorage.getItem("workouts") || "[]");
      const target = list.find(w => String(w.id) === String(workout.id));
      if (target) {
        target.stravaUploadId = data.strava_id;
        target.stravaUploadAt = new Date().toISOString();
        localStorage.setItem("workouts", JSON.stringify(list));
        if (typeof DB !== "undefined" && DB.syncWorkouts) DB.syncWorkouts();
      }
    } catch {}

    if (typeof trackEvent === "function") {
      trackEvent("strava_activity_uploaded", {
        type: payload.type,
        elapsed_time: payload.elapsed_time,
      });
    }

    if (!opts.silent) _showStravaToast("Posted to Strava!");
    return { ok: true, strava_id: data.strava_id, strava_url: data.strava_url };
  } catch (e) {
    console.error("[Strava] upload error:", e);
    if (typeof reportCaughtError === "function") reportCaughtError(e, { context: "strava", action: "upload" });
    if (!opts.silent) _showStravaToast("Couldn't post to Strava");
    return { ok: false, reason: "exception", error: e };
  }
}

/**
 * Auto-share path: called after a workout save in the live tracker or
 * day-detail completion form. No-op unless the user has enabled
 * auto-share AND has the write scope. Skips if the workout was already
 * uploaded (stravaUploadId set).
 */
async function tryAutoShareToStrava(workout) {
  if (!workout) return;
  if (!isStravaAutoShareEnabled()) return;
  if (workout.stravaUploadId) return;
  if (workout.source === "strava") return; // don't push a Strava activity back to Strava
  const hasWrite = await hasStravaWriteScope();
  if (!hasWrite) return;
  // Fire and forget — the user just finished a workout, we don't want to
  // block the UI on a network round-trip.
  uploadWorkoutToStrava(workout, { silent: true }).catch(() => {});
}

/**
 * Post-completion share path. The spec (Section 1) says:
 *   - Auto-share ON  → upload silently in the background
 *   - Auto-share OFF → show a modal asking the user if they want to
 *     share this specific workout, with "Share" and "Not now" buttons
 *
 * Called from every workout-completion code path (live tracker,
 * day-detail Mark-as-Complete form, quick-log). Short-circuits silently
 * if Strava isn't connected, the user doesn't have the write scope, or
 * the workout is already tagged with a stravaUploadId.
 *
 * Dedupes its own prompt via a session-storage flag keyed on workout id
 * so you can't get stacked modals if multiple code paths fire.
 */
async function promptStravaShareIfEligible(workout, opts) {
  opts = opts || {};
  if (!workout) return;
  // Hydrate the workout with structured body from its source schedule/plan
  // entry if the completion record is thin (older completions won't have
  // aiSession/phases carried forward). Done once upfront so every downstream
  // consumer — the toggle availability check, the preview renderer, the
  // upload payload builder — sees the same enriched object.
  workout = _enrichWorkoutWithSource(workout);
  // When force=true (explicit user action from the share action sheet),
  // we skip the auto-share bypass, the already-uploaded short-circuit,
  // and the session-storage dedup. The user is asking for the prompt
  // right now.
  const force = !!opts.force;

  if (!force && workout.stravaUploadId) { console.log("[Strava] prompt skipped: already uploaded", workout.id); return; }
  if (!force && workout.source === "strava") { console.log("[Strava] prompt skipped: workout came from Strava", workout.id); return; }

  const hasWrite = await hasStravaWriteScope();
  if (!hasWrite) {
    console.log("[Strava] prompt skipped: no write scope (reconnect in Settings)", { force });
    if (force) {
      _showStravaToast("Reconnect Strava in Settings to enable uploads");
    }
    return;
  }

  // Auto-share branch — silent background upload, only when NOT forced.
  if (!force && isStravaAutoShareEnabled()) {
    console.log("[Strava] auto-share uploading silently", workout.id);
    uploadWorkoutToStrava(workout, { silent: true }).catch(() => {});
    return;
  }

  // Manual branch — guard against prompt stacking on the completion
  // flow. The force path skips this so the share icon always works.
  if (!force) {
    try {
      const key = "stravaPromptShown:" + String(workout.id || "");
      if (sessionStorage.getItem(key) === "1") { console.log("[Strava] prompt skipped: already shown this session for", workout.id); return; }
      sessionStorage.setItem(key, "1");
    } catch {}
    console.log("[Strava] scheduling prompt for", workout.id);
    // Defer the modal a beat so it lands AFTER the rating modal opens
    // (the rating modal shows at +400ms from saveSessionCompletion).
    setTimeout(() => _showStravaSharePrompt(workout), 900);
  } else {
    // Forced path — show the prompt immediately.
    _showStravaSharePrompt(workout);
  }
}

// Field definitions for the toggle grid. Each entry has a user-facing
// label, a key into the prefs object, and an "availability" function
// that returns true only when the field actually has data to show. We
// hide unavailable toggles (e.g. "HIIT metadata" on a yoga workout) so
// the UI doesn't offer meaningless choices.
//
// The "body" toggle's label is dynamic per workout type — strength users
// see "Exercises", runners/cyclists see "Phases", swimmers see "Sets",
// circuit users see "Steps". Matches the cluster-1 spec.
function _bodyToggleLabel(w) {
  const parent = _parentDiscipline(w?.type);
  if (w?.type === "circuit" || w?.circuit) return "Steps";
  if (parent === "swimming") return "Sets";
  if (parent === "running" || parent === "cycling" || parent === "rowing") return "Phases";
  return "Exercises";
}

const _STRAVA_CARD_FIELDS = [
  { key: "body",      label: _bodyToggleLabel,
    available: (w) => !!_bodySourceForWorkout(w) },
  { key: "stats",     label: "Stats line",           available: () => true },
  { key: "hiitMeta",  label: "HIIT format / rounds", available: (w) => !!w.hiitMeta },
  { key: "notes",     label: "Workout notes",        available: (w) => !!w.notes },
  { key: "footer",    label: "IronZ branding footer", available: () => true },
];

function _showStravaSharePrompt(workout) {
  // Remove any existing prompt first.
  const existing = document.getElementById("strava-share-prompt");
  if (existing) existing.remove();

  const name = _escStrava(_buildStravaTitle(workout));
  const typeLabel = _escStrava(_stravaWorkoutTypeLabel(workout));
  const workoutType = (workout.type || "general");

  // Seed the prompt's prefs from the user's saved prefs for this type.
  // Live mutable object — we update it as toggles flip and re-render the
  // preview, then pass it to uploadWorkoutToStrava + setStravaCardPrefs
  // on share.
  const livePrefs = { ...getStravaCardPrefs(workoutType) };

  // Build the toggles HTML. Fields without available data are hidden.
  // A field's label may be a string or a function(workout) — the "body"
  // toggle uses the latter so its label is Exercises/Phases/Sets/Steps
  // depending on the workout discipline.
  const togglesHtml = _STRAVA_CARD_FIELDS
    .filter(f => f.available(workout))
    .map(f => {
      const rawLabel = typeof f.label === "function" ? f.label(workout) : f.label;
      return `
        <label class="strava-toggle-item" data-field="${f.key}">
          <input type="checkbox" data-field="${f.key}" ${livePrefs[f.key] ? "checked" : ""}>
          <span>${_escStrava(rawLabel)}</span>
        </label>
      `;
    }).join("");

  const overlay = document.createElement("div");
  overlay.id = "strava-share-prompt";
  overlay.className = "strava-share-prompt-overlay";
  overlay.innerHTML = `
    <div class="strava-share-prompt-modal">
      <div class="strava-share-prompt-header">
        <div class="strava-share-prompt-icon">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169"/></svg>
        </div>
        <div>
          <div class="strava-share-prompt-title">Share to Strava?</div>
          <div class="strava-share-prompt-sub">Post <strong>${name}</strong> · ${typeLabel}</div>
        </div>
      </div>
      <div class="strava-share-prompt-body">
        <div class="strava-preview-label">Preview <span class="strava-preview-hint">(editable)</span></div>
        <textarea class="strava-preview-box" id="strava-preview-box" spellcheck="false" rows="10"></textarea>
        <div class="strava-toggles-label">Include</div>
        <div class="strava-toggles-grid" id="strava-toggles-grid">${togglesHtml}</div>
        <div class="strava-share-prompt-remember">
          Your choices are saved as the default for future ${_escStrava(typeLabel.toLowerCase() || "workouts")}.
        </div>
      </div>
      <div class="strava-share-prompt-footer">
        <label class="strava-share-prompt-autoshare">
          <input type="checkbox" id="strava-share-prompt-remember">
          <span>Always share future workouts automatically</span>
        </label>
        <div class="strava-share-prompt-actions">
          <button class="btn-ghost"  id="strava-share-prompt-skip">Not now</button>
          <button class="btn-strava" id="strava-share-prompt-share">Share to Strava</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("is-open"));

  const previewEl = document.getElementById("strava-preview-box");
  // Track whether the user has manually edited the description. Once they
  // have, toggling a checkbox should NOT stomp their edit. We only reset
  // the "edited" flag when the user presses a toggle AFTER clearing the
  // field, or when they close and reopen the prompt.
  let userEdited = false;
  const refreshPreview = () => {
    if (userEdited) return;
    previewEl.value = _buildStravaDescription(workout, livePrefs);
  };
  refreshPreview();

  previewEl.addEventListener("input", () => {
    userEdited = true;
  });

  // Wire toggles — flipping any checkbox updates livePrefs and re-renders
  // the preview. If the user has hand-edited the text, toggles become
  // cosmetic-only (they still save as the default for next time).
  overlay.querySelectorAll('.strava-toggles-grid input[type="checkbox"]').forEach(cb => {
    cb.addEventListener("change", () => {
      const field = cb.dataset.field;
      livePrefs[field] = cb.checked;
      refreshPreview();
    });
  });

  const close = () => {
    overlay.classList.remove("is-open");
    setTimeout(() => overlay.remove(), 200);
  };

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  document.getElementById("strava-share-prompt-skip").addEventListener("click", close);

  document.getElementById("strava-share-prompt-share").addEventListener("click", async () => {
    const remember = document.getElementById("strava-share-prompt-remember")?.checked;
    if (remember) setStravaAutoShareEnabled(true);
    // Save the user's toggle choices as the new defaults for this type.
    setStravaCardPrefs(workoutType, livePrefs);
    // Capture whatever is currently in the textarea — either the
    // auto-generated body or the user's manual edits — and pass it
    // straight through to the uploader so it goes to Strava verbatim.
    const finalDescription = previewEl.value;
    close();
    await uploadWorkoutToStrava(workout, {
      silent: false,
      cardPrefs: livePrefs,
      descriptionOverride: finalDescription,
    });
  });
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
    const scopeStr = String(row.scope || "");
    const hasWrite = scopeStr.includes("activity:write");
    const autoShare = isStravaAutoShareEnabled();

    // Log the stored scope to the console every time we render so it's
    // easy to diagnose "reconnect isn't enabling uploads" reports.
    console.log("[Strava] renderStravaStatus — stored scope:", scopeStr || "(null)", "hasWrite:", hasWrite);

    // Small diagnostic line on the card so the user can see what's
    // actually stored without opening devtools. Read-only connections
    // display this in the reconnect block; successful upload-enabled
    // connections just see "Uploads: enabled".
    const scopeLine = scopeStr
      ? `<div class="strava-scope-info">Scope: <code>${_escStrava(scopeStr)}</code></div>`
      : `<div class="strava-scope-info">Scope: <code>(none stored)</code></div>`;

    // Read-only legacy connections need to re-grant the write scope
    // before the auto-share toggle becomes meaningful.
    const reconnectBlock = !hasWrite ? `
      <div class="strava-reconnect-prompt">
        <p class="hint">Reconnect to enable Push-to-Strava — your existing connection only has read access.</p>
        ${scopeLine}
        <button class="btn-strava btn-sm" onclick="connectStrava()">Reconnect to enable uploads</button>
        <p class="hint" style="margin-top:8px;font-size:0.72rem;opacity:0.75">
          If reconnecting doesn't change the scope above, the <code>strava-auth</code>
          and <code>strava-callback</code> Edge Functions need to be redeployed
          with <code>--no-verify-jwt</code>.
        </p>
      </div>` : "";

    const autoShareBlock = hasWrite ? `
      <label class="strava-toggle-row">
        <span>
          <span class="strava-toggle-title">Auto-share completed workouts</span>
          <span class="strava-toggle-sub">Posts every workout you finish to Strava with the IronZ branding line.</span>
        </span>
        <input type="checkbox" ${autoShare ? "checked" : ""}
               onchange="setStravaAutoShareEnabled(this.checked)">
      </label>` : "";

    container.innerHTML = `
      <div class="strava-connected">
        <div class="strava-user">
          Connected as <strong>${_escStrava(name)}</strong>
        </div>
        <div class="strava-sync-info">Last sync: ${_escStrava(sync)}</div>
        ${reconnectBlock}
        ${autoShareBlock}
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
  // Push-to-Strava
  window.uploadWorkoutToStrava = uploadWorkoutToStrava;
  window.tryAutoShareToStrava = tryAutoShareToStrava;
  window.promptStravaShareIfEligible = promptStravaShareIfEligible;
  window.hasStravaWriteScope = hasStravaWriteScope;
  window.isStravaAutoShareEnabled = isStravaAutoShareEnabled;
  window.setStravaAutoShareEnabled = setStravaAutoShareEnabled;
  window.getStravaCardPrefs = getStravaCardPrefs;
  window.setStravaCardPrefs = setStravaCardPrefs;
  // For back-compat with any old code calling importStravaActivities()
  window.importStravaActivities = syncStravaNow;
}
