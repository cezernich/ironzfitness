// send-coach-request-email — handles the "Request a Coach" form submission.
//
// One-shot endpoint that does two things atomically (or as close to atomic
// as we can without a transaction across DB + SMTP):
//   1. Insert a row into public.coach_requests with the form payload.
//   2. Send an email to ironzsupport@gmail.com so a human (Chase) is
//      notified immediately, alongside the in-app Admin Portal entry.
//
// ── Email transport ──────────────────────────────────────────────────────
// Gmail SMTP via denomailer. App-password auth (NOT the user's password —
// requires 2FA on the Gmail account + a generated app password). Stored
// as the GMAIL_APP_PASSWORD secret. Sender: ironzsupport@gmail.com.
//
// Known constraints:
//   • Gmail caps outbound at ~500 emails/day per app password. For a
//     "Request a Coach" feature this is fine — even 100/day would be
//     a great problem to have.
//   • Gmail may rewrite the From header to the authenticated address
//     (ironzsupport@gmail.com) regardless of what we set. That's okay;
//     the Subject + body carry the signal.
//   • TLS on port 465 (SSL) is preferred over STARTTLS on 587 — fewer
//     connection issues from Deno's Edge runtime.
//   • If GMAIL_APP_PASSWORD is missing, the DB row is still inserted but
//     the email step is skipped with a warning. The admin portal's
//     Requests tab still shows the request.
//
// Required secrets:
//   GMAIL_APP_PASSWORD       — Gmail app password for ironzsupport@gmail.com
//   SUPABASE_URL             — auto-injected
//   SUPABASE_SERVICE_ROLE_KEY — auto-injected (RLS bypass for the insert)
//   SUPABASE_ANON_KEY        — auto-injected (JWT verification)
//
// Deploy:
//   supabase functions deploy send-coach-request-email
//   supabase secrets set GMAIL_APP_PASSWORD=<app-password>

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPPORT_EMAIL = "ironzsupport@gmail.com";

const SPORT_LABEL: Record<string, string> = {
  running: "Running",
  cycling: "Cycling",
  swimming: "Swimming",
  triathlon: "Triathlon",
  strength: "Strength training",
  hyrox: "Hyrox",
  general_fitness: "General fitness",
  other: "Other",
};
const GOAL_LABEL: Record<string, string> = {
  race: "Train for a specific race",
  general_fitness: "Build general fitness",
  body_comp: "Body composition (lose fat / gain muscle)",
  performance: "Performance / hit a benchmark",
  injury_return: "Return from injury",
  other: "Other",
};
const EXP_LABEL: Record<string, string> = {
  beginner: "Beginner — getting started",
  intermediate: "Intermediate — training consistently",
  advanced: "Advanced — racing or peaking",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isAllowed<T extends string>(v: unknown, allowed: readonly T[]): v is T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v);
}

