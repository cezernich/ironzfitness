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

  // 45-second timeout so a hanging Edge Function doesn't strand the
  // caller forever in their loading state. Anthropic typically
  // responds in 1-5s for haiku-class requests; 45s is generous.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  let response;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/ask-ironz`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
        "apikey": SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        messages,
        model: model || "claude-haiku-4-5-20251001",
        max_tokens: max_tokens || 1024,
        ...(system && { system }),
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("AI is taking longer than usual — try again in a moment.");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  const data = await response.json();

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error(data.message || "Rate limit exceeded. Try again tomorrow.");
    }
    if (response.status === 401) {
      throw new Error(data.debug || data.error || "Session expired. Please sign in again.");
    }
    throw new Error(data.error?.message || data.error || data.message || "AI request failed");
  }

  // If the Anthropic API itself returned an error
  if (data.error) {
    throw new Error(data.error.message || "AI service error");
  }

  return data;
}

/**
 * callAskIronZ — Send a coaching question to the philosophy-aware Ask IronZ Edge Function.
 *
 * @param {Object} opts
 * @param {string} opts.question   - The user's question (required)
 * @param {Object} [opts.profile]  - Extra profile context (optional, merged with DB profile)
 * @param {Object} [opts.context]  - Extra context like { sport, race_type } (optional)
 * @returns {Promise<Object>}      - { answer, modules_used, modules_count, _remaining }
 */
async function callAskIronZ({ question, profile, context }) {
  if (!window.supabaseClient) {
    throw new Error("Supabase not initialized");
  }

  const { data: { session } } = await window.supabaseClient.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Please sign in to use AI features");
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/ask-ironz`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.access_token}`,
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      question,
      ...(profile && { profile }),
      ...(context && { context }),
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
    throw new Error(data.error || data.message || "AI request failed");
  }

  return data;
}
