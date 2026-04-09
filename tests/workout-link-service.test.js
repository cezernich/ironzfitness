// tests/workout-link-service.test.js
// Token format, uniqueness over 10K generations, URL formatting.

const LinkService = require("../js/workout-link-service.js");

let passed = 0, failed = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push({ name, detail }); console.log(`  ✗ ${name}${detail ? "  → " + detail : ""}`); }
}
function section(t) { console.log("\n" + t); }

// ─── 1. Token format ────────────────────────────────────────────────────────
section("1. Token format");
{
  const t = LinkService.generateToken();
  check("token is a string", typeof t === "string");
  check("token is 12 chars", t.length === 12, `got ${t.length}`);
  check("token is base62 only", /^[0-9a-zA-Z]{12}$/.test(t), t);
}

// ─── 2. 10,000-token uniqueness ─────────────────────────────────────────────
section("2. 10,000 token generations — no collisions");
{
  const N = 10000;
  const seen = new Set();
  let collisions = 0;
  for (let i = 0; i < N; i++) {
    const t = LinkService.generateToken();
    if (seen.has(t)) collisions++;
    seen.add(t);
  }
  console.log(`     generated ${N} tokens, ${seen.size} unique, ${collisions} collisions`);
  check("zero collisions over 10,000 generations", collisions === 0,
    `${collisions} collisions in ${N} tokens`);
  check("set size matches generation count", seen.size === N);
}

// ─── 3. Distribution sanity ─────────────────────────────────────────────────
section("3. Character distribution sanity (first char of 1000 tokens)");
{
  const N = 1000;
  const counts = {};
  for (let i = 0; i < N; i++) {
    const c = LinkService.generateToken()[0];
    counts[c] = (counts[c] || 0) + 1;
  }
  const distinctFirstChars = Object.keys(counts).length;
  // Expect roughly 30-62 distinct first chars over 1000 samples (62 possible).
  check("at least 30 distinct first chars", distinctFirstChars >= 30,
    `got ${distinctFirstChars}`);
}

// ─── 4. URL formatting ──────────────────────────────────────────────────────
section("4. URL formatting");
{
  const t = "abcDEF123456";
  check("shareUrlFor returns ironz.app/w/<token>",
    LinkService.shareUrlFor(t) === "https://ironz.app/w/abcDEF123456",
    LinkService.shareUrlFor(t));
  check("SHARE_URL_BASE exposed",
    LinkService.SHARE_URL_BASE === "https://ironz.app/w/");
  check("TOKEN_LENGTH exposed", LinkService.TOKEN_LENGTH === 12);
}

// ─── 5. Tokens differ across calls ──────────────────────────────────────────
section("5. Two consecutive calls produce different tokens");
{
  const a = LinkService.generateToken();
  const b = LinkService.generateToken();
  check("a != b", a !== b);
}

console.log(`\n${"=".repeat(60)}\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach(f => console.log(`  - ${f.name}${f.detail ? "  → " + f.detail : ""}`));
  process.exit(1);
}
