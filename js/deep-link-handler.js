// js/deep-link-handler.js
//
// Routes inbound share links into the right app state.
// Handles:
//   - https://ironz.app/w/{token}     (universal link)
//   - ironz://share/{token}            (custom scheme)
//
// Implements FEATURE_SPEC_2026-04-09_workout_sharing.md → DEEP_LINK_HANDLER.

(function () {
  "use strict";

  const PENDING_LOCAL_KEY = "ironz_pending_share_token";
  const FINGERPRINT_KEY   = "ironz_device_fingerprint";

  // ─── Token parsing ──────────────────────────────────────────────────────────

  function parseToken(input) {
    if (!input) return null;
    try {
      // Accept full URLs, custom-scheme URLs, or bare tokens.
      let url;
      try { url = new URL(input); }
      catch { url = null; }

      if (url) {
        // ironz://share/{token}
        if (url.protocol === "ironz:") {
          const m = url.pathname.replace(/^\/+/, "").match(/^([\w-]{1,64})$/);
          if (m) return m[1];
          // Some platforms put it after //share/
          const m2 = (url.host + url.pathname).match(/share\/([\w-]{1,64})/);
          if (m2) return m2[1];
        }
        // https://ironz.fit/w/{token} or https://ironz.app/w/{token}
        if (/ironz\.(fit|app)$/i.test(url.hostname)) {
          const m = url.pathname.match(/^\/w\/([\w-]{1,64})$/);
          if (m) return m[1];
        }
      }
      // Fallback: bare token (12 alphanumeric chars per spec, but accept up to 64 for forward-compat)
      const bare = String(input).match(/^[\w-]{6,64}$/);
      if (bare) return bare[0];
    } catch {}
    return null;
  }

  // ─── Device fingerprint (stable hash, no PII) ───────────────────────────────

  function getDeviceFingerprint() {
    if (typeof localStorage === "undefined") return "anon";
    let fp = null;
    try { fp = localStorage.getItem(FINGERPRINT_KEY); } catch {}
    if (fp) return fp;
    // Generate a stable random fingerprint on first call. NO browser/UA fingerprinting,
    // NO IP, NO geo — just a random opaque token persisted to localStorage.
    fp = "fp-" + Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-6);
    try { localStorage.setItem(FINGERPRINT_KEY, fp); } catch {}
    return fp;
  }

  // ─── Pending shares (post-install resume) ───────────────────────────────────

  /**
   * Stash a pending share locally and (best-effort) in the Supabase pending_shares
   * table for cross-device recovery. Called when a non-authenticated user clicks
   * a share link before installing/onboarding.
   */
  async function stashPendingShare(token) {
    if (!token) return;
    if (typeof localStorage !== "undefined") {
      try { localStorage.setItem(PENDING_LOCAL_KEY, token); } catch {}
    }
    const sb = (typeof window !== "undefined" && window.supabaseClient) || null;
    if (!sb) return;
    try {
      await sb.from("pending_shares").insert({
        device_fingerprint: getDeviceFingerprint(),
        share_token: token,
      });
    } catch {}
  }

  /**
   * Look up any pending share for the current device. Called on first launch
   * after onboarding completes.
   */
  async function findPendingShare() {
    // 1. Local first (handles same-device install).
    let local = null;
    if (typeof localStorage !== "undefined") {
      try { local = localStorage.getItem(PENDING_LOCAL_KEY); } catch {}
    }
    if (local) return local;

    // 2. Cross-device fallback via the pending_shares table.
    const sb = (typeof window !== "undefined" && window.supabaseClient) || null;
    if (!sb) return null;
    try {
      const { data } = await sb
        .from("pending_shares")
        .select("share_token, created_at")
        .eq("device_fingerprint", getDeviceFingerprint())
        .is("claimed_at", null)
        .order("created_at", { ascending: false })
        .limit(1);
      if (data && data[0]) return data[0].share_token;
    } catch {}
    return null;
  }

  /**
   * Mark a pending share as claimed.
   */
  async function claimPendingShare(token, userId) {
    if (typeof localStorage !== "undefined") {
      try {
        if (localStorage.getItem(PENDING_LOCAL_KEY) === token) {
          localStorage.removeItem(PENDING_LOCAL_KEY);
        }
      } catch {}
    }
    const sb = (typeof window !== "undefined" && window.supabaseClient) || null;
    if (!sb) return;
    try {
      await sb.from("pending_shares")
        .update({ claimed_at: new Date().toISOString(), claimed_by_user_id: userId || null })
        .eq("device_fingerprint", getDeviceFingerprint())
        .eq("share_token", token);
    } catch {}
  }

  // ─── Routing ────────────────────────────────────────────────────────────────

  async function _isAuthenticated() {
    const sb = (typeof window !== "undefined" && window.supabaseClient) || null;
    if (!sb) return false;
    try {
      const { data } = await sb.auth.getUser();
      return !!(data && data.user);
    } catch { return false; }
  }

  async function _getCurrentUserId() {
    const sb = (typeof window !== "undefined" && window.supabaseClient) || null;
    if (!sb) return null;
    try {
      const { data } = await sb.auth.getUser();
      return (data && data.user && data.user.id) || null;
    } catch { return null; }
  }

  /**
   * Route an inbound URL or token. Main entry point.
   *
   * Logic:
   *   1. Parse token from URL.
   *   2. If user is authenticated → resolve via WorkoutLinkService → preview modal.
   *   3. If not authenticated → stash pending share + show install prompt.
   *
   * @param {string} urlOrToken
   * @returns {Promise<{action: string, token?: string, error?: string}>}
   */
  async function route(urlOrToken) {
    const token = parseToken(urlOrToken);
    if (!token) return { action: "noop", error: "INVALID_URL" };

    const authed = await _isAuthenticated();
    if (!authed) {
      await stashPendingShare(token);
      return { action: "stashed_pending", token };
    }

    const Link = (typeof window !== "undefined" && window.WorkoutLinkService) || null;
    if (!Link) return { action: "error", error: "LINK_SERVICE_MISSING" };

    const resolved = await Link.resolveToken(token);
    if (resolved.error) {
      _openErrorModal(resolved.error);
      return { action: "error", error: resolved.error };
    }

    // Push the resolved share into the inbox so it survives reloads.
    const Inbox = window.SharedWorkoutsInbox;
    if (Inbox && Inbox.upsertEntry) {
      await Inbox.upsertEntry({
        shareToken: resolved.shareToken,
        senderUserId: resolved.senderUserId,
        senderDisplayName: resolved.senderDisplayName,
        senderAvatarUrl: resolved.senderAvatarUrl,
        variantId: resolved.variantId,
        sportId: resolved.sportId,
        sessionTypeId: resolved.sessionTypeId,
        shareNote: resolved.shareNote,
        received_at: new Date().toISOString(),
        status: "unread",
      });
    }

    // Open the preview modal.
    const PreviewModal = window.SharedWorkoutPreviewModal;
    if (PreviewModal && PreviewModal.open) {
      PreviewModal.open({ sharedWorkout: resolved });
    }

    return { action: "previewed", token };
  }

  /**
   * Resume a pending share after the user finishes onboarding.
   * Returns the resolved share or null.
   */
  async function resumePendingShareAfterOnboarding() {
    const token = await findPendingShare();
    if (!token) return null;
    const userId = await _getCurrentUserId();
    await claimPendingShare(token, userId);
    // Run the standard route now that the user is authenticated.
    await route(token);
    return token;
  }

  function _openErrorModal(error) {
    if (typeof document === "undefined") return;
    const overlay = document.createElement("div");
    overlay.className = "rating-modal-overlay";
    overlay.style.display = "flex";
    let title, body;
    if (error === "REVOKED") {
      title = "Link revoked";
      body = "This link was revoked by the sender.";
    } else if (error === "EXPIRED") {
      title = "Link expired";
      body = "This link has expired.";
    } else if (error === "INVALID_VARIANT") {
      title = "Workout unavailable";
      body = "This workout is no longer available in the library.";
    } else {
      title = "Link not found";
      body = "We couldn't find this shared workout.";
    }
    overlay.innerHTML = `
      <div class="rating-modal post-test-modal">
        <div class="post-test-modal-title">${title}</div>
        <div class="post-test-modal-body"><p>${body}</p></div>
        <div class="post-test-modal-actions">
          <button class="rating-save-btn" id="dlh-error-ok">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));
    overlay.querySelector("#dlh-error-ok").onclick = () => overlay.remove();
  }

  // ─── Auto-handle URLs at load time ──────────────────────────────────────────

  function _autoHandleOnLoad() {
    if (typeof window === "undefined" || !window.location) return;
    // Pattern 1: ?share=<token> query param
    const params = new URLSearchParams(window.location.search || "");
    const fromQuery = params.get("share") || params.get("w");
    if (fromQuery) {
      route(fromQuery);
      return;
    }
    // Pattern 2: path /w/{token}
    const m = (window.location.pathname || "").match(/^\/w\/([\w-]{6,64})/);
    if (m) {
      route(m[1]);
      return;
    }
    // Pattern 3: hash #/share/{token}
    const hashMatch = (window.location.hash || "").match(/share\/([\w-]{6,64})/);
    if (hashMatch) {
      route(hashMatch[1]);
    }
  }

  function _resetForTests() {
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.removeItem(PENDING_LOCAL_KEY);
        localStorage.removeItem(FINGERPRINT_KEY);
      } catch {}
    }
  }

  const api = {
    parseToken,
    route,
    stashPendingShare,
    findPendingShare,
    claimPendingShare,
    resumePendingShareAfterOnboarding,
    getDeviceFingerprint,
    _resetForTests,
  };

  if (typeof window !== "undefined") {
    window.DeepLinkHandler = api;
    if (window.addEventListener) {
      window.addEventListener("DOMContentLoaded", _autoHandleOnLoad);
    }
  }
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
