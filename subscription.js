// subscription.js — Premium subscription gating via Supabase + Stripe Checkout.
//
// Replaces the prior localStorage-only mock. Keeps the global
// `renderSubscriptionStatus()` entry point because app.js:150 calls it
// directly from the Settings-tab open handler.
//
// ───────────────────────────────────────────────────────────────────────────
// Launch-mode gate: when PREMIUM_ENABLED is false, isPremium() short-circuits
// to true and every requirePremium() call becomes a pass-through. Flip it to
// true once we're ready to start enforcing paywalls — no other code needs to
// change.
// ───────────────────────────────────────────────────────────────────────────

const PREMIUM_ENABLED = false;

// Hosted Stripe Checkout payment links. Public URLs — safe to commit. The
// userId is appended as ?client_reference_id=... at click time so the
// stripe-webhook Edge Function can tie the completed checkout session back
// to our auth user.
const STRIPE_MONTHLY_LINK = "https://buy.stripe.com/8x2fZi9Ne9lAefe1jo0gw00";
const STRIPE_ANNUAL_LINK  = "https://buy.stripe.com/28E9AUaRibtI3AA2ns0gw01";

const PREMIUM_MONTHLY_PRICE   = "$7.99";
const PREMIUM_ANNUAL_PRICE    = "$59.99";
const PREMIUM_ANNUAL_SAVINGS  = "Save 37%";

