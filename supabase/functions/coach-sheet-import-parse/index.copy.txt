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

  // ── Download from storage ──────────────────────────────────────────────────
  const { data: fileBlob, error: dlErr } = await supabase.storage
    .from("coach-sheet-imports")
    .download(body.storage_path.replace(/^coach-sheet-imports\//, ""));
  if (dlErr || !fileBlob) {
    console.warn("[parse] storage download failed", dlErr);
    return errorResponse("IRO06_PARSE_FAILED", "Couldn't read the uploaded file. Try uploading again.", 500);
  }
  const arrayBuffer = await fileBlob.arrayBuffer();
  if (arrayBuffer.byteLength > 10 * 1024 * 1024) {
    return errorResponse("IRO07_FILE_TOO_LARGE", "File exceeds the 10 MB limit.", 413);
  }

  // ── Parse workbook ─────────────────────────────────────────────────────────
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: "array", cellDates: true, cellNF: false, cellText: false });
  } catch (e) {
    console.warn("[parse] XLSX.read threw", e);
    return errorResponse("IRO06_PARSE_FAILED", "We couldn't read this file. Make sure it's a valid Excel file and try again.", 422);
  }
  if (!workbook.SheetNames?.length) {
    return errorResponse("IRO06_PARSE_FAILED", "The workbook has no sheets.", 422);
  }

  // ── Stage 1: structural analysis ──────────────────────────────────────────
  const analysis = analyzeWorkbook(workbook);
  if (!analysis.sheets.some(s => s.role === "calendar")) {
    // Don't hard-fail metadata_only requests — the user may still want to
    // see the picker and pick a non-calendar sheet (e.g. only Strength).
    // But for a full request with no calendar sheet AND no strength
    // sheet, the file is unusable.
    if (!body.metadata_only && !analysis.sheets.some(s => s.role === "strength_library")) {
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

  // ── Stage 2 (Slice 2 will replace this with LLM normalization) ───────────
  // For now: heuristic workout shaping from raw blocks, scoped to the
  // user's selected_sheets and date_range. This produces real workouts
  // from any uploaded file but with limited intelligence — Slice 2's
  // LLM call lifts accuracy to ~92% per spec.
  const selected = new Set(body.selected_sheets ?? analysis.sheets.map(s => s.name));
  const range = body.date_range ?? null;

  const running_workouts: Array<Record<string, unknown>> = [];
  const warnings: string[] = [];
  for (const sheet of analysis.sheets) {
    if (sheet.role !== "calendar") continue;
    if (!selected.has(sheet.name)) continue;
    try {
      const blocks = extractRawBlocks(workbook.Sheets[sheet.name], sheet);
      for (const day of blocks) {
        if (range) {
          if (day.date < range.from || day.date > range.to) continue;
        }
        const w = heuristicShapeWorkout(day, sheet, body.import_id, body.filename);
        if (w) running_workouts.push(w);
      }
    } catch (e) {
      console.warn(`[parse] sheet ${sheet.name} extraction failed`, e);
      warnings.push(`Couldn't fully parse "${sheet.name}" — review carefully.`);
    }
  }

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

  return jsonResponse({
    status: "ok",
    import_id: body.import_id,
    is_stub: false,
    sheets: analysis.sheets.map(stripInternal),
    running_workouts,
    strength_templates,
    athlete_profile: null, // Slice 2: extract from athlete_profile sheet
    warnings,
    stats: {
      workouts_parsed: running_workouts.length,
      templates_parsed: strength_templates.length,
      llm_tokens_used: 0,
      estimated_cost_usd: 0,
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
