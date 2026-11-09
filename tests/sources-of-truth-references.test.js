// Fails if any code, script, test, or edge function references a
// sources-of-truth/... path that doesn't exist. js/philosophy-engine.js
// fetches sources-of-truth/philosophy/modules_static.json at runtime, so a
// move or rename there breaks the live app.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DIRS = ["js", "scripts", "tests", "supabase/functions"];
const ROOT_FILES = ["index.html", "exercise-data.js", "service-worker.js"];
const RE = /sources-of-truth\/[A-Za-z0-9_\-./ ]*?\.(?:json|md|xlsx|txt|docx)/g;

const files = [];
for (const d of DIRS) {
  (function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|ts|py|html|sh)$/.test(e.name)) files.push(p);
    }
  })(path.join(ROOT, d));
}
for (const f of ROOT_FILES) if (fs.existsSync(path.join(ROOT, f))) files.push(path.join(ROOT, f));

let checked = 0;
const missing = [];
for (const f of files) {
  const text = fs.readFileSync(f, "utf-8");
  for (const m of text.match(RE) || []) {
    checked++;
    if (!fs.existsSync(path.join(ROOT, m))) missing.push(`${path.relative(ROOT, f)} -> ${m}`);
  }
}

if (missing.length) {
  console.log("FAIL: references to missing sources-of-truth files:");
  missing.forEach((m) => console.log("  " + m));
  console.log(`\n${missing.length} failed`);
  process.exit(1);
}
console.log(`sources-of-truth references: ${checked} checked, 0 failed`);
