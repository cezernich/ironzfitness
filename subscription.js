// subscription.js — Subscription & Pricing Infrastructure
// Phase 3.3: Free/premium tiers, trial, feature gating, paywall.

/* =====================================================================
   TIER DEFINITIONS
   ===================================================================== */

const SUBSCRIPTION_TIERS = {
  free: {
    name: "Free",
    price: 0,
    features: [
      "1 active training plan",
      "Basic nutrition logging (manual + quick-add)",
      "Hydration tracking",
      "Community workout browse",
      "Weekly check-in",
    ],
    limits: {
      activePlans: 1,
      savedWorkouts: 5,
      aiGenerationsPerDay: 0,
      photoMealLogging: false,
      barcodeScan: false,
      groceryList: false,
      advancedStats: false,
    },
  },
  premium: {
    name: "Premium",
    monthlyPrice: 7.99,
    annualPrice: 59.99,
    features: [
      "Unlimited training plans",
      "AI workout generation",
      "AI meal suggestions & grocery lists",
      "Photo AI meal logging",
      "Barcode scanning",
      "20 saved workout templates",
      "Advanced stats & insights",
      "Weekly check-in insights",
      "Priority support",
    ],
    limits: {
      activePlans: 999,
      savedWorkouts: 20,
      aiGenerationsPerDay: 50,
      photoMealLogging: true,
      barcodeScan: true,
      groceryList: true,
      advancedStats: true,
    },
  },
};

/* =====================================================================
   SUBSCRIPTION STATE
   ===================================================================== */

function getSubscription() {
  try {
    return JSON.parse(localStorage.getItem("subscription") || "null") || {
      tier: "free",
      trialStarted: null,
      trialEnded: false,
      subscribedAt: null,
      billingCycle: null,
      cancelledAt: null,
    };
  } catch {
    return { tier: "free", trialStarted: null, trialEnded: false };
  }
}

function saveSubscription(sub) {
  localStorage.setItem("subscription", JSON.stringify(sub));
}

function getCurrentTier() {
  const sub = getSubscription();

  // Active premium subscription
  if (sub.tier === "premium" && !sub.cancelledAt) return "premium";

  // Active trial (7 days from start)
  if (sub.trialStarted && !sub.trialEnded) {
    const trialEnd = new Date(sub.trialStarted);
    trialEnd.setDate(trialEnd.getDate() + 7);
    if (new Date() < trialEnd) return "premium";
    // Trial expired
    sub.trialEnded = true;
    saveSubscription(sub);
  }

  return "free";
}

function isPremium() {
  return getCurrentTier() === "premium";
}

function getTrialDaysRemaining() {
  const sub = getSubscription();
  if (!sub.trialStarted || sub.trialEnded) return 0;
  const trialEnd = new Date(sub.trialStarted);
  trialEnd.setDate(trialEnd.getDate() + 7);
  const remaining = Math.ceil((trialEnd - new Date()) / 86400000);
  return Math.max(0, remaining);
}

function isInTrial() {
  const sub = getSubscription();
  return sub.trialStarted && !sub.trialEnded && getTrialDaysRemaining() > 0;
}

/* =====================================================================
   FEATURE GATING
   ===================================================================== */

/**
 * Check if a specific feature is available in the current tier.
 * Returns true if available, false if paywalled.
 */
function hasFeature(featureName) {
  const tier = getCurrentTier();
  const limits = SUBSCRIPTION_TIERS[tier]?.limits;
  if (!limits) return true;

  switch (featureName) {
    case "aiGeneration": return limits.aiGenerationsPerDay > 0;
    case "photoMeal": return limits.photoMealLogging;
    case "barcodeScan": return limits.barcodeScan;
    case "groceryList": return limits.groceryList;
    case "advancedStats": return limits.advancedStats;
    case "unlimitedPlans": return limits.activePlans > 1;
    case "unlimitedSaved": return limits.savedWorkouts > 5;
    default: return true;
  }
}

/**
 * Gate a feature — if not available, show paywall and return false.
 * Use before executing premium actions.
 */
function requireFeature(featureName, context) {
  if (hasFeature(featureName)) return true;
  showPaywall(context || featureName);
  return false;
}

/* =====================================================================
   TRIAL ACTIVATION
   ===================================================================== */

function startFreeTrial() {
  const sub = getSubscription();
  if (sub.trialStarted) return; // Already started
  sub.trialStarted = new Date().toISOString();
  sub.trialEnded = false;
  saveSubscription(sub);
  closePaywall();
  renderSubscriptionStatus();
}

/* =====================================================================
   SUBSCRIPTION ACTIONS (simulated — no real payment)
   ===================================================================== */

function subscribePremium(cycle) {
  const sub = getSubscription();
  sub.tier = "premium";
  sub.billingCycle = cycle; // "monthly" or "annual"
  sub.subscribedAt = new Date().toISOString();
  sub.cancelledAt = null;
  sub.trialEnded = true;
  saveSubscription(sub);
  closePaywall();
  renderSubscriptionStatus();
}

