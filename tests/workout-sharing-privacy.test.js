// tests/workout-sharing-privacy.test.js
// Whitelist enforcement + field stripping for the privacy chokepoint.
// Run: `node tests/workout-sharing-privacy.test.js` from project root.

const Privacy = require("../js/workout-sharing-privacy.js");

let passed = 0, failed = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push({ name, detail }); console.log(`  ✗ ${name}${detail ? "  → " + detail : ""}`); }
}
function section(t) { console.log("\n" + t); }

// ─── 1. Fully-populated sender workout — whitelist enforcement ──────────────
section("1. Fully-populated sender workout containing every blacklist field");
{
  // Build a maximally hostile input — every blacklist field plus VDOT/FTP/CSS
  // plus completion data plus PII plus device IDs plus health.
  const fullSenderWorkout = {
    // Whitelisted (should appear in output)
    variant_id: "track_yasso_800s",
    sport_id: "run",
    session_type_id: "track_workout",
    share_note: "Crushed this one!",

    // Blacklist — every category from the spec
    vdot: 53,
    ftp: 250,
    css_sec_per_100m: 90,
    threshold_pace: "6:42/mi",
    e_pace: "8:11/mi",
    m_pace: "7:21/mi",
    t_pace: "6:42/mi",
    i_pace: "3:12/800",
    r_pace: "44s/200",

    actual_pace: "3:08",
    actual_watts: 285,
    actual_hr: 178,
    actual_cadence: 184,
    actual_splits: ["3:11", "3:12", "3:09", "3:08", "3:13", "3:10"],
    completion_time: "42:18",
    target_time: "44:00",

    race_results: [{ event: "5K", time: "19:42", date: "2026-03-15" }],
    race_goals: { marathon: "3:15:00" },

    weight_lbs: 168,
    weight_kg: 76.2,
    height_in: 70,
    sleep_hours: 7.4,
    rhr: 48,
    hrv: 62,
    body_fat_pct: 12,

    user_data: { secret_jsonb_blob: { foo: "bar" } },

    device_id: "DEV-FOOBAR-1234",
    device_fingerprint: "abc123",
    location: { lat: 37.7749, lon: -122.4194 },
    ip: "192.168.1.42",

    email: "chase@example.com",
    real_name: "Chase Zernich",
    phone: "+1-555-555-5555",
    sender_user_id: "uuid-here",

    // Random new fields that didn't exist when the spec was written
    future_field_alpha: "should be dropped",
    future_field_beta: { nested: { secret: true } },
  };

  const out = Privacy.scrubForShare(fullSenderWorkout);

  // Output keys must equal exactly the whitelist (note included).
  const outKeys = Object.keys(out).sort();
  const expected = ["session_type_id", "share_note", "sport_id", "variant_id"];
  check("output contains exactly the 4 whitelist fields",
    JSON.stringify(outKeys) === JSON.stringify(expected),
    `got ${JSON.stringify(outKeys)}`);

  // Specifically test the "must not leak" fields one by one for clarity.
  const mustNotLeak = [
    "vdot", "ftp", "css_sec_per_100m", "threshold_pace",
    "e_pace", "m_pace", "t_pace", "i_pace", "r_pace",
    "actual_pace", "actual_watts", "actual_hr", "actual_cadence",
    "actual_splits", "completion_time", "target_time",
    "race_results", "race_goals",
    "weight_lbs", "weight_kg", "height_in", "sleep_hours", "rhr", "hrv", "body_fat_pct",
    "user_data", "device_id", "device_fingerprint", "location", "ip",
    "email", "real_name", "phone", "sender_user_id",
    "future_field_alpha", "future_field_beta",
  ];
  let leaked = [];
  for (const f of mustNotLeak) {
    if (Object.prototype.hasOwnProperty.call(out, f)) leaked.push(f);
  }
  check("zero blacklist fields appear in the output", leaked.length === 0,
    leaked.length ? `leaked: ${leaked.join(", ")}` : "");

  // Sanity-check the whitelist fields are correct.
  check("variant_id preserved", out.variant_id === "track_yasso_800s");
  check("sport_id preserved", out.sport_id === "run");
  check("session_type_id preserved", out.session_type_id === "track_workout");
  check("share_note preserved", out.share_note === "Crushed this one!");
}

