#!/usr/bin/env node
// tests/run-all.js
// Dependency-free test aggregator: discovers every tests/*.js file (except this
// one), runs each in its own `node` process, collects exit codes, prints a
// summary, and exits non-zero if any test failed.

"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const testsDir = __dirname;
const repoRoot = path.join(__dirname, "..");
const selfName = path.basename(__filename);

const testFiles = fs
  .readdirSync(testsDir)
  .filter((f) => f.endsWith(".js") && f !== selfName)
  .sort();

if (testFiles.length === 0) {
  console.error("No test files found in", testsDir);
  process.exit(1);
}

const results = [];
for (const file of testFiles) {
  const rel = path.join("tests", file);
  process.stdout.write(`\n─── ${rel} ${"─".repeat(Math.max(0, 50 - rel.length))}\n`);
  const res = spawnSync("node", [path.join(testsDir, file)], {
    cwd: repoRoot,
    stdio: "inherit",
    encoding: "utf-8",
  });
  const code = res.status === null ? 1 : res.status;
  results.push({ file: rel, code });
}

const passed = results.filter((r) => r.code === 0);
const failed = results.filter((r) => r.code !== 0);

console.log("\n" + "=".repeat(60));
console.log("Test summary");
console.log("=".repeat(60));
for (const r of results) {
  const mark = r.code === 0 ? "PASS" : "FAIL";
  console.log(`  ${mark}  ${r.file}${r.code === 0 ? "" : ` (exit ${r.code})`}`);
}
console.log("-".repeat(60));
console.log(`  ${passed.length}/${results.length} test files passed`);
if (failed.length > 0) {
  console.log(`  ${failed.length} failed: ${failed.map((r) => r.file).join(", ")}`);
}
console.log("=".repeat(60));

process.exit(failed.length > 0 ? 1 : 0);
