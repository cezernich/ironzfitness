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
// Race a getSession() call against a timeout so a stuck gotrue-js
// auth-token lock doesn't hang the caller forever. Same root cause as
// the coach-invite Accept modal bug from 2026-04-30 — when supabase-js's
// internal lock is held by a refresh that never completes, getSession()
// (and refreshSession(), and any other auth-touching call) waits on the
// lock and never returns. The user previously had to refresh the whole
// page; now we surface the timeout cleanly and try a forceful refresh
// before giving up.
async function _getSessionWithTimeout(ms) {
  return Promise.race([
    window.supabaseClient.auth.getSession(),
    new Promise((_, reject) => setTimeout(() => reject(new Error("auth_lock_timeout")), ms)),
  ]);
}

async function callAI({ messages, model, max_tokens, system }) {
  if (!window.supabaseClient) {
    throw new Error("Supabase not initialized");
  }

  // First attempt: 8s race. Generous enough for a slow network /
  // legitimate refresh to complete; tight enough that a stuck lock
  // surfaces as an error users can react to.
  let session;
  try {
    const result = await _getSessionWithTimeout(8000);
    session = result?.data?.session;
  } catch (err) {
    if (err && err.message === "auth_lock_timeout") {
      // Force a refresh to try to break the lock free, then retry
      // getSession one more time. If the refresh also hangs, we bail
      // with a user-actionable error instead of an infinite spinner.
      console.warn("[callAI] getSession hung — forcing refreshSession");
      try {
        await Promise.race([
          window.supabaseClient.auth.refreshSession(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("refresh_timeout")), 5000)),
        ]);
      } catch (refreshErr) {
        console.warn("[callAI] refreshSession also hung:", refreshErr);
        throw new Error("Couldn't reach IronZ — tap Estimate again, or refresh the page if it keeps hanging.");
      }
      try {
        const retry = await _getSessionWithTimeout(5000);
        session = retry?.data?.session;
      } catch (retryErr) {
        console.warn("[callAI] retry getSession failed:", retryErr);
        throw new Error("Couldn't reach IronZ — tap Estimate again, or refresh the page if it keeps hanging.");
      }
    } else {
      throw err;
    }
  }

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

  // Same auth-lock race + recovery as callAI above. Without this,
  // any Ask IronZ surface (homepage Q&A, training plan rationale, etc.)
  // could hang indefinitely if the gotrue-js refresh lock is stuck.
  let session;
  try {
    const result = await _getSessionWithTimeout(8000);
    session = result?.data?.session;
  } catch (err) {
    if (err && err.message === "auth_lock_timeout") {
      try {
        await Promise.race([
          window.supabaseClient.auth.refreshSession(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("refresh_timeout")), 5000)),
        ]);
        const retry = await _getSessionWithTimeout(5000);
        session = retry?.data?.session;
      } catch {
        throw new Error("Couldn't reach IronZ — tap again, or refresh the page if it keeps hanging.");
      }
    } else {
      throw err;
    }
  }

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