// ─── 2. Notes — URL stripping ───────────────────────────────────────────────
section("2. Sender note URL/mention sanitization");
{
  const out = Privacy.scrubForShare({
    variant_id: "track_yasso_800s",
    sport_id: "run",
    session_type_id: "track_workout",
    share_note: "Run this with me! https://shady.example.com/redir @username also email me at me@example.com",
  });
  check("https URL stripped", !/https?:\/\//.test(out.share_note || ""), out.share_note);
  check("email stripped", !/@example\.com/.test(out.share_note || ""), out.share_note);
  check("mention stripped", !/@username/.test(out.share_note || ""), out.share_note);
  check("note still has the human-readable prefix",
    /Run this with me/.test(out.share_note || ""), out.share_note);

  // Bare www links
  const out2 = Privacy.scrubForShare({
    variant_id: "track_yasso_800s",
    sport_id: "run",
    session_type_id: "track_workout",
    share_note: "Check www.example.com later",
  });
  check("bare www link stripped", !/www\./.test(out2.share_note || ""), out2.share_note);
}

// ─── 3. Note length cap ─────────────────────────────────────────────────────
section("3. Sender note 280-char cap");
{
  const long = "a".repeat(500);
  const out = Privacy.scrubForShare({
    variant_id: "track_yasso_800s",
    sport_id: "run",
    session_type_id: "track_workout",
    share_note: long,
  });
  check("note clamped to 280 chars", out.share_note.length === 280, `got ${out.share_note.length}`);
}

// ─── 4. Note becomes empty after stripping → dropped ────────────────────────
section("4. Note that's only forbidden content gets dropped entirely");
{
  const out = Privacy.scrubForShare({
    variant_id: "track_yasso_800s",
    sport_id: "run",
    session_type_id: "track_workout",
    share_note: "https://only-a-url.example.com",
  });
  check("share_note dropped (empty after sanitization)",
    !Object.prototype.hasOwnProperty.call(out, "share_note"),
    `got ${JSON.stringify(out.share_note)}`);
}

// ─── 5. Required field validation ───────────────────────────────────────────
section("5. Required field validation");
{
  let threw;
  threw = null;
  try { Privacy.scrubForShare({ sport_id: "run", session_type_id: "track_workout" }); }
  catch (e) { threw = e; }
  check("missing variant_id throws", threw && /variant_id/.test(threw.message));

  threw = null;
  try { Privacy.scrubForShare({ variant_id: "x", session_type_id: "y" }); }
  catch (e) { threw = e; }
  check("missing sport_id throws", threw && /sport_id/.test(threw.message));

  threw = null;
  try { Privacy.scrubForShare({ variant_id: "x", sport_id: "run" }); }
  catch (e) { threw = e; }
  check("missing session_type_id throws", threw && /session_type_id/.test(threw.message));

  threw = null;
  try { Privacy.scrubForShare({ variant_id: "x", sport_id: "tennis", session_type_id: "y" }); }
  catch (e) { threw = e; }
  check("invalid sport_id throws", threw && /invalid sport_id/.test(threw.message));

  threw = null;
  try { Privacy.scrubForShare(null); } catch (e) { threw = e; }
  check("null input throws", threw && /must be an object/.test(threw.message));
}

// ─── 6. listFieldsThatWouldBeDropped helper ─────────────────────────────────
section("6. listFieldsThatWouldBeDropped diagnostic helper");
{
  const dropped = Privacy.listFieldsThatWouldBeDropped({
    variant_id: "x", sport_id: "run", session_type_id: "track_workout",
    vdot: 50, secret: true, ftp: 250,
  });
  check("dropped contains vdot", dropped.includes("vdot"));
  check("dropped contains secret", dropped.includes("secret"));
  check("dropped contains ftp", dropped.includes("ftp"));
  check("dropped does NOT contain variant_id", !dropped.includes("variant_id"));
}

// ─── 7. ALLOWED_FIELDS is a frozen-ish reference ────────────────────────────
section("7. ALLOWED_FIELDS export");
{
  check("exports as a Set", Privacy.ALLOWED_FIELDS instanceof Set);
  check("contains exactly 4 fields", Privacy.ALLOWED_FIELDS.size === 4);
  for (const f of ["variant_id", "sport_id", "session_type_id", "share_note"]) {
    check(`includes ${f}`, Privacy.ALLOWED_FIELDS.has(f));
  }
}

console.log(`\n${"=".repeat(60)}\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  failures.forEach(f => console.log(`  - ${f.name}${f.detail ? "  → " + f.detail : ""}`));
  process.exit(1);
}
