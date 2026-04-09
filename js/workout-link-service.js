// js/workout-link-service.js
//
// Mint, resolve, and revoke workout share tokens.
// Implements FEATURE_SPEC_2026-04-09_workout_sharing.md → WORKOUT_LINK_SERVICE.
//
// Token format: 12 chars, base62 (0-9 + a-z + A-Z), generated from
// crypto.randomUUID() bytes (or crypto.getRandomValues fallback).
// Collision space: 62^12 ≈ 3.2e21 — astronomically unlikely.
// Insert collision detection: try up to 3 times before giving up.

(function () {
  "use strict";

  const BASE62 = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const TOKEN_LENGTH = 12;
  const SHARE_URL_BASE = "https://ironz.app/w/";

  // Resolve a usable random byte source. Browser → window.crypto.
  // Node test harness → globalThis.crypto (Node 19+) or fallback to Math.random.
  function _getRandomBytes(n) {
    const cryptoObj =
      (typeof globalThis !== "undefined" && globalThis.crypto) ||
      (typeof window !== "undefined" && window.crypto) ||
      null;
    if (cryptoObj && cryptoObj.getRandomValues) {
      const bytes = new Uint8Array(n);
      cryptoObj.getRandomValues(bytes);
      return bytes;
    }
    // Test-only fallback. crypto.getRandomValues is available in every browser
    // since 2014 and in Node since 19, so this branch should never run in prod.
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
    return out;
  }

  /**
   * Generate a 12-character base62 token from cryptographically random bytes.
   * Pure function — does NOT call the database. Use mintToken() if you also
   * want collision-detection against the shared_workouts table.
   */
  function generateToken() {
    const bytes = _getRandomBytes(TOKEN_LENGTH);
    let token = "";
    for (let i = 0; i < TOKEN_LENGTH; i++) {
      token += BASE62[bytes[i] % 62];
    }
    return token;
  }

  // ─── Supabase client lookup ─────────────────────────────────────────────────

  function _getSupabase() {
    if (typeof window !== "undefined" && window.supabaseClient) return window.supabaseClient;
    return null;
  }

  /**
   * Mint a fresh token. Generates a base62 token and inserts the share row.
   * On collision (rare), retries up to 3 times. Throws on persistent failure.
   *
   * @param {Object} insertPayload — { sender_user_id, variant_id, sport_id,
   *   session_type_id, share_note? }. Caller is responsible for having already
   *   passed the workout through WorkoutSharingPrivacy.scrubForShare().
   * @returns {Promise<{ shareToken, shareUrl, expiresAt }>}
   */
  async function mintToken(insertPayload) {
    const sb = _getSupabase();
    if (!sb) throw new Error("mintToken: supabaseClient not initialized");
    if (!insertPayload || !insertPayload.sender_user_id) {
      throw new Error("mintToken: sender_user_id required");
    }

    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const token = generateToken();
      const { data, error } = await sb
        .from("shared_workouts")
        .insert({ ...insertPayload, share_token: token })
        .select("share_token, expires_at")
        .single();

      if (!error && data) {
        return {
          shareToken: data.share_token,
          shareUrl: SHARE_URL_BASE + data.share_token,
          expiresAt: data.expires_at,
        };
      }
      // Postgres unique violation = 23505 → collision, retry
      const code = error && (error.code || (error.details || ""));
      if (code === "23505" || /duplicate key/i.test(String(error && error.message))) {
        lastError = error;
        continue;
      }
      // Any other error is fatal
      throw new Error(`mintToken: ${error && error.message ? error.message : "unknown insert error"}`);
    }
    throw new Error(`mintToken: collision retry exhausted (${lastError && lastError.message})`);
  }

  /**
   * Look up a share by token. Returns the resolved row OR a structured error.
   * RLS enforces that only live shares are returned, so we don't have to
   * re-check expires_at / revoked_at on the client.
   */
  async function resolveToken(token) {
    if (!token || typeof token !== "string") return { error: "NOT_FOUND" };
    const sb = _getSupabase();
    if (!sb) return { error: "NOT_FOUND" };

    // Read the row plus a join on the sender's profile for display name + avatar.
    // The profile join uses the public profiles table populated by auth.js.
    const { data, error } = await sb
      .from("shared_workouts")
      .select(`
        share_token, variant_id, sport_id, session_type_id, share_note,
        created_at, expires_at, revoked_at, sender_user_id,
        sender:profiles!shared_workouts_sender_user_id_fkey ( full_name, avatar_url )
      `)
      .eq("share_token", token)
      .maybeSingle();

    if (error) {
      // Try a simpler select without the join in case the FK is missing.
      const fallback = await sb
        .from("shared_workouts")
        .select("share_token, variant_id, sport_id, session_type_id, share_note, created_at, expires_at, revoked_at, sender_user_id")
        .eq("share_token", token)
        .maybeSingle();
      if (fallback.error) return { error: "NOT_FOUND" };
      return _classifyResolveResult(fallback.data);
    }
    return _classifyResolveResult(data);
  }

  function _classifyResolveResult(row) {
    if (!row) return { error: "NOT_FOUND" };
    if (row.revoked_at) return { error: "REVOKED" };
    if (row.expires_at && new Date(row.expires_at) <= new Date()) return { error: "EXPIRED" };
    return {
      shareToken: row.share_token,
      variantId: row.variant_id,
      sportId: row.sport_id,
      sessionTypeId: row.session_type_id,
      shareNote: row.share_note,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      senderUserId: row.sender_user_id,
      senderDisplayName: (row.sender && row.sender.full_name) || null,
      senderAvatarUrl: (row.sender && row.sender.avatar_url) || null,
    };
  }

  /**
   * Revoke a share. Sets revoked_at = now() on the row. Only the sender can
   * revoke (enforced by RLS). Once revoked, resolveToken returns
   * { error: 'REVOKED' } forever.
   */
  async function revokeToken(token, userId) {
    const sb = _getSupabase();
    if (!sb) return { error: "no_client" };
    const { error } = await sb
      .from("shared_workouts")
      .update({ revoked_at: new Date().toISOString() })
      .eq("share_token", token)
      .eq("sender_user_id", userId);
    if (error) return { error: error.message || "update_failed" };
    return { ok: true };
  }

  /**
   * List all shares created by a user (their "Shared by me" view).
   */
  async function listSharesBy(userId) {
    const sb = _getSupabase();
    if (!sb) return [];
    const { data, error } = await sb
      .from("shared_workouts")
      .select("share_token, variant_id, sport_id, session_type_id, share_note, created_at, expires_at, revoked_at, view_count, import_count, completion_count")
      .eq("sender_user_id", userId)
      .order("created_at", { ascending: false });
    if (error) return [];
    return data || [];
  }

  function shareUrlFor(token) {
    return SHARE_URL_BASE + token;
  }

  const api = {
    generateToken,
    mintToken,
    resolveToken,
    revokeToken,
    listSharesBy,
    shareUrlFor,
    SHARE_URL_BASE,
    TOKEN_LENGTH,
  };

  if (typeof window !== "undefined") window.WorkoutLinkService = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
