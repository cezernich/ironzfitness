// supabase/functions/share-preview/index.ts
//
// Public web preview for a workout share. Takes a token from the URL path,
// looks up the share via RLS (live shares only), and returns an HTML page
// with sender attribution and generic workout structure.
//
// PRIVACY: this function NEVER computes or returns concrete paces. The sender's
// VDOT/FTP/CSS never left the sender's device, so we cannot scale paces here.
// Output is intentionally generic — labels like "I-pace", not "3:12/800m".
//
// Deploy: supabase functions deploy share-preview --no-verify-jwt
// Set:    SUPABASE_URL and SUPABASE_ANON_KEY env vars (auto-set by Supabase).

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function escapeHtml(s: string): string {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c] as string));
}

// Generic structure descriptions per session type. NO concrete paces.
const STRUCTURE_LABELS: Record<string, { warmup: string; main: string; cooldown: string }> = {
  track_workout:    { warmup: "1.5mi easy", main: "Repeats at I-pace",      cooldown: "1mi easy" },
  tempo_threshold:  { warmup: "15 min easy", main: "Cruise intervals at T-pace", cooldown: "10 min easy" },
  speed_work:       { warmup: "15 min easy", main: "Short repeats at R-pace", cooldown: "10 min easy" },
  hills:            { warmup: "15 min easy", main: "Hill repeats hard up / easy down", cooldown: "10 min easy" },
  long_run:         { warmup: "—", main: "Sustained effort at E-pace",      cooldown: "—" },
  endurance:        { warmup: "—", main: "Steady aerobic effort",            cooldown: "—" },
  easy_recovery:    { warmup: "—", main: "Conversational easy effort",       cooldown: "—" },
  bike_intervals_ftp: { warmup: "15 min easy spin", main: "Intervals at FTP", cooldown: "10 min easy spin" },
  bike_intervals_vo2: { warmup: "15 min easy spin", main: "Intervals at VO2max effort", cooldown: "10 min easy spin" },
  swim_css_intervals: { warmup: "400m easy + 4×50m build", main: "Repeats at CSS pace", cooldown: "200m easy" },
  swim_speed:        { warmup: "400m easy + 4×50m build", main: "Sprints",  cooldown: "200m easy" },
};

