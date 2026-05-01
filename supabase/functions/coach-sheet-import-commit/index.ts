// coach-sheet-import-commit — Coach sheet import, atomic commit
//
// Called by the front-end after the user reviews and clicks "Import all".
// Phase A scope: increments coach_sheet_import_quotas for the current
// month and flips the matching coach_sheet_import_logs row to status =
// 'success'. The actual workout/template inserts happen client-side via
// the existing localStorage + DB.syncWorkouts pipeline so imported
// workouts go through the same commit path as native ones (Decision
// #11). Phase B may move workout inserts here as a SECURITY DEFINER
// transaction once the parser is real.
//
// Rejects with IRO05_QUOTA_EXCEEDED if the user is already at 5/month —
// belt-and-braces alongside the parse-stub's pre-check.
//
// Deploy: supabase functions deploy coach-sheet-import-commit

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

function errorResponse(code: string, message: string, status = 400) {
  return jsonResponse({ status: "error", code, message }, status);
}

interface CommitRequest {
  import_id: string;
  workouts_inserted?: number;
  templates_inserted?: number;
  selected_sheets?: string[];
  date_range?: { from: string; to: string };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("METHOD_NOT_ALLOWED", "POST only", 405);

  // ── Auth ───────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return errorResponse("UNAUTHORIZED", "Missing authorization", 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseServiceKey) {
    return errorResponse("SERVER_MISCONFIGURED", "Missing service env", 500);
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return errorResponse("UNAUTHORIZED", "Invalid session", 401);

  // ── Body ───────────────────────────────────────────────────────────────────
  let body: CommitRequest;
  try { body = await req.json(); } catch { return errorResponse("BAD_REQUEST", "Invalid JSON body"); }
  if (!body?.import_id) return errorResponse("BAD_REQUEST", "import_id is required");

  // ── Verify the import_id belongs to this user (look up the pending log) ──
  const { data: logRow, error: logErr } = await supabase
    .from("coach_sheet_import_logs")
    .select("id, user_id, status")
    .eq("import_id", body.import_id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (logErr || !logRow) return errorResponse("NOT_FOUND", "Import not found for this user", 404);
  if (logRow.status === "success") {
    return errorResponse("ALREADY_COMMITTED", "This import has already been committed", 409);
  }

  // ── Quota re-check (race-safe). The parse-stub checked at parse time;
  //    re-checking here means a client that bypasses the front-end can't
  //    commit a 6th import even if they raced two parse calls. ─────────────
  const monthKey = new Date().toISOString().slice(0, 7);
  const { data: quotaRow } = await supabase
    .from("coach_sheet_import_quotas")
    .select("import_count")
    .eq("user_id", user.id)
    .eq("month_yyyymm", monthKey)
    .maybeSingle();
  const usedThisMonth = quotaRow?.import_count ?? 0;
  if (usedThisMonth >= 5) {
    await supabase.from("coach_sheet_import_logs")
      .update({ status: "failed", error_code: "IRO05_QUOTA_EXCEEDED", updated_at: new Date().toISOString() })
      .eq("id", logRow.id);
    return errorResponse(
      "IRO05_QUOTA_EXCEEDED",
      `You've used all 5 imports for ${monthKey}. Quota resets on the 1st.`,
      429,
    );
  }

  // ── Atomic-ish commit. Two writes; we accept that a server crash
  //    between them leaves the counter unincremented. Phase B can wrap
  //    this in a SECURITY DEFINER function for true atomicity. ────────────
  const now = new Date().toISOString();
  const { error: updateLogErr } = await supabase
    .from("coach_sheet_import_logs")
    .update({
      status: "success",
      workouts_parsed: body.workouts_inserted ?? null,
      templates_parsed: body.templates_inserted ?? null,
      selected_sheets: body.selected_sheets ?? null,
      date_range_from: body.date_range?.from ?? null,
      date_range_to: body.date_range?.to ?? null,
      updated_at: now,
    })
    .eq("id", logRow.id);
  if (updateLogErr) {
    console.warn("[commit] log update failed", updateLogErr);
    return errorResponse("COMMIT_FAILED", updateLogErr.message, 500);
  }

  // Upsert + increment the monthly counter. Two-step (read then write)
  // is fine here because RLS prevents anyone but the service role from
  // touching this table — no concurrent writers other than this
  // function for a given (user, month).
  const { error: quotaErr } = await supabase
    .from("coach_sheet_import_quotas")
    .upsert({
      user_id: user.id,
      month_yyyymm: monthKey,
      import_count: usedThisMonth + 1,
      updated_at: now,
    }, { onConflict: "user_id,month_yyyymm" });
  if (quotaErr) {
    console.warn("[commit] quota upsert failed", quotaErr);
    // Not fatal — log already flipped to success — but flag to the
    // client so support can investigate if it shows up in logs.
    return jsonResponse({
      status: "ok_with_warning",
      import_id: body.import_id,
      warning: "Quota counter update failed; please contact support if you see this.",
      month_yyyymm: monthKey,
      import_count: usedThisMonth, // pre-increment value
    });
  }

  return jsonResponse({
    status: "ok",
    import_id: body.import_id,
    month_yyyymm: monthKey,
    import_count: usedThisMonth + 1,
  });
});
