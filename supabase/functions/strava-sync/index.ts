// supabase/functions/strava-sync/index.ts
//
// Pulls recent activities from the Strava API for the authenticated user.
// Refreshes the access token if it's expired or about to expire. Upserts
// activities into strava_activities. Returns the synced rows so the
// client can mirror them into local state / calendar rendering.
//
// Deploy: supabase functions deploy strava-sync --no-verify-jwt
//
// IMPORTANT: --no-verify-jwt is REQUIRED for the same reason as
// strava-auth — platform JWT verification can reject valid session
// tokens before the function code runs. Manual verification via a
// user-scoped Supabase client is wired up inside the function.
//
// Requires secrets: STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const STRAVA_CLIENT_ID     = Deno.env.get("STRAVA_CLIENT_ID") || "";
const STRAVA_CLIENT_SECRET = Deno.env.get("STRAVA_CLIENT_SECRET") || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

async function refreshIfNeeded(admin: any, tokenRow: any): Promise<any> {
  const nowMs = Date.now();
  const expiresAtMs = new Date(tokenRow.expires_at).getTime();
  // Refresh if the token expires in the next 60 seconds.
  if (expiresAtMs > nowMs + 60_000) return tokenRow;

  const resp = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      refresh_token: tokenRow.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const data = await resp.json();
  if (!resp.ok || !data.access_token) {
    throw new Error("refresh_failed: " + (data.message || resp.status));
  }

  const newExpiresAt = new Date((data.expires_at || 0) * 1000).toISOString();
  const { error } = await admin
    .from("strava_tokens")
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: newExpiresAt,
    })
    .eq("user_id", tokenRow.user_id);
  if (error) throw new Error("token_update_failed: " + error.message);

  return {
    ...tokenRow,
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: newExpiresAt,
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET) {
    return jsonResponse({ error: "server_misconfigured" }, 500);
  }

  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  // Verify user
  const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userInfo } = await userClient.auth.getUser();
  const userId = userInfo?.user?.id;
  if (!userId) return jsonResponse({ error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Fetch the user's Strava token row
  const { data: tokenRow, error: tokenErr } = await admin
    .from("strava_tokens")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (tokenErr) return jsonResponse({ error: "token_lookup_failed", detail: tokenErr.message }, 500);
  if (!tokenRow) return jsonResponse({ error: "not_connected" }, 400);

  // Parse optional body — { since?: unix seconds }
  let since: number | null = null;
  try {
    const body = await req.json();
    if (body && typeof body.since === "number") since = body.since;
  } catch {}

  // Default: last 30 days
  if (!since) {
    since = Math.floor((Date.now() - 30 * 86400000) / 1000);
  }

  // Refresh token if needed
  let workingToken: any;
  try {
    workingToken = await refreshIfNeeded(admin, tokenRow);
  } catch (e: any) {
    return jsonResponse({ error: "refresh_failed", detail: e.message }, 500);
  }

  // Fetch activities from Strava
  const stravaUrl = `https://www.strava.com/api/v3/athlete/activities?after=${since}&per_page=50`;
  let activities: any[] = [];
  try {
    const resp = await fetch(stravaUrl, {
      headers: { Authorization: `Bearer ${workingToken.access_token}` },
    });
    if (!resp.ok) {
      const txt = await resp.text();
      return jsonResponse({ error: "strava_fetch_failed", status: resp.status, detail: txt }, 502);
    }
    activities = await resp.json();
  } catch (e: any) {
    return jsonResponse({ error: "strava_network_error", detail: e.message }, 502);
  }

  if (!Array.isArray(activities)) {
    return jsonResponse({ error: "strava_bad_response" }, 502);
  }

  // Upsert activities
  const rows = activities.map((a: any) => ({
    id: a.id,
    user_id: userId,
    name: a.name || null,
    type: a.type || a.sport_type || null,
    distance: a.distance ?? null,
    moving_time: a.moving_time ?? null,
    elapsed_time: a.elapsed_time ?? null,
    start_date: a.start_date || null,
    start_date_local: a.start_date_local || null,
    average_heartrate: a.average_heartrate ?? null,
    max_heartrate: a.max_heartrate ?? null,
    suffer_score: a.suffer_score ?? null,
    total_elevation_gain: a.total_elevation_gain ?? null,
    map_summary_polyline: a.map?.summary_polyline || null,
    raw: a,
    synced_at: new Date().toISOString(),
  }));

  if (rows.length > 0) {
    const { error: upsertErr } = await admin
      .from("strava_activities")
      .upsert(rows, { onConflict: "id" });
    if (upsertErr) {
      return jsonResponse({ error: "upsert_failed", detail: upsertErr.message }, 500);
    }
  }

  // Update last_sync_at
  await admin
    .from("strava_tokens")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("user_id", userId);

  // Return the synced rows so the client can mirror them into local state.
  // We return a trimmed version (no raw) to keep the payload small.
  const trimmed = rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    distance: r.distance,
    moving_time: r.moving_time,
    elapsed_time: r.elapsed_time,
    start_date: r.start_date,
    start_date_local: r.start_date_local,
    average_heartrate: r.average_heartrate,
    suffer_score: r.suffer_score,
    map_summary_polyline: r.map_summary_polyline,
  }));

  return jsonResponse({ synced: rows.length, activities: trimmed });
});
