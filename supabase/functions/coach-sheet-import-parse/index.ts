// coach-sheet-import-parse — Coach sheet import edge function
//
// Phase B Slice 1: real xlsx parsing replaces the Phase A stub. The
// function downloads the uploaded file from storage, runs a structural
// extractor (sheet enumeration + role detection + header rules + raw
// per-day blocks), and returns sheet metadata + best-effort workouts.
//
// Slice 2 will swap the heuristic workout shaping for an Anthropic LLM
// normalizer that takes the raw blocks + header rules and returns the
// canonical IronZ workout shape with the accuracy the spec promises.
// The request envelope and response shape stay the same — front-end
// won't need to change.
//
// Slice 3 adds cost guardrails ($2/import LLM cap), token tracking
// into coach_sheet_import_logs, and structured error envelopes
// (IRO06_PARSE_FAILED, IRO07_FILE_TOO_LARGE, IRO08_PARSE_BUDGET_EXCEEDED).
//
// Deploy: supabase functions deploy coach-sheet-import-parse

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

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
  metadata_only?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("METHOD_NOT_ALLOWED", "POST only", 405);

  // ── Auth ───────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return errorResponse("UNAUTHORIZED", "Missing authorization", 401);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseServiceKey) return errorResponse("SERVER_MISCONFIGURED", "Missing service env", 500);
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return errorResponse("UNAUTHORIZED", "Invalid session", 401);

  // ── Body ───────────────────────────────────────────────────────────────────
  let body: ParseRequest;
  try { body = await req.json(); } catch { return errorResponse("BAD_REQUEST", "Invalid JSON body"); }
  if (!body?.storage_path || !body?.import_id) return errorResponse("BAD_REQUEST", "storage_path and import_id are required");
  if (!body.storage_path.startsWith(`${user.id}/`)) return errorResponse("FORBIDDEN", "storage_path does not belong to caller", 403);

  // ── Quota ──────────────────────────────────────────────────────────────────
  const monthKey = new Date().toISOString().slice(0, 7);
  const { data: quotaRow } = await supabase
    .from("coach_sheet_import_quotas")
    .select("import_count")
    .eq("user_id", user.id).eq("month_yyyymm", monthKey).maybeSingle();
  if ((quotaRow?.import_count ?? 0) >= 5) {
    return errorResponse("IRO05_QUOTA_EXCEEDED", `You've used all 5 imports for ${monthKey}. Quota resets on the 1st.`, 429);
  }

  // ── Audit log row ──────────────────────────────────────────────────────────
  // Insert at the start so even a parse failure leaves a paper trail.
  // Captured logId is used by every exit path below to update the row
  // with final status (success/failed) + token usage + cost.
  const { data: logRow } = await supabase
    .from("coach_sheet_import_logs")
    .insert({
      user_id: user.id,
      import_id: body.import_id,
      storage_path: body.storage_path,
      filename: body.filename ?? null,
      file_size_bytes: body.file_size_bytes ?? null,
      selected_sheets: body.selected_sheets ?? null,
      date_range_from: body.date_range?.from ?? null,
      date_range_to: body.date_range?.to ?? null,
      status: "pending",
    })
    .select("id")
    .single();
  const logId: string | null = logRow?.id ?? null;

  // Helper: every exit path that doesn't go through the normal success
  // return uses this to flip the log row to "failed" with an error
  // code. Best-effort — a Supabase write hiccup here doesn't block the
  // response; the operator can still see the original "pending" row.
  const failLog = async (code: string, message: string) => {
    if (!logId) return;
    try {
      await supabase.from("coach_sheet_import_logs")
        .update({ status: "failed", error_code: code, error_message: message?.slice(0, 1000) ?? null, updated_at: new Date().toISOString() })
        .eq("id", logId);
    } catch (e) {
      console.warn("[parse] failLog write failed", e);
    }
  };

  // ── Download from storage ──────────────────────────────────────────────────
  const { data: fileBlob, error: dlErr } = await supabase.storage
    .from("coach-sheet-imports")
    .download(body.storage_path.replace(/^coach-sheet-imports\//, ""));
  if (dlErr || !fileBlob) {
    console.warn("[parse] storage download failed", dlErr);
    await failLog("IRO06_PARSE_FAILED", `download: ${dlErr?.message ?? "unknown"}`);
    return errorResponse("IRO06_PARSE_FAILED", "Couldn't read the uploaded file. Try uploading again.", 500);
  }
  const arrayBuffer = await fileBlob.arrayBuffer();
  if (arrayBuffer.byteLength > 10 * 1024 * 1024) {
    await failLog("IRO07_FILE_TOO_LARGE", `${arrayBuffer.byteLength} bytes`);
    return errorResponse("IRO07_FILE_TOO_LARGE", "File exceeds the 10 MB limit.", 413);
  }

  // ── Parse workbook ─────────────────────────────────────────────────────────
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: "array", cellDates: true, cellNF: false, cellText: false });
  } catch (e) {
    console.warn("[parse] XLSX.read threw", e);
    await failLog("IRO06_PARSE_FAILED", `XLSX.read: ${String(e).slice(0, 500)}`);
    return errorResponse("IRO06_PARSE_FAILED", "We couldn't read this file. Make sure it's a valid Excel file and try again.", 422);
  }
  if (!workbook.SheetNames?.length) {
    await failLog("IRO06_PARSE_FAILED", "no sheets");
    return errorResponse("IRO06_PARSE_FAILED", "The workbook has no sheets.", 422);
  }

  // ── Stage 1: structural analysis ──────────────────────────────────────────
  const analysis = analyzeWorkbook(workbook);
  if (!analysis.sheets.some(s => s.role === "calendar")) {
    if (!body.metadata_only && !analysis.sheets.some(s => s.role === "strength_library")) {
      await failLog("IRO06_PARSE_FAILED", "no calendar/strength sheet detected");
      return errorResponse(
        "IRO06_PARSE_FAILED",
        "We couldn't find a calendar layout in this file. Check that there's a sheet with dates laid out as a weekly grid (Mon–Sun across columns).",
        422,
      );
    }
  }

  // Metadata-only (front-end's first call after upload — only needs the
  // sheet list for the picker step). Skip workout extraction entirely.
  if (body.metadata_only) {
    return jsonResponse({
      status: "ok",
      import_id: body.import_id,
      is_stub: false,
      sheets: analysis.sheets.map(stripInternal),
      running_workouts: [],
      strength_templates: [],
      athlete_profile: null,
      warnings: [],
      stats: { workouts_parsed: 0, templates_parsed: 0, llm_tokens_used: 0, estimated_cost_usd: 0 },
    });
  }

  // ── Stage 2 — LLM normalization (Slice 2) ────────────────────────────────
  // Collects raw blocks across all selected calendar sheets, batches them,
  // and sends each batch to Claude for normalization into the canonical
  // IronZ workout shape. Heuristic shaping (Slice 1's logic) is the
  // per-batch fallback so a single LLM hiccup doesn't drop the whole
  // import; LLM-disabled (no API key) falls back to heuristic for the
  // entire pipe.
  const selected = new Set(body.selected_sheets ?? analysis.sheets.map(s => s.name));
  const range = body.date_range ?? null;

  // Phase 1 — extract raw blocks across all selected calendar sheets,
  // filtered by the user's date range. Header rules ride along with each
  // block so the normalizer can apply WU/CD universally per Decision #12
  // even when batches mix sheets (e.g. "May" + "June" both selected).
  const allRawBlocks: RawBlockWithContext[] = [];
  const warnings: string[] = [];
  for (const sheet of analysis.sheets) {
    if (sheet.role !== "calendar") continue;
    if (!selected.has(sheet.name)) continue;
    try {
      const blocks = extractRawBlocks(workbook.Sheets[sheet.name], sheet);
      for (const day of blocks) {
        if (range && (day.date < range.from || day.date > range.to)) continue;
        allRawBlocks.push({
          ...day,
          sheet_name: sheet.name,
          header_rules: sheet._headerRules ?? { warmup_distance_mi: null, cooldown_distance_mi: null },
        });
      }
    } catch (e) {
      console.warn(`[parse] sheet ${sheet.name} extraction failed`, e);
      warnings.push(`Couldn't fully parse "${sheet.name}" — review carefully.`);
    }
  }

  // Phase 2 — normalize. LLM batches of NORMALIZE_BATCH_SIZE; heuristic
  // fallback per batch on LLM error or malformed JSON.
  const sheetByName = new Map<string, SheetAnalysis>();
  for (const s of analysis.sheets) sheetByName.set(s.name, s);

  let normalizeResult: NormalizeResult;
  try {
    normalizeResult = await normalizeBlocks(
      allRawBlocks,
      sheetByName,
      body.import_id,
      body.filename,
      { budgetCapUsd: BUDGET_CAP_USD },
    );
  } catch (e: any) {
    if (e?.code === "IRO08_PARSE_BUDGET_EXCEEDED") {
      await failLog("IRO08_PARSE_BUDGET_EXCEEDED", e.message);
      return errorResponse(
        "IRO08_PARSE_BUDGET_EXCEEDED",
        "This import is unusually large. Try a shorter date range.",
        413,
      );
    }
    console.warn("[parse] normalizeBlocks threw", e);
    await failLog("IRO06_PARSE_FAILED", `normalize: ${String(e).slice(0, 500)}`);
    return errorResponse("IRO06_PARSE_FAILED", "Auto-parse failed. Try again.", 500);
  }
  const running_workouts = normalizeResult.workouts;
  warnings.push(...normalizeResult.warnings);

  const strength_templates: Array<Record<string, unknown>> = [];
  for (const sheet of analysis.sheets) {
    if (sheet.role !== "strength_library") continue;
    if (!selected.has(sheet.name)) continue;
    try {
      const tpls = extractStrengthTemplates(workbook.Sheets[sheet.name], sheet, body.import_id);
      strength_templates.push(...tpls);
    } catch (e) {
      console.warn(`[parse] strength sheet ${sheet.name} failed`, e);
      warnings.push(`Couldn't fully parse strength sheet "${sheet.name}" — review carefully.`);
    }
  }

  // Athlete profile (Resources sheet). Heuristic-only for Slice 3 —
  // the LLM normalizer would lift quality but profile data is opt-in
  // beta on the front-end (Decision #13), so a lightweight extractor
  // is enough to populate it. Front-end shows it under a "(beta)" tag.
  let athlete_profile: Record<string, unknown> | null = null;
  for (const sheet of analysis.sheets) {
    if (sheet.role !== "athlete_profile") continue;
    if (!selected.has(sheet.name)) continue;
    try {
      const profile = extractAthleteProfile(workbook.Sheets[sheet.name]);
      if (profile && (profile.races?.length || profile.prs?.length)) {
        athlete_profile = profile;
      }
    } catch (e) {
      console.warn(`[parse] athlete_profile sheet ${sheet.name} failed`, e);
    }
  }

  // Math reconciliation runtime check (per spec §B5). Surface a warning
  // if fewer than 90% of workouts have sum(structure[*].distance_mi)
  // matching total_distance_mi within 0.5mi tolerance.
  const recon = computeReconciliation(running_workouts);
  if (recon.total > 0 && recon.ratio < 0.9) {
    warnings.push(
      `${recon.total - recon.reconciled}/${recon.total} workouts have structure totals that don't match prescribed mileage — review carefully.`,
    );
  }

  // Final log update — success path. Write the parse counters + cost
  // so support can audit any user's import history without needing the
  // file itself.
  if (logId) {
    try {
      await supabase.from("coach_sheet_import_logs")
        .update({
          status: "success",
          workouts_parsed: running_workouts.length,
          templates_parsed: strength_templates.length,
          llm_tokens_used: normalizeResult.usage.total_tokens,
          estimated_cost_usd: normalizeResult.usage.estimated_cost_usd,
          updated_at: new Date().toISOString(),
        })
        .eq("id", logId);
    } catch (e) {
      console.warn("[parse] success log update failed", e);
    }
  }

  return jsonResponse({
    status: "ok",
    import_id: body.import_id,
    is_stub: false,
    sheets: analysis.sheets.map(stripInternal),
    running_workouts,
    strength_templates,
    athlete_profile,
    warnings,
    stats: {
      workouts_parsed: running_workouts.length,
      templates_parsed: strength_templates.length,
      reconciliation_ratio: recon.ratio,
      reconciliation_count: recon.reconciled,
      reconciliation_total: recon.total,
      llm_tokens_used: normalizeResult.usage.total_tokens,
      llm_cache_read_tokens: normalizeResult.usage.cache_read_tokens,
      llm_cache_write_tokens: normalizeResult.usage.cache_write_tokens,
      llm_input_tokens: normalizeResult.usage.input_tokens,
      llm_output_tokens: normalizeResult.usage.output_tokens,
      llm_batches: normalizeResult.usage.batch_count,
      llm_fallbacks: normalizeResult.usage.fallback_batch_count,
      estimated_cost_usd: normalizeResult.usage.estimated_cost_usd,
      llm_used: normalizeResult.usage.llm_used,
    },
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Stage 1 — structural extractor
// ────────────────────────────────────────────────────────────────────────────

interface SheetAnalysis {
  name: string;
  role: "calendar" | "strength_library" | "athlete_profile" | "fueling" | "unknown";
  auto_detected: boolean;
  date_range: { from: string; to: string } | null;
  week_count: number;
  template_count?: number;
  disabled?: boolean;
  disabled_reason?: string;
  // Internals used during workout extraction; stripped from the wire response.
  _dateRows?: Array<{ row: number; cols: number[]; dates: string[] }>;
  _headerRules?: { warmup_distance_mi: number | null; cooldown_distance_mi: number | null };
}

function stripInternal(s: SheetAnalysis) {
  const { _dateRows, _headerRules, ...rest } = s;
  return rest;
}

function analyzeWorkbook(wb: XLSX.WorkBook) {
  const sheets: SheetAnalysis[] = [];
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    sheets.push(analyzeSheet(name, sheet));
  }
  return { sheets };
}

function analyzeSheet(name: string, sheet: XLSX.WorkSheet): SheetAnalysis {
  const lower = name.toLowerCase();

  // Name-based heuristic first — these are stable across coach formats.
  if (lower.includes("fuel")) {
    return { name, role: "fueling", auto_detected: false, date_range: null, week_count: 0, disabled: true, disabled_reason: "Coming soon" };
  }
  if (lower.includes("strength") || lower.includes("lifting") || lower.includes("weights")) {
    const templateCount = countStrengthTemplates(sheet);
    return { name, role: "strength_library", auto_detected: true, date_range: null, week_count: 0, template_count: templateCount };
  }
  if (lower.includes("resource") || lower.includes("athlete") || lower.includes("profile") || lower.includes("race") || lower.includes("pr")) {
    return { name, role: "athlete_profile", auto_detected: true, date_range: null, week_count: 0 };
  }

  // Structural heuristic for calendars: scan for rows with ≥3 date cells.
  const dateRows = findDateRows(sheet);
  if (dateRows.length > 0) {
    const allDates = dateRows.flatMap(r => r.dates).sort();
    const dateRange = allDates.length
      ? { from: allDates[0], to: allDates[allDates.length - 1] }
      : null;
    return {
      name,
      role: "calendar",
      auto_detected: true,
      date_range: dateRange,
      week_count: dateRows.length,
      _dateRows: dateRows,
      _headerRules: detectHeaderRules(sheet),
    };
  }

  return { name, role: "unknown", auto_detected: false, date_range: null, week_count: 0 };
}

// Find rows that look like date headers — a row with ≥3 cells whose
// values parse as ISO dates within a sensible year window.
function findDateRows(sheet: XLSX.WorkSheet): Array<{ row: number; cols: number[]; dates: string[] }> {
  const ref = sheet["!ref"];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const rowsScanned = Math.min(range.e.r, 200); // cap scan depth
  const result: Array<{ row: number; cols: number[]; dates: string[] }> = [];

  for (let r = range.s.r; r <= rowsScanned; r++) {
    const cols: number[] = [];
    const dates: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ c, r });
      const cell = sheet[addr];
      if (!cell) continue;
      const iso = coerceToIsoDate(cell);
      if (iso) {
        cols.push(c);
        dates.push(iso);
      }
    }
    if (cols.length >= 3) result.push({ row: r, cols, dates });
  }
  return result;
}

