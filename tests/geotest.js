const { chromium } = require('playwright-core');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const srv = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); }).listen(8774);
const DB = 'https://script.google.com/macros/s/AKfycbGEO/exec';
const t = (n, ok, extra = '') => console.log((ok ? 'PASS' : 'FAIL') + ' ' + n + (extra ? ' — ' + extra : ''));
async function run(b, name, backendGeocode) {
  const ctx = await b.newContext({ viewport: { width: 1000, height: 800 }, geolocation: { latitude: 23.2211, longitude: 88.3672, accuracy: 8 }, permissions: ['geolocation'] });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message)); const calls = []; page.on('dialog', d => d.type() === 'prompt' ? d.accept('GeoSurvey') : d.accept());
  await page.route(u => u.hostname === 'nominatim.openstreetmap.org', async r => { calls.push('osm'); await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ display_name: 'OSM address', address: { village: 'OSM Village', state_district: 'Purba Bardhaman', state: 'West Bengal', postcode: '713409', country: 'India' } }) }); });
  await page.route(u => u.hostname === 'script.google.com', async r => {
    const u = new URL(r.request().url()); const action = u.searchParams.get('action'); calls.push(action || 'post'); let out;
    if (action === 'schema') out = { ok: true, schema: null, ai: false, version: backendGeocode ? '1.15.8' : '1.15.4' };
    else if (action === 'list') out = { ok: true, rows: [], total: 0, version: '1.15.8' };
    else if (action === 'geocode') out = backendGeocode ? { ok: true, version: '1.15.8', place: { village: 'Baidyapur', block: 'Kalna II', district: 'Purba Bardhaman', state: 'West Bengal', postcode: '713122', country: 'India', full_address: 'Baidyapur, Kalna II, Purba Bardhaman, West Bengal 713122, India', source: 'google' } } : { ok: true, total: 3 };
    else out = { ok: false, error: 'unexpected', version: '1.15.8' };
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) });
  });
  await page.addInitScript(() => localStorage.setItem('gs_welcomed', '"x"'));
  await page.goto(`http://localhost:8774/?db=${encodeURIComponent(DB)}`); await page.waitForTimeout(600);
  await page.click('#obSample').catch(() => {}); await page.waitForTimeout(2500);
  const v = await page.evaluate(() => ({ village: getValue('village'), block: getValue('block'), district: getValue('district'), pin: getValue('postcode'), lat: getValue('latitude') }));
  const status = await page.textContent('#locStatus');
  await ctx.close(); return { v, status, calls, errors };
}
(async () => {
  const b = await chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: 'chrome' }) });
  let r = await run(b, 'google', true);
  t('backend geocoder used first', r.calls.includes('geocode') && !r.calls.includes('osm'), r.calls.join(','));
  t('village/block/district/PIN from Google', r.v.village === 'Baidyapur' && r.v.block === 'Kalna II' && r.v.district === 'Purba Bardhaman' && r.v.pin === '713122', JSON.stringify(r.v));
  t('status shows block and source', /Kalna II/.test(r.status) && /via Google/.test(r.status), r.status);
  t('no page errors', !r.errors.length, r.errors.join(','));
  r = await run(b, 'old', false);
  t('old backend: falls back to OpenStreetMap', r.calls.includes('geocode') && r.calls.includes('osm'), r.calls.join(','));
  t('OSM values applied', r.v.village === 'OSM Village' && r.v.district === 'Purba Bardhaman', JSON.stringify(r.v));
  t('status shows OSM source', /via OpenStreetMap/.test(r.status), r.status);
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