function cancelSubscription() {
  if (!confirm("Cancel your Premium subscription? You'll keep access until the end of your billing period.")) return;
  const sub = getSubscription();
  sub.cancelledAt = new Date().toISOString();
  saveSubscription(sub);
  renderSubscriptionStatus();
}

/* =====================================================================
   PAYWALL MODAL
   ===================================================================== */

function showPaywall(context) {
  const overlay = document.getElementById("paywall-overlay");
  if (!overlay) return;

  const sub = getSubscription();
  const canTrial = !sub.trialStarted;
  const annualMonthly = (SUBSCRIPTION_TIERS.premium.annualPrice / 12).toFixed(2);
  const annualSavings = Math.round((1 - SUBSCRIPTION_TIERS.premium.annualPrice / (SUBSCRIPTION_TIERS.premium.monthlyPrice * 12)) * 100);

  const contextMessages = {
    aiGeneration: "AI workout generation is a Premium feature",
    photoMeal: "Photo meal logging is a Premium feature",
    barcodeScan: "Barcode scanning is a Premium feature",
    groceryList: "Grocery lists are a Premium feature",
    advancedStats: "Advanced stats are a Premium feature",
    unlimitedPlans: "Multiple training plans require Premium",
    unlimitedSaved: "More than 5 saved workouts requires Premium",
  };

  const content = document.getElementById("paywall-content");
  if (!content) return;

  content.innerHTML = `
    <div class="pw-header">
      <div class="pw-logo">${ICONS.zap} IronZ Premium</div>
      <p class="pw-context">${escHtml(contextMessages[context] || "Upgrade to Premium to unlock all features")}</p>
    </div>

    <div class="pw-features">
      ${SUBSCRIPTION_TIERS.premium.features.map(f =>
        `<div class="pw-feature">${ICONS.check} <span>${escHtml(f)}</span></div>`
      ).join("")}
    </div>

    <div class="pw-pricing">
      <button class="pw-plan pw-plan--annual" onclick="subscribePremium('annual')">
        <div class="pw-plan-badge">Best Value</div>
        <div class="pw-plan-name">Annual</div>
        <div class="pw-plan-price">$${annualMonthly}<span>/mo</span></div>
        <div class="pw-plan-total">$${SUBSCRIPTION_TIERS.premium.annualPrice}/year · Save ${annualSavings}%</div>
      </button>
      <button class="pw-plan" onclick="subscribePremium('monthly')">
        <div class="pw-plan-name">Monthly</div>
        <div class="pw-plan-price">$${SUBSCRIPTION_TIERS.premium.monthlyPrice}<span>/mo</span></div>
        <div class="pw-plan-total">Billed monthly</div>
      </button>
    </div>

    ${canTrial ? `
      <button class="btn-primary pw-trial-btn" onclick="startFreeTrial()">
        Start 7-Day Free Trial
      </button>
      <p class="pw-trial-note">No payment required. Full Premium access for 7 days.</p>
    ` : ""}

    <button class="pw-skip-btn" onclick="closePaywall()">Maybe Later</button>
  `;

  overlay.style.display = "flex";
}

function closePaywall() {
  const overlay = document.getElementById("paywall-overlay");
  if (overlay) overlay.style.display = "none";
}

/* =====================================================================
   SUBSCRIPTION STATUS (Settings)
   ===================================================================== */

function renderSubscriptionStatus() {
  const container = document.getElementById("subscription-status");
  if (!container) return;

  const sub = getSubscription();
  const tier = getCurrentTier();
  const trialDays = getTrialDaysRemaining();

  let html = "";

  if (tier === "premium" && isInTrial()) {
    html = `
      <div class="sub-status sub-status--trial">
        <div class="sub-status-badge">Premium Trial</div>
        <p class="sub-status-detail">${trialDays} day${trialDays !== 1 ? "s" : ""} remaining</p>
        <button class="btn-primary btn-sm" onclick="showPaywall()">Subscribe Now</button>
      </div>`;
  } else if (tier === "premium") {
    const cycle = sub.billingCycle === "annual" ? "Annual" : "Monthly";
    html = `
      <div class="sub-status sub-status--premium">
        <div class="sub-status-badge">${ICONS.zap} Premium ${cycle}</div>
        <p class="sub-status-detail">Active since ${new Date(sub.subscribedAt).toLocaleDateString()}</p>
        <button class="btn-secondary btn-sm" onclick="cancelSubscription()">Cancel Subscription</button>
      </div>`;
  } else {
    html = `
      <div class="sub-status sub-status--free">
        <div class="sub-status-badge">Free Plan</div>
        <p class="sub-status-detail">Upgrade to unlock AI features, barcode scanning, and more.</p>
        <button class="btn-primary btn-sm" onclick="showPaywall()">Upgrade to Premium</button>
      </div>`;
  }

  container.innerHTML = html;
}
