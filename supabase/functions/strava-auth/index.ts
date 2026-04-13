// supabase/functions/strava-auth/index.ts
//
// Initiates the Strava OAuth2 flow. Called by the client from a
// user-authenticated fetch (Authorization: Bearer <supabase_jwt>).
// Generates a random nonce, stores it in strava_oauth_state keyed to the
// user_id, and returns the Strava authorize URL with the nonce as `state`.
//
// Deploy: supabase functions deploy strava-auth --no-verify-jwt
//
// IMPORTANT: --no-verify-jwt is REQUIRED. Supabase's platform-level JWT
// verification (enabled by default) runs BEFORE the function code, and
// in some edge runtime versions rejects valid session tokens before our
// manual getUser() check can run — resulting in a 401 with no function
// logs. We do manual JWT verification via a user-scoped Supabase client
// inside the function, so the platform pre-check is redundant.
//
// Requires secrets: STRAVA_CLIENT_ID, STRAVA_REDIRECT_URI

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL       = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const STRAVA_CLIENT_ID   = Deno.env.get("STRAVA_CLIENT_ID") || "";
const STRAVA_REDIRECT_URI = Deno.env.get("STRAVA_REDIRECT_URI") || "";

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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "server_misconfigured" }, 500);
  }
  if (!STRAVA_CLIENT_ID || !STRAVA_REDIRECT_URI) {
    return jsonResponse({ error: "strava_not_configured" }, 500);
  }

  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  // Verify the user's JWT with a user-scoped client.
  const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userInfo, error: userErr } = await userClient.auth.getUser();
  const userId = userInfo?.user?.id;
  if (userErr || !userId) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  // Generate a random nonce and store it in strava_oauth_state.
  const nonce = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { error: insertErr } = await admin
    .from("strava_oauth_state")
    .insert({ nonce, user_id: userId, expires_at: expiresAt });
  if (insertErr) {
    return jsonResponse({ error: "state_store_failed", detail: insertErr.message }, 500);
  }

  // Build the authorize URL. approval_prompt=auto so returning users don't
  // have to re-grant every time.
  const params = new URLSearchParams({
    client_id: STRAVA_CLIENT_ID,
    response_type: "code",
    redirect_uri: STRAVA_REDIRECT_URI,
    scope: "activity:read_all",
    approval_prompt: "auto",
    state: nonce,
  });
  const authorize_url = `https://www.strava.com/oauth/authorize?${params.toString()}`;

  return jsonResponse({ authorize_url });
});
