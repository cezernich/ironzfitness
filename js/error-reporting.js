// js/error-reporting.js
//
// Global error handling + crash reporting. Logs uncaught errors, unhandled
// promise rejections, and manually-reported caught errors to the existing
// Supabase analytics_events table via trackEvent('client_error', ...).
//
// NO external services (Sentry, Bugsnag) and NO new dependencies. Dedupes
// by type:message:lineno so the same error only reports once per session.
//
// Loaded FIRST in index.html so it catches errors from every module that
// loads after it. If the error fires before analytics.js has loaded and
// window.trackEvent is undefined, the payload is queued and flushed later.

(function () {
  "use strict";

  // ── Session id (random UUID per page load) ───────────────────────────────
  function _getSessionId() {
    try {
      let sid = sessionStorage.getItem("ironz_error_session_id");
      if (!sid) {
        sid = (typeof crypto !== "undefined" && crypto.randomUUID)
          ? crypto.randomUUID()
          : "err-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
        sessionStorage.setItem("ironz_error_session_id", sid);
      }
      return sid;
    } catch {
      return "err-" + Date.now();
    }
  }

  // ── Dedupe + pending queue ───────────────────────────────────────────────
  const _reportedErrors = new Set();
  const _pendingQueue = [];

  function _flushQueue() {
    if (!window.trackEvent || _pendingQueue.length === 0) return;
    while (_pendingQueue.length) {
      const payload = _pendingQueue.shift();
      try { window.trackEvent("client_error", payload); } catch {}
    }
  }

  // ── PII scrub ────────────────────────────────────────────────────────────
  // Strip anything that looks like an email, JWT, or Supabase key from
  // error messages and stack traces. Better to lose a few characters than
  // leak user credentials or auth tokens into analytics_events.
  function _scrub(str) {
    if (!str) return str;
    return String(str)
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "<email>")
      .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "<jwt>")
      .replace(/Bearer\s+[\w.-]+/gi, "Bearer <token>")
      .replace(/sb-[\w-]+-auth-token/g, "<sb-token>");
  }

  // ── Core reportError ─────────────────────────────────────────────────────
  function reportError(errorData) {
    try {
      if (!errorData || typeof errorData !== "object") return;

      // Dedupe: don't report the same error more than once per session.
      const key = (errorData.type || "unknown")
        + ":" + (errorData.message || "").slice(0, 200)
        + ":" + (errorData.lineno || "");
      if (_reportedErrors.has(key)) return;
      _reportedErrors.add(key);

      // Add context
      const payload = {
        type: errorData.type || "unknown",
        message: _scrub(errorData.message || ""),
        filename: errorData.filename || null,
        lineno: errorData.lineno || null,
        colno: errorData.colno || null,
        stack: _scrub(errorData.stack || ""),
        context: errorData.context || null,
        url: _scrub(window.location.href),
        userAgent: (navigator && navigator.userAgent) || "",
        timestamp: new Date().toISOString(),
        sessionId: _getSessionId(),
        appVersion: window.IRONZ_VERSION || "unknown",
      };

      // Also console.error when debug mode is on
      try {
        if (localStorage.getItem("ironz_debug") === "true") {
          console.error("[IronZ Error Report]", payload);
        }
      } catch {}

      // Log to Supabase via trackEvent (fire-and-forget).
      // If trackEvent isn't loaded yet, queue the payload and flush later.
      if (window.trackEvent) {
        _flushQueue();
        try { window.trackEvent("client_error", payload); } catch {}
      } else {
        _pendingQueue.push(payload);
        // Retry once trackEvent shows up. Poll at a cheap 500ms cadence
        // for up to 10 seconds so early-load errors still land.
        if (!window._errorReportFlushTimer) {
          window._errorReportFlushTimer = setInterval(() => {
            if (window.trackEvent) {
              _flushQueue();
              clearInterval(window._errorReportFlushTimer);
              window._errorReportFlushTimer = null;
            }
          }, 500);
          setTimeout(() => {
            if (window._errorReportFlushTimer) {
              clearInterval(window._errorReportFlushTimer);
              window._errorReportFlushTimer = null;
            }
          }, 10000);
        }
      }
    } catch {
      // The error handler must NEVER throw — that would infinite-loop.
    }
  }

  // ── Manual error reporting helper ────────────────────────────────────────
  //
  // Usage from any try/catch:
  //   try { await supabase.from('x').insert(row); }
  //   catch (e) { reportCaughtError(e, { context: 'sync', action: 'insert' }); }
  function reportCaughtError(error, context) {
    const msg = (error && error.message) || String(error || "Unknown error");
    const stack = (error && error.stack) ? String(error.stack).substring(0, 500) : "";
    reportError({
      type: "caught_error",
      message: msg,
      stack,
      context: context || null,
    });
  }

  // ── Global listeners ─────────────────────────────────────────────────────
  window.addEventListener("error", function (event) {
    try {
      reportError({
        type: "uncaught_error",
        message: event.message || "unknown",
        filename: event.filename || null,
        lineno: event.lineno || null,
        colno: event.colno || null,
        stack: event.error && event.error.stack
          ? String(event.error.stack).substring(0, 500)
          : "",
      });
    } catch {}
  });

  window.addEventListener("unhandledrejection", function (event) {
    try {
      const reason = event.reason;
      const msg = (reason && reason.message) ? reason.message : String(reason || "unknown");
      const stack = (reason && reason.stack) ? String(reason.stack).substring(0, 500) : "";
      reportError({
        type: "unhandled_rejection",
        message: msg,
        stack,
      });
    } catch {}
  });

  // ── Expose ───────────────────────────────────────────────────────────────
  if (typeof window !== "undefined") {
    window.reportError = reportError;
    window.reportCaughtError = reportCaughtError;
  }
})();
