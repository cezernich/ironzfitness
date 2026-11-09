// Guard: a healthy, well-recovered athlete must never receive injury or
// recovery-state modules from the legacy philosophy engine.
//
// Why this exists (2026-11-09): js/philosophy-engine.js matchesFilter()
// treats any applies_when key that a query doesn't mention as a match, so
// every active module is returned for every user. The INJURY_* and
// RECOVERY_* modules in philosophy_modules.json are inactive placeholders.
// Activating them (in the DB or a file) would apply knee/shoulder
// restrictions and "unscheduled deload, -40-50% volume" to EVERY user.
// See docs/PHILOSOPHY_MODULES_DRIFT_2026-11-09.md.
//
// Runs the real engine against: the production snapshot, the runtime
// fallback, and the repo JSON.

const fs = require("fs");
const vm = require("vm");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ENGINE = fs.readFileSync(path.join(ROOT, "js/philosophy-engine.js"), "utf-8");
const SETS = {
  "db_snapshot_2026-11-09.json": "modules",
  "modules_static.json": null,
  "philosophy_modules.json": null,
};
const BLOCKED = /^(INJURY|RECOVERY)_/;

function load(file, key) {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, "sources-of-truth/philosophy", file), "utf-8"));
  return key ? d[key] : Array.isArray(d) ? d : d.modules;
}

async function selected(mods, profile) {
  const store = {};
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } },
    window: {}, document: {},
    fetch: async () => { throw new Error("no network in tests"); },
  };
  vm.createContext(ctx);
  vm.runInContext(ENGINE, ctx);
  vm.runInContext(`philosophyModules = ${JSON.stringify(mods)};`, ctx);
  ctx.__p = profile;
  ctx.__c = vm.runInContext("classifyUser(__p)", ctx);
  const out = await vm.runInContext("retrieveModules(__c)", ctx);
  return (out.modules || []).map((m) => m.id);
}

(async () => {
  const healthy = { age: 30, gender: "male", fitnessLevel: "intermediate", goal: "performance", injuries: [], daysPerWeek: 5 };
  let failed = 0;
  for (const [file, key] of Object.entries(SETS)) {
    const mods = load(file, key);
    const active = mods.filter((m) => m.is_active && BLOCKED.test(m.id)).map((m) => m.id);
    const got = (await selected(mods, healthy)).filter((id) => BLOCKED.test(id));
    if (active.length || got.length) {
      failed++;
      console.log(`FAIL: ${file}: active injury/recovery modules [${active}] reach a healthy user [${got}]`);
    } else {
      console.log(`  PASS: ${file}: no injury/recovery modules reach a healthy user`);
    }
  }
  console.log(failed ? `\n${failed} failed` : "\nphilosophy modules safety: 0 failed");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log("FAIL: " + e.message + "\n1 failed"); process.exit(1); });
