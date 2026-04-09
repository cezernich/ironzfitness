// js/workout-sharing-privacy.js
//
// Single chokepoint for scrubbing sender data before any share payload leaves
// the device. EVERY share creation in the codebase must pass through
// scrubForShare(). This module is whitelist-only — there is no blacklist.
//
// Implements FEATURE_SPEC_2026-04-09_workout_sharing.md → WORKOUT_SHARING_PRIVACY.
//
// HARD RULE: If a new field is added to workout objects later, it is dropped
// from shares by default unless explicitly added to ALLOWED_FIELDS below.

(function () {
  "use strict";

  // The complete whitelist. Any field not in this set is dropped.
  // sender_display_name and sender_avatar_url are added server-side via
  // RLS join, NOT client-side, so they are deliberately excluded here.
  const ALLOWED_FIELDS = new Set([
    "variant_id",
    "sport_id",
    "session_type_id",
    "share_note",
  ]);

  // Sender note rules:
  //   - Max 280 chars
  //   - Strip http(s):// and www. URLs
  //   - Strip @mentions and bare email addresses
  //   - Trim and collapse whitespace
  function _sanitizeNote(note) {
    if (note == null) return null;
    let s = String(note);
    // URL stripping (http/https + bare www.)
    s = s.replace(/https?:\/\/\S+/gi, "");
    s = s.replace(/\bwww\.\S+/gi, "");
    // Email and @mention stripping
    s = s.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "");
    s = s.replace(/(^|\s)@\w+/g, "$1");
    // Collapse whitespace
    s = s.replace(/\s+/g, " ").trim();
    if (s.length === 0) return null;
    if (s.length > 280) s = s.slice(0, 280);
    return s;
  }

  /**
   * Scrub a workout object for sharing. Returns a brand-new object containing
   * EXACTLY the whitelisted fields and nothing else.
   *
   * @param {Object} workout — caller-provided workout object. Anything in here
   *   that is not whitelisted is dropped.
   * @returns {Object} PublicWorkoutPayload with shape:
   *   { variant_id, sport_id, session_type_id, share_note? }
   * @throws Error if any required whitelist field is missing or invalid.
   */
  function scrubForShare(workout) {
    if (!workout || typeof workout !== "object") {
      throw new Error("scrubForShare: workout must be an object");
    }

    // Pull whitelisted fields. Look in both top-level and a nested .public field
    // (in case caller already started building a payload).
    const out = {};
    for (const field of ALLOWED_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(workout, field)) {
        out[field] = workout[field];
      }
    }

    // Required fields.
    if (!out.variant_id || typeof out.variant_id !== "string") {
      throw new Error("scrubForShare: variant_id is required and must be a string");
    }
    if (!out.sport_id || typeof out.sport_id !== "string") {
      throw new Error("scrubForShare: sport_id is required and must be a string");
    }
    if (!out.session_type_id || typeof out.session_type_id !== "string") {
      throw new Error("scrubForShare: session_type_id is required and must be a string");
    }
    if (!["run", "bike", "swim", "strength", "hybrid"].includes(out.sport_id)) {
      throw new Error(`scrubForShare: invalid sport_id "${out.sport_id}"`);
    }

    // Sanitize the optional note. If sanitization yields an empty string, drop it.
    if (out.share_note != null) {
      const sanitized = _sanitizeNote(out.share_note);
      if (sanitized) {
        out.share_note = sanitized;
      } else {
        delete out.share_note;
      }
    }

    return out;
  }

  /**
   * Defensive helper: takes any object and returns the list of fields that
   * would be dropped by scrubForShare. Used by tests and by debugging panels.
   */
  function listFieldsThatWouldBeDropped(obj) {
    if (!obj || typeof obj !== "object") return [];
    return Object.keys(obj).filter(k => !ALLOWED_FIELDS.has(k));
  }

  /**
   * Check if a sender note contains content that would be stripped (URLs,
   * emails, mentions). Used by the share sheet UI to surface the rule before
   * the user hits Generate Link.
   */
  function noteContainsForbiddenContent(note) {
    if (note == null) return false;
    const s = String(note);
    if (/https?:\/\//i.test(s)) return true;
    if (/\bwww\./i.test(s)) return true;
    if (/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/.test(s)) return true;
    if (/(^|\s)@\w+/.test(s)) return true;
    return false;
  }

  const api = {
    scrubForShare,
    listFieldsThatWouldBeDropped,
    noteContainsForbiddenContent,
    ALLOWED_FIELDS,
  };

  if (typeof window !== "undefined") window.WorkoutSharingPrivacy = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