// Coerce a cell to YYYY-MM-DD if it looks date-like. Accepts:
//   - real date type (cellDates: true gives Date in cell.v)
//   - Excel serial numbers (large integer roughly in [25000, 60000])
//   - "M/D/YY" / "M/D/YYYY" text
function coerceToIsoDate(cell: XLSX.CellObject): string | null {
  if (!cell) return null;
  const v = cell.v;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (cell.t === "n" && typeof v === "number" && v > 25000 && v < 80000) {
    // Excel serial date — days since 1899-12-30
    const ms = (v - 25569) * 86400 * 1000;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  if (typeof v === "string") {
    const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    if (m) {
      const month = parseInt(m[1], 10);
      const day = parseInt(m[2], 10);
      let year = parseInt(m[3], 10);
      if (year < 100) year += 2000;
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const d = new Date(Date.UTC(year, month - 1, day));
        return d.toISOString().slice(0, 10);
      }
    }
  }
  return null;
}

// Detect WU/CD distance rules in the top ~15 rows of a calendar sheet.
// Looks for cells containing the words then walks neighbors for a number.
function detectHeaderRules(sheet: XLSX.WorkSheet): { warmup_distance_mi: number | null; cooldown_distance_mi: number | null } {
  const ref = sheet["!ref"];
  if (!ref) return { warmup_distance_mi: null, cooldown_distance_mi: null };
  const range = XLSX.utils.decode_range(ref);
  const maxR = Math.min(range.e.r, range.s.r + 15);

  let wu: number | null = null;
  let cd: number | null = null;

  for (let r = range.s.r; r <= maxR; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ c, r })];
      if (!cell || typeof cell.v !== "string") continue;
      const text = cell.v.toLowerCase();
      const isWu = /warm\s*up|^wu\b|warmup/i.test(text);
      const isCd = /cool\s*down|^cd\b|cooldown/i.test(text);
      if (!isWu && !isCd) continue;

      // Embedded number ("1.5 mile warmup") wins over neighbor lookup.
      const inline = text.match(/(\d+(?:\.\d+)?)\s*(?:mile|mi|m)?/i);
      if (inline) {
        const n = parseFloat(inline[1]);
        if (Number.isFinite(n) && n < 20) {
          if (isWu && wu == null) wu = n;
          if (isCd && cd == null) cd = n;
          continue;
        }
      }
      // Neighbor lookup — scan right + below for the first numeric cell.
      const neighbors: Array<[number, number]> = [
        [c + 1, r], [c + 2, r], [c, r + 1], [c, r + 2],
      ];
      for (const [nc, nr] of neighbors) {
        const nb = sheet[XLSX.utils.encode_cell({ c: nc, r: nr })];
        if (!nb) continue;
        const n = parseFloat(String(nb.v));
        if (Number.isFinite(n) && n < 20) {
          if (isWu && wu == null) wu = n;
          if (isCd && cd == null) cd = n;
          break;
        }
      }
    }
  }
  return { warmup_distance_mi: wu, cooldown_distance_mi: cd };
}

