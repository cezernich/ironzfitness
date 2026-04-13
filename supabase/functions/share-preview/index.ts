// supabase/functions/share-preview/index.ts
//
// Public workout-share data endpoint. Returns JSON by default so the
// static share page (ironz.fit/share?token=X) can fetch workout data
// and render it client-side. Direct browser navigation 302s to the
// same static page.
//
// WHY JSON INSTEAD OF HTML: Supabase's Edge Runtime forces
// Content-Type: text/plain on all --no-verify-jwt Edge Function
// responses, even with status 200. We can't serve styled HTML directly
// from this function — browsers render it as source code. The
// workaround is to move rendering to GitHub Pages (which CAN serve
// HTML with a real Content-Type) and use this function purely as a
// JSON data source.
//
// PRIVACY: this function NEVER computes or returns concrete paces.
// The sender's VDOT/FTP/CSS never left the sender's device.
//
// Deploy: supabase functions deploy share-preview --no-verify-jwt
// Set:    SUPABASE_URL and SUPABASE_ANON_KEY env vars (auto-set).

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const STATIC_SHARE_URL = "https://ironz.fit/share";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

function redirectTo(url: string) {
  return new Response(null, {
    status: 302,
    headers: { ...CORS, Location: url },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);

  // Token resolution: path segment, ?token=, or legacy ?id=.
  const pathToken = (url.pathname.split("/").pop() || "").trim();
  const queryToken = url.searchParams.get("token") || url.searchParams.get("id") || "";
  const token = (pathToken && pathToken !== "share-preview" ? pathToken : queryToken).trim();

  // Two response modes:
  //   - JSON mode: ?format=json OR Accept: application/json.
  //     Returns workout data for the static share page to render.
  //   - Browser mode (everything else): 302 redirect to the static
  //     share page at ironz.fit/share?token=X so old direct links
  //     still land on the styled page.
  const wantsJson = url.searchParams.get("format") === "json"
                 || (req.headers.get("accept") || "").includes("application/json");

  if (!token || !/^[\w-]{6,64}$/.test(token)) {
    if (wantsJson) {
      return jsonResponse({ ok: false, reason: "invalid_token" }, 200);
    }
    return redirectTo(`${STATIC_SHARE_URL}?error=invalid`);
  }

  // Browser mode: hand off to the static page with the token intact.
  if (!wantsJson) {
    return redirectTo(`${STATIC_SHARE_URL}?token=${encodeURIComponent(token)}`);
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return jsonResponse({ ok: false, reason: "server_misconfigured" }, 200);
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Fetch the share row
  const { data: share, error } = await sb
    .from("shared_workouts")
    .select(`
      share_token, sender_user_id, variant_id, sport_id, session_type_id,
      share_note, created_at, expires_at, revoked_at
    `)
    .eq("share_token", token)
    .maybeSingle();

  if (error || !share) {
    return jsonResponse({ ok: false, reason: "not_found" }, 200);
  }
  if (share.revoked_at) {
    return jsonResponse({ ok: false, reason: "revoked" }, 200);
  }
  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return jsonResponse({ ok: false, reason: "expired", share_token: token }, 200);
  }

  // Look up sender display name (separate query; no FK join on the schema).
  let senderName: string | null = null;
  if (share.sender_user_id) {
    try {
      const { data: profile } = await sb
        .from("profiles")
        .select("full_name")
        .eq("id", share.sender_user_id)
        .maybeSingle();
      if (profile && profile.full_name) senderName = profile.full_name;
    } catch {}
  }

  // Pull the full training session by variant_id if one is set. RLS
  // may block anon reads on this table — handle gracefully.
  let sessionData: any = null;
  if (share.variant_id) {
    try {
      const { data: sessionRow } = await sb
        .from("training_sessions")
        .select("session_name, session_type, description, exercises, data")
        .eq("id", share.variant_id)
        .maybeSingle();
      if (sessionRow) sessionData = sessionRow;
    } catch {}
  }

  // Best-effort view increment. Errors never block the response.
  try {
    await sb.rpc("increment_share_view", { token_arg: token });
  } catch {}

  // Compose the JSON payload the static page will render.
  const workoutName = (sessionData && sessionData.session_name)
    || share.session_type_id
    || "Shared workout";
  const og_title = senderName
    ? `${senderName} shared ${workoutName}`
    : `${workoutName} — IronZ`;
  const og_description = "Run this workout in your own zones with IronZ. Your friend's paces stay private.";

  return jsonResponse({
    ok: true,
    share_token: share.share_token,
    sender_name: senderName,
    sender_user_id: share.sender_user_id,
    variant_id: share.variant_id,
    sport_id: share.sport_id,
    session_type_id: share.session_type_id,
    share_note: share.share_note,
    created_at: share.created_at,
    expires_at: share.expires_at,
    session: sessionData,
    og_title,
    og_description,
  }, 200);
});
