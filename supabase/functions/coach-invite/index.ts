// supabase/functions/coach-invite/index.ts
//
// Phase A — public coach invite endpoint.
//
// Two response modes:
//   • Browser navigation (Accept: text/html, no ?format=json): records the
//     click and 302s to the static landing page at ironz.fit/c?code=X.
//     We can't render styled HTML directly here — Supabase's Edge Runtime
//     forces Content-Type: text/plain on --no-verify-jwt responses, so
//     browsers would render markup as source. (Same workaround share-preview
//     uses: edge function = data + redirect, GitHub Pages page = render.)
//
//   • JSON mode (?format=json or Accept: application/json): returns coach
//     info (name, bio, avatar) so the static page can render. The static
//     page DOESN'T re-record a click on its own — the click was already
//     recorded by the redirect path above. Direct JSON callers (rare,
//     mostly testing) DO get a click recorded, since this is the canonical
//     entry point for that link.
//
// Click dedup is enforced server-side by record_invite_click() (60-second
// window per ip_hash). ip_hash and user_agent_hash are sha256 of
// (ip|ua + daily_salt) — not reversible to a real IP/UA, only useful for
// dedup-within-a-day.
//
// Deploy: supabase functions deploy coach-invite --no-verify-jwt
// Required env: SUPABASE_URL, SUPABASE_ANON_KEY (auto), INVITE_CLICK_SALT.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
// Daily-rotating salt used in the click ip_hash. The salt rotates on the
// UTC day boundary so stored hashes can't be cross-referenced across
// days. Operator sets this in Supabase Dashboard → Functions → Secrets.
const SALT = Deno.env.get("INVITE_CLICK_SALT") || "ironz-default-salt";

// Static landing page on GitHub Pages (mirrors how /share works).
const STATIC_LANDING_URL = "https://ironz.fit/c";

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

// SHA-256 over (value + daily-rotating salt). Returns hex. Used to bucket
// clicks for the 60-second dedup window without storing any real IP or
// UA string. Salt rotates at midnight UTC; cross-day correlation is
// intentionally impossible.
async function dailyHash(value: string | null): Promise<string | null> {
  if (!value) return null;
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  const data = new TextEncoder().encode(`${value}|${today}|${SALT}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Pull a best-effort client IP. Supabase Edge sits behind Cloudflare /
// the Supabase router, so x-forwarded-for is the most reliable signal.
function getClientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for") || "";
  const cf = req.headers.get("cf-connecting-ip") || "";
  if (cf) return cf.trim();
  if (xff) return xff.split(",")[0].trim();
  return null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);

  // Code resolution: path segment OR ?code=. We accept either so the URL
  // can be /c/X7Q2K9 (path style) or /functions/v1/coach-invite?code=X7Q2K9
  // (direct edge function call from the static page fetch).
  const pathCode = (url.pathname.split("/").pop() || "").trim();
  const queryCode = url.searchParams.get("code") || "";
  const rawCode = (pathCode && pathCode !== "coach-invite" ? pathCode : queryCode).trim();
  // Codes are stored uppercase. Be tolerant of users pasting in lowercase.
  const code = rawCode.toUpperCase();

  const wantsJson = url.searchParams.get("format") === "json"
                 || (req.headers.get("accept") || "").includes("application/json");

  // Reject malformed codes early. The DB CHECK is `^[2-9A-HJ-NP-Z]{6}$`
  // (URL-safe alphabet, no 0/1/I/O); enforce the same shape here so we
  // don't waste a DB round-trip on obvious garbage.
  if (!/^[2-9A-HJ-NP-Z]{6}$/.test(code)) {
    if (wantsJson) {
      return jsonResponse({ ok: false, reason: "invalid_code" }, 200);
    }
    return redirectTo(`${STATIC_LANDING_URL}?error=invalid`);
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  // Record the click (60s dedup is enforced inside record_invite_click).
  // We do this BEFORE rendering / redirecting so a slow render doesn't
  // drop the click. record_invite_click returns NULLs for unknown /
  // inactive codes — we treat that as "link no longer active".
  const ip = getClientIp(req);
  const ua = req.headers.get("user-agent") || null;
  const [ip_hash, ua_hash] = await Promise.all([dailyHash(ip), dailyHash(ua)]);

  const { data: clickResult, error: clickErr } = await sb.rpc("record_invite_click", {
    p_code:    code,
    p_ip_hash: ip_hash,
    p_ua_hash: ua_hash,
  });
  if (clickErr) {
    console.warn("[coach-invite] record_invite_click failed:", clickErr);
  }

  // record_invite_click returns SETOF, so `data` comes back as an array.
  const click = Array.isArray(clickResult) ? clickResult[0] : clickResult;
  const inviteLinkId = click?.invite_link_id || null;
  const coachId      = click?.coach_id || null;

  // Browser navigation: redirect to the static page with the code so the
  // page can fetch JSON and render. Including the resolved invite_link_id
  // in the query lets the post-auth handler stamp it onto the user's
  // profile without a second lookup. (The page only honors it if the
  // code resolves; mismatched values fall back to a fresh lookup.)
  if (!wantsJson) {
    if (!inviteLinkId) {
      return redirectTo(`${STATIC_LANDING_URL}?code=${encodeURIComponent(code)}&error=inactive`);
    }
    return redirectTo(
      `${STATIC_LANDING_URL}?code=${encodeURIComponent(code)}&link=${encodeURIComponent(inviteLinkId)}`
    );
  }

  // JSON mode — fetch coach profile and return it.
  if (!inviteLinkId || !coachId) {
    return jsonResponse({ ok: false, reason: "inactive" }, 200);
  }

  // Pull coach display fields. is_coach=false here means the coach got
  // deactivated AFTER the link was generated — surface as inactive rather
  // than leaking the coach's name on a now-disabled link.
  const { data: profile, error: profileErr } = await sb
    .from("profiles")
    .select("id, full_name, avatar_url, coach_bio, is_coach")
    .eq("id", coachId)
    .maybeSingle();

  if (profileErr) {
    console.warn("[coach-invite] profile lookup failed:", profileErr);
    return jsonResponse({ ok: false, reason: "lookup_failed" }, 200);
  }
  if (!profile || profile.is_coach !== true) {
    return jsonResponse({ ok: false, reason: "inactive" }, 200);
  }

  return jsonResponse({
    ok: true,
    invite_link_id: inviteLinkId,
    code,
    coach: {
      id:         profile.id,
      full_name:  profile.full_name || null,
      avatar_url: profile.avatar_url || null,
      coach_bio:  profile.coach_bio || null,
    },
  }, 200);
});