// ────────────────────────────────────────────────────────────────────────────
// Per-day raw block extraction (inputs to Slice 2 LLM normalizer)
// ────────────────────────────────────────────────────────────────────────────

interface RawDayBlock {
  date: string;
  day_of_week: string;
  source_cell: string;
  prescribed_mileage_mi: number | null;
  raw_description: string;
}

// For each date row, walk the rows beneath each date column collecting
// text content as raw_description. Tries to identify a numeric cell as
// the prescribed mileage. Heuristic — Slice 2 LLM cleans this up.
function extractRawBlocks(sheet: XLSX.WorkSheet, info: SheetAnalysis): RawDayBlock[] {
  if (!info._dateRows?.length) return [];
  const blocks: RawDayBlock[] = [];
  const ref = sheet["!ref"];
  if (!ref) return blocks;
  const range = XLSX.utils.decode_range(ref);

  // For each date row, we read the column under each date until we hit
  // (a) a row with another date in any column = next week, or (b) the
  // sheet bottom. Cell content concatenated (newline-separated) becomes
  // raw_description. Numbers we encounter are candidates for prescribed
  // mileage; we take the first plausible "miles"-shaped number.
  const dateRowSet = new Set(info._dateRows.map(r => r.row));

  for (let i = 0; i < info._dateRows.length; i++) {
    const dr = info._dateRows[i];
    const nextDateRow = info._dateRows[i + 1]?.row ?? Math.min(range.e.r, dr.row + 12);

    for (let cIdx = 0; cIdx < dr.cols.length; cIdx++) {
      const col = dr.cols[cIdx];
      const date = dr.dates[cIdx];
      const dow = isoDayShort(date);
      const sourceCell = XLSX.utils.encode_cell({ c: col, r: dr.row });

      const lines: string[] = [];
      let prescribed: number | null = null;
      for (let r = dr.row + 1; r < nextDateRow && r <= range.e.r; r++) {
        if (dateRowSet.has(r)) break;
        const cell = sheet[XLSX.utils.encode_cell({ c: col, r })];
        if (!cell) continue;
        const text = cellToText(cell);
        if (!text) continue;
        if (prescribed == null) {
          const m = text.match(/^\s*(\d+(?:\.\d+)?)\s*(?:mi(?:les?)?|m)?\s*$/i);
          if (m) {
            const n = parseFloat(m[1]);
            if (Number.isFinite(n) && n >= 1 && n <= 30) prescribed = n;
          }
        }
        lines.push(text);
      }

      const desc = lines.join("\n").trim();
      // Skip empty cells entirely — they're rest days the coach left blank.
      if (!desc && prescribed == null) continue;

      blocks.push({
        date, day_of_week: dow, source_cell: sourceCell,
        prescribed_mileage_mi: prescribed,
        raw_description: desc,
      });
    }
  }
  return blocks;
}

