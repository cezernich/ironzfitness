// service-worker.js — Basic PWA service worker for IronZ
// Provides offline support and enables "Add to Home Screen"
//
// Cache version: bump this string any time you want to force every client
// to drop the old cache and re-fetch everything from the network. The
// activate handler deletes any cache whose name doesn't match CACHE_NAME.
const CACHE_NAME = "ironz-v6";
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/style.css",
  "/app.js",
  "/workouts.js",
  "/calendar.js",
  "/planner.js",
  "/nutrition.js",
  "/meals-data.js",
  "/hydration.js",
  "/exercise-library.js",
  "/fueling.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {
        // Silently handle cache failures for missing files
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Only touch same-origin requests — let the browser handle cross-origin
  // (Supabase, Strava, CDNs) without our intervention.
  if (url.origin !== self.location.origin) return;

  // For JS / CSS / HTML, bypass the browser's HTTP cache so we always get
  // the latest deploy. GitHub Pages sets max-age=600 on text assets, which
  // otherwise strands users on stale JS for up to 10 minutes after a push.
  const isSourceAsset = /\.(js|mjs|css|html)$/i.test(url.pathname) || url.pathname === "/";

  event.respondWith(
    fetch(req, isSourceAsset ? { cache: "no-store" } : {})
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return response;
      })
      .catch(() => caches.match(req))
  );
});
