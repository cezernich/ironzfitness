// config.js — App configuration & shared utilities
// ⚠️  Copy this file to config.js and add your API key.
//    Never commit config.js to a public repo.

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
  // Paste your Anthropic API key here.
  // Get one at: https://console.anthropic.com/settings/keys
  // For production, proxy API calls through a backend server instead.
  anthropicApiKey: 'YOUR_ANTHROPIC_API_KEY',
};