function cellToText(cell: XLSX.CellObject): string {
  if (!cell) return "";
  if (cell.w && typeof cell.w === "string") return cell.w;
  if (cell.v == null) return "";
  if (cell.v instanceof Date) return cell.v.toISOString().slice(0, 10);
  return String(cell.v);
}

function isoDayShort(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getUTCDay()];
}

// ────────────────────────────────────────────────────────────────────────────
// Heuristic workout shaping (Slice 1 placeholder for LLM normalization)
// ────────────────────────────────────────────────────────────────────────────

function heuristicShapeWorkout(day: RawDayBlock, sheet: SheetAnalysis, importId: string, filename?: string): Record<string, unknown> | null {
  const desc = day.raw_description;
  const total = day.prescribed_mileage_mi;
  const dt = classifyDayType(desc, total);

  if (dt === "rest") {
    return {
      date: day.date, day_of_week: day.day_of_week, sport: "running",
      day_type: "rest", total_distance_mi: 0, structure: [],
      raw_description: desc, source_file: filename ?? null,
      source_sheet: sheet.name, source_cell: day.source_cell,
      import_id: importId,
    };
  }
  if (!total && !desc) return null;

  // Apply header WU/CD to all running workouts (Decision #12 — universal).
  const wu = sheet._headerRules?.warmup_distance_mi ?? null;
  const cd = sheet._headerRules?.cooldown_distance_mi ?? null;
  const totalMi = total ?? estimateMileageFromDesc(desc) ?? 0;
  const mainMi = totalMi > 0 ? Math.max(0, totalMi - (wu ?? 0) - (cd ?? 0)) : 0;
  const pace = extractPace(desc);

  const structure: Array<Record<string, unknown>> = [];
  if (wu) structure.push({ phase: "warmup", distance_mi: wu, intensity: "easy" });
  if (mainMi > 0) {
    const mainPhase: Record<string, unknown> = { phase: "main", distance_mi: round1(mainMi) };
    if (pace) mainPhase.target_pace_per_mi = pace;
    if (dt === "easy_run" || dt === "long_run") mainPhase.intensity = "easy";
    structure.push(mainPhase);
  }
  if (cd) structure.push({ phase: "cooldown", distance_mi: cd, intensity: "easy" });

  return {
    date: day.date,
    day_of_week: day.day_of_week,
    sport: "running",
    day_type: dt,
    total_distance_mi: totalMi || null,
    structure,
    raw_description: desc,
    source_file: filename ?? null,
    source_sheet: sheet.name,
    source_cell: day.source_cell,
    import_id: importId,
  };
}

function classifyDayType(desc: string, total: number | null): "easy_run" | "hard_workout" | "long_run" | "rest" | "unknown" {
  const d = desc.toLowerCase();
  if (!d && (!total || total === 0)) return "rest";
  if (/\brest\b|day off|off day|no run/.test(d)) return "rest";
  if (/long run|long ?ru/.test(d)) return "long_run";
  if (total != null && total >= 12) return "long_run";
  if (/interval|tempo|threshold|fartlek|×|x\d+|\d+\s*x\s*\d|track|hill|repeat|workout|wo\b/.test(d)) return "hard_workout";
  if (/easy|recovery|shake|cruise|conversational/.test(d)) return "easy_run";
  if (total != null && total > 0) return "easy_run";
  return "unknown";
}

function estimateMileageFromDesc(desc: string): number | null {
  const m = desc.match(/(\d+(?:\.\d+)?)\s*mi(?:les?)?/i);
  if (m) {
    const n = parseFloat(m[1]);
    if (Number.isFinite(n) && n < 50) return n;
  }
  return null;
}

