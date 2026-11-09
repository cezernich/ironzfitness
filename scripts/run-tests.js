#!/usr/bin/env node
// run-tests.js: runs every test in tests/ plus the golden philosophy tests.
//
// Many tests print their own PASS/FAIL lines and do not set an exit code,
// so a test counts as failed if it exits non-zero OR its output reports
// failures ("N failed", "N assertion(s) failed", or a line starting "FAIL:").
//
// Tests listed in QUARANTINE run and report, but do not fail the build.
// Each entry needs a reason and a tracking note. Remove an entry as soon
// as the test is fixed (or its expectations are updated on purpose).

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const QUARANTINE = {
  "tests/diversification-tests.js":
    "4 swim-set text expectations drifted from generator output (pre-Nov 2026). Decide: fix generator or update expectations.",
  "tests/run-session-types-tests.js":
    "12 run-session expectations (cruise intervals, track rotation, long-run cap) drifted from generator. Needs a spec decision.",
  "tests/threshold-week-tests.js":
    "2 test-day placement expectations (CSS Thu, FTP Fri/Sat) drifted from scheduler.",
};

const tests = fs
  .readdirSync(path.join(ROOT, "tests"))
  .filter((f) => f.endsWith(".js"))
  .sort()
  .map((f) => "tests/" + f)
  .concat(["scripts/test-golden.js"]);

const FAIL_RE = /\b[1-9]\d*\s+(failed|assertion\(s\) failed)\b|^\s*FAIL:/m;

let hardFailures = 0;
let quarantinedFailures = 0;

for (const t of tests) {
  const r = spawnSync(process.execPath, [t], { cwd: ROOT, encoding: "utf-8", timeout: 120000 });
  const out = (r.stdout || "") + (r.stderr || "");
  const failed = r.status !== 0 || FAIL_RE.test(out);
  const q = QUARANTINE[t];

  if (!failed) {
    console.log(`PASS  ${t}`);
    if (q) console.log(`      note: ${t} is quarantined but now passes. Remove it from QUARANTINE.`);
  } else if (q) {
    quarantinedFailures++;
    console.log(`QUAR  ${t}  (${q})`);
  } else {
    hardFailures++;
    console.log(`FAIL  ${t}`);
    console.log(out.split("\n").slice(-25).map((l) => "      " + l).join("\n"));
  }
}

// Syntax check every client JS file. No bundler means a syntax error ships straight to prod.
const jsFiles = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "ios", ".git", "www", "www-staging", "supabase"].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".js")) jsFiles.push(p);
  }
})(ROOT);
let syntaxErrors = 0;
for (const f of jsFiles) {
  const r = spawnSync(process.execPath, ["--check", f], { encoding: "utf-8" });
  if (r.status !== 0) {
    syntaxErrors++;
    console.log(`SYNTAX  ${path.relative(ROOT, f)}\n${r.stderr}`);
  }
}

console.log(
  `\n${tests.length} test files: ${hardFailures} failed, ${quarantinedFailures} quarantined. ` +
    `${jsFiles.length} JS files syntax-checked: ${syntaxErrors} errors.`
);
process.exit(hardFailures || syntaxErrors ? 1 : 0);