const SPORTS = ["running", "cycling", "swimming", "triathlon", "strength", "hyrox", "general_fitness", "other"] as const;
const GOALS  = ["race", "general_fitness", "body_comp", "performance", "injury_return", "other"] as const;
const EXPS   = ["beginner", "intermediate", "advanced"] as const;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // ── 1. Verify JWT ────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return jsonResponse({ error: "Missing Authorization bearer token" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const anonKey     = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return jsonResponse({ error: "Server misconfigured (missing Supabase env)" }, 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user?.id) {
    return jsonResponse({ error: "Invalid or expired session" }, 401);
  }
  const userId = userRes.user.id;

  // ── 2. Parse + validate payload ──────────────────────────────────────
  let payload: { sport?: string; goal?: string; experience?: string; notes?: string };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON payload" }, 400);
  }

  const sport      = payload.sport;
  const goal       = payload.goal;
  const experience = payload.experience;
  const notes      = (payload.notes ?? "").toString().slice(0, 500); // cap at 500 chars

  if (!isAllowed(sport, SPORTS))      return jsonResponse({ error: "Invalid sport" }, 400);
  if (!isAllowed(goal, GOALS))        return jsonResponse({ error: "Invalid goal" }, 400);
  if (!isAllowed(experience, EXPS))   return jsonResponse({ error: "Invalid experience" }, 400);

  // ── 3. Look up profile (full_name, email, subscription, created_at) ─
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, email, subscription_status, created_at")
    .eq("id", userId)
    .maybeSingle();

  const isPremium = profile?.subscription_status === "premium";
  const userName  = profile?.full_name || "(no name on profile)";
  const userEmail = profile?.email || userRes.user.email || "(no email)";
  const accountAgeDays = profile?.created_at
    ? Math.floor((Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // ── 4. Insert coach_requests row ─────────────────────────────────────
  const { data: insertRow, error: insertErr } = await admin
    .from("coach_requests")
    .insert({
      user_id: userId,
      sport,
      goal,
      experience,
      notes: notes || null,
      premium_at_request: isPremium,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertErr) {
    return jsonResponse({ error: `Failed to record request: ${insertErr.message}` }, 500);
  }

  const requestId = insertRow.id;

  // ── 5. Send email (best-effort — DB row is the source of truth) ──────
  const gmailPass = Deno.env.get("GMAIL_APP_PASSWORD") || "";
  let emailSent = false;
  let emailError: string | null = null;

  if (!gmailPass) {
    emailError = "GMAIL_APP_PASSWORD secret not set — request stored, no email sent.";
    console.warn("[send-coach-request-email]", emailError);
  } else {
    try {
      const subject = "REQUEST COACH";
      const body = formatEmailBody({
        userName,
        userEmail,
        isPremium,
        accountAgeDays,
        userId,
        sport: sport as keyof typeof SPORT_LABEL,
        goal: goal as keyof typeof GOAL_LABEL,
        experience: experience as keyof typeof EXP_LABEL,
        notes,
        requestId,
      });

      const smtp = new SMTPClient({
        connection: {
          hostname: "smtp.gmail.com",
          port: 465,
          tls: true,
          auth: {
            username: SUPPORT_EMAIL,
            password: gmailPass,
          },
        },
      });

      await smtp.send({
        from: `IronZ Coach Requests <${SUPPORT_EMAIL}>`,
        to: SUPPORT_EMAIL,
        replyTo: userEmail !== "(no email)" ? userEmail : undefined,
        subject,
        content: body,
        html: undefined, // plaintext only — easier to parse in Gmail rules
      });

      await smtp.close();
      emailSent = true;
    } catch (e) {
      emailError = `SMTP send failed: ${(e as Error).message}`;
      console.warn("[send-coach-request-email] email error:", e);
      // Note: we don't fail the request — the DB row is the source of truth.
      // Admin can still see it in the Requests tab even if the email bounced.
    }
  }

  return jsonResponse({
    ok: true,
    requestId,
    emailSent,
    ...(emailError ? { emailError } : {}),
  });
});

// ── Email body formatter ──────────────────────────────────────────────────

interface BodyArgs {
  userName: string;
  userEmail: string;
  isPremium: boolean;
  accountAgeDays: number | null;
  userId: string;
  sport: keyof typeof SPORT_LABEL;
  goal: keyof typeof GOAL_LABEL;
  experience: keyof typeof EXP_LABEL;
  notes: string;
  requestId: string;
}

function formatEmailBody(a: BodyArgs): string {
  const planLabel = a.isPremium ? "Premium" : "Free";
  const ageLabel  = a.accountAgeDays != null ? `${a.accountAgeDays} days` : "(unknown)";
  const sportLbl  = SPORT_LABEL[a.sport] || a.sport;
  const goalLbl   = GOAL_LABEL[a.goal] || a.goal;
  const expLbl    = EXP_LABEL[a.experience] || a.experience;
  const notesBlock = a.notes
    ? `  Notes:\n  "${a.notes.replace(/"/g, "'")}"`
    : `  Notes:\n  (none)`;

  return [
    "New coach request from a user.",
    "",
    "USER",
    `  Name:           ${a.userName}`,
    `  Email:          ${a.userEmail}`,
    `  Plan:           ${planLabel}`,
    `  Account age:    ${ageLabel}`,
    `  User ID:        ${a.userId}`,
    "",
    "REQUEST",
    `  Sport:          ${sportLbl}`,
    `  Goal:           ${goalLbl}`,
    `  Experience:     ${expLbl}`,
    notesBlock,
    "",
    "NEXT STEPS",
    `  • Reply to this email or assign a coach via the Admin Portal:`,
    `    https://ironz.fit/  →  Admin Portal  →  Coaches  →  Requests`,
    `    Request ID: ${a.requestId}`,
    "",
  ].join("\n");
}
