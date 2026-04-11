// supabase/functions/check-hydration-reminders/index.ts
//
// Hourly cron function. For each user with hydration_reminders enabled,
// check if the current hour falls within their hydration window and if
// it aligns with their interval. If behind target, send a push.
//
// Required tables: notification_preferences, push_tokens, user_data (hydrationLog)
// Required Edge Function: send-push

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

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "server_misconfigured" }, 500);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const now = new Date();
  const currentHour = now.getUTCHours(); // UTC — adjust if user timezone is available
  const todayStr = now.toISOString().slice(0, 10);

  // Get all users with hydration reminders enabled
  const { data: prefs, error: prefErr } = await admin
    .from("notification_preferences")
    .select("user_id, hydration_start_hour, hydration_end_hour, hydration_interval_hours")
    .eq("hydration_reminders", true);

  if (prefErr) {
    return jsonResponse({ error: prefErr.message }, 500);
  }

  if (!prefs || prefs.length === 0) {
    return jsonResponse({ sent: 0, reason: "no_users_with_hydration_reminders" });
  }

  let sentCount = 0;

  for (const pref of prefs) {
    const startHour = pref.hydration_start_hour ?? 8;
    const endHour = pref.hydration_end_hour ?? 22;
    const interval = pref.hydration_interval_hours ?? 2;

    // Check if current hour is within the hydration window
    if (currentHour < startHour || currentHour > endHour) continue;

    // Check if current hour aligns with the interval
    // (e.g., start=8, interval=2 → remind at 8, 10, 12, 14, ...)
    if ((currentHour - startHour) % interval !== 0) continue;

    // Check for duplicate — already sent this hour?
    const { data: already } = await admin
      .from("sent_notifications")
      .select("id")
      .eq("user_id", pref.user_id)
      .eq("notification_type", "hydration_reminder")
      .gte("created_at", `${todayStr}T${String(currentHour).padStart(2, "0")}:00:00Z`)
      .limit(1);

    if (already && already.length > 0) continue;

    // Read the user's hydration log for today from user_data
    let currentBottles = 0;
    let targetBottles = 8; // sensible default
    try {
      const { data: hydRow } = await admin
        .from("user_data")
        .select("value")
        .eq("user_id", pref.user_id)
        .eq("key", "hydrationLog")
        .maybeSingle();

      if (hydRow?.value) {
        const log = typeof hydRow.value === "string" ? JSON.parse(hydRow.value) : hydRow.value;
        const todayLog = log[todayStr];
        if (todayLog) {
          currentBottles = todayLog.total || 0;
        }
      }

      // Read target from hydration settings
      const { data: targetRow } = await admin
        .from("user_data")
        .select("value")
        .eq("user_id", pref.user_id)
        .eq("key", "hydrationTarget")
        .maybeSingle();

      if (targetRow?.value) {
        const parsed = typeof targetRow.value === "string" ? JSON.parse(targetRow.value) : targetRow.value;
        if (typeof parsed === "number") targetBottles = parsed;
      }
    } catch {
      // If we can't read hydration data, still send the reminder
    }

    // Calculate expected progress for this time of day
    const totalHours = endHour - startHour;
    const elapsedHours = currentHour - startHour;
    const expectedBottles = Math.round((elapsedHours / totalHours) * targetBottles);

    // Only send if behind expected pace
    if (currentBottles >= expectedBottles) continue;

    // Call send-push
    const pushBody = {
      user_id: pref.user_id,
      title: "Time to hydrate!",
      body: `You're at ${currentBottles}/${targetBottles} bottles today`,
      data: { type: "hydration" },
    };

    try {
      await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify(pushBody),
      });
    } catch (e: any) {
      console.warn(`Hydration push failed for user ${pref.user_id}:`, e.message);
      continue;
    }

    // Record sent
    await admin.from("sent_notifications").insert({
      user_id: pref.user_id,
      notification_type: "hydration_reminder",
      reference_id: todayStr,
      title: pushBody.title,
      body: pushBody.body,
    });

    sentCount++;
  }

  return jsonResponse({ sent: sentCount });
});
