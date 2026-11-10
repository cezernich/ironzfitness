// day-restrictions.js: pure helpers for date-range restrictions and the
// return-to-training ramp (issue #27, master spec section 12e).
//
// The app stores restrictions per day in localStorage "dayRestrictions"
// ({ "YYYY-MM-DD": { type, note, action, disciplines?, ... } }); the
// calendar already hides "remove" days and lightens "reduce" days. These
// helpers only build and merge entries. Callers persist through
// localStorage + DB.syncKey('dayRestrictions') like the existing code.

(function (root) {
  "use strict";

  // Types that trigger a return ramp after a block of RAMP_MIN_DAYS or more.
  const RAMP_TYPES = new Set(["medical", "injury", "sick"]);
  const RAMP_MIN_DAYS = 5;
  const RAMP_DAYS = 7;
  const MAX_RANGE_DAYS = 120;

  const ISO = /^\d{4}-\d{2}-\d{2}$/;

  function _parse(d) {
    if (typeof d !== "string" || !ISO.test(d)) return null;
    const t = new Date(d + "T00:00:00Z");
    return isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== d ? null : t;
  }

  function _iso(t) { return t.toISOString().slice(0, 10); }

  function _addDays(d, n) {
    const t = _parse(d);
    t.setUTCDate(t.getUTCDate() + n);
    return _iso(t);
  }

  /** Inclusive list of ISO dates from start to end. Throws on bad input. */
  function datesInRange(start, end) {
    const s = _parse(start);
    const e = _parse(end || start);
    if (!s || !e) throw new Error("Pick a valid start and end date.");
    if (e < s) throw new Error("The end date is before the start date.");
    const days = Math.round((e - s) / 864e5) + 1;
    if (days > MAX_RANGE_DAYS) throw new Error(`Restrictions are limited to ${MAX_RANGE_DAYS} days at a time.`);
    const out = [];
    for (let i = 0; i < days; i++) out.push(_addDays(start, i));
    return out;
  }

  /** Whether a block of this type and length gets a return ramp by default. */
  function rampRecommended(type, start, end) {
    if (!RAMP_TYPES.has(type)) return false;
    try { return datesInRange(start, end).length >= RAMP_MIN_DAYS; } catch (e) { return false; }
  }

  /**
   * Build restriction entries for a range, plus an optional return ramp.
   * @returns {{ entries: Object<string, Object>, rampDates: string[] }}
   */
  function buildRestrictions(opts) {
    const { start, end, type, action, note = "", disciplines = null, ramp = false, now = new Date().toISOString() } = opts || {};
    if (!type) throw new Error("Pick a restriction type.");
    if (!["reduce", "swap", "remove"].includes(action)) throw new Error("Pick what should happen to sessions.");
    if (action === "swap" && (!Array.isArray(disciplines) || !disciplines.length)) {
      throw new Error("Pick at least one discipline to swap.");
    }
    const dates = datesInRange(start, end);
    const blockId = `${type}:${dates[0]}:${dates[dates.length - 1]}`;
    const entries = {};
    for (const d of dates) {
      const entry = { type, note, action, createdAt: now, blockId };
      if (action === "swap") entry.disciplines = disciplines.slice();
      entries[d] = entry;
    }
    const rampDates = [];
    if (ramp) {
      const last = dates[dates.length - 1];
      for (let i = 1; i <= RAMP_DAYS; i++) {
        const d = _addDays(last, i);
        rampDates.push(d);
        entries[d] = {
          type: "return",
          note: `Easy return after ${type === "medical" ? "medical time off" : type === "sick" ? "illness" : "injury"}: easy intensity, about half duration.`,
          action: "reduce",
          createdAt: now,
          blockId,
          rampDay: i,
        };
      }
    }
    return { entries, rampDates };
  }

  /**
   * Merge new entries into existing restrictions. Existing user-set days are
   * never weakened: a ramp ("return") day does not overwrite an existing
   * restriction, while explicit block days replace whatever was there.
   */
  function mergeRestrictions(existing, entries) {
    const out = { ...(existing || {}) };
    for (const [d, entry] of Object.entries(entries || {})) {
      if (entry.type === "return" && out[d] && out[d].type !== "return") continue;
      out[d] = entry;
    }
    return out;
  }

  /** Remove every day belonging to a block (including its ramp). */
  function removeBlock(existing, blockId) {
    const out = {};
    for (const [d, entry] of Object.entries(existing || {})) {
      if (!blockId || !entry || entry.blockId !== blockId) out[d] = entry;
    }
    return out;
  }

  const api = { datesInRange, rampRecommended, buildRestrictions, mergeRestrictions, removeBlock, RAMP_DAYS, RAMP_MIN_DAYS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.DayRestrictions = api;
})(typeof window !== "undefined" ? window : null);
