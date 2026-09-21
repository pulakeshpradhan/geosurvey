const { chromium } = require('playwright-core'); const jsQR = require('jsqr');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
}).listen(8771);
const DB = 'https://script.google.com/macros/s/AKfycbSTREAM/exec'; const KEY = 'GeoSurvey';
const sheet = [{ id: 'other-1', submitted_at: '2026-09-18T10:00:00Z', head_name: 'Ravi Das', surveyor: 'Bimal', device_id: 'dev-other', photo_count: 0 }];
(async () => {
  const b = await chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: 'chrome' }) });
  const ctx = await b.newContext({ viewport: { width: 1000, height: 800 } }); const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); const calls = []; let promptAnswer = null;
  page.on('dialog', async d => { if (d.type() === 'prompt') { if (promptAnswer === null) await d.dismiss(); else await d.accept(promptAnswer); } else await d.accept(); });
  await page.route(u => /nominatim|generativelanguage/.test(u.hostname), r => r.abort());
  await page.route(u => u.hostname === 'script.google.com', async r => {
    const u = new URL(r.request().url()); const method = r.request().method(); const action = u.searchParams.get('action');
    const body = method === 'POST' ? JSON.parse(r.request().postData() || '{}') : {}; let out;
    if (action === 'schema') out = { ok: true, schema: null, ai: false, version: '1.15.5' };
    else if (action === 'list') {
      const tok = u.searchParams.get('token'), dev = u.searchParams.get('device'); calls.push('list:' + (tok ? 'token=' + tok : dev ? 'device' : 'none'));
      if (tok === KEY) out = { ok: true, rows: sheet.slice().reverse(), total: sheet.length, sheetUrl: 'x', version: '1.15.5' };
      else if (tok) out = { ok: false, error: 'Invalid admin token', version: '1.15.5' };
      else if (dev) out = { ok: true, rows: sheet.filter(r => r.device_id === dev).reverse(), total: 0, version: '1.15.5' };
      else out = { ok: false, error: 'NO_TOKEN', version: '1.15.5' };
    } else if (method === 'POST' && !body.action) { calls.push('post'); sheet.push({ id: body.id, submitted_at: body.submitted_at, head_name: body.head_name, surveyor: body.surveyor, device_id: body.device_id, photo_count: body.photo_count || 0, photo_urls: body.photos && body.photos.length ? 'https://drive.google.com/file/d/P1/view' : '' }); out = { ok: true, id: body.id, row: 2, photo_urls: body.photos && body.photos.length ? 'https://drive.google.com/file/d/P1/view' : '', audio_urls: '', transcript_url: '', version: '1.15.5' }; }
    else out = { ok: false, error: 'unexpected', version: '1.15.5' };
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) });
  });
  const t = (n, ok, extra = '') => console.log((ok ? 'PASS' : 'FAIL') + ' ' + n + (extra ? ' — ' + extra : ''));
  const rows = () => page.$$eval('#localTable tbody tr', trs => trs.map(tr => tr.querySelector('.pill').textContent + ':' + tr.querySelectorAll('td')[4].textContent));
  await page.addInitScript(() => { try { localStorage.setItem('gs_welcomed', '"x"'); } catch {} }); await page.goto(`http://localhost:8771/?db=${encodeURIComponent(DB)}`); await page.waitForTimeout(700);
  await page.click('#obSample').catch(() => {}); await page.waitForTimeout(300);
  const dev = await page.evaluate(() => JSON.parse(localStorage.getItem('gs_settings')).deviceId);
  t('device id generated and persisted', typeof dev === 'string' && dev.length > 10, dev);
  // one record with a photo, one without
  await page.evaluate(async () => { const r = getRecords(); r.unshift({ id: 'loc-1', submitted_at: new Date().toISOString(), surveyor: 'Asha', head_name: 'With Photo', device_id: settings.deviceId, photo_count: 1, status: 'pending' }); r.unshift({ id: 'loc-2', submitted_at: new Date().toISOString(), surveyor: 'Asha', head_name: 'No Photo', device_id: settings.deviceId, photo_count: 0, status: 'pending' }); saveRecords(r); await PhotoDB.put('loc-1', [{ name: 'p.jpg', dataUrl: 'data:image/jpeg;base64,/9j/4AAQ' }], []); });
  await page.click('.tab[data-view="responsesView"]'); await page.waitForTimeout(400);
  t('before sync: two pending rows', JSON.stringify(await rows()) === '["pending:No Photo","pending:With Photo"]', JSON.stringify(await rows()));
  calls.length = 0; await page.click('#syncBtn'); await page.waitForTimeout(900);
  t('Sync posts both, then lists by device id (no key)', calls.filter(c => c === 'post').length === 2 && calls.includes('list:device') && !calls.some(c => c.startsWith('list:token')), calls.join(','));
  const local = await page.evaluate(() => getRecords().length); const idb = await page.evaluate(async () => (await PhotoDB.get('loc-1')).length);
  t('local copies and photos removed after sync', local === 0 && idb === 0, `records=${local} photos=${idb}`);
  const shown = await rows();
  t('own records now stream from the database, not the other phone\'s', shown.length === 2 && shown.every(r => r.startsWith('database:')) && !shown.some(r => /Ravi/.test(r)), JSON.stringify(shown));
  t('Drive link shown for the photo record', (await page.$$eval('#localTable a[href*="drive.google.com"]', a => a.length)) === 1);
  t('summary says "of your records"', /of your record/.test(await page.textContent('#localSummary')), await page.textContent('#localSummary'));
  // Sync all with key → whole sheet
  promptAnswer = KEY; calls.length = 0; await page.click('#syncAllBtn'); await page.waitForTimeout(700);
  const all = await rows();
  t('Sync all with key shows every row incl. other phones', all.length === 3 && all.some(r => /Ravi/.test(r)), JSON.stringify(all));
  // Cache survives offline reload
  await ctx.setOffline(true); await page.reload().catch(() => {}); await page.waitForTimeout(700);
  await page.click('.tab[data-view="responsesView"]').catch(() => {}); await page.waitForTimeout(400);
  t('offline: cached database rows still listed', (await rows()).length === 3, JSON.stringify(await rows()));
  await ctx.setOffline(false);
  // QR popup
  await page.click('#qrBtn'); await page.waitForTimeout(300);
  t('QR dialog opens with an SVG', await page.$eval('#qrDlg', d => d.open) && (await page.$('#qrCode svg')) !== null);
  const linkText = await page.textContent('#qrLink');
  t('link text is the team link', linkText === `http://localhost:8771/?db=${encodeURIComponent(DB)}`, linkText);
  const png = await (await page.$('#qrCode svg')).screenshot({ type: 'png' });
  // decode the rendered QR from the screenshot via a tiny PNG→RGBA path using the browser itself
  const decoded = await page.evaluate(async b64 => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, c.width, c.height); return { w: c.width, h: c.height, data: Array.from(d.data) }; }, png.toString('base64'));
  const r = jsQR(new Uint8ClampedArray(decoded.data), decoded.w, decoded.h);
  t('rendered QR decodes to the team link', !!r && r.data === linkText, r ? r.data.slice(0, 60) : 'no decode');
  await page.screenshot({ path: 'out/qr-dialog.png' });
  await page.click('#qrClose'); t('QR dialog closes', !(await page.$eval('#qrDlg', d => d.open)));
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