function extractPace(desc: string): string | null {
  // Common formats: "8:15", "8:15-7:15", "@8:15", "7:45 pace"
  const m = desc.match(/(\d{1,2}:\d{2}(?:\s*-\s*\d{1,2}:\d{2})?)/);
  return m ? m[1].replace(/\s+/g, "") : null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ────────────────────────────────────────────────────────────────────────────
// Strength template extraction
// ────────────────────────────────────────────────────────────────────────────

interface StrengthTemplate {
  library_name: string;
  exercises: Array<{ name: string; sets: number | null; reps: string | null; weight: string | null; video_link: string | null; source_row: number }>;
  import_id: string;
}

// Strength sheets typically have one or more named blocks ("Strength
// Workout 1", "Strength Workout 2", ...) with exercise rows underneath
// containing name/sets/reps/weight columns. Heuristic: scan rows; a
// row with "Strength Workout N" or similar starts a block; subsequent
// rows with a non-empty first cell + numeric sets/reps form exercises.
function extractStrengthTemplates(sheet: XLSX.WorkSheet, info: SheetAnalysis, importId: string): StrengthTemplate[] {
  const ref = sheet["!ref"];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);

  const templates: StrengthTemplate[] = [];
  let current: StrengthTemplate | null = null;
  let templateIdx = 0;

  // Detect column indices for "exercise / sets / reps / weight" once
  // by looking for header rows. Falls back to columns 0/1/2/3 if not
  // found — covers most coach sheets.
  const colMap = detectStrengthColumns(sheet, range);

  for (let r = range.s.r; r <= range.e.r; r++) {
    const firstCellAddr = XLSX.utils.encode_cell({ c: range.s.c, r });
    const firstCell = sheet[firstCellAddr];
    const firstText = cellToText(firstCell).trim();

    // Block heading?
    if (/^strength\s*workout|^workout\s*[#\d]|^day\s*[#\d]/i.test(firstText)) {
      if (current && current.exercises.length) templates.push(current);
      templateIdx++;
      current = { library_name: firstText.length <= 80 ? firstText : `Strength Workout ${templateIdx}`, exercises: [], import_id: importId };
      continue;
    }

    // Skip rows that look like column headers ("Exercise / Sets / Reps").
    if (/^exercise$/i.test(firstText)) continue;

    // Exercise row?
    const name = firstText;
    if (!name) continue;
    const sets = numericCell(sheet, colMap.sets, r);
    const reps = textCell(sheet, colMap.reps, r);
    const weight = textCell(sheet, colMap.weight, r);
    const video = textCell(sheet, colMap.video, r);

    // Need at least one of sets/reps/weight to count as an exercise.
    if (sets == null && !reps && !weight) continue;

    if (!current) {
      // No heading seen — start a default block.
      templateIdx++;
      current = { library_name: `Strength Workout ${templateIdx}`, exercises: [], import_id: importId };
    }
    current.exercises.push({
      name, sets, reps, weight,
      video_link: video || null,
      source_row: r + 1,
    });
  }
  if (current && current.exercises.length) templates.push(current);
  return templates;
}

function countStrengthTemplates(sheet: XLSX.WorkSheet): number {
  const ref = sheet["!ref"];
  if (!ref) return 0;
  const range = XLSX.utils.decode_range(ref);
  let count = 0;
  for (let r = range.s.r; r <= range.e.r; r++) {
    const firstCell = sheet[XLSX.utils.encode_cell({ c: range.s.c, r })];
    const txt = cellToText(firstCell).trim();
    if (/^strength\s*workout|^workout\s*[#\d]|^day\s*[#\d]/i.test(txt)) count++;
  }
  return count || 1; // at least 1 if there's any content
}

interface StrengthColumns {
  exercise: number;
  sets: number;
  reps: number;
  weight: number;
  video: number;
}

function detectStrengthColumns(sheet: XLSX.WorkSheet, range: XLSX.Range): StrengthColumns {
  const fallback: StrengthColumns = { exercise: range.s.c, sets: range.s.c + 1, reps: range.s.c + 2, weight: range.s.c + 3, video: range.s.c + 4 };
  const maxR = Math.min(range.e.r, range.s.r + 30);
  for (let r = range.s.r; r <= maxR; r++) {
    const map: Partial<StrengthColumns> = {};
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ c, r })];
      const t = cellToText(cell).trim().toLowerCase();
      if (!t) continue;
      if (t === "exercise" || t.startsWith("exercise"))  map.exercise = c;
      else if (t === "sets" || t === "set")              map.sets = c;
      else if (t === "reps" || t === "rep" || t === "rep range") map.reps = c;
      else if (t === "weight" || t === "load" || t.startsWith("weight")) map.weight = c;
      else if (t === "video" || t === "link" || t === "demo") map.video = c;
    }
    // Need at least exercise + reps to consider this a header row.
    if (map.exercise != null && map.reps != null) {
      return { ...fallback, ...map } as StrengthColumns;
    }
  }
  return fallback;
}

function numericCell(sheet: XLSX.WorkSheet, c: number, r: number): number | null {
  const cell = sheet[XLSX.utils.encode_cell({ c, r })];
  if (!cell) return null;
  const n = parseFloat(String(cell.v));
  return Number.isFinite(n) ? n : null;
}

function textCell(sheet: XLSX.WorkSheet, c: number, r: number): string | null {
  const cell = sheet[XLSX.utils.encode_cell({ c, r })];
  if (!cell) return null;
  const t = cellToText(cell).trim();
  return t || null;
}

// ────────────────────────────────────────────────────────────────────────────
// Stage 2 — LLM normalizer (Anthropic API)
// ────────────────────────────────────────────────────────────────────────────
//
// Architecture:
//   1. Raw blocks are batched (NORMALIZE_BATCH_SIZE per call) so the
//      input fits comfortably in a single Claude request and the output
//      stays well under max_tokens.
//   2. Each call sends an immutable system prompt + JSON schema (cached
//      via cache_control) and a per-batch user message containing the
//      blocks. The system prefix repeats verbatim across all 8 batches
//      for a Paige import → ~7 cache hits per import after the first
//      write.
//   3. Output is constrained via output_config.format = json_schema so
//      malformed JSON is impossible at the API layer (Claude refuses
//      rather than emitting bad JSON). We still defensively try/catch
//      the JSON.parse for belt-and-braces.
//   4. On per-batch error (network, 5xx, parse miss, schema reject),
//      that batch falls back to heuristic shaping. The whole import
//      doesn't fail — we surface a warning and keep the user moving.
//   5. Usage is aggregated across batches and returned in stats so
//      Slice 3's logging can write llm_tokens_used + estimated_cost_usd
//      to coach_sheet_import_logs.

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const NORMALIZE_MODEL = "claude-opus-4-7";
const NORMALIZE_BATCH_SIZE = 20;
const NORMALIZE_MAX_TOKENS = 16000;

