#!/usr/bin/env node
// scripts/seed-workout-library.js — Seed public.workout_library from the
// canonical workout_library_seed.json.
//
// Usage:
//   SUPABASE_URL=https://xxx.supabase.co \
//   SUPABASE_SERVICE_KEY=eyJ... \
//   node scripts/seed-workout-library.js [--dry-run] [--path=path/to/seed.json]
//
// Idempotent: upserts on (name, sport). Re-running with an edited seed
// updates matching rows without creating duplicates.

const fs = require("fs");
const path = require("path");

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const DEFAULT_SEED_PATH = path.resolve(__dirname, "../cowork-handoff/workout_library_seed.json");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const PATH_ARG = args.find(a => a.startsWith("--path="));
const SEED_PATH = PATH_ARG ? path.resolve(PATH_ARG.slice("--path=".length)) : DEFAULT_SEED_PATH;

function die(msg, code) {
  console.error(msg);
  process.exit(code || 1);
}

// Map the seed's free-form strength session_type values onto the canonical
// strength-role names used by the onboarding and the plan generator. The
// seed uses "easy" for prehab circuits and "intervals" for power/hypertrophy
// sessions — we disambiguate by name so the query layer can match on
// session_type === strengthRole directly.
function normalizeStrengthType(workout) {
  if (workout.sport !== "strength") return workout.session_type;
  const name = String(workout.name || "").toLowerCase();
  const desc = String(workout.description || "").toLowerCase();
  const hay = name + " " + desc;
  if (/\bprehab|anti[- ]rotation|core\b/.test(hay)) return "injury_prevention";
  if (/hypertrophy|push day|pull day|leg day/.test(hay)) return "hypertrophy";
  if (/minimum effective|bodyweight baseline|minimal/.test(hay)) return "minimal";
  if (/power|race performance|sport[- ]specific/.test(hay)) return "race_performance";
  // Fallback: seed said "easy" → injury_prevention; "intervals" → race_performance.
  if (workout.session_type === "easy") return "injury_prevention";
  if (workout.session_type === "intervals") return "race_performance";
  return workout.session_type;
}

// Fetch / mutate helpers — native fetch (Node 18+) so we don't pull @supabase/supabase-js
// just for the seed script.
async function supabaseFetch(method, pathRel, body) {
  const url = SUPABASE_URL.replace(/\/$/, "") + pathRel;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": "Bearer " + SUPABASE_KEY,
      "Prefer": "return=representation,resolution=merge-duplicates",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  if (!fs.existsSync(SEED_PATH)) die(`Seed file not found: ${SEED_PATH}`);

  const raw = fs.readFileSync(SEED_PATH, "utf8");
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (e) { die(`Failed to parse seed JSON: ${e.message}`); }

  if (!Array.isArray(parsed)) die("Seed file must be a JSON array.");

  const workouts = parsed.filter(x => x && !x._comment);
  console.log(`Seed file:       ${SEED_PATH}`);
  console.log(`Total entries:   ${parsed.length}`);
  console.log(`Workouts:        ${workouts.length}`);
  console.log(`Dry run:         ${DRY_RUN ? "YES" : "no"}`);
  console.log();

  // Validate shape + normalize strength session_type. Collect problems so we
  // report the whole seed, not just the first bad row.
  const REQUIRED = ["name", "sport", "session_type", "energy_system", "phases", "levels", "warmup", "main_set", "cooldown", "volume_range", "total_duration_range"];
  const problems = [];
  const rows = [];

  workouts.forEach((w, i) => {
    const missing = REQUIRED.filter(k => w[k] === undefined || w[k] === null);
    if (missing.length) problems.push(`[${i}] ${w.name || "(no name)"} — missing: ${missing.join(", ")}`);
    if (w.phases && !Array.isArray(w.phases)) problems.push(`[${i}] ${w.name} — phases must be array`);
    if (w.levels && !Array.isArray(w.levels)) problems.push(`[${i}] ${w.name} — levels must be array`);
    if (w.total_duration_range && !Array.isArray(w.total_duration_range)) {
      problems.push(`[${i}] ${w.name} — total_duration_range must be array`);
    }

    rows.push({
      name:                 w.name,
      description:          w.description || null,
      sport:                w.sport,
      session_type:         normalizeStrengthType(w),
      energy_system:        w.energy_system,
      phases:               w.phases,
      levels:               w.levels,
      race_distances:       w.race_distances || null,
      race_goals:           w.race_goals || null,
      warmup:               w.warmup,
      main_set:             w.main_set,
      cooldown:             w.cooldown,
      volume_range:         w.volume_range,
      total_duration_range: w.total_duration_range,
      status:               w.status || "published",
    });
  });

  if (problems.length) {
    console.error("Validation problems:");
    problems.forEach(p => console.error("  " + p));
    die(`Aborting due to ${problems.length} problem(s).`);
  }

  // Tally coverage so the user sees what they're seeding.
  const coverage = {};
  rows.forEach(r => {
    const k = `${r.sport}/${r.session_type}`;
    coverage[k] = (coverage[k] || 0) + 1;
  });
  console.log("Coverage by sport/type:");
  Object.keys(coverage).sort().forEach(k => console.log(`  ${k.padEnd(32)} ${coverage[k]}`));
  console.log();

  if (DRY_RUN) {
    console.log("Dry run — not writing to Supabase.");
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    die("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in env.");
  }

  // Upsert via PostgREST. The `Prefer: resolution=merge-duplicates` header
  // combined with `?on_conflict=name,sport` tells PostgREST to upsert on
  // the unique index we defined in the migration.
  const endpoint = "/rest/v1/workout_library?on_conflict=name,sport";
  console.log("Upserting into Supabase...");
  const result = await supabaseFetch("POST", endpoint, rows);
  const returned = Array.isArray(result) ? result.length : 0;
  console.log(`  Upserted ${returned} rows.`);

  // Quick tally so the user can eyeball what landed. supabaseFetch returns
  // the parsed array directly (not wrapped in {data}) — earlier code
  // destructured `{data: counted}` which left counted undefined.
  const counted = await supabaseFetch("GET", "/rest/v1/workout_library?select=sport,session_type,status");
  if (Array.isArray(counted)) {
    const bySport = {};
    const byStatus = {};
    counted.forEach(r => {
      bySport[r.sport] = (bySport[r.sport] || 0) + 1;
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    });
    console.log("Table totals by sport:  ", bySport);
    console.log("Table totals by status:", byStatus);
  }
}

main().catch(e => die(`Seed failed: ${e.message || e}`));
