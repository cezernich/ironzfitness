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
    let tok = data?.session?.access_token || null;
    // If getSession() returned nothing (auth state still loading), fall
    // back to refreshSession which forces a re-read from storage.
    if (!tok && sb.auth.refreshSession) {
      try {
        const { data: r } = await sb.auth.refreshSession();
        tok = r?.session?.access_token || null;
      } catch {}
    }
    return tok;
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

function _stravaTypeForWorkout(w) {
  const t = (w.type || "").toLowerCase();
  return IRONZ_TO_STRAVA_TYPE[t] || "Workout";
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
const _STRAVA_CARD_DEFAULTS_BY_TYPE = {
  weightlifting: { typeLabel: true, body: true, stats: true, distance: false, hiitMeta: false, notes: false, footer: true },
  bodyweight:    { typeLabel: true, body: true, stats: true, distance: false, hiitMeta: false, notes: false, footer: true },
  hiit:          { typeLabel: true, body: true, stats: true, distance: false, hiitMeta: true,  notes: false, footer: true },
  running:       { typeLabel: true, body: true, stats: true, distance: true,  hiitMeta: false, notes: false, footer: true },
  cycling:       { typeLabel: true, body: true, stats: true, distance: true,  hiitMeta: false, notes: false, footer: true },
  swimming:      { typeLabel: true, body: true, stats: true, distance: true,  hiitMeta: false, notes: false, footer: true },
  yoga:          { typeLabel: true, body: true, stats: true, distance: false, hiitMeta: false, notes: true,  footer: true },
  rowing:        { typeLabel: true, body: true, stats: true, distance: true,  hiitMeta: false, notes: false, footer: true },
  walking:       { typeLabel: true, body: false, stats: true, distance: true, hiitMeta: false, notes: false, footer: true },
  hiking:        { typeLabel: true, body: false, stats: true, distance: true, hiitMeta: false, notes: false, footer: true },
  general:       { typeLabel: true, body: true, stats: true, distance: false, hiitMeta: false, notes: false, footer: true },
};
const _STRAVA_CARD_DEFAULT = { typeLabel: true, body: true, stats: true, distance: false, hiitMeta: false, notes: false, footer: true };

function _normalizeWorkoutTypeKey(type) {
  const t = (type || "").toLowerCase();
  if (t === "run") return "running";
  if (t === "bike") return "cycling";
  if (t === "swim") return "swimming";
  if (t === "walk") return "walking";
  if (t === "hike") return "hiking";
  return t || "general";
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

/**
 * Build the multi-line Strava activity description from an IronZ workout.
 * Per-field inclusion is controlled by `prefs` which comes from
 * getStravaCardPrefs(workout.type) by default, but the share prompt
 * lets the user override any field at upload time. Keys are:
 *
 *   typeLabel  — append "— Strength Training" to title
 *   body       — exercise list / interval list / segment list
 *   stats      — "52 min · 24 sets · 6 exercises" line
 *   distance   — explicit distance line (cardio only, if available)
 *   hiitMeta   — HIIT format / rounds / rest line
 *   notes      — user's workout notes field
 *   footer     — "Built with IronZ — ironz.fit" branding
 */
function _buildStravaDescription(w, prefs) {
  prefs = prefs || getStravaCardPrefs(w.type);
  const lines = [];

  // Title — always included (a Strava activity has to have one)
  const typeLabel = _stravaWorkoutTypeLabel(w);
  const titleLine = prefs.typeLabel && typeLabel
    ? `${w.name || w.sessionName || "Workout"} — ${typeLabel}`
    : (w.name || w.sessionName || "Workout");
  lines.push(titleLine);

  // Body: exercises (strength/HIIT) OR intervals (cardio) OR segments
  const exercises = (w.exercises && w.exercises.length) ? w.exercises : null;
  const intervals = (w.aiSession && w.aiSession.intervals && w.aiSession.intervals.length)
    ? w.aiSession.intervals
    : null;
  const segments = (w.segments && w.segments.length) ? w.segments : null;

  if (prefs.body) {
    if (exercises) {
      lines.push("");
      exercises.forEach(ex => {
        const name = ex.name || "Exercise";
        const parts = [];
        if (ex.sets && ex.reps) parts.push(`${ex.sets} × ${ex.reps}`);
        else if (ex.sets) parts.push(`${ex.sets} sets`);
        else if (ex.reps) parts.push(`${ex.reps} reps`);
        if (ex.weight) parts.push(`@ ${ex.weight}`);
        if (ex.duration) parts.push(ex.duration);
        lines.push(parts.length ? `${name}: ${parts.join(" ")}` : name);
      });
    } else if (intervals) {
      lines.push("");
      intervals.forEach(iv => {
        const parts = [];
        if (iv.duration) parts.push(iv.duration);
        if (iv.effort || iv.intensity) parts.push(iv.effort || iv.intensity);
        lines.push(`${iv.name || "Interval"}${parts.length ? ` — ${parts.join(" · ")}` : ""}`);
      });
    } else if (segments) {
      lines.push("");
      segments.forEach(s => {
        const parts = [];
        if (s.duration) parts.push(s.duration);
        if (s.effort || s.intensity || s.zone) parts.push(s.effort || s.intensity || s.zone);
        lines.push(`${s.name || "Segment"}${parts.length ? ` — ${parts.join(" · ")}` : ""}`);
      });
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

  // Stats line
  if (prefs.stats) {
    const statParts = [];
    const durMin = parseInt(w.duration, 10);
    if (durMin > 0) statParts.push(`${durMin} min`);
    if (exercises) {
      const totalSets = exercises.reduce((s, e) => s + (parseInt(e.sets, 10) || 0), 0);
      if (totalSets) statParts.push(`${totalSets} set${totalSets === 1 ? "" : "s"}`);
      statParts.push(`${exercises.length} exercise${exercises.length === 1 ? "" : "s"}`);
    } else if (intervals) {
      statParts.push(`${intervals.length} interval${intervals.length === 1 ? "" : "s"}`);
    }
    if (statParts.length) {
      lines.push("");
      lines.push(statParts.join(" · "));
    }
  }

  // Distance line (cardio only, if available)
  if (prefs.distance && w.distance) {
    lines.push("");
    lines.push(`Distance: ${w.distance}`);
  }

  // Footer — branding
  if (prefs.footer) {
    lines.push("");
    lines.push("Built with IronZ — ironz.fit");
  }

  return lines.join("\n");
}

function _stravaWorkoutTypeLabel(w) {
  const t = (w.type || "").toLowerCase();
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
  const min = parseInt(w.duration, 10);
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

  const payload = {
    name: workout.name || workout.sessionName || "IronZ workout",
    type: _stravaTypeForWorkout(workout),
    start_date_local: _stravaStartDateLocal(workout),
    elapsed_time: _stravaElapsedSeconds(workout),
    description: _buildStravaDescription(workout, cardPrefs),
    trainer: workout.type === "weightlifting" || workout.type === "bodyweight" || workout.type === "hiit",
  };

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
  // When force=true (explicit user action from the share action sheet),
  // we skip the auto-share bypass, the already-uploaded short-circuit,
  // and the session-storage dedup. The user is asking for the prompt
  // right now.
  const force = !!opts.force;

  if (!force && workout.stravaUploadId) return;
  if (!force && workout.source === "strava") return;

  const hasWrite = await hasStravaWriteScope();
  if (!hasWrite) {
    if (force) {
      _showStravaToast("Reconnect Strava in Settings to enable uploads");
    }
    return;
  }

  // Auto-share branch — silent background upload, only when NOT forced.
  if (!force && isStravaAutoShareEnabled()) {
    uploadWorkoutToStrava(workout, { silent: true }).catch(() => {});
    return;
  }

  // Manual branch — guard against prompt stacking on the completion
  // flow. The force path skips this so the share icon always works.
  if (!force) {
    try {
      const key = "stravaPromptShown:" + String(workout.id || "");
      if (sessionStorage.getItem(key) === "1") return;
      sessionStorage.setItem(key, "1");
    } catch {}
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
const _STRAVA_CARD_FIELDS = [
  { key: "typeLabel", label: "Type label", available: (w) => !!_stravaWorkoutTypeLabel(w) },
  { key: "body",      label: "Exercises / intervals",
    available: (w) => (w.exercises && w.exercises.length)
                    || (w.aiSession && w.aiSession.intervals && w.aiSession.intervals.length)
                    || (w.segments && w.segments.length) },
  { key: "stats",     label: "Stats line (time · sets · count)",
    available: () => true },
  { key: "distance",  label: "Distance", available: (w) => !!w.distance },
  { key: "hiitMeta",  label: "HIIT format / rounds / rest",
    available: (w) => !!w.hiitMeta },
  { key: "notes",     label: "Workout notes", available: (w) => !!w.notes },
  { key: "footer",    label: "IronZ branding footer", available: () => true },
];

function _showStravaSharePrompt(workout) {
  // Remove any existing prompt first.
  const existing = document.getElementById("strava-share-prompt");
  if (existing) existing.remove();

  const name = _escStrava(workout.name || workout.sessionName || "this workout");
  const typeLabel = _escStrava(_stravaWorkoutTypeLabel(workout));
  const workoutType = (workout.type || "general");

  // Seed the prompt's prefs from the user's saved prefs for this type.
  // Live mutable object — we update it as toggles flip and re-render the
  // preview, then pass it to uploadWorkoutToStrava + setStravaCardPrefs
  // on share.
  const livePrefs = { ...getStravaCardPrefs(workoutType) };

  // Build the toggles HTML. Fields without available data are hidden.
  const togglesHtml = _STRAVA_CARD_FIELDS
    .filter(f => f.available(workout))
    .map(f => `
      <label class="strava-toggle-item" data-field="${f.key}">
        <input type="checkbox" data-field="${f.key}" ${livePrefs[f.key] ? "checked" : ""}>
        <span>${_escStrava(f.label)}</span>
      </label>
    `).join("");

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
        <div class="strava-preview-label">Preview</div>
        <div class="strava-preview-box" id="strava-preview-box"></div>
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
  const refreshPreview = () => {
    previewEl.textContent = _buildStravaDescription(workout, livePrefs);
  };
  refreshPreview();

  // Wire toggles — flipping any checkbox updates livePrefs and
  // re-renders the preview in place.
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
    close();
    await uploadWorkoutToStrava(workout, { silent: false, cardPrefs: livePrefs });
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
    const hasWrite = String(row.scope || "").includes("activity:write");
    const autoShare = isStravaAutoShareEnabled();

    // Read-only legacy connections need to re-grant the write scope
    // before the auto-share toggle becomes meaningful.
    const reconnectBlock = !hasWrite ? `
      <div class="strava-reconnect-prompt">
        <p class="hint">Reconnect to enable Push-to-Strava — your existing connection only has read access.</p>
        <button class="btn-strava btn-sm" onclick="connectStrava()">Reconnect to enable uploads</button>
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
