// supabase/functions/notify-share/index.ts
//
// Called from the client after a successful shared_workouts INSERT.
// Sends a push notification to the recipient (if they have a device token).
//
// POST body: { recipient_user_id: string, sender_name: string, workout_name: string, share_token: string }

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

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

  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "server_misconfigured" }, 500);
  }

  let body: any;
  try { body = await req.json(); }
  catch { return jsonResponse({ error: "bad_json" }, 400); }

  const { recipient_user_id, sender_name, workout_name, share_token } = body || {};
  if (!recipient_user_id || !sender_name || !workout_name || !share_token) {
    return jsonResponse({ error: "missing_fields" }, 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Check if recipient has share_alerts enabled (default true)
  const { data: prefs } = await admin
    .from("notification_preferences")
    .select("share_alerts")
    .eq("user_id", recipient_user_id)
    .maybeSingle();

  if (prefs && prefs.share_alerts === false) {
    return jsonResponse({ success: true, skipped: "share_alerts_disabled" });
  }

  // Call send-push
  const pushBody = {
    user_id: recipient_user_id,
    title: `${sender_name} shared a workout with you`,
    body: workout_name,
    data: { type: "share", token: share_token },
  };

  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify(pushBody),
    });
    const result = await resp.json();
    return jsonResponse({ success: true, push_result: result });
  } catch (e: any) {
    return jsonResponse({ success: false, reason: e.message }, 500);
  }
});
