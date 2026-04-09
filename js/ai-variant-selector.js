// js/ai-variant-selector.js
//
// Client-side AI variant selector. Calls the Supabase Edge Function
// `variant-selector` for a constrained-choice pick from the variant library.
// Falls back to deterministic rotation on ANY failure (network, timeout,
// rate limit, parse error, validation failure).
//
// Implements PHILOSOPHY_UPDATE_2026-04-09_workout_diversification.md.
//
// Hard rules enforced here:
//   - NEVER include the Anthropic API key — the Edge Function holds it.
//   - NEVER return a variant id that isn't in the library (validated locally
//     even though the Edge Function also validates).
//   - NEVER return a variant the user did within the rotation window unless
//     the library is exhausted.
//   - NEVER make more than one call per (user, week, session type).
//   - NEVER call the selector for excluded session types.
//   - NEVER make more than 20 calls/user/week — silent fallback beyond.
//
// Public surface: window.AIVariantSelector.selectVariant(opts)

(function () {
  "use strict";

  const TIMEOUT_MS = 3000;
  const PER_USER_WEEKLY_CAP = 20;
  const CACHE_TTL_DAYS = 7;

  // The Edge Function URL is read from a global config injected by the host
  // page (so we can swap dev/prod without code changes). Falls back to the
  // standard Supabase functions URL pattern if a project URL is configured.
  function _edgeFunctionUrl() {
    if (typeof window === "undefined") return null;
    if (window.IRONZ_VARIANT_SELECTOR_URL) return window.IRONZ_VARIANT_SELECTOR_URL;
    if (window.SUPABASE_URL) return `${window.SUPABASE_URL}/functions/v1/variant-selector`;
    if (window.supabaseClient && window.supabaseClient.supabaseUrl) {
      return `${window.supabaseClient.supabaseUrl}/functions/v1/variant-selector`;
    }
    return null;
  }

  // ─── Date helpers ────────────────────────────────────────────────────────────

  function _mondayOfDate(d) {
    const date = (d instanceof Date) ? new Date(d.getTime()) : new Date(d + "T00:00:00");
    const dow = date.getDay();
    const offset = dow === 0 ? -6 : 1 - dow;
    date.setDate(date.getDate() + offset);
    return date.toISOString().slice(0, 10);
  }

  function _todayMondayStr() {
    return _mondayOfDate(new Date());
  }

  // ─── Cache (in user_data.variant_cache JSONB) ────────────────────────────────

  function _readUserData() {
    if (typeof localStorage === "undefined") return {};
    try { return JSON.parse(localStorage.getItem("user_data") || "{}"); } catch { return {}; }
  }
  function _writeUserData(ud) {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem("user_data", JSON.stringify(ud));
      if (typeof DB !== "undefined" && DB.syncKey) DB.syncKey("user_data");
    } catch {}
  }

  function _cacheGet(weekStartDate, sessionTypeId) {
    const ud = _readUserData();
    const cache = ud.variant_cache || {};
    const week = cache[weekStartDate];
    if (!week) return null;
    const entry = week[sessionTypeId];
    if (!entry) return null;
    // TTL check
    if (entry.cachedAt) {
      const ageMs = Date.now() - new Date(entry.cachedAt).getTime();
      if (ageMs > CACHE_TTL_DAYS * 86400000) return null;
    }
    return entry;
  }

  function _cachePut(weekStartDate, sessionTypeId, entry) {
    const ud = _readUserData();
    if (!ud.variant_cache) ud.variant_cache = {};
    if (!ud.variant_cache[weekStartDate]) ud.variant_cache[weekStartDate] = {};
    ud.variant_cache[weekStartDate][sessionTypeId] = {
      ...entry,
      cachedAt: new Date().toISOString(),
    };
    _writeUserData(ud);
  }

  // ─── Cost control: weekly call counter ───────────────────────────────────────

  function _bumpCallCounter() {
    const ud = _readUserData();
    const monday = _todayMondayStr();
    if (!ud.variant_selector_calls_this_week
      || ud.variant_selector_calls_this_week.weekStartDate !== monday) {
      ud.variant_selector_calls_this_week = { weekStartDate: monday, count: 0 };
    }
    ud.variant_selector_calls_this_week.count++;
    _writeUserData(ud);
    return ud.variant_selector_calls_this_week.count;
  }

  function _peekCallCounter() {
    const ud = _readUserData();
    const monday = _todayMondayStr();
    if (!ud.variant_selector_calls_this_week
      || ud.variant_selector_calls_this_week.weekStartDate !== monday) return 0;
    return ud.variant_selector_calls_this_week.count || 0;
  }

  // ─── Validation (defense in depth — Edge Function also validates) ────────────

  function _validateAgainstLibrary(pick, library, recentHistory) {
    if (!pick || typeof pick.variantId !== "string") return { ok: false, reason: "invalid_response" };
    const exists = Array.isArray(library) && library.some(v => v && v.id === pick.variantId);
    if (!exists) return { ok: false, reason: "invalid_response" };
    const window = (recentHistory || []).slice(0, 2);
    if (window.includes(pick.variantId)) {
      const unused = library.filter(v => !window.includes(v.id));
      if (unused.length > 0) return { ok: false, reason: "stale_selection" };
    }
    return { ok: true };
  }

  // ─── Edge Function call ──────────────────────────────────────────────────────

  let _callEdgeFunction = async function (payload) {
    const url = _edgeFunctionUrl();
    if (!url) return { ok: false, reason: "no_url" };

    let token = null;
    try {
      if (typeof window !== "undefined" && window.supabaseClient) {
        const session = await window.supabaseClient.auth.getSession();
        token = session && session.data && session.data.session && session.data.session.access_token;
      }
    } catch {}
    if (!token) return { ok: false, reason: "no_auth" };

    const ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null;

    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "authorization": `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: ctrl ? ctrl.signal : undefined,
      });
      if (!resp.ok) {
        if (resp.status === 429) return { ok: false, reason: "rate_limited" };
        if (resp.status === 504) return { ok: false, reason: "timeout" };
        return { ok: false, reason: `api_error_${resp.status}` };
      }
      const json = await resp.json();
      return { ok: true, json };
    } catch (e) {
      const reason = (e && e.name === "AbortError") ? "timeout" : "network_error";
      return { ok: false, reason };
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  // ─── Public entry point ──────────────────────────────────────────────────────

  /**
   * Pick a variant for the given context.
   *
   * @param {Object} opts
   * @param {string} opts.userId
   * @param {string} opts.sessionTypeId
   * @param {number} opts.weekNumber — 0-indexed weeks since plan start
   * @param {Array<string>} [opts.recentHistory] — variant ids, most recent first
   * @param {Object} [opts.userProfile]
   * @param {Date|string} [opts.weekStartDate] — used as the cache key
   * @param {string} [opts.sport] — optional override; otherwise inferred
   *
   * @returns {Promise<{ variantId: string, rationale: string, fromFallback: boolean,
   *                     fallback_reason?: string, fromCache?: boolean }>}
   */
  async function selectVariant(opts) {
    const { userId, sessionTypeId, weekNumber, sport } = opts || {};
    const recentHistory = (opts && opts.recentHistory) || [];
    const userProfile = (opts && opts.userProfile) || {};
    const weekStartDate = _mondayOfDate(opts && opts.weekStartDate ? opts.weekStartDate : new Date());

    if (!userId || !sessionTypeId) {
      throw new Error("selectVariant: missing userId or sessionTypeId");
    }

    const VL  = (typeof window !== "undefined" && window.VariantLibraries) || null;
    const DVR = (typeof window !== "undefined" && window.DeterministicVariantRotation) || null;
    if (!VL || !DVR) throw new Error("selectVariant: VariantLibraries / DeterministicVariantRotation not loaded");

    // Resolve and filter the library by experience level.
    const rawLibrary = VL.getLibraryFor(sport, sessionTypeId);
    if (!rawLibrary || rawLibrary.length === 0) {
      throw new Error(`selectVariant: no variants for ${sport || "(inferred)"}/${sessionTypeId}`);
    }
    const filteredLibrary = VL.filterByExperience(rawLibrary, userProfile.experience_level || "intermediate");
    const library = filteredLibrary.length ? filteredLibrary : rawLibrary;

    // 1. Cache check.
    const cached = _cacheGet(weekStartDate, sessionTypeId);
    if (cached && cached.variantId) {
      // Even cache hits go through validation — defends against bit-rot.
      const v = _validateAgainstLibrary(cached, library, recentHistory);
      if (v.ok) {
        return {
          variantId: cached.variantId,
          rationale: cached.rationale || "(cached)",
          fromFallback: !!cached.fromFallback,
          fromCache: true,
        };
      }
    }

    // 2. Excluded types — straight to deterministic.
    if (VL.isExcludedFromAiSelection(sessionTypeId)) {
      const det = DVR.pickVariant({ variants: library, weekNumber, recentHistory });
      _cachePut(weekStartDate, sessionTypeId, { ...det, source: "excluded" });
      return { ...det, fromCache: false };
    }

    // 3. Cost cap — silent fallback beyond 20 calls/user/week.
    if (_peekCallCounter() >= PER_USER_WEEKLY_CAP) {
      const det = DVR.pickVariant({ variants: library, weekNumber, recentHistory });
      const result = { ...det, fallback_reason: "weekly_cap" };
      _cachePut(weekStartDate, sessionTypeId, result);
      return { ...result, fromCache: false };
    }

    // 4. AI call.
    _bumpCallCounter();
    const apiResult = await _callEdgeFunction({
      userId,
      sessionTypeId,
      weekNumber,
      recentHistory,
      userProfile,
      variantLibrary: library,
      callsThisWeek: _peekCallCounter(),
    });

    if (!apiResult.ok) {
      const det = DVR.pickVariant({ variants: library, weekNumber, recentHistory });
      const result = { ...det, fallback_reason: apiResult.reason };
      _cachePut(weekStartDate, sessionTypeId, result);
      return { ...result, fromCache: false };
    }

    // 5. Local validation against the library (defense in depth).
    const validation = _validateAgainstLibrary(apiResult.json, library, recentHistory);
    if (!validation.ok) {
      const det = DVR.pickVariant({ variants: library, weekNumber, recentHistory });
      const result = { ...det, fallback_reason: validation.reason || "invalid_response" };
      _cachePut(weekStartDate, sessionTypeId, result);
      return { ...result, fromCache: false };
    }

    // 6. Cache and return.
    const accepted = {
      variantId: apiResult.json.variantId,
      rationale: apiResult.json.rationale || "",
      fromFallback: false,
    };
    _cachePut(weekStartDate, sessionTypeId, accepted);
    return { ...accepted, fromCache: false };
  }

  // ─── Test helpers (exposed for the harness, not for production calling) ──────

  function _resetCacheForTests() {
    const ud = _readUserData();
    delete ud.variant_cache;
    delete ud.variant_selector_calls_this_week;
    _writeUserData(ud);
  }

  // Allow the test harness to inject a fake fetch result so we can exercise
  // the validation paths without hitting the network.
  let __testEdgeFnOverride = null;
  function __setEdgeFnOverrideForTests(fn) { __testEdgeFnOverride = fn; }

  // Wrap _callEdgeFunction so the override (if set) takes precedence.
  const _origCallEdgeFunction = _callEdgeFunction;
  _callEdgeFunction = async function (payload) {
    if (__testEdgeFnOverride) return __testEdgeFnOverride(payload);
    return _origCallEdgeFunction(payload);
  };

  const api = {
    selectVariant,
    PER_USER_WEEKLY_CAP,
    CACHE_TTL_DAYS,
    // test-only:
    _resetCacheForTests,
    __setEdgeFnOverrideForTests,
    _peekCallCounter,
    _cacheGet,
  };

  if (typeof window !== "undefined") window.AIVariantSelector = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
