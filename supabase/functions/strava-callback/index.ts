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

  // Helper: redirect back to the SPA with a normalized error reason the
  // client maps to a friendly toast. Always the same shape so
  // handleStravaReturn() can dispatch on `reason` alone.
  const returnBase = STRAVA_RETURN_URL.split("?")[0];
  const errorReturn = (reason: string) =>
    redirect(`${returnBase}?strava=error&reason=${encodeURIComponent(reason)}`);

  if (err) {
    // Strava redirected back with an error before we even saw a code.
    // `access_denied` = user clicked Cancel on the authorize page.
    // Anything else (`temporarily_unavailable`, server errors) we pass
    // through as-is so the client can surface the raw reason.
    return errorReturn(err);
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
      // Detect Strava's "limit of connected athletes exceeded" — it
      // surfaces as a 403 with a message containing "limit" and an
      // errors[].code === "exceeded". Body shape (observed):
      //   { "message": "Authorization Error",
      //     "errors": [{ "resource": "Application",
      //                  "field": "limit", "code": "exceeded" }] }
      // When we hit it, redirect back to the SPA with a normalized
      // reason so the client shows the friendly fallback copy instead
      // of Strava's raw "Authorization Error" verbatim. Default API
      // quota is 1, so this is the most common 403 we'll see in v1
      // until the higher-tier app review goes through.
      const msgText = String(tokenData?.message || "").toLowerCase();
      const quotaSignal =
        resp.status === 403 && (
          msgText.includes("limit") ||
          msgText.includes("exceeded") ||
          (Array.isArray(tokenData?.errors) &&
           tokenData.errors.some((e: any) =>
             String(e?.code || "").toLowerCase() === "exceeded" ||
             String(e?.field || "").toLowerCase() === "limit"
           ))
        );
      if (quotaSignal) {
        return errorReturn("quota_exceeded");
      }
      // Any other Strava denial — generic reason. Client toasts the
      // raw message slot from tokenData if present, so we still need
      // to pass something useful.
      return errorReturn("token_exchange_failed");
    }
  } catch (e: any) {
    return errorReturn("network_error");
  }

  const athlete = tokenData.athlete || {};
  const expiresAtIso = new Date((tokenData.expires_at || 0) * 1000).toISOString();

  // Strava also returns `scope` (and an array `scope_split` in some
  // versions) confirming which scopes the user actually granted. Falling
  // back to the request scopes if the response doesn't include it.
  let grantedScope: string | null = tokenData.scope || null;
  if (!grantedScope && Array.isArray(tokenData.scope_split)) {
    grantedScope = tokenData.scope_split.join(",");
  }
  // Strava's authorize page also passes the granted scope back via the
  // callback query string when the user accepts a subset of the requested
  // scopes. Prefer that if present, since it's the most authoritative.
  const callbackScope = url.searchParams.get("scope");
  if (callbackScope) grantedScope = callbackScope;

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
      scope: grantedScope,
    });

  if (upsertErr) {
    return errorReturn("save_failed");
  }

  // Redirect back to the app with a success flag.
  return redirect(STRAVA_RETURN_URL);
});
