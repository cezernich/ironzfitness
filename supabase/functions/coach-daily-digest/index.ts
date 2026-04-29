// supabase/functions/coach-daily-digest/index.ts
//
// Daily push digest sent to every active coach. Summarises yesterday's
// client activity in <180 chars so the iOS preview can show the whole
// thing without truncation.
//
// ── Schedule ─────────────────────────────────────────────────────────
// Cron at 13:00 UTC daily. That lands the digest at:
//   • 06:00 PT  (West Coast morning routine)
//   • 08:00 CT
//   • 09:00 ET  (East Coast walking-into-work hour)
// Reasonable spread for US-based coaches. Per-user timezone scheduling
// is deferred to a later phase — would require both a timezone column
// on profiles + an hourly cron with timezone math. The spec called for
// 7 AM local; this is the closest single-cron approximation.
//
// To switch to per-user later: change the cron to run hourly, look up
// each coach's timezone, only send when "now in their tz" === 7 AM.
// The dedup logic via coach_digest_log already protects against
// double-sends across hourly runs.
//
// ── Schedule the cron ─────────────────────────────────────────────────
// Run once daily at 13:00 UTC via Supabase Cron:
//   select cron.schedule(
//     'coach-daily-digest',
//     '0 13 * * *',
//     $$ select net.http_post(
//          url := 'https://<project>.supabase.co/functions/v1/coach-daily-digest',
//          headers := jsonb_build_object(
//            'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
//            'Content-Type', 'application/json'
//          ),
//          body := '{}'::jsonb
//        ); $$
//   );
// (Run with the service role key — the function uses admin RLS bypass
// internally to walk every coach's clients.)
//
// Required secrets:
//   SUPABASE_URL              — auto-injected
//   SUPABASE_SERVICE_ROLE_KEY — auto-injected
// (send-push needs APNS_KEY + APNS_KEY_ID + APNS_TEAM_ID — those are
//  already configured by the existing reminder crons.)
//
// ── Output shape ──────────────────────────────────────────────────────
// One push per coach via send-push. Body templates:
//   "3 of 5 trained yesterday. Sarah crushed her tempo run. David
//    missed Push Day. Jen logged 'hard' on Squats — check in?"
//
//   "5 of 5 trained yesterday. Quiet day — keep it rolling."
//
//   "0 of 5 trained yesterday — slow day. Reach out?"
//
// dedup table coach_digest_log (Phase 1 schema): primary key
// (coach_id, digest_date). Insert with ON CONFLICT DO NOTHING — if
// the cron retries (network blip, manual re-run), no duplicate push.

// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (obj: any, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });

const PUSH_BODY_MAX = 180;

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  is_coach: boolean | null;
}

interface WorkoutRow {
  user_id: string;
  date: string;
  type: string | null;
  name: string | null;
}