function renderHtml(share: any): string {
  const senderName  = (share._senderName) || (share.sender && share.sender.full_name) || "A friend";
  const initial     = senderName.trim().slice(0, 1).toUpperCase();
  const variantName = (share._sessionName) || share.variant_id || "Workout";
  const sportLabel  = (share.sport_id || "").toUpperCase();
  const structure   = STRUCTURE_LABELS[share.session_type_id] || {
    warmup: "—", main: "Generic structure", cooldown: "—",
  };
  const note = share.share_note ? `<p class="share-note">"${escapeHtml(share.share_note)}"</p>` : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(senderName)} shared a workout · IronZ</title>
  <meta property="og:title" content="${escapeHtml(senderName)} shared ${escapeHtml(variantName)}">
  <meta property="og:description" content="Run this workout in your own zones with IronZ. Your friend's paces stay private.">
  <meta property="og:type" content="website">
  <meta name="twitter:card" content="summary_large_image">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
           background: #0f0f18; color: #fff; min-height: 100vh; padding: 24px 16px; }
    .wrap { max-width: 480px; margin: 0 auto; }
    .logo { font-size: 22px; font-weight: 900; color: #ff6b35; letter-spacing: -0.5px; text-align: center; }
    .url  { font-size: 11px; color: #555; text-align: center; margin: 4px 0 24px;
            font-family: "SF Mono", Menlo, monospace; }
    .from { display: flex; align-items: center; gap: 12px; padding: 14px;
            background: #1a1a24; border-radius: 14px; margin-bottom: 14px; }
    .avatar { width: 44px; height: 44px; border-radius: 50%; flex-shrink: 0;
              background: linear-gradient(135deg, #ff6b35, #ff8e5e);
              display: flex; align-items: center; justify-content: center;
              font-weight: 800; font-size: 18px; color: #fff; }
    .from-label { font-size: 11px; color: #888; }
    .from-name  { font-size: 14px; font-weight: 700; }
    .card { background: #1a1a24; border-radius: 16px; padding: 20px; margin-bottom: 14px; }
    .badge { background: #ff6b35; color: #fff; font-size: 10px; font-weight: 700;
             padding: 4px 10px; border-radius: 10px; display: inline-block;
             margin-bottom: 8px; letter-spacing: 0.5px; }
    .title { font-size: 22px; font-weight: 800; margin-bottom: 4px; letter-spacing: -0.3px; }
    .subtitle { color: #888; font-size: 12px; margin-bottom: 16px; }
    .row { display: flex; justify-content: space-between; padding: 11px 0;
           border-bottom: 1px solid #252530; font-size: 13px; }
    .row:last-child { border-bottom: none; }
    .label { color: #aaa; }
    .value { color: #fff; font-weight: 600; }
    .share-note { font-size: 13px; color: #ccc; font-style: italic;
                  padding: 12px; background: #0f0f18; border-radius: 10px;
                  border: 1px solid #252530; margin: 12px 0; }
    .install { background: linear-gradient(135deg, #1a1a24, #252530); padding: 18px;
               border-radius: 14px; border: 1px solid #333; margin-top: 12px; }
    .install h2 { font-size: 15px; font-weight: 800; margin-bottom: 6px; }
    .install p  { font-size: 12px; color: #999; line-height: 1.5; margin-bottom: 14px; }
    .cta { display: block; width: 100%; background: #ff6b35; color: #fff;
           text-decoration: none; padding: 14px; border-radius: 12px;
           font-size: 15px; font-weight: 700; text-align: center; }
    .privacy { font-size: 11px; color: #666; text-align: center; margin-top: 16px;
               line-height: 1.5; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="logo">IronZ</div>
    <div class="url">ironz.fit/w/${escapeHtml(share.share_token)}</div>
    <div class="from">
      <div class="avatar">${escapeHtml(initial)}</div>
      <div>
        <div class="from-label">${escapeHtml(senderName)} shared a workout</div>
        <div class="from-name">${escapeHtml(variantName)}</div>
      </div>
    </div>
    <div class="card">
      <span class="badge">${escapeHtml(sportLabel)}</span>
      <div class="title">${escapeHtml(variantName)}</div>
      <div class="subtitle">${escapeHtml(share.session_type_id || "")}</div>
      <div class="row"><span class="label">Warm-up</span><span class="value">${escapeHtml(structure.warmup)}</span></div>
      <div class="row"><span class="label">Main set</span><span class="value">${escapeHtml(structure.main)}</span></div>
      <div class="row"><span class="label">Cool-down</span><span class="value">${escapeHtml(structure.cooldown)}</span></div>
      ${note}
    </div>
    <div class="install">
      <h2>Run this in your zones</h2>
      <p>IronZ scales every workout to your actual VDOT, FTP, and CSS — no guessing, no generic "zone 4". Your friend's paces stay private.</p>
      <a class="cta" href="ironz://share/${escapeHtml(share.share_token)}">Install IronZ — Free</a>
    </div>
    <p class="privacy">Your friend's paces, VDOT, and zones never left their device. The web preview shows generic structure only.</p>
  </div>
</body>
</html>`;
}

// Status 200 workaround: Supabase Edge Runtime overrides Content-Type to text/plain
// on 4xx/5xx responses for --no-verify-jwt functions, causing browsers to render
// raw HTML source. Error info is conveyed in the HTML body instead.
function renderError(message: string, _status: number): Response {
  const html = `<!doctype html><html><head><meta charset="UTF-8"><title>${escapeHtml(message)}</title>
<style>body{font-family:system-ui;background:#0f0f18;color:#fff;padding:40px;text-align:center;}</style>
</head><body><h1>${escapeHtml(message)}</h1></body></html>`;
  const headers = new Headers(CORS);
  headers.set("Content-Type", "text/html; charset=utf-8");
  return new Response(html, { status: 200, headers });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);
  // Token can come from path /share-preview/{token} or ?token=
  const pathToken = (url.pathname.split("/").pop() || "").trim();
  const queryToken = url.searchParams.get("token") || "";
  const token = (pathToken && pathToken !== "share-preview" ? pathToken : queryToken).trim();

  if (!token || !/^[\w-]{6,64}$/.test(token)) {
    // Status 200 workaround: Supabase Edge Runtime overrides Content-Type on 4xx/5xx
    // for --no-verify-jwt functions
    return renderError("Link not found", 200);
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    // Status 200 workaround: Supabase Edge Runtime overrides Content-Type on 4xx/5xx
    // for --no-verify-jwt functions
    return renderError("Server misconfigured", 200);
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await sb
    .from("shared_workouts")
    .select(`
      share_token, variant_id, sport_id, session_type_id, share_note,
      created_at, expires_at, revoked_at,
      sender:profiles!shared_workouts_sender_user_id_fkey ( full_name )
    `)
    .eq("share_token", token)
    .maybeSingle();

  // Status 200 workaround: Supabase Edge Runtime overrides Content-Type on 4xx/5xx
  // for --no-verify-jwt functions
  if (error || !data) return renderError("Link not found", 200);
  // Status 200 workaround: Supabase Edge Runtime overrides Content-Type on 4xx/5xx
  // for --no-verify-jwt functions
  if (data.revoked_at) return renderError("Link revoked", 200);
  // Status 200 workaround: Supabase Edge Runtime overrides Content-Type on 4xx/5xx
  // for --no-verify-jwt functions
  if (data.expires_at && new Date(data.expires_at) < new Date()) return renderError("Link expired", 200);

  // Look up actual workout name from training_sessions by variant_id.
  if (data.variant_id) {
    try {
      const { data: session } = await sb
        .from("training_sessions")
        .select("session_name")
        .eq("id", data.variant_id)
        .maybeSingle();
      if (session && session.session_name) data._sessionName = session.session_name;
    } catch {}
  }

  // Look up sender profile name directly (more reliable than FK join).
  if (data.sender_user_id && !(data.sender && data.sender.full_name)) {
    try {
      const { data: profile } = await sb
        .from("profiles")
        .select("full_name")
        .eq("id", data.sender_user_id)
        .maybeSingle();
      if (profile && profile.full_name) data._senderName = profile.full_name;
    } catch {}
  }

  // Bump view_count via RPC (best-effort, never block render).
  try {
    await sb.rpc("increment_share_view", { token_arg: token });
  } catch {}

  const headers = new Headers(CORS);
  headers.set("Content-Type", "text/html; charset=utf-8");
  return new Response(renderHtml(data), { status: 200, headers });
});
