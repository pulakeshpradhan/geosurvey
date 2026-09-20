/* GeoSurvey service worker — caches the app shell so the form opens offline.
 * CACHE is bumped on every release; shell requests always revalidate with the network first. */
const VERSION = '1.17.0';
const CACHE = 'geosurvey-v' + VERSION;
const SHELL = ['./', './index.html', './icon.svg', './manifest.json', ...['styles.css', 'config.js', 'qr.js', 'app.js', 'sav.js', 'exports.js', 'analysis.js', 'pdf.js', 'designer.js', 'stats-worker.js'].map(f => `./${f}?v=${VERSION}`)];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Only same-origin GETs (never cache Gemini / OpenRouter / Nominatim / Apps Script calls)
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Network-first with revalidation (bypasses the browser HTTP cache); cache is the offline fallback
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: false }).then(r => r || caches.match(e.request, { ignoreSearch: true })).then(r => r || caches.match('./index.html')))
  );
});
