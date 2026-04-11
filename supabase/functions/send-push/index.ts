// supabase/functions/send-push/index.ts
//
// Sends a push notification to a user's iOS device via Apple Push Notification
// service (APNs). Looks up the device token from push_tokens, builds a signed
// JWT, and POSTs to the APNs HTTP/2 endpoint.
//
// Required Supabase secrets:
//   APNS_KEY        — .p8 key file contents (-----BEGIN PRIVATE KEY----- ...)
//   APNS_KEY_ID     — 10-char Key ID from Apple Developer portal
//   APNS_TEAM_ID    — 10-char Apple Team ID
//
// POST body: { user_id: string, title: string, body: string, data?: object }

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const APNS_KEY = Deno.env.get("APNS_KEY") || "";
const APNS_KEY_ID = Deno.env.get("APNS_KEY_ID") || "";
const APNS_TEAM_ID = Deno.env.get("APNS_TEAM_ID") || "";

const APNS_HOST = "https://api.push.apple.com";
const APNS_TOPIC = "com.ironz.app";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

// ── APNs JWT (ES256, valid 1 hour) ────────────────────────────────────────────

async function buildApnsJwt(): Promise<string> {
  // Decode the PEM-encoded P8 key into raw PKCS#8 bytes
  const pemBody = APNS_KEY
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const keyData = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const header = { alg: "ES256", kid: APNS_KEY_ID };
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: APNS_TEAM_ID, iat: now };

  const encode = (obj: any) =>
    btoa(JSON.stringify(obj))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

  const unsignedToken = `${encode(header)}.${encode(claims)}`;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(unsignedToken),
  );

  // Convert DER signature to raw r||s (64 bytes) for ES256 JWT
  const sigBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return `${unsignedToken}.${sigBase64}`;
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  // Auth check — require a valid bearer token
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "server_misconfigured" }, 500);
  }

  if (!APNS_KEY || !APNS_KEY_ID || !APNS_TEAM_ID) {
    return jsonResponse({ success: false, reason: "apns_not_configured" }, 500);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "bad_json" }, 400);
  }

  const { user_id, title, body: msgBody, data } = body || {};
  if (!user_id || !title || !msgBody) {
    return jsonResponse({ error: "missing_fields", required: ["user_id", "title", "body"] }, 400);
  }

  // Service role client — bypasses RLS to read push_tokens
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Look up the most recent device token for this user
  const { data: tokenRow, error: tokenErr } = await admin
    .from("push_tokens")
    .select("id, token")
    .eq("user_id", user_id)
    .order("last_used_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (tokenErr) {
    return jsonResponse({ success: false, reason: tokenErr.message }, 500);
  }
  if (!tokenRow) {
    return jsonResponse({ success: false, reason: "no_token" });
  }

  // Build the APNs payload
  const apnsPayload = {
    aps: {
      alert: { title, body: msgBody },
      sound: "default",
      badge: 1,
    },
    data: data || {},
  };

  // Sign and send
  let jwt: string;
  try {
    jwt = await buildApnsJwt();
  } catch (e: any) {
    return jsonResponse({ success: false, reason: `jwt_error: ${e.message}` }, 500);
  }

  let apnsResponse: Response;
  try {
    apnsResponse = await fetch(`${APNS_HOST}/3/device/${tokenRow.token}`, {
      method: "POST",
      headers: {
        "authorization": `bearer ${jwt}`,
        "apns-topic": APNS_TOPIC,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
      },
      body: JSON.stringify(apnsPayload),
    });
  } catch (e: any) {
    return jsonResponse({ success: false, reason: `fetch_error: ${e.message}` }, 500);
  }

  // Handle APNs response
  if (apnsResponse.ok) {
    // Update last_used_at on successful delivery
    await admin
      .from("push_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", tokenRow.id);

    return jsonResponse({ success: true });
  }

  // Parse error
  let apnsError: any = {};
  try {
    apnsError = await apnsResponse.json();
  } catch {
    // non-JSON response
  }

  const reason = apnsError.reason || `http_${apnsResponse.status}`;

  // 410 Gone or Unregistered — device token is invalid, clean it up
  if (apnsResponse.status === 410 || reason === "Unregistered") {
    await admin.from("push_tokens").delete().eq("id", tokenRow.id);
    return jsonResponse({ success: false, reason: "token_expired_deleted" });
  }

  return jsonResponse({ success: false, reason });
});
