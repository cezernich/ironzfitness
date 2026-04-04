// safety-guardrails.js — Nutrition safety checks and wellness disclaimers
// Phase 1.4: Minimum calorie floors, low-intake warnings, professional referral prompts

const SAFETY_MIN_CALORIES_FEMALE = 1200;
const SAFETY_MIN_CALORIES_MALE = 1500;
const SAFETY_DANGER_THRESHOLD = 800; // cal/day — trigger concern alert
const SAFETY_DANGER_CONSECUTIVE_DAYS = 3;
const SAFETY_MIN_PROTEIN_PER_LB = 0.6; // grams per lb bodyweight

const SAFETY_DISCLAIMER = "These are general wellness suggestions, not medical advice. Consult a healthcare professional before making significant dietary changes.";

const NEDA_RESOURCES = {
  text: "If you or someone you know is struggling with an eating disorder, help is available.",
  phone: "NEDA Helpline: 1-800-931-2237",
  url: "https://www.nationaleatingdisorders.org/help-support/contact-helpline",
};

/**
 * Check if user has logged dangerously low calories for multiple consecutive days.
 * Returns a warning object or null.
 */
function checkLowCalorieWarning() {
  let meals = [];
  try { meals = JSON.parse(localStorage.getItem("meals") || "[]"); } catch {}
  if (!meals.length) return null;

  const today = new Date();
  const recentDays = [];
  for (let i = 0; i < SAFETY_DANGER_CONSECUTIVE_DAYS; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    recentDays.push(d.toISOString().slice(0, 10));
  }

  let lowDays = 0;
  for (const dateStr of recentDays) {
    const dayMeals = meals.filter(m => m.date === dateStr);
    if (dayMeals.length === 0) continue; // no meals logged = not trackable
    const totalCal = dayMeals.reduce((sum, m) => sum + (m.calories || 0), 0);
    if (totalCal > 0 && totalCal < SAFETY_DANGER_THRESHOLD) {
      lowDays++;
    }
  }

  if (lowDays >= SAFETY_DANGER_CONSECUTIVE_DAYS) {
    return {
      type: "low-calorie",
      message: `Your calorie intake has been under ${SAFETY_DANGER_THRESHOLD} cal/day for ${lowDays} days. This is below recommended minimums and may affect your health and performance.`,
      resources: NEDA_RESOURCES,
    };
  }
  return null;
}

/**
 * Check if a manual calorie target is below the safety floor.
 * Called when user adjusts nutrition targets via slider.
 */
function checkCalorieFloor(calories) {
  let profile = {};
  try { profile = JSON.parse(localStorage.getItem("profile") || "{}"); } catch {}
  const gender = profile.gender || "";
  const floor = gender === "female" ? SAFETY_MIN_CALORIES_FEMALE : SAFETY_MIN_CALORIES_MALE;

  if (calories < floor) {
    return {
      type: "below-floor",
      floor: floor,
      message: `${calories} calories is below the recommended minimum of ${floor} cal/day. Very low calorie diets should only be followed under medical supervision.`,
    };
  }
  return null;
}

/**
 * Renders the safety warning banner if applicable.
 * Should be called in the nutrition section of the day detail.
 */
function renderSafetyWarning() {
  const warning = checkLowCalorieWarning();
  if (!warning) return "";

  return `
    <div class="safety-warning">
      <div class="safety-warning-icon">${ICONS.warning}</div>
      <div class="safety-warning-body">
        <div class="safety-warning-text">${warning.message}</div>
        <div class="safety-warning-resources">
          <p>${warning.resources.text}</p>
          <p>${warning.resources.phone}</p>
          <a href="${warning.resources.url}" target="_blank" rel="noopener">Get Support</a>
        </div>
      </div>
    </div>`;
}

/**
 * Returns the standard AI disclaimer HTML.
 */
function getAIDisclaimer() {
  return `<p class="ai-disclaimer">${SAFETY_DISCLAIMER}</p>`;
}
