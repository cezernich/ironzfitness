// supabase/functions/notify-share-completion/index.ts
//
// Triggered when a receiver completes a workout that came in via a share.
// Pushes a notification to the sender containing ONLY the variant name and
// a single delta statistic. No splits, no HR, no cadence, no date beyond
// "today/yesterday."
//
// Privacy: receiver paces never reach the sender. The receiver's ID is also
// kept off the client — this Edge Function is the only place that joins
// receiver → share → sender.
//
// Rate limit: max one notification per share per receiver per 24 hours.

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

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { ...CORS, "content-type": "application/json" },
    });
  }

  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...CORS, "content-type": "application/json" },
    });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "server_misconfigured" }), {
      status: 500, headers: { ...CORS, "content-type": "application/json" },
    });
  }

  let body: any;
  try { body = await req.json(); }
  catch {
    return new Response(JSON.stringify({ error: "bad_json" }), {
      status: 400, headers: { ...CORS, "content-type": "application/json" },
    });
  }

  const { share_token, receiver_delta_percent } = body || {};
  if (!share_token || typeof share_token !== "string") {
    return new Response(JSON.stringify({ error: "missing_share_token" }), {
      status: 400, headers: { ...CORS, "content-type": "application/json" },
    });
  }

  // Use the user-scoped client to read the share + identify the caller (receiver).
  const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userInfo } = await userClient.auth.getUser();
  const receiverUserId = userInfo && userInfo.user && userInfo.user.id;
  if (!receiverUserId) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...CORS, "content-type": "application/json" },
    });
  }

  // Service role for the join + insert (RLS would otherwise hide the sender id).
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: share, error } = await adminClient
    .from("shared_workouts")
    .select("share_token, sender_user_id, variant_id, sport_id, session_type_id")
    .eq("share_token", share_token)
    .maybeSingle();

  if (error || !share) {
    return new Response(JSON.stringify({ error: "share_not_found" }), {
      status: 404, headers: { ...CORS, "content-type": "application/json" },
    });
  }

  // 24h dedupe — check workout_share_imports for an existing completion in the
  // last 24 hours from the same receiver on the same share token.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await adminClient
    .from("workout_share_imports")
    .select("id, completed_at")
    .eq("share_token", share_token)
    .eq("receiver_user_id", receiverUserId)
    .gte("completed_at", since)
    .limit(1);

  if (recent && recent.length > 0) {
    return new Response(JSON.stringify({ ok: true, deduped: true }), {
      status: 200, headers: { ...CORS, "content-type": "application/json" },
    });
  }

  // Update the import row to record completion.
  await adminClient
    .from("workout_share_imports")
    .update({
      completed_at: new Date().toISOString(),
      completion_delta_percent: receiver_delta_percent != null ? Number(receiver_delta_percent) : null,
    })
    .eq("share_token", share_token)
    .eq("receiver_user_id", receiverUserId);

  // Bump completion_count on the share row.
  await adminClient.rpc("increment_share_completion", { token_arg: share_token }).then(
    () => {}, () => {}
  );

  // Build the notification body — variant name + delta only. No splits, no HR.
  const variantName = share.variant_id;
  const deltaText = (receiver_delta_percent != null)
    ? (Number(receiver_delta_percent) >= 0
        ? `${Math.abs(Number(receiver_delta_percent)).toFixed(1)}% slower than target`
        : `${Math.abs(Number(receiver_delta_percent)).toFixed(1)}% faster than target`)
    : "completed";

  // Look up receiver display name for the title (no other PII).
  let receiverName = "A friend";
  try {
    const { data: profile } = await adminClient
      .from("profiles")
      .select("full_name")
      .eq("id", receiverUserId)
      .maybeSingle();
    if (profile && profile.full_name) receiverName = profile.full_name;
  } catch {}

  const notification = {
    user_id: share.sender_user_id,
    title: `${receiverName} ran your shared workout`,
    body: `${variantName} · ${deltaText}`,
    data: {
      share_token,
      variant_id: share.variant_id,
      delta_percent: receiver_delta_percent != null ? Number(receiver_delta_percent) : null,
    },
    type: "share_completion",
    created_at: new Date().toISOString(),
  };

  // Insert into the notifications table (existing infra). The actual push
  // delivery is handled by the existing notification service consumer.
  try {
    await adminClient.from("notifications").insert(notification);
  } catch (e: any) {
    // If notifications table doesn't exist yet, return success — the row in
    // workout_share_imports is the source of truth for completion tracking.
    return new Response(JSON.stringify({ ok: true, notification_dispatched: false, reason: e.message }), {
      status: 200, headers: { ...CORS, "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, notification_dispatched: true }), {
    status: 200, headers: { ...CORS, "content-type": "application/json" },
  });
});