// Per-import LLM cost cap (spec §B3). Pre-flight + mid-flight checks
// abort with IRO08_PARSE_BUDGET_EXCEEDED before runaway spend.
const BUDGET_CAP_USD = 2.00;

// Opus 4.7 pricing (cached: 2026-04-15 from skill table). Cache reads
// are 0.1×, cache writes are 1.25× of base input rate.
const PRICE_INPUT_PER_M = 5.00;
const PRICE_OUTPUT_PER_M = 25.00;
const PRICE_CACHE_READ_PER_M = PRICE_INPUT_PER_M * 0.1;
const PRICE_CACHE_WRITE_PER_M = PRICE_INPUT_PER_M * 1.25;

interface RawBlockWithContext extends RawDayBlock {
  sheet_name: string;
  header_rules: { warmup_distance_mi: number | null; cooldown_distance_mi: number | null };
}

interface NormalizeUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  total_tokens: number;
  batch_count: number;
  fallback_batch_count: number;
  estimated_cost_usd: number;
  llm_used: boolean;
}

interface NormalizeResult {
  workouts: Array<Record<string, unknown>>;
  warnings: string[];
  usage: NormalizeUsage;
}

async function normalizeBlocks(
  blocks: RawBlockWithContext[],
  sheetByName: Map<string, SheetAnalysis>,
  importId: string,
  filename: string | undefined,
  opts?: { budgetCapUsd?: number },
): Promise<NormalizeResult> {
  const budgetCap = opts?.budgetCapUsd ?? BUDGET_CAP_USD;
  const usage: NormalizeUsage = {
    input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0,
    total_tokens: 0, batch_count: 0, fallback_batch_count: 0,
    estimated_cost_usd: 0, llm_used: false,
  };
  const out: Array<Record<string, unknown>> = [];
  const warnings: string[] = [];

  if (!blocks.length) return { workouts: out, warnings, usage };

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  // No key → fall back to heuristic for the whole pipe. Same shape; just
  // less accurate. Logged as a warning so the operator knows.
  if (!apiKey) {
    console.warn("[parse] ANTHROPIC_API_KEY not set — using heuristic for all blocks");
    warnings.push("LLM normalization unavailable; results may be less accurate.");
    for (const b of blocks) {
      const sheet = sheetByName.get(b.sheet_name);
      if (!sheet) continue;
      const w = heuristicShapeWorkout(b, sheet, importId, filename);
      if (w) out.push(w);
    }
    return { workouts: out, warnings, usage };
  }

  // Pre-flight cost estimate. Worst case: every batch is uncached
  // (no system-prefix cache hits) at ~$0.30 per batch (≈10k input
  // uncached + ≈10k output). If the projection clearly exceeds the
  // cap, abort before any tokens are spent.
  const estBatches = Math.ceil(blocks.length / NORMALIZE_BATCH_SIZE);
  const worstCaseCost = estBatches * 0.30;
  if (worstCaseCost > budgetCap) {
    const err: any = new Error(`pre-flight estimate $${worstCaseCost.toFixed(2)} > cap $${budgetCap.toFixed(2)} (${estBatches} batches for ${blocks.length} workouts)`);
    err.code = "IRO08_PARSE_BUDGET_EXCEEDED";
    throw err;
  }

  usage.llm_used = true;

  // Batch and call. Mid-flight cap check after each batch so a
  // pathological file (lots of long descriptions, large tokens) can't
  // overrun even if the pre-flight estimate said it'd fit.
  let fallbackSummarized = false;
  for (let i = 0; i < blocks.length; i += NORMALIZE_BATCH_SIZE) {
    if (usage.estimated_cost_usd >= budgetCap) {
      const err: any = new Error(`mid-flight cost $${usage.estimated_cost_usd.toFixed(2)} >= cap $${budgetCap.toFixed(2)} after ${usage.batch_count} batches`);
      err.code = "IRO08_PARSE_BUDGET_EXCEEDED";
      throw err;
    }

    const batch = blocks.slice(i, i + NORMALIZE_BATCH_SIZE);
    usage.batch_count++;
    try {
      const result = await callNormalizerLLM(apiKey, batch);
      for (const w of result.workouts) {
        const block = batch.find(b => (b.date === w.date) && (b.source_cell === w.source_cell));
        const sheetName = block?.sheet_name ?? (w.source_sheet as string | undefined) ?? "";
        out.push({
          ...w,
          sport: "running",
          source_file: filename ?? null,
          source_sheet: sheetName,
          import_id: importId,
        });
      }
      usage.input_tokens       += result.usage.input_tokens;
      usage.output_tokens      += result.usage.output_tokens;
      usage.cache_read_tokens  += result.usage.cache_read_tokens;
      usage.cache_write_tokens += result.usage.cache_write_tokens;
      // Recompute running cost so the next iteration's cap check sees it.
      usage.estimated_cost_usd = computeCost(usage);
    } catch (e) {
      console.warn(`[parse] LLM batch ${usage.batch_count} failed; falling back to heuristic`, e);
      usage.fallback_batch_count++;
      // Aggregate one "fell back" warning instead of N — a flapping LLM
      // shouldn't spam the review screen.
      if (!fallbackSummarized) {
        warnings.push(`Auto-parse fell back to heuristic for some workouts — review carefully.`);
        fallbackSummarized = true;
      }
      for (const b of batch) {
        const sheet = sheetByName.get(b.sheet_name);
        if (!sheet) continue;
        const w = heuristicShapeWorkout(b, sheet, importId, filename);
        if (w) out.push(w);
      }
    }
  }

  usage.total_tokens = usage.input_tokens + usage.output_tokens + usage.cache_read_tokens + usage.cache_write_tokens;
  usage.estimated_cost_usd = computeCost(usage);

  return { workouts: out, warnings, usage };
}

function computeCost(u: NormalizeUsage): number {
  return round4(
    (u.input_tokens       / 1_000_000) * PRICE_INPUT_PER_M +
    (u.output_tokens      / 1_000_000) * PRICE_OUTPUT_PER_M +
    (u.cache_read_tokens  / 1_000_000) * PRICE_CACHE_READ_PER_M +
    (u.cache_write_tokens / 1_000_000) * PRICE_CACHE_WRITE_PER_M
  );
}

function round4(n: number): number { return Math.round(n * 10000) / 10000; }

interface LLMBatchResult {
  workouts: Array<Record<string, any>>;
  usage: { input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_write_tokens: number };
}