interface AssignmentRow {
  client_id: string;
  coach_id: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: "server_misconfigured" }, 500);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // "Yesterday" = current UTC date minus one. Slight skew at the IDL
  // edges is acceptable for v1 — coaches in HI/AK are a rounding error
  // and the dedup table catches double-sends.
  const yest = new Date();
  yest.setUTCDate(yest.getUTCDate() - 1);
  const yesterdayStr = yest.toISOString().slice(0, 10);
  const todayStr = new Date().toISOString().slice(0, 10);

  // ── 1. Find every active coach ──────────────────────────────────────
  const { data: coaches, error: coachErr } = await admin
    .from("profiles")
    .select("id, full_name, email, is_coach")
    .eq("is_coach", true);

  if (coachErr) return json({ error: coachErr.message }, 500);
  if (!coaches || coaches.length === 0) {
    return json({ sent: 0, reason: "no_coaches" });
  }

  // ── 2. Pull every coach's active client list in one go ──────────────
  const { data: assignments } = await admin
    .from("coaching_assignments")
    .select("client_id, coach_id")
    .eq("active", true);

  const clientsByCoach: Record<string, string[]> = {};
  for (const a of (assignments || []) as AssignmentRow[]) {
    if (!clientsByCoach[a.coach_id]) clientsByCoach[a.coach_id] = [];
    clientsByCoach[a.coach_id].push(a.client_id);
  }

  // Aggregate every unique client across all coaches so we can fetch
  // workouts + profiles in two queries instead of N×coaches.
  const allClientIds = [...new Set(Object.values(clientsByCoach).flat())];
  if (!allClientIds.length) {
    return json({ sent: 0, reason: "no_active_clients" });
  }

  // ── 3. Yesterday's workouts (any client of any coach) ───────────────
  const { data: workouts } = await admin
    .from("workouts")
    .select("user_id, date, type, name")
    .in("user_id", allClientIds)
    .eq("date", yesterdayStr);

  const workoutsByUser: Record<string, WorkoutRow[]> = {};
  for (const w of (workouts || []) as WorkoutRow[]) {
    if (!workoutsByUser[w.user_id]) workoutsByUser[w.user_id] = [];
    workoutsByUser[w.user_id].push(w);
  }

  // ── 4. Client profile names for the body ────────────────────────────
  const { data: clientProfiles } = await admin
    .from("profiles")
    .select("id, full_name, email")
    .in("id", allClientIds);

  const nameById: Record<string, string> = {};
  for (const p of (clientProfiles || []) as Profile[]) {
    nameById[p.id] = (p.full_name || p.email || p.id.slice(0, 8))
      .split(/\s+/)[0];  // first name only — keeps the body tight
  }

  // ── 5. Already-sent dedup ───────────────────────────────────────────
  const { data: alreadySent } = await admin
    .from("coach_digest_log")
    .select("coach_id")
    .eq("digest_date", todayStr);
  const sentSet = new Set((alreadySent || []).map((r: any) => r.coach_id));

  // ── 6. Build + dispatch ──────────────────────────────────────────────
  const fnUrl = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/send-push`;
  let sent = 0;
  let skipped = 0;
  const failures: { coach: string; error: string }[] = [];

  for (const coach of coaches as Profile[]) {
    if (sentSet.has(coach.id)) { skipped++; continue; }

    const clientIds = clientsByCoach[coach.id] || [];
    if (!clientIds.length) {
      // No active clients — still log the date so we don't keep
      // re-checking on retries.
      await admin.from("coach_digest_log")
        .upsert({ coach_id: coach.id, digest_date: todayStr,
                  digest_body: "skipped: no active clients" },
                { onConflict: "coach_id,digest_date" });
      skipped++;
      continue;
    }

    const trained = clientIds.filter(id => (workoutsByUser[id] || []).length > 0);
    const missed  = clientIds.filter(id => (workoutsByUser[id] || []).length === 0);

    const body = formatDigestBody({
      total: clientIds.length,
      trained,
      missed,
      nameById,
      workoutsByUser,
    });

    const title = `${trained.length}/${clientIds.length} trained yesterday`;

    // Send-push invocation. Inherit the service-role auth from this
    // function so send-push doesn't 401 on the lookup.
    try {
      const res = await fetch(fnUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: coach.id,
          title,
          body,
          data: { kind: "coach_digest", date: yesterdayStr },
        }),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        throw new Error(`send-push ${res.status}: ${errBody.slice(0, 120)}`);
      }

      // Log dedup AFTER successful send. If the push fails we want the
      // next cron run to retry (presumably APNs is down briefly).
      await admin.from("coach_digest_log").upsert({
        coach_id: coach.id,
        digest_date: todayStr,
        digest_body: body,
      }, { onConflict: "coach_id,digest_date" });

      sent++;
    } catch (e: any) {
      console.warn(`[coach-daily-digest] coach ${coach.id} failed:`, e?.message || e);
      failures.push({ coach: coach.id, error: e?.message || "unknown" });
    }
  }

  return json({
    sent,
    skipped,
    coaches: coaches.length,
    failures: failures.length,
    failureDetail: failures,
    yesterdayStr,
    todayStr,
  });
});

// ── Body builder ────────────────────────────────────────────────────────
// Hand-tuned templates. The constraint is iOS push preview = ~180 chars
// before truncation. We trim names to first-name only, list up to ~3
// trained + ~2 missed, then truncate the rest with "+N more".

interface BodyArgs {
  total: number;
  trained: string[];
  missed: string[];
  nameById: Record<string, string>;
  workoutsByUser: Record<string, WorkoutRow[]>;
}

function formatDigestBody(a: BodyArgs): string {
  const { total, trained, missed, nameById, workoutsByUser } = a;

  // Edge case: nobody trained.
  if (trained.length === 0) {
    if (missed.length === 0) {
      return "No client activity yesterday — quiet day.";
    }
    const namesPreview = listNames(missed.slice(0, 3), nameById);
    const more = missed.length > 3 ? ` +${missed.length - 3} more` : "";
    return `0 of ${total} trained yesterday. ${namesPreview}${more} didn't log anything. Reach out?`
      .slice(0, PUSH_BODY_MAX);
  }

  // Common case: some trained, some missed.
  const trainedDetails = trained.slice(0, 3).map(id => {
    const name = nameById[id] || "Client";
    const w = (workoutsByUser[id] || [])[0];
    const wname = (w?.name || w?.type || "Workout").slice(0, 20);
    return `${name}: ${wname}`;
  });

  let body = `${trained.length} of ${total} trained yesterday. ${trainedDetails.join(". ")}.`;

  if (missed.length > 0) {
    const missedNames = listNames(missed.slice(0, 2), nameById);
    const more = missed.length > 2 ? ` +${missed.length - 2}` : "";
    body += ` Missed: ${missedNames}${more}.`;
  }

  if (body.length <= PUSH_BODY_MAX) return body;

  // Over budget — drop the trained details to a name list.
  const trainedNames = listNames(trained.slice(0, 4), nameById);
  const trainedMore = trained.length > 4 ? ` +${trained.length - 4}` : "";
  body = `${trained.length} of ${total} trained: ${trainedNames}${trainedMore}.`;
  if (missed.length > 0) {
    const missedNames = listNames(missed.slice(0, 2), nameById);
    const more = missed.length > 2 ? ` +${missed.length - 2}` : "";
    body += ` Missed: ${missedNames}${more}.`;
  }
  return body.length <= PUSH_BODY_MAX
    ? body
    : `${trained.length} of ${total} trained yesterday. ${missed.length} missed.`;
}

function listNames(ids: string[], nameById: Record<string, string>): string {
  return ids.map(id => nameById[id] || "Client").join(", ");
}
