// delete-account — Permanently delete the calling user's account.
//
// Required for App Store Guideline 5.1.1(v): apps with account creation
// must offer an in-app path to delete the account (and the associated
// personal data) directly in the app.
//
// Flow:
//   1. Verify the caller's JWT — we only delete the user who asked.
//   2. Delete rows from tables that reference auth.users WITHOUT
//      ON DELETE CASCADE. Per supabase-schema.sql these are
//      generated_plans and user_outcomes. The FK would otherwise block
//      auth.admin.deleteUser with a constraint violation.
//   3. Call auth.admin.deleteUser — that deletes the auth.users row,
//      which cascades to profiles / workouts / workout_exercises /
//      workout_segments / training_plans / training_sessions /
//      plan_adherence / weekly_checkins / goals / race_events /
//      user_data / ai_usage (all ON DELETE CASCADE in schema).
//
// Deploy: supabase functions deploy delete-account
//
// Required secrets (already set for other functions):
//   SUPABASE_URL        — auto-injected by Supabase runtime
//   SUPABASE_SERVICE_ROLE_KEY — auto-injected; required for admin.deleteUser

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) {
    return jsonResponse({ error: "Missing Authorization bearer token" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  // Verify caller identity with an anon-key client that forwards their JWT.
  // getUser validates the JWT signature + expiry against Supabase auth.
  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") || "", {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user?.id) {
    return jsonResponse({ error: "Invalid or expired session" }, 401);
  }
  const userId = userRes.user.id;

  // Admin client for destructive ops.
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Purge rows that don't cascade from auth.users. Ignore errors on
  // tables that may not exist yet — deletion should still proceed.
  const nonCascadingTables = ["generated_plans", "user_outcomes"];
  for (const table of nonCascadingTables) {
    try {
      const { error } = await admin.from(table).delete().eq("user_id", userId);
      if (error) console.warn(`delete-account: ${table} purge warning:`, error.message);
    } catch (e) {
      console.warn(`delete-account: ${table} purge exception:`, e);
    }
  }

  // Delete the auth.users row. The CASCADE-wired FKs in
  // supabase-schema.sql take care of all other user-owned rows.
  const { error: deleteErr } = await admin.auth.admin.deleteUser(userId);
  if (deleteErr) {
    return jsonResponse({ error: `Account deletion failed: ${deleteErr.message}` }, 500);
  }

  return jsonResponse({ ok: true, userId });
});
