// supabase/functions/strava-callback/index.ts
//
// Handles the Strava OAuth redirect. Strava sends the user here with
// ?code=X&state=Y after approval. We:
//   1. Look up the state nonce in strava_oauth_state to find user_id
//   2. Delete the nonce (one-time use)
//   3. Exchange the code for access/refresh tokens via Strava's token endpoint
//   4. Upsert the tokens + athlete info into strava_tokens
//   5. Redirect the browser back to the app with ?strava=connected
//
// Deploy: supabase functions deploy strava-callback --no-verify-jwt
// (The --no-verify-jwt flag is REQUIRED because Strava redirects the user
//  here without any JWT header. We verify the nonce instead.)
//
// Requires secrets: STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_RETURN_URL

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL          = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const STRAVA_CLIENT_ID      = Deno.env.get("STRAVA_CLIENT_ID") || "";
const STRAVA_CLIENT_SECRET  = Deno.env.get("STRAVA_CLIENT_SECRET") || "";
const STRAVA_RETURN_URL     = Deno.env.get("STRAVA_RETURN_URL") || "https://ironz.fit/?strava=connected";

function errorHtml(title: string, message: string): Response {
  const body = `<!doctype html><html><head><meta charset="UTF-8"><title>${title}</title>
<style>body{font-family:system-ui;background:#0f0f18;color:#fff;padding:40px;text-align:center;}
a{color:#a855f7;text-decoration:none;}</style></head>
<body><h1>${title}</h1><p style="color:#aaa">${message}</p>
<p><a href="https://ironz.fit">Return to IronZ</a></p></body></html>`;
  return new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
}

function redirect(url: string): Response {
  return new Response(null, { status: 302, headers: { Location: url } });
}

serve(async (req: Request) => {
  if (req.method !== "GET") {
    return errorHtml("Unsupported request", "Expected GET.");
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET) {
    return errorHtml("Server misconfigured", "Strava integration is not fully set up. Contact support.");
  }

  const url = new URL(req.url);
  const code  = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err   = url.searchParams.get("error");

  if (err) {
    return redirect(`${STRAVA_RETURN_URL.split("?")[0]}?strava=error&reason=${encodeURIComponent(err)}`);
  }
  if (!code || !state) {
    return errorHtml("Missing parameters", "The callback URL was malformed. Try connecting again from the app.");
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Look up the nonce → user_id
  const { data: stateRow, error: stateErr } = await admin
    .from("strava_oauth_state")
    .select("user_id, expires_at")
    .eq("nonce", state)
    .maybeSingle();

  if (stateErr || !stateRow) {
    return errorHtml("Session expired", "This connect link has already been used or has expired. Try again from the app.");
  }
  if (new Date(stateRow.expires_at) < new Date()) {
    await admin.from("strava_oauth_state").delete().eq("nonce", state);
    return errorHtml("Session expired", "The connect link expired. Try again from the app.");
  }

  // One-time use — delete the nonce before doing anything else.
  await admin.from("strava_oauth_state").delete().eq("nonce", state);

  const userId = stateRow.user_id;

  // Exchange the code for tokens.
  let tokenData: any;
  try {
    const resp = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: STRAVA_CLIENT_ID,
        client_secret: STRAVA_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
      }),
    });
    tokenData = await resp.json();
    if (!resp.ok || !tokenData.access_token) {
      return errorHtml("Strava denied the request", tokenData.message || "Token exchange failed.");
    }
  } catch (e: any) {
    return errorHtml("Network error", "Couldn't reach Strava. " + (e.message || ""));
  }

  const athlete = tokenData.athlete || {};
  const expiresAtIso = new Date((tokenData.expires_at || 0) * 1000).toISOString();

  // Upsert into strava_tokens
  const { error: upsertErr } = await admin
    .from("strava_tokens")
    .upsert({
      user_id: userId,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: expiresAtIso,
      athlete_id: athlete.id || null,
      athlete_firstname: athlete.firstname || null,
      athlete_lastname: athlete.lastname || null,
      athlete_avatar: athlete.profile_medium || athlete.profile || null,
      connected_at: new Date().toISOString(),
    });

  if (upsertErr) {
    return errorHtml("Database error", "Couldn't save your connection. " + upsertErr.message);
  }

  // Redirect back to the app with a success flag.
  return redirect(STRAVA_RETURN_URL);
});