(function () {
  "use strict";

  // 5-minute in-memory cache for isPremium() — avoids hammering Supabase on
  // every gated click. Invalidated by refreshStatus() or on sign-out.
  let _cache = null; // { value: boolean, expires: number }
  const CACHE_MS = 5 * 60 * 1000;

  function _client() {
    return (typeof window !== "undefined" && window.supabaseClient) || null;
  }

  async function _getUserId() {
    const c = _client();
    if (!c) return null;
    try {
      const { data } = await c.auth.getSession();
      return data?.session?.user?.id || null;
    } catch { return null; }
  }

  function _escHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function _escAttr(s) { return _escHtml(s); }

  function _prettyFeature(feature) {
    const map = {
      barcode_scanner: "Barcode scanner",
      ai_plan:         "AI-generated workout plans",
      workout_sharing: "Sharing workouts to friends",
      workout_inbox:   "Sending workouts to friends",
    };
    return map[feature] || "This feature";
  }

  function _appendClientRef(url, uid) {
    if (!uid || !url) return url;
    const sep = url.includes("?") ? "&" : "?";
    return url + sep + "client_reference_id=" + encodeURIComponent(uid);
  }

  /* ─── Public API ──────────────────────────────────────────────────────── */

  // isPremium — async boolean. Reads the subscriptions table for the current
  // user and returns true iff status = 'active' AND current_period_end is in
  // the future. Cached 5 min. Short-circuits to true while PREMIUM_ENABLED
  // is false so launch mode ships every feature unlocked.
  async function isPremium() {
    if (!PREMIUM_ENABLED) return true;
    if (_cache && _cache.expires > Date.now()) return _cache.value;

    const client = _client();
    const uid = await _getUserId();
    if (!client || !uid) {
      _cache = { value: false, expires: Date.now() + CACHE_MS };
      return false;
    }

    try {
      const { data, error } = await client
        .from("subscriptions")
        .select("status, current_period_end")
        .eq("user_id", uid)
        .maybeSingle();
      if (error) {
        console.warn("[Subscription] isPremium query error:", error.message);
        _cache = { value: false, expires: Date.now() + CACHE_MS };
        return false;
      }
      const active = !!(
        data &&
        data.status === "active" &&
        data.current_period_end &&
        new Date(data.current_period_end) > new Date()
      );
      _cache = { value: active, expires: Date.now() + CACHE_MS };
      return active;
    } catch (e) {
      console.warn("[Subscription] isPremium exception:", e);
      _cache = { value: false, expires: Date.now() + CACHE_MS };
      return false;
    }
  }

  // Force a fresh read on the next call. Use after a successful checkout
  // so the UI reflects the new premium state without waiting for the cache
  // window to expire.
  async function refreshStatus() {
    _cache = null;
    return await isPremium();
  }

  // Gate helper:
  //   if (!(await Subscription.requirePremium("barcode_scanner"))) return;
  // Returns true when the caller may proceed, false when the upsell was
  // shown and the caller should abort.
  async function requirePremium(featureName) {
    const ok = await isPremium();
    if (ok) return true;
    await showPremiumUpsell(featureName);
    return false;
  }

  // Renders the premium upsell modal into document.body. Tracks the impression,
  // pre-bakes the Stripe URLs with client_reference_id, and resolves once the
  // modal is in the DOM.
  async function showPremiumUpsell(featureName) {
    try {
      if (typeof trackEvent === "function") {
        trackEvent("premium_upsell_shown", { feature: featureName });
      }
    } catch {}

    const existing = document.getElementById("premium-upsell-modal");
    if (existing) existing.remove();

    const uid = await _getUserId();
    const monthlyUrl = _appendClientRef(STRIPE_MONTHLY_LINK, uid);
    const annualUrl  = _appendClientRef(STRIPE_ANNUAL_LINK, uid);
    const pretty = _prettyFeature(featureName);

    const modal = document.createElement("div");
    modal.id = "premium-upsell-modal";
    modal.className = "premium-upsell-overlay";
    modal.addEventListener("click", (e) => {
      if (e.target === modal) _closePremiumUpsell();
    });

    modal.innerHTML = `
      <div class="premium-upsell-card" role="dialog" aria-labelledby="premium-upsell-title">
        <button class="premium-upsell-close" type="button" onclick="_closePremiumUpsell()" aria-label="Close">&times;</button>
        <span class="premium-upsell-badge">Premium</span>
        <h2 id="premium-upsell-title" class="premium-upsell-title">Unlock IronZ Premium</h2>
        <p class="premium-upsell-feature">${_escHtml(pretty)} is a Premium feature.</p>
        <ul class="premium-upsell-list">
          <li>AI-generated workout plans</li>
          <li>Barcode food scanning</li>
          <li>Send workouts to friends</li>
          <li>Priority support</li>
        </ul>
        <div class="premium-upsell-plans">
          <a class="premium-plan premium-plan--annual"
             href="${_escAttr(annualUrl)}"
             target="_blank" rel="noopener"
             onclick="_trackCheckoutStarted('annual')">
            <span class="premium-plan-save">${PREMIUM_ANNUAL_SAVINGS}</span>
            <span class="premium-plan-label">Annual</span>
            <span class="premium-plan-price">${PREMIUM_ANNUAL_PRICE}<small>/yr</small></span>
          </a>
          <a class="premium-plan"
             href="${_escAttr(monthlyUrl)}"
             target="_blank" rel="noopener"
             onclick="_trackCheckoutStarted('monthly')">
            <span class="premium-plan-label">Monthly</span>
            <span class="premium-plan-price">${PREMIUM_MONTHLY_PRICE}<small>/mo</small></span>
          </a>
        </div>
        <button class="premium-upsell-dismiss" type="button" onclick="_closePremiumUpsell()">Maybe later</button>
      </div>
    `;

    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add("is-open"));
  }

  function _closePremiumUpsell() {
    const m = document.getElementById("premium-upsell-modal");
    if (!m) return;
    m.classList.remove("is-open");
    setTimeout(() => { try { m.remove(); } catch {} }, 200);
  }

  function _trackCheckoutStarted(plan) {
    try {
      if (typeof trackEvent === "function") {
        trackEvent("premium_checkout_started", { plan });
      }
    } catch {}
  }

  /* ─── Settings tab renderer ──────────────────────────────────────────────
     Populates the existing `#subscription-status` container in the Settings
     tab. Async: app.js calls us synchronously from the tab-open handler and
     doesn't await — we just write into the DOM when we know. */

  async function renderSubscriptionStatus() {
    const el = document.getElementById("subscription-status");
    if (!el) return;
    el.innerHTML = '<p class="hint">Loading…</p>';

    const premium = await isPremium();

    // Launch mode: everything is unlocked. Tell the user that truthfully
    // rather than pretending they're "Premium" in a world where premium
    // doesn't yet exist.
    if (!PREMIUM_ENABLED) {
      el.innerHTML = `
        <p><strong>All features included</strong></p>
        <p class="hint">We're not charging during launch — every feature is unlocked.</p>
      `;
      return;
    }

    if (premium) {
      // Pull the period end date so we can show it. Ignore failures — we
      // already know they're premium, so worst case we just omit the date.
      let periodEnd = null;
      try {
        const c = _client();
        const uid = await _getUserId();
        if (c && uid) {
          const { data } = await c.from("subscriptions")
            .select("current_period_end, plan")
            .eq("user_id", uid)
            .maybeSingle();
          if (data?.current_period_end) periodEnd = new Date(data.current_period_end);
        }
      } catch {}

      const dateStr = periodEnd
        ? periodEnd.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
        : null;

      el.innerHTML = `
        <p><strong>Premium active</strong></p>
        ${dateStr ? `<p class="hint">Renews ${_escHtml(dateStr)}</p>` : ""}
        <a class="btn-secondary btn-sm" href="pricing.html">Manage subscription</a>
      `;
      return;
    }

    el.innerHTML = `
      <p><strong>Free plan</strong></p>
      <p class="hint">Upgrade to unlock AI plans, barcode scanning, and sharing.</p>
      <a class="btn-primary btn-sm" href="pricing.html">Upgrade to Premium</a>
    `;
  }

  /* ─── Exports ─────────────────────────────────────────────────────────── */

  if (typeof window !== "undefined") {
    window.Subscription = {
      isPremium,
      requirePremium,
      showPremiumUpsell,
      refreshStatus,
    };
    // Legacy global: app.js:150 calls this from the Settings-tab open handler.
    window.renderSubscriptionStatus = renderSubscriptionStatus;
    // Inline onclick handlers in the upsell modal need these on window.
    window._closePremiumUpsell = _closePremiumUpsell;
    window._trackCheckoutStarted = _trackCheckoutStarted;
  }
})();
