// coach-sheet-import-parse — Coach sheet import edge function
//
// Phase A (this file): stub. Verifies the user, validates the request
// shape, writes a row to coach_sheet_import_logs with status='pending',
// and returns canned sheet/workout metadata so the front-end's three-step
// modal (drop → sheet picker → date range → review) is end-to-end
// testable against real infra.
//
// Phase B (later): replaces the canned response with a structural parser
// (xlsx walker) + LLM normalizer (Anthropic API) that returns the
// canonical IronZ workout shape. The request envelope here is the one
// Phase B will consume — front-end won't need to change when the real
// parser ships.
//
// Deploy: supabase functions deploy coach-sheet-import-parse
// Verify JWT: ON (default).

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

interface ParseRequest {
  storage_path: string;
  import_id: string;
  filename?: string;
  file_size_bytes?: number;
  selected_sheets?: string[];
  date_range?: { from: string; to: string };
  // Phase A flag: when true, the stub returns sheet metadata only
  // (no workouts). Used by the front-end immediately after upload to
  // populate the sheet picker. Phase B can ignore this and always
  // return the full payload.
  metadata_only?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("METHOD_NOT_ALLOWED", "POST only", 405);

  // ── 1. Auth ────────────────────────────────────────────────────────────────
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

  // ── 2. Request shape ───────────────────────────────────────────────────────
  let body: ParseRequest;
  try {
    body = await req.json();
  } catch {
    return errorResponse("BAD_REQUEST", "Invalid JSON body");
  }
  if (!body?.storage_path || !body?.import_id) {
    return errorResponse("BAD_REQUEST", "storage_path and import_id are required");
  }

  // The path's first segment must match the caller's uid — defense in
  // depth alongside storage RLS.
  const expectedPrefix = `${user.id}/`;
  if (!body.storage_path.startsWith(expectedPrefix)) {
    return errorResponse("FORBIDDEN", "storage_path does not belong to caller", 403);
  }

  // ── 3. Quota check (warn-only in Phase A; soft-cap is enforced
  //      client-side too, but the authoritative check lives here so a
  //      client that bypasses the JS can't game it). ────────────────────────
  const monthKey = new Date().toISOString().slice(0, 7); // "2026-05"
  const { data: quotaRow } = await supabase
    .from("coach_sheet_import_quotas")
    .select("import_count")
    .eq("user_id", user.id)
    .eq("month_yyyymm", monthKey)
    .maybeSingle();

  const usedThisMonth = quotaRow?.import_count ?? 0;
  if (usedThisMonth >= 5) {
    return errorResponse(
      "IRO05_QUOTA_EXCEEDED",
      `You've used all 5 imports for ${monthKey}. Quota resets on the 1st.`,
      429,
    );
  }

  // ── 4. Audit log row (status='pending') ───────────────────────────────────
  // Insert here so even a malformed request leaves a paper trail; Phase B
  // updates it to success/failed at completion.
  await supabase.from("coach_sheet_import_logs").insert({
    user_id: user.id,
    import_id: body.import_id,
    storage_path: body.storage_path,
    filename: body.filename ?? null,
    file_size_bytes: body.file_size_bytes ?? null,
    selected_sheets: body.selected_sheets ?? null,
    date_range_from: body.date_range?.from ?? null,
    date_range_to: body.date_range?.to ?? null,
    status: "pending",
  });

  // ── 5. Stub response ──────────────────────────────────────────────────────
  // Phase A returns canned data shaped exactly like Phase B will. The
  // front-end consumes this for the sheet picker + date range + review
  // placeholder so the whole flow is testable end-to-end against real
  // storage uploads.
  //
  // Heuristic: if the filename looks like Paige's known sample, return
  // her canned sheet list. Anything else gets a generic single-sheet
  // canned response. Phase B replaces this with a real workbook walker.

  const filename = (body.filename ?? body.storage_path.split("/").pop() ?? "").toLowerCase();
  const isPaigeFile = filename.includes("paige");

  const sheets = isPaigeFile
    ? [
        { name: "Resources", role: "athlete_profile", auto_detected: true,  date_range: null,                                week_count: 0 },
        { name: "January",   role: "calendar",         auto_detected: true,  date_range: { from: "2026-01-05", to: "2026-02-01" }, week_count: 4 },
        { name: "February",  role: "calendar",         auto_detected: true,  date_range: { from: "2026-02-02", to: "2026-03-01" }, week_count: 4 },
        { name: "March",     role: "calendar",         auto_detected: true,  date_range: { from: "2026-03-02", to: "2026-04-05" }, week_count: 5 },
        { name: "April",     role: "calendar",         auto_detected: true,  date_range: { from: "2026-04-06", to: "2026-05-03" }, week_count: 4 },
        { name: "May",       role: "calendar",         auto_detected: true,  date_range: { from: "2026-05-04", to: "2026-05-31" }, week_count: 4 },
        { name: "June",      role: "calendar",         auto_detected: true,  date_range: { from: "2026-06-01", to: "2026-06-28" }, week_count: 4 },
        { name: "Strength",  role: "strength_library", auto_detected: true,  date_range: null,                                week_count: 0, template_count: 5 },
        { name: "Fueling",   role: "fueling",          auto_detected: false, date_range: null,                                week_count: 0, disabled: true, disabled_reason: "Coming soon" },
      ]
    : [
        { name: "Sheet1", role: "calendar", auto_detected: true, date_range: { from: new Date().toISOString().slice(0, 10), to: addDays(new Date().toISOString().slice(0, 10), 28) }, week_count: 4 },
      ];

  return jsonResponse({
    status: "ok",
    import_id: body.import_id,
    is_stub: true,
    sheets,
    // Phase B fills these — Phase A returns empty arrays so the review
    // placeholder has a stable shape to bind against.
    running_workouts: [],
    strength_templates: [],
    athlete_profile: null,
    warnings: [],
    stats: {
      workouts_parsed: 0,
      templates_parsed: 0,
      llm_tokens_used: 0,
      estimated_cost_usd: 0,
    },
  });
});

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
