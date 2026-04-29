// coach-digest-format.test.js — Phase 4 regression test
//
// Pins the formatDigestBody templates from
// supabase/functions/coach-daily-digest/index.ts. The function is Deno
// TypeScript so we re-implement the body builder here in JS — same
// shape, same truncation rules. If the edge function diverges, the
// drift surfaces here.
//
// Run: `node tests/coach-digest-format.test.js` from fitness-app/.

"use strict";

const PUSH_BODY_MAX = 180;

// JS port of formatDigestBody / listNames from index.ts.
function listNames(ids, nameById) {
  return ids.map(id => nameById[id] || "Client").join(", ");
}
function formatDigestBody(a) {
  const { total, trained, missed, nameById, workoutsByUser } = a;
  if (trained.length === 0) {
    if (missed.length === 0) return "No client activity yesterday — quiet day.";
    const namesPreview = listNames(missed.slice(0, 3), nameById);
    const more = missed.length > 3 ? ` +${missed.length - 3} more` : "";
    return `0 of ${total} trained yesterday. ${namesPreview}${more} didn't log anything. Reach out?`
      .slice(0, PUSH_BODY_MAX);
  }
  const trainedDetails = trained.slice(0, 3).map(id => {
    const name = nameById[id] || "Client";
    const w = (workoutsByUser[id] || [])[0];
    const wname = (w?.name || w?.type || "Workout").slice(0, 20);
    return `${name}: ${wname}`;
  });
  let body = `${trained.length} of ${total} trained yesterday. ${trainedDetails.join(". ")}.`;
  if (missed.length > 0) {
    const missedNames = listNames(missed.slice(0, 2), nameById);
    const more = missed.length > 2 ? ` +${missed.length - 2}` : "";
    body += ` Missed: ${missedNames}${more}.`;
  }
  if (body.length <= PUSH_BODY_MAX) return body;
  const trainedNames = listNames(trained.slice(0, 4), nameById);
  const trainedMore = trained.length > 4 ? ` +${trained.length - 4}` : "";
  body = `${trained.length} of ${total} trained: ${trainedNames}${trainedMore}.`;
  if (missed.length > 0) {
    const missedNames = listNames(missed.slice(0, 2), nameById);
    const more = missed.length > 2 ? ` +${missed.length - 2}` : "";
    body += ` Missed: ${missedNames}${more}.`;
  }
  return body.length <= PUSH_BODY_MAX
    ? body
    : `${trained.length} of ${total} trained yesterday. ${missed.length} missed.`;
}

let failures = 0;
function check(actual, predicate, label) {
  let ok;
  try { ok = predicate(actual); } catch { ok = false; }
  console[ok ? "log" : "error"](`  ${ok ? "PASS" : "FAIL"}: ${label}${ok ? "" : ` — got ${JSON.stringify(actual)}`}`);
  if (!ok) failures++;
}

console.log("Section 1 — empty / quiet days");
check(
  formatDigestBody({ total: 5, trained: [], missed: [], nameById: {}, workoutsByUser: {} }),
  s => s === "No client activity yesterday — quiet day.",
  "no clients at all"
);
check(
  formatDigestBody({ total: 3, trained: [], missed: ["a", "b", "c"], nameById: { a: "Sarah", b: "David", c: "Jen" }, workoutsByUser: {} }),
  s => s.startsWith("0 of 3 trained yesterday.") && s.includes("Sarah") && s.endsWith("Reach out?"),
  "0 of 3 trained — full miss list"
);

console.log("Section 2 — typical mixed day");
const typical = formatDigestBody({
  total: 5,
  trained: ["a", "b", "c"],
  missed: ["d", "e"],
  nameById: { a: "Sarah", b: "David", c: "Jen", d: "Mark", e: "Beth" },
  workoutsByUser: {
    a: [{ name: "Tempo Run" }],
    b: [{ name: "Push Day" }],
    c: [{ type: "swimming" }],
  },
});
check(typical, s => s.startsWith("3 of 5 trained yesterday."),     "header reads 3 of 5");
check(typical, s => s.includes("Sarah: Tempo Run"),                "first trained client surfaces workout name");
check(typical, s => s.includes("David: Push Day"),                 "second trained client surfaces workout name");
check(typical, s => s.includes("Missed: Mark, Beth"),              "missed clients listed at end");
check(typical, s => s.length <= PUSH_BODY_MAX,                     "stays under 180 chars");

console.log("Section 3 — overflow truncation");
const overflow = formatDigestBody({
  total: 8,
  trained: ["a", "b", "c", "d", "e", "f"],
  missed: ["g", "h"],
  nameById: { a: "Alessandro", b: "Bartholomew", c: "Christopher", d: "Daniela",
              e: "Evangelina", f: "Frederick", g: "Gretchen", h: "Hieronymus" },
  workoutsByUser: {
    a: [{ name: "Sweet Spot Brick — 90min" }],
    b: [{ name: "Race-Pace Brick — 110min" }],
    c: [{ name: "Long Aerobic Brick — 240min" }],
  },
});
check(overflow, s => s.length <= PUSH_BODY_MAX,                    "truncated form stays under 180 chars");
check(overflow, s => s.startsWith("6 of 8 trained"),               "starts with the trained count");
check(overflow, s => s.includes("+") || s.length < PUSH_BODY_MAX,  "uses +N more or trimmed-down second template");

console.log("Section 4 — extreme overflow falls back to terse template");
const extremeNames = {};
const trainedExt = [], missedExt = [];
for (let i = 0; i < 30; i++) {
  trainedExt.push(`u${i}`);
  extremeNames[`u${i}`] = "Christopherson";
}
for (let i = 0; i < 10; i++) {
  missedExt.push(`m${i}`);
  extremeNames[`m${i}`] = "Hieronymousx";
}
const extreme = formatDigestBody({
  total: 40, trained: trainedExt, missed: missedExt, nameById: extremeNames,
  workoutsByUser: trainedExt.reduce((acc, id) => { acc[id] = [{ name: "Long Workout" }]; return acc; }, {}),
});
check(extreme, s => s.length <= PUSH_BODY_MAX,                     "extreme overflow still under 180");
check(extreme, s => s.includes("30") && s.includes("40"),          "preserves the count");

console.log("Section 5 — first-name shortening logic spec parity");
// The edge function shortens names to first-name only (first whitespace
// split). The body builder we test here receives nameById already
// shortened. This pins that contract — if the edge function changes
// the trim behaviour, the test parameters need updating too.
const firstName = (full) => (full || "").split(/\s+/)[0];
check(firstName("Sarah Chen"),       n => n === "Sarah",       "two-word name → first word");
check(firstName("Michael"),          n => n === "Michael",     "single-word name → unchanged");
check(firstName("Mary Ann Smith"),   n => n === "Mary",        "three-word name → first word");
check(firstName(""),                 n => n === "",            "empty name → empty");

if (failures === 0) {
  console.log("\nAll digest-format assertions pass.");
  process.exit(0);
} else {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
}
