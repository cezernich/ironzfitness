// supabase/functions/strava-upload/index.ts
//
// Push-to-Strava: uploads a completed IronZ workout to Strava as a manual
// activity. Requires the user to have granted activity:write scope when
// connecting (re-auth flow handled client-side).
//
// POST body:
//   {
//     name:             "Upper Body Push + Core",
//     type:             "WeightTraining",          // Strava activity type
//     start_date_local: "2026-04-13T07:30:00",     // ISO 8601, no tz
//     elapsed_time:     3120,                       // seconds
//     description:      "Bench Press: 4 × 8 ...",   // formatted multi-line
//     trainer:          true | false                // optional
//     distance:         12345.6                     // optional, meters
//   }
//
// Returns: { ok: true, strava_id, strava_url } on success
//          { ok: false, reason, status } on failure
//
// Deploy: supabase functions deploy strava-upload --no-verify-jwt
// (Same --no-verify-jwt requirement as the other Strava functions —
//  manual JWT verification is wired up below.)
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

// ── Token refresh (copied from strava-sync — kept inline so this function
//    doesn't import from a sibling) ─────────────────────────────────────
async function refreshIfNeeded(admin: any, tokenRow: any): Promise<any> {
  const nowMs = Date.now();
  const expiresAtMs = new Date(tokenRow.expires_at).getTime();
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
  await admin
    .from("strava_tokens")
    .update({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: newExpiresAt,
    })
    .eq("user_id", tokenRow.user_id);

  return {
    ...tokenRow,
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: newExpiresAt,
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return jsonResponse({ ok: false, reason: "method_not_allowed" }, 405);

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET) {
    return jsonResponse({ ok: false, reason: "server_misconfigured" }, 500);
  }

  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) {
    return jsonResponse({ ok: false, reason: "unauthorized" }, 401);
  }

  // Verify user
  const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userInfo } = await userClient.auth.getUser();
  const userId = userInfo?.user?.id;
  if (!userId) return jsonResponse({ ok: false, reason: "unauthorized" }, 401);

  // Parse body
  let body: any;
  try { body = await req.json(); }
  catch { return jsonResponse({ ok: false, reason: "bad_json" }, 400); }

  const {
    name,
    type,
    start_date_local,
    elapsed_time,
    description,
    trainer,
    distance,
  } = body || {};

  if (!name || !type || !start_date_local || !elapsed_time) {
    return jsonResponse({
      ok: false,
      reason: "missing_fields",
      required: ["name", "type", "start_date_local", "elapsed_time"],
    }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Fetch + (if needed) refresh the user's Strava token
  const { data: tokenRow, error: tokenErr } = await admin
    .from("strava_tokens")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (tokenErr) return jsonResponse({ ok: false, reason: "token_lookup_failed", detail: tokenErr.message }, 500);
  if (!tokenRow) return jsonResponse({ ok: false, reason: "not_connected" }, 400);

  // Confirm write scope. NULL scope = legacy connection without write.
  const scope = String(tokenRow.scope || "");
  if (!scope.includes("activity:write")) {
    return jsonResponse({ ok: false, reason: "missing_write_scope" }, 403);
  }

  let workingToken: any;
  try {
    workingToken = await refreshIfNeeded(admin, tokenRow);
  } catch (e: any) {
    return jsonResponse({ ok: false, reason: "refresh_failed", detail: e.message }, 500);
  }

  // POST the activity to Strava. Strava expects form-encoded params on the
  // activities create endpoint, not JSON.
  const form = new URLSearchParams();
  form.set("name", String(name));
  form.set("type", String(type));
  form.set("start_date_local", String(start_date_local));
  form.set("elapsed_time", String(elapsed_time));
  if (description) form.set("description", String(description));
  if (trainer != null) form.set("trainer", trainer ? "1" : "0");
  if (distance != null) form.set("distance", String(distance));

  let stravaResp: Response;
  try {
    stravaResp = await fetch("https://www.strava.com/api/v3/activities", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${workingToken.access_token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
  } catch (e: any) {
    return jsonResponse({ ok: false, reason: "network_error", detail: e.message }, 502);
  }

  let stravaData: any = null;
  try { stravaData = await stravaResp.json(); }
  catch { stravaData = null; }

  if (!stravaResp.ok) {
    return jsonResponse({
      ok: false,
      reason: "strava_rejected",
      status: stravaResp.status,
      detail: stravaData,
    }, 502);
  }

  const stravaId = stravaData?.id || null;
  if (!stravaId) {
    return jsonResponse({ ok: false, reason: "no_strava_id", detail: stravaData }, 502);
  }

  // Mirror the new activity into strava_activities so it shows up in the
  // user's synced history immediately (without waiting for the next sync).
  // Round-trip prevention is handled client-side via the local workout's
  // stravaUploadId field.
  try {
    await admin.from("strava_activities").upsert({
      id: stravaId,
      user_id: userId,
      name: stravaData.name || name,
      type: stravaData.type || type,
      distance: stravaData.distance ?? null,
      moving_time: stravaData.moving_time ?? elapsed_time,
      elapsed_time: stravaData.elapsed_time ?? elapsed_time,
      start_date: stravaData.start_date || null,
      start_date_local: stravaData.start_date_local || start_date_local,
      raw: stravaData,
      synced_at: new Date().toISOString(),
    }, { onConflict: "id" });
  } catch (e: any) {
    // Non-fatal: the activity is on Strava even if our mirror failed.
    console.warn("[strava-upload] mirror upsert failed:", e.message);
  }

  return jsonResponse({
    ok: true,
    strava_id: stravaId,
    strava_url: `https://www.strava.com/activities/${stravaId}`,
  });
});
