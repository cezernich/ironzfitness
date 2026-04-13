// js/sentry-init.js
//
// Initialize Sentry error tracking. The Sentry Browser SDK CDN bundle is
// loaded in index.html immediately before this file; here we just call
// Sentry.init with the project DSN and fire a sentry_initialized analytics
// event so we can measure init reliability in our own telemetry.
//
// bundle.min.js is the error-tracking-only bundle — NO performance
// monitoring and NO session replay. If we ever want those, swap the
// CDN URL in index.html for bundle.tracing.replay.min.js and add the
// corresponding integrations here.
//
// Sentry's Browser SDK auto-installs GlobalHandlers which hooks
// window.onerror and window.onunhandledrejection, so unhandled promise
// rejections are captured automatically — no extra listener needed. The
// existing js/error-reporting.js listeners stay in place and continue
// writing to analytics_events for our own dashboards; Sentry is an
// additional destination, not a replacement.

(function () {
  "use strict";

  // Public DSN — safe to commit. Sentry DSNs only authorize sending events
  // from the browser, never reading them; the project key is designed to be
  // embedded in client-side code.
  const SENTRY_DSN = "https://072ff4648ce1ac6ad52f87eb8a2c4a3f@o4511213148176384.ingest.us.sentry.io/4511213159317504";
  const SENTRY_ENVIRONMENT = "production";
  // tracesSampleRate is a no-op without the browser-tracing integration
  // (which we deliberately don't load — bundle.min.js is error tracking
  // only). Kept at 0.1 to match what the rest of the codebase expects in
  // case we turn on performance monitoring later.
  const SENTRY_TRACES_SAMPLE_RATE = 0.1;

  if (typeof window === "undefined") return;

  if (typeof window.Sentry === "undefined") {
    console.warn("[IronZ] Sentry SDK not loaded — skipping init");
    return;
  }

  if (!SENTRY_DSN) {
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
