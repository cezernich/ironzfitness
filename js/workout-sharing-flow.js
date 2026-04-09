// js/workout-sharing-flow.js
//
// Sender-side orchestration. The single entry point for "share this workout".
// Implements FEATURE_SPEC_2026-04-09_workout_sharing.md → WORKOUT_SHARING_FLOW.
//
// Hard rules enforced here:
//   - variant_id must exist in the canonical library (preflight)
//   - All payloads pass through WorkoutSharingPrivacy.scrubForShare() — no exceptions
//   - Module-level rate limiter: 20 shares per user per 24h rolling window
//   - Never reaches the database without going through the privacy chokepoint

(function () {
  "use strict";

  const RATE_LIMIT_PER_24H = 20;
  const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;
  const RATE_KEY = "ironz_share_rate_log_v1";

  // ─── Local rate limiter (defense-in-depth alongside any DB-side cap) ────────

  function _readRateLog() {
    if (typeof localStorage === "undefined") return {};
    try { return JSON.parse(localStorage.getItem(RATE_KEY) || "{}"); } catch { return {}; }
  }
  function _writeRateLog(log) {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(RATE_KEY, JSON.stringify(log));
      if (typeof DB !== "undefined" && DB.syncKey) DB.syncKey(RATE_KEY);
    } catch {}
  }
  function _pruneRateLog(log, userId) {
    const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
    const list = (log[userId] || []).filter(ts => ts >= cutoff);
    log[userId] = list;
    return list;
  }
  function _peekUserCount(userId) {
    const log = _readRateLog();
    return _pruneRateLog(log, userId).length;
  }
  function _bumpUserCount(userId) {
    const log = _readRateLog();
    const list = _pruneRateLog(log, userId);
    list.push(Date.now());
    log[userId] = list;
    _writeRateLog(log);
    return list.length;
  }

  // ─── Variant existence preflight ────────────────────────────────────────────

  function _variantExistsInLibrary(sportId, sessionTypeId, variantId) {
    if (typeof window === "undefined" || !window.VariantLibraries) return false;
    const variants = window.VariantLibraries.getLibraryFor(sportId, sessionTypeId);
    if (!Array.isArray(variants) || variants.length === 0) return false;
    return variants.some(v => v && v.id === variantId);
  }

  // ─── Auth helper ────────────────────────────────────────────────────────────

  async function _getCurrentUserId() {
    if (typeof window === "undefined" || !window.supabaseClient) return null;
    try {
      const { data } = await window.supabaseClient.auth.getUser();
      return (data && data.user && data.user.id) || null;
    } catch {
      return null;
    }
  }

  // ─── Analytics ──────────────────────────────────────────────────────────────

  function _emitAnalytics(event, payload) {
    if (typeof window === "undefined") return;
    if (window.IronZAnalytics && window.IronZAnalytics.track) {
      try { window.IronZAnalytics.track(event, payload); } catch {}
    }
    // Always log to console as a fallback for debugging.
    try { console.log(`[IronZ Analytics] ${event}`, payload); } catch {}
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Create a share. The single entry point for the sender side of the flow.
   *
   * @param {Object} input
   * @param {string} input.variantId       — required, must exist in library
   * @param {string} input.sportId         — required, one of run/bike/swim/strength/hybrid
   * @param {string} input.sessionTypeId   — required
   * @param {string} [input.note]          — optional, max 280 chars after sanitization
   * @returns {Promise<{ shareToken, shareUrl, expiresAt } | { error: string }>}
   */
  async function createShare(input) {
    if (!input || typeof input !== "object") {
      return { error: "INVALID_INPUT" };
    }
    const { variantId, sportId, sessionTypeId, note } = input;

    // 1. Auth.
    const userId = await _getCurrentUserId();
    if (!userId) return { error: "NOT_AUTHENTICATED" };

    // 2. Variant existence preflight.
    if (!variantId || !sportId || !sessionTypeId) return { error: "INVALID_VARIANT" };
    if (!_variantExistsInLibrary(sportId, sessionTypeId, variantId)) {
      return { error: "INVALID_VARIANT" };
    }

    // 3. Rate limit.
    if (_peekUserCount(userId) >= RATE_LIMIT_PER_24H) {
      return { error: "RATE_LIMITED" };
    }

    // 4. Privacy scrub. Build a workout object with EVERYTHING the caller might
    //    have accidentally passed plus the explicit fields, and let the privacy
    //    module reject any leaks. The privacy module is the chokepoint.
    const Privacy = (typeof window !== "undefined" && window.WorkoutSharingPrivacy) || null;
    if (!Privacy) return { error: "PRIVACY_MODULE_MISSING" };

    let scrubbed;
    try {
      scrubbed = Privacy.scrubForShare({
        variant_id: variantId,
        sport_id: sportId,
        session_type_id: sessionTypeId,
        share_note: note,
      });
    } catch (e) {
      return { error: "PRIVACY_REJECTED", message: e.message };
    }

    // 5. Mint token + insert. Insert payload is whitelist + sender_user_id.
    const Link = (typeof window !== "undefined" && window.WorkoutLinkService) || null;
    if (!Link) return { error: "LINK_SERVICE_MISSING" };

    let mintResult;
    try {
      mintResult = await Link.mintToken({
        sender_user_id: userId,
        variant_id: scrubbed.variant_id,
        sport_id: scrubbed.sport_id,
        session_type_id: scrubbed.session_type_id,
        share_note: scrubbed.share_note || null,
      });
    } catch (e) {
      return { error: "MINT_FAILED", message: e.message };
    }

    // 6. Bump rate limit counter (only after successful insert).
    _bumpUserCount(userId);

    // 7. Analytics.
    _emitAnalytics("share_created", {
      variant_id: scrubbed.variant_id,
      sport_id: scrubbed.sport_id,
      session_type_id: scrubbed.session_type_id,
      has_note: !!scrubbed.share_note,
    });

    return {
      shareToken: mintResult.shareToken,
      shareUrl: mintResult.shareUrl,
      expiresAt: mintResult.expiresAt,
    };
  }

  /**
   * Revoke a share. Thin wrapper around link service revokeToken with auth.
   */
  async function revokeShare(token) {
    const userId = await _getCurrentUserId();
    if (!userId) return { error: "NOT_AUTHENTICATED" };
    const Link = window.WorkoutLinkService;
    if (!Link) return { error: "LINK_SERVICE_MISSING" };
    const result = await Link.revokeToken(token, userId);
    if (result.ok) {
      _emitAnalytics("share_revoked", { share_token: token });
    }
    return result;
  }

  /**
   * Get the user's current rate-limit state. Used by the share sheet UI to
   * surface the count to the user before they hit Generate Link.
   */
  async function getRateLimitState() {
    const userId = await _getCurrentUserId();
    if (!userId) return { count: 0, max: RATE_LIMIT_PER_24H, remaining: RATE_LIMIT_PER_24H };
    const count = _peekUserCount(userId);
    return { count, max: RATE_LIMIT_PER_24H, remaining: Math.max(0, RATE_LIMIT_PER_24H - count) };
  }

  // Test-only helpers — exposed so tests can simulate rate-limit state without
  // going through the auth flow.
  function _resetRateLogForTests() {
    if (typeof localStorage !== "undefined") {
      try { localStorage.removeItem(RATE_KEY); } catch {}
    }
  }
  function _injectRateCountForTests(userId, count) {
    const log = _readRateLog();
    log[userId] = Array.from({ length: count }, () => Date.now());
    _writeRateLog(log);
  }

  const api = {
    createShare,
    revokeShare,
    getRateLimitState,
    RATE_LIMIT_PER_24H,
    RATE_LIMIT_WINDOW_MS,
    // test-only:
    _peekUserCount,
    _bumpUserCount,
    _resetRateLogForTests,
    _injectRateCountForTests,
  };

  if (typeof window !== "undefined") window.WorkoutSharingFlow = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
