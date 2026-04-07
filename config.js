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
  // AI requests are proxied through a Supabase Edge Function.
  // No API key needed on the client — the key lives server-side.
};

/**
 * callAI — Send a request to the Claude API via the Supabase Edge Function proxy.
 * Handles auth, rate limiting, and error handling in one place.
 *
 * @param {Object} opts
 * @param {Array}  opts.messages   - Claude messages array (required)
 * @param {string} [opts.model]    - Model ID (default: claude-haiku-4-5-20251001)
 * @param {number} [opts.max_tokens] - Max tokens (default: 1024, server caps at 4096)
 * @param {string} [opts.system]   - System prompt (optional)
 * @returns {Promise<Object>}      - The Anthropic API response JSON
 */
async function callAI({ messages, model, max_tokens, system }) {
  if (!window.supabaseClient) {
    throw new Error("Supabase not initialized");
  }

  // Get the current user's session token
  const { data: { session } } = await window.supabaseClient.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Please sign in to use AI features");
  }

  const supabaseUrl = window.supabaseClient.supabaseUrl || SUPABASE_URL;
  const response = await fetch(`${supabaseUrl}/functions/v1/ai-proxy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      messages,
      model: model || "claude-haiku-4-5-20251001",
      max_tokens: max_tokens || 1024,
      ...(system && { system }),
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error(data.message || "Rate limit exceeded. Try again tomorrow.");
    }
    if (response.status === 401) {
      throw new Error("Session expired. Please sign in again.");
    }
    throw new Error(data.error?.message || data.error || data.message || "AI request failed");
  }

  // If the Anthropic API itself returned an error
  if (data.error) {
    throw new Error(data.error.message || "AI service error");
  }

  return data;
}
