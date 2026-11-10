// Issue #27: date-range restrictions and the return-to-training ramp.
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const DR = require("../js/day-restrictions.js");

let passed = 0, failed = 0;
function t(name, fn) {
  try { fn(); passed++; console.log("  PASS: " + name); }
  catch (e) { failed++; console.log("  FAIL: " + name + "\n    " + e.message); }
}

const NOW = "2030-03-01T12:00:00.000Z";

t("range is inclusive and crosses month boundaries", () => {
  assert.deepStrictEqual(DR.datesInRange("2030-03-30", "2030-04-02"), ["2030-03-30", "2030-03-31", "2030-04-01", "2030-04-02"]);
});
t("single day when end is missing", () => {
  assert.deepStrictEqual(DR.datesInRange("2030-05-05"), ["2030-05-05"]);
});
t("rejects end before start, bad dates, and huge ranges", () => {
  assert.throws(() => DR.datesInRange("2030-03-08", "2030-03-04"), /before the start/);
  assert.throws(() => DR.datesInRange("2026-02-30", "2026-03-01"), /valid/);
  assert.throws(() => DR.datesInRange("2026-01-01", "2026-12-31"), /limited/);
});

// Acceptance case from #27: 7-day medical block, then a 7-day easy ramp.
t("medical week off: 7 removed days, then 7 easy ramp days", () => {
  const { entries, rampDates } = DR.buildRestrictions({ start: "2030-03-04", end: "2030-03-10", type: "medical", action: "remove", ramp: true, now: NOW });
  const block = DR.datesInRange("2030-03-04", "2030-03-10");
  block.forEach(d => assert.strictEqual(entries[d].action, "remove", d));
  assert.deepStrictEqual(rampDates, DR.datesInRange("2030-03-11", "2030-03-17"));
  rampDates.forEach((d, i) => {
    assert.strictEqual(entries[d].type, "return");
    assert.strictEqual(entries[d].action, "reduce");
    assert.strictEqual(entries[d].rampDay, i + 1);
  });
  assert.strictEqual(entries["2030-03-18"], undefined, "normal training resumes after the ramp");
  assert.strictEqual(Object.keys(entries).length, 14);
});
t("ramp recommended for medical/injury/sick blocks of 5+ days only", () => {
  assert.strictEqual(DR.rampRecommended("medical", "2030-03-04", "2030-03-10"), true);
  assert.strictEqual(DR.rampRecommended("sick", "2030-03-04", "2030-03-07"), false);
  assert.strictEqual(DR.rampRecommended("travel", "2030-04-01", "2030-04-07"), false);
});
t("travel block: no ramp unless asked", () => {
  const { entries, rampDates } = DR.buildRestrictions({ start: "2030-04-01", end: "2030-04-07", type: "travel", action: "reduce", now: NOW });
  assert.strictEqual(rampDates.length, 0);
  assert.strictEqual(Object.keys(entries).length, 7);
});
t("swap requires disciplines and stores them per day", () => {
  assert.throws(() => DR.buildRestrictions({ start: "2030-04-10", end: "2030-04-11", type: "travel", action: "swap", now: NOW }), /discipline/);
  const { entries } = DR.buildRestrictions({ start: "2030-04-10", end: "2030-04-11", type: "travel", action: "swap", disciplines: ["swim"], now: NOW });
  assert.deepStrictEqual(entries["2030-04-11"].disciplines, ["swim"]);
});
t("merge never weakens an existing user restriction with a ramp day", () => {
  const existing = { "2030-03-12": { type: "rest", action: "remove" } };
  const { entries } = DR.buildRestrictions({ start: "2030-03-04", end: "2030-03-10", type: "medical", action: "remove", ramp: true, now: NOW });
  const merged = DR.mergeRestrictions(existing, entries);
  assert.strictEqual(merged["2030-03-12"].action, "remove");
  assert.strictEqual(merged["2030-03-11"].type, "return");
});
t("removing a block clears its ramp and leaves other days", () => {
  const existing = { "2030-02-01": { type: "rest", action: "remove" } };
  const { entries } = DR.buildRestrictions({ start: "2030-03-04", end: "2030-03-10", type: "medical", action: "remove", ramp: true, now: NOW });
  const merged = DR.mergeRestrictions(existing, entries);
  const cleared = DR.removeBlock(merged, entries["2030-03-04"].blockId);
  assert.deepStrictEqual(Object.keys(cleared), ["2030-02-01"]);
});

// Calendar contract: the existing renderers must treat the new types correctly.
const calSrc = fs.readFileSync(path.join(__dirname, "../js/calendar.js"), "utf-8");
function extract(name) {
  const start = calSrc.indexOf("function " + name + "(");
  let depth = 0, i = calSrc.indexOf("{", start);
  for (let j = i; j < calSrc.length; j++) {
    if (calSrc[j] === "{") depth++;
    else if (calSrc[j] === "}" && --depth === 0) return calSrc.slice(start, j + 1);
  }
  throw new Error("not found: " + name);
}
const ctx = {};
vm.createContext(ctx);
vm.runInContext(extract("getEffectiveLoad") + "\n" + extract("getRestrictedDuration"), ctx);

t("calendar: blocked (remove) days render as rest", () => {
  assert.strictEqual(ctx.getEffectiveLoad("hard", { type: "medical", action: "remove" }), "rest");
});
t("calendar: ramp days are easy whatever the planned load", () => {
  for (const load of ["hard", "long", "moderate", "strides", "easy"]) {
    assert.strictEqual(ctx.getEffectiveLoad(load, { type: "return", action: "reduce" }), "easy", load);
  }
});
t("calendar: ramp days run at about half duration (min 15 min)", () => {
  assert.strictEqual(ctx.getRestrictedDuration(90, "long", { type: "return", action: "reduce" }), 45);
  assert.strictEqual(ctx.getRestrictedDuration(60, "hard", { type: "return", action: "reduce" }), 30);
  assert.strictEqual(ctx.getRestrictedDuration(20, "easy", { type: "return", action: "reduce" }), 15);
});
t("calendar: medical reduce days are easy", () => {
  assert.strictEqual(ctx.getEffectiveLoad("hard", { type: "medical", action: "reduce" }), "easy");
});
t("calendar: existing restriction types unchanged", () => {
  assert.strictEqual(ctx.getEffectiveLoad("hard", { type: "fatigue", action: "reduce" }), "moderate");
  assert.strictEqual(ctx.getRestrictedDuration(100, "long", { type: "travel", action: "reduce" }), 60);
});

console.log(`\nday restrictions: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
