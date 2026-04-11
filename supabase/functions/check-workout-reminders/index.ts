// supabase/functions/check-workout-reminders/index.ts
//
// Cron-triggered function (run every 5-10 minutes).
// For each user with a training session today that hasn't been completed,
// check if we're within reminder_minutes_before of the scheduled time.
// If so, call send-push. Uses sent_notifications table to avoid duplicates.
//
// Required tables: training_sessions, notification_preferences, sent_notifications, push_tokens
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
  const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD

  // Get today's incomplete training sessions
  const { data: sessions, error: sessErr } = await admin
    .from("training_sessions")
    .select("id, user_id, session_name, scheduled_date, scheduled_time, status")
    .eq("scheduled_date", todayStr)
    .neq("status", "completed");

  if (sessErr) {
    return jsonResponse({ error: sessErr.message }, 500);
  }

  if (!sessions || sessions.length === 0) {
    return jsonResponse({ sent: 0, reason: "no_sessions_today" });
  }

  // Collect unique user IDs to batch-fetch notification preferences
  const userIds = [...new Set(sessions.map((s: any) => s.user_id))];

  const { data: prefs } = await admin
    .from("notification_preferences")
    .select("*")
    .in("user_id", userIds);

  const prefsMap = new Map<string, any>();
  (prefs || []).forEach((p: any) => prefsMap.set(p.user_id, p));

  let sentCount = 0;

  for (const session of sessions) {
    const userPrefs = prefsMap.get(session.user_id);

    // Default to true if no preferences row exists
    const workoutReminders = userPrefs?.workout_reminders ?? true;
    if (!workoutReminders) continue;

    const reminderMinutes = userPrefs?.reminder_minutes_before ?? 30;

    // If no scheduled_time, skip — we can't calculate when to remind
    if (!session.scheduled_time) continue;

    // Parse scheduled time — expected "HH:MM" or "HH:MM:SS"
    const [sh, sm] = session.scheduled_time.split(":").map(Number);
    const sessionTime = new Date(now);
    sessionTime.setHours(sh, sm, 0, 0);

    const reminderTime = new Date(sessionTime.getTime() - reminderMinutes * 60000);
    const diffMs = now.getTime() - reminderTime.getTime();

    // Only send if we're 0-10 minutes past the reminder window
    // (accounts for cron interval drift)
    if (diffMs < 0 || diffMs > 10 * 60000) continue;

    // Check for duplicate — have we already sent this reminder today?
    const { data: already } = await admin
      .from("sent_notifications")
      .select("id")
      .eq("user_id", session.user_id)
      .eq("reference_id", session.id)
      .eq("notification_type", "workout_reminder")
      .gte("created_at", todayStr + "T00:00:00Z")
      .limit(1);

    if (already && already.length > 0) continue;

    // Call send-push
    const pushBody = {
      user_id: session.user_id,
      title: session.session_name || "Workout Reminder",
      body: `Starts in ${reminderMinutes} minutes`,
      data: { type: "workout", session_id: session.id },
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
      console.warn(`Push failed for user ${session.user_id}:`, e.message);
      continue;
    }

    // Record that we sent this reminder
    await admin.from("sent_notifications").insert({
      user_id: session.user_id,
      notification_type: "workout_reminder",
      reference_id: session.id,
      title: pushBody.title,
      body: pushBody.body,
    });

    sentCount++;
  }

  return jsonResponse({ sent: sentCount });
});
