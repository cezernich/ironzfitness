// supabase/functions/check-workout-reminders/index.ts
//
// Cron-triggered function (run every 5-10 minutes).
//
// Daily-time model: each user picks a single workout_reminder_time
// in notification_preferences (default 07:00 local). For each user
// where NOW falls inside the cron window past their reminder time
// AND who has any incomplete training session today, send one push
// summarizing the day. sent_notifications dedupes per (user, day,
// type) so we never double-fire.
//
// Replaces the old "scheduled_time minus reminder_minutes_before"
// model — the app never sets scheduled_time on a workout, so the
// previous logic was a no-op.
//
// Required tables: training_sessions, notification_preferences, sent_notifications, push_tokens
// Required Edge Function: send-push

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// Cron is configured every 5–10 min; we treat any "now is N minutes
// past reminder_time" up to this window as "fire now" so a single
// missed cron tick doesn't drop the day's notification.
const CRON_WINDOW_MINUTES = 15;

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

// Convert "HH:MM" or "HH:MM:SS" string into total minutes-of-day.
function parseTimeToMinutes(t: string): number | null {
  if (!t || typeof t !== "string") return null;
  const parts = t.split(":").map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
  return parts[0] * 60 + parts[1];
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "server_misconfigured" }, 500);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD

  // Pull every user's prefs first — we drive the loop off the prefs
  // table so users with workouts but no prefs row default-in via
  // PUSH_PREF_DEFAULTS-equivalent values, and users with no workouts
  // today exit early.
  const { data: prefsRows, error: prefsErr } = await admin
    .from("notification_preferences")
    .select("user_id, workout_reminders, workout_reminder_time");
  if (prefsErr) {
    return jsonResponse({ error: prefsErr.message }, 500);
  }

  // Group today's incomplete sessions by user.
  const { data: sessions, error: sessErr } = await admin
    .from("training_sessions")
    .select("user_id, session_name, scheduled_date, status")
    .eq("scheduled_date", todayStr)
    .neq("status", "completed");
  if (sessErr) {
    return jsonResponse({ error: sessErr.message }, 500);
  }

  const sessionsByUser = new Map<string, any[]>();
  (sessions || []).forEach((s: any) => {
    if (!sessionsByUser.has(s.user_id)) sessionsByUser.set(s.user_id, []);
    sessionsByUser.get(s.user_id)!.push(s);
  });

  let sentCount = 0;
  const skipped: Record<string, number> = { off: 0, no_sessions: 0, before_window: 0, dup: 0, push_err: 0 };

  for (const pref of (prefsRows || [])) {
    if (!pref.workout_reminders) { skipped.off++; continue; }

    const userSessions = sessionsByUser.get(pref.user_id) || [];
    if (userSessions.length === 0) { skipped.no_sessions++; continue; }

    const remMin = parseTimeToMinutes(pref.workout_reminder_time || "07:00");
    if (remMin == null) continue;

    const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
    // Treat the reminder time as UTC for v1 — the client stores a
    // local-time string but we don't yet sync the user's timezone.
    // Cost: a user in Eastern time who picks 07:00 sees the push at
    // 07:00 UTC = 03:00 ET. Acceptable as a known limitation; a
    // follow-up migration adding `timezone` to notification_preferences
    // closes the gap. Documented so the next reader doesn't think it's
    // a bug.
    const diffMin = nowMin - remMin;
    if (diffMin < 0 || diffMin > CRON_WINDOW_MINUTES) { skipped.before_window++; continue; }

    // Daily dedupe key — one notification per user per day, regardless
    // of which session it references. reference_id is the date string
    // so the same-day check is a primary-key-ish lookup.
    const { data: already } = await admin
      .from("sent_notifications")
      .select("id")
      .eq("user_id", pref.user_id)
      .eq("notification_type", "workout_reminder")
      .eq("reference_id", todayStr)
      .limit(1);
    if (already && already.length > 0) { skipped.dup++; continue; }

    // Build a one-line summary of the day's planned work. If a single
    // session, name it; if multiple, count them.
    let title: string;
    let body: string;
    if (userSessions.length === 1) {
      const s = userSessions[0];
      title = s.session_name || "Today's Workout";
      body = "Tap to see details.";
    } else {
      title = "Today's Workouts";
      body = `${userSessions.length} sessions scheduled — tap to see your plan.`;
    }

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          user_id: pref.user_id,
          title,
          body,
          data: { type: "workout", date: todayStr },
        }),
      });
      if (!res.ok) {
        skipped.push_err++;
        continue;
      }
    } catch (e: any) {
      console.warn(`Push failed for user ${pref.user_id}:`, e.message);
      skipped.push_err++;
      continue;
    }

    await admin.from("sent_notifications").insert({
      user_id: pref.user_id,
      notification_type: "workout_reminder",
      reference_id: todayStr,
      title,
      body,
    });

    sentCount++;
  }

  return jsonResponse({ sent: sentCount, skipped });
});
