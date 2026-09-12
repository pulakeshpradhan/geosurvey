/* GeoSurvey service worker — caches the app shell so the form opens offline.
 * Bump CACHE when deploying changes to index.html / app.js / styles.css. */
const CACHE = 'geosurvey-v1.5.4';
const SHELL = ['./', './index.html', './app.js', './exports.js', './analysis.js', './pdf.js', './stats-worker.js', './styles.css', './icon.svg', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Only handle same-origin GETs (never cache Gemini / Nominatim / Apps Script calls)
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Network-first so updates land immediately; fall back to cache when offline
  e.respondWith(
    fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