async function callNormalizerLLM(apiKey: string, batch: RawBlockWithContext[]): Promise<LLMBatchResult> {
  const body = {
    model: NORMALIZE_MODEL,
    max_tokens: NORMALIZE_MAX_TOKENS,
    // Adaptive thinking — Claude decides depth per-batch. Display
    // "omitted" (the Opus 4.7 default) keeps response payload small;
    // we don't surface reasoning to the user.
    thinking: { type: "adaptive" },
    output_config: {
      format: { type: "json_schema", schema: NORMALIZE_OUTPUT_SCHEMA },
    },
    system: [
      {
        type: "text",
        text: NORMALIZE_SYSTEM_PROMPT,
        // Cache the system prompt + schema across all 8 batches per
        // import. Shared prefix is identical byte-for-byte; user
        // payload is the only thing that differs per call. Each cached
        // hit saves ~90% of the input cost on that prefix.
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: JSON.stringify({ blocks: batch.map(serializeBlockForLLM) }),
      },
    ],
  };

  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic ${response.status}: ${text.slice(0, 500)}`);
  }
  const data = await response.json();

  // Find the text block containing the JSON output. With
  // output_config.format=json_schema, Claude returns a single text
  // block whose content is the structured JSON.
  const textBlock = (data.content || []).find((b: any) => b.type === "text");
  if (!textBlock) throw new Error("No text block in LLM response");
  let parsed: any;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch (e) {
    throw new Error(`LLM returned non-JSON despite schema: ${String(e).slice(0, 200)}`);
  }
  const workouts = Array.isArray(parsed?.workouts) ? parsed.workouts : null;
  if (!workouts) throw new Error("LLM response missing 'workouts' array");

  const u = data.usage || {};
  return {
    workouts,
    usage: {
      input_tokens:       u.input_tokens || 0,
      output_tokens:      u.output_tokens || 0,
      cache_read_tokens:  u.cache_read_input_tokens || 0,
      cache_write_tokens: u.cache_creation_input_tokens || 0,
    },
  };
}

function serializeBlockForLLM(b: RawBlockWithContext) {
  return {
    date: b.date,
    day_of_week: b.day_of_week,
    prescribed_mileage_mi: b.prescribed_mileage_mi,
    raw_description: b.raw_description,
    source_cell: b.source_cell,
    header_rules: b.header_rules,
  };
}

// JSON Schema enforced by the Anthropic API via output_config.format.
// All properties listed in `required` per Anthropic's strict mode rules
// (nullable variants used for optional fields). additionalProperties:
// false on every object so unknown keys can't slip through.
const NORMALIZE_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    workouts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          date: { type: "string", description: "ISO YYYY-MM-DD; copy verbatim from input." },
          day_of_week: { type: "string", description: "Three-letter abbreviation; copy from input." },
          day_type: { type: "string", enum: ["easy_run", "hard_workout", "long_run", "rest", "unknown"] },
          total_distance_mi: { type: ["number", "null"] },
          structure: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                phase: { type: "string", enum: ["warmup", "main", "cooldown"] },
                distance_mi: { type: ["number", "null"] },
                intensity: { type: ["string", "null"], description: "easy | moderate | tempo | threshold | hard | null" },
                target_pace_per_mi: { type: ["string", "null"], description: "Per-mile pace, e.g. \"7:45\" or \"8:15-7:15\"" },
                intervals: {
                  type: ["array", "null"],
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      reps: { type: ["integer", "null"] },
                      distance: { type: ["number", "null"] },
                      unit: { type: ["string", "null"], description: "m | mi | yd | km" },
                      on_min: { type: ["number", "null"] },
                      off_min: { type: ["number", "null"] },
                      type: { type: ["string", "null"], description: "fartlek | repeats | tempo | etc." },
                    },
                    required: ["reps", "distance", "unit", "on_min", "off_min", "type"],
                  },
                },
                note: { type: ["string", "null"] },
              },
              required: ["phase", "distance_mi", "intensity", "target_pace_per_mi", "intervals", "note"],
            },
          },
          raw_description: { type: "string", description: "Copy verbatim from input — load-bearing for the View Source UI." },
          source_cell: { type: "string", description: "Copy verbatim from input." },
        },
        required: ["date", "day_of_week", "day_type", "total_distance_mi", "structure", "raw_description", "source_cell"],
      },
    },
  },
  required: ["workouts"],
};

const NORMALIZE_SYSTEM_PROMPT = `You normalize raw cells from coach-distributed Excel training plans into structured running-workout JSON for the IronZ training app.

# Input

You receive an array of cell blocks under the key \`blocks\`. Each block has:
- \`date\` (ISO YYYY-MM-DD)
- \`day_of_week\` (Mon/Tue/.../Sun)
- \`prescribed_mileage_mi\` (number or null) — the coach's prescribed total mileage
- \`raw_description\` (string) — verbatim text from the cell, may be empty
- \`source_cell\` (e.g. "B8") — for forensic backtracking
- \`header_rules\` ({ warmup_distance_mi, cooldown_distance_mi }) — universal WU/CD rules from the sheet header

# Output

Return ONE \`workouts\` array, one entry per input block, in the same order. Use the schema enforced by the API.

# Normalization rules

1. **Apply header WU/CD universally** to every running workout (Decision #12 — coach intent is universal). Structure is [warmup, main, cooldown]. Main distance = \`prescribed_mileage_mi\` − warmup − cooldown. If \`prescribed_mileage_mi\` is null, leave \`total_distance_mi\` null and infer the main distance from the description if possible.

2. **Trust \`prescribed_mileage_mi\` over distances mentioned in the description.** If the description says "5 miles of intervals" but \`prescribed_mileage_mi\` is 4, the main is 4 − WU − CD; the "5 miles" is instructional context. If the description says "9-13 miles", use the LOW end (conservative).

3. **Day type classification:**
   - \`rest\`: empty description AND null/zero mileage, OR description contains "rest" / "off" / "no run"
   - \`long_run\`: description says "long" or prescribed mileage ≥ 12
   - \`hard_workout\`: description mentions intervals, tempo, threshold, fartlek, hills, repeats, "x" notation ("10x800m"), workout, WO
   - \`easy_run\`: easy / recovery / shake-out / conversational
   - \`unknown\`: ambiguous

4. **Pace extraction:** pull pace ranges like "8:15-7:15" or single paces "7:45" from the description. Set on the main phase as \`target_pace_per_mi\`. Do NOT include the "/mi" suffix.

5. **Intervals:** when the description mentions interval structure ("10x800m", "3 min ON 2 min OFF", "5x1mi"), capture as \`intervals\` on the main phase. Use the most natural shape — \`reps\` + \`distance\` + \`unit\`, or \`on_min\` + \`off_min\` + \`type\`. Leave fields null when not applicable.

6. **Preserve \`raw_description\` and \`source_cell\` verbatim** — copy them straight through. They're load-bearing for the "View source" UI affordance and forensic backtracking.

7. **Always emit one workout per input block, in the same order.** Even rest days get an entry (with \`day_type: "rest"\` and an empty \`structure: []\`).

8. **Intensity:** for easy/long runs the main phase intensity is \`"easy"\`. For hard workouts, use \`"tempo"\` / \`"threshold"\` / \`"hard"\` based on description language. WU/CD phases are always \`"easy"\`.

9. **Rest days:** \`structure: []\`, \`total_distance_mi: 0\`, no pace.`;

// ────────────────────────────────────────────────────────────────────────────
// Math reconciliation runtime check (spec §B5)
// ────────────────────────────────────────────────────────────────────────────
//
// For every workout that has a non-null total_distance_mi and a non-empty
// structure array, check whether the sum of phase distances matches the
// declared total within 0.5mi tolerance. Surfaces a single warning if
// fewer than 90% reconcile — Phase B's accuracy bar per spec.

function computeReconciliation(workouts: Array<Record<string, any>>) {
  let total = 0, reconciled = 0;
  for (const w of workouts) {
    const tot = w.total_distance_mi;
    if (typeof tot !== "number" || tot <= 0) continue;
    if (!Array.isArray(w.structure) || w.structure.length === 0) continue;
    total++;
    const sum = w.structure.reduce((s: number, p: any) => s + (typeof p?.distance_mi === "number" ? p.distance_mi : 0), 0);
    if (Math.abs(sum - tot) <= 0.5) reconciled++;
  }
  return { total, reconciled, ratio: total ? reconciled / total : 1 };
}

// ────────────────────────────────────────────────────────────────────────────
// Athlete profile extractor (Resources sheet, beta)
// ────────────────────────────────────────────────────────────────────────────
//
// Heuristic-only: walks the sheet looking for tabular blocks that match
// race or PR row shapes. Front-end shows this under a "(beta)" tag and
// defaults the per-item checkboxes to OFF (Decision #13), so a noisy
// extractor doesn't accidentally write incorrect race/PR data on import.
//
// Race row signals: a date column + words like "Marathon" / "Half" /
// "10K" / "5K" + an optional priority column (MAIN/A/B/C).
// PR row signals: a distance column + a time column ("3:26", "1:38:53").

interface AthleteProfile {
  races: Array<Record<string, unknown>>;
  prs: Array<Record<string, unknown>>;
}

function extractAthleteProfile(sheet: XLSX.WorkSheet): AthleteProfile | null {
  const ref = sheet["!ref"];
  if (!ref) return null;
  const range = XLSX.utils.decode_range(ref);
  const races: Array<Record<string, unknown>> = [];
  const prs: Array<Record<string, unknown>> = [];

  // Two-pass: first find header rows ("Race", "Date", "Distance",
  // "Goal" / "PR", "Time"), then read the rows beneath. Falls back to
  // a row-by-row scan if no headers detected.
  const racesHeader = findHeaderRow(sheet, range, ["race", "event"], ["date"], ["distance"]);
  if (racesHeader) {
    const cols = racesHeader.cols;
    for (let r = racesHeader.row + 1; r <= range.e.r; r++) {
      const name = textCell(sheet, cols.race ?? range.s.c, r);
      if (!name) break; // blank row → end of block
      const dateCell = sheet[XLSX.utils.encode_cell({ c: cols.date ?? range.s.c + 1, r })];
      const dateIso = dateCell ? coerceToIsoDate(dateCell) : null;
      races.push({
        name,
        date: dateIso ?? (dateCell ? cellToText(dateCell) : null),
        distance: textCell(sheet, cols.distance ?? range.s.c + 2, r),
        priority: textCell(sheet, cols.priority ?? range.s.c + 3, r),
        a_goal: textCell(sheet, cols.goal ?? range.s.c + 4, r),
        course_type: textCell(sheet, cols.course ?? range.s.c + 5, r),
      });
    }
  }

  const prsHeader = findHeaderRow(sheet, range, ["pr", "personal best", "best"], ["distance"], ["time"]);
  if (prsHeader) {
    const cols = prsHeader.cols;
    for (let r = prsHeader.row + 1; r <= range.e.r; r++) {
      const distance = textCell(sheet, cols.distance ?? range.s.c, r);
      const time = textCell(sheet, cols.time ?? range.s.c + 1, r);
      if (!distance || !time) break;
      const dateCell = sheet[XLSX.utils.encode_cell({ c: cols.date ?? range.s.c + 4, r })];
      const dateIso = dateCell ? coerceToIsoDate(dateCell) : null;
      prs.push({
        distance,
        time,
        race: textCell(sheet, cols.race ?? range.s.c + 2, r),
        pace_per_mi: textCell(sheet, cols.pace ?? range.s.c + 3, r),
        date: dateIso ?? (dateCell ? cellToText(dateCell) : null),
      });
    }
  }

  return { races, prs };
}

function findHeaderRow(
  sheet: XLSX.WorkSheet,
  range: XLSX.Range,
  primaryKeywords: string[],
  ...secondaryKeywords: string[][]
): { row: number; cols: Record<string, number> } | null {
  for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 50); r++) {
    const cols: Record<string, number> = {};
    let primaryHit = false;
    let secondaryHits = 0;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const t = (cellToText(sheet[XLSX.utils.encode_cell({ c, r })]) || "").trim().toLowerCase();
      if (!t) continue;
      if (primaryKeywords.some(k => t.includes(k))) { primaryHit = true; cols[primaryKeywords[0]] = c; }
      for (const grp of secondaryKeywords) {
        if (grp.some(k => t.includes(k))) { secondaryHits++; cols[grp[0]] = c; break; }
      }
      // Common extra columns we care about.
      if (t.includes("priority")) cols.priority = c;
      else if (t.includes("goal"))     cols.goal     = c;
      else if (t.includes("course"))   cols.course   = c;
      else if (t.includes("race") && !cols.race) cols.race = c;
      else if (t.includes("pace"))     cols.pace     = c;
      else if (t === "date" || t.endsWith(" date")) cols.date = c;
    }
    if (primaryHit && secondaryHits >= secondaryKeywords.length) return { row: r, cols };
  }
  return null;
}
