// js/sentry-init.js
//
// Initialize Sentry error tracking. The Sentry CDN bundle is loaded in
// index.html immediately before this file; here we just call Sentry.init
// with the project DSN and fire a sentry_initialized analytics event so
// we can measure init reliability in our own telemetry.
//
// Replace PLACEHOLDER_SENTRY_DSN with the real DSN from sentry.io after
// you create the Browser JavaScript project. Until it's replaced the
// init call is a no-op — we don't want to surface "invalid DSN" warnings
// during local dev or before the Sentry project exists.
//
// Sentry's Browser SDK auto-installs GlobalHandlers which hooks
// window.onerror and window.onunhandledrejection, so unhandled promise
// rejections are captured automatically — no extra listener needed. The
// existing js/error-reporting.js listeners stay in place and continue
// writing to analytics_events for our own dashboards; Sentry is an
// additional destination, not a replacement.

(function () {
  "use strict";

  const SENTRY_DSN = "PLACEHOLDER_SENTRY_DSN";
  const SENTRY_ENVIRONMENT = "production";
  const SENTRY_TRACES_SAMPLE_RATE = 0.1;

  if (typeof window === "undefined") return;

  if (typeof window.Sentry === "undefined") {
    console.warn("[IronZ] Sentry SDK not loaded — skipping init");
    return;
  }

  // Skip init when the placeholder is still in place. Avoids the "Invalid
  // DSN" warning the Sentry SDK would otherwise log on every page load
  // during local dev.
  if (!SENTRY_DSN || SENTRY_DSN === "PLACEHOLDER_SENTRY_DSN") {
    console.log("[IronZ] Sentry DSN not configured — error tracking disabled");
    return;
  }

  try {
    window.Sentry.init({
      dsn: SENTRY_DSN,
      environment: SENTRY_ENVIRONMENT,
      tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
      release: window.IRONZ_VERSION || undefined,
    });
    window.__sentryInitialized = true;

    // Fire `sentry_initialized` once analytics.js has loaded. Script load
    // order across tags isn't guaranteed to have analytics.js ready yet,
    // so poll for window.trackEvent the same way error-reporting.js does.
    function _fireInitEvent() {
      if (typeof window.trackEvent === "function") {
        try {
          window.trackEvent("sentry_initialized", {
            environment: SENTRY_ENVIRONMENT,
            sample_rate: SENTRY_TRACES_SAMPLE_RATE,
          });
        } catch {}
        return true;
      }
      return false;
    }
    if (!_fireInitEvent()) {
      const tick = setInterval(() => { if (_fireInitEvent()) clearInterval(tick); }, 500);
      setTimeout(() => clearInterval(tick), 10000);
    }
  } catch (e) {
    console.warn("[IronZ] Sentry init failed:", e && e.message);
  }
})();
