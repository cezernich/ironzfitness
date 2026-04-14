// ux-level.js — UX Adaptation by Skill Level

// Levels: beginner, intermediate, advanced
// Beginner: simplified UI, more guidance, fewer options
// Intermediate: full features, moderate guidance
// Advanced: all features, no guidance, additional metrics

function getUXLevel() {
  // Manual override takes precedence
  try {
    const override = localStorage.getItem("uxLevelOverride");
    if (override && ["beginner", "intermediate", "advanced"].includes(override)) return override;
  } catch {}

  // Auto-detect from leveling system
  if (typeof getLevelProgress === "function") {
    try {
      const progress = getLevelProgress();
      return progress.current || "beginner";
    } catch {}
  }

  // Fallback: check profile
  try {
    const profile = JSON.parse(localStorage.getItem("profile")) || {};
    return profile.fitnessLevel || "beginner";
  } catch {}

  return "beginner";
}

function setUXLevelOverride(level) {
  if (["beginner", "intermediate", "advanced", "auto"].includes(level)) {
    if (level === "auto") {
      localStorage.removeItem("uxLevelOverride");
    } else {
      localStorage.setItem("uxLevelOverride", level);
    }
    applyUXLevel();
  }
}

function applyUXLevel() {
  const level = getUXLevel();
  document.documentElement.setAttribute("data-ux-level", level);

  // Update the UX level selector if visible
  const sel = document.getElementById("ux-level-select");
  const override = localStorage.getItem("uxLevelOverride");
  if (sel) sel.value = override || "auto";
}

// Apply on load
document.addEventListener("DOMContentLoaded", applyUXLevel);

// ── Guidance tooltips for beginners ──────────────────────────────────────────

function buildGuidanceTooltip(text) {
  return `<div class="ux-guidance">${typeof ICONS !== "undefined" ? ICONS.lightbulb : ""} ${text}</div>`;
}
