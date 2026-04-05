// config.js — App configuration & shared utilities
// ⚠️  Never commit this file to a public repo or share its contents.

/**
 * Shared HTML escape — use this for ALL user-controlled data injected into innerHTML.
 * Prevents XSS from localStorage-stored user input.
 */
function escHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Generate a unique ID. Avoids Date.now() collisions during batch operations.
 */
function generateId(prefix) {
  return (prefix ? prefix + "-" : "") + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

const APP_CONFIG = {
  // API key is read from localStorage (set via Settings > API Key).
  get anthropicApiKey() {
    return localStorage.getItem('anthropicApiKey') || 'YOUR_ANTHROPIC_API_KEY';
  },
};
