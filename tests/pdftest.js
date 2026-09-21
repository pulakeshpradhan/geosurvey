const { chromium } = require('playwright-core');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..'); const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const srv = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); }).listen(8785);
const DB = 'https://script.google.com/macros/s/AKfycbPDF/exec';
const t = (n, ok, extra = '') => console.log((ok ? 'PASS' : 'FAIL') + ' ' + n + (extra ? ' — ' + extra : ''));
// 1x1 JPEG
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKpgA//Z';
(async () => {
  const b = await chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: 'chrome' }) });
  const ctx = await b.newContext({ viewport: { width: 1100, height: 800 }, acceptDownloads: true }); const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.type() === 'prompt' ? d.accept('GeoSurvey') : d.accept());
  await page.route(u => /nominatim/.test(u.hostname), r => r.abort());
  await page.route(u => u.hostname === 'script.google.com', async r => { const u = new URL(r.request().url()); const a = u.searchParams.get('action'); let out; if (a === 'schema') out = { ok: true, schema: null, active: '', questionnaires: [], ai: false, version: '1.17.4' }; else if (a === 'list') out = { ok: true, rows: [{ id: 'db-1', submitted_at: '2026-09-18T10:00:00Z', head_name: 'Ravi Das', village: 'Kalna', surveyor: 'Bimal', device_id: 'other', photo_count: 2, photo_urls: 'https://drive.google.com/file/d/AAA/view\nhttps://drive.google.com/file/d/BBB/view' }], total: 1, sheetUrl: 'x', version: '1.17.4' }; else out = { ok: true, version: '1.17.4' }; await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) }); });
  await page.addInitScript(() => { try { localStorage.setItem('gs_welcomed', '"x"'); } catch {} });
  await page.goto(`http://localhost:8785/?db=${encodeURIComponent(DB)}`); await page.waitForTimeout(700);
  await page.evaluate(() => { settings.adminKey = 'GeoSurvey'; settings.adminKeyOk = true; LS.set('gs_settings', settings); }); await page.click('#obSample'); await page.waitForTimeout(400);
  t('header has Data (database icon) + Edit side by side, no header PDF', (await page.$eval('#dbBtn', b => b.textContent.trim())) === 'Data' && (await page.$('#editBtn')) !== null && (await page.$eval('#pdfBtn', b => b.closest('#actionBar') !== null)));
  // local record with a photo
  await page.evaluate(async j => { const r = getRecords(); r.unshift({ id: 'loc-1', submitted_at: new Date().toISOString(), surveyor: 'Asha', head_name: 'Local Person', village: 'Rajarhat', device_id: settings.deviceId, photo_count: 1, status: 'pending' }); saveRecords(r); await PhotoDB.put('loc-1', [{ name: 'p.jpg', dataUrl: j, taken_at: new Date().toISOString(), lat: 22.5, lon: 88.3 }], []); }, JPG);
  t('pending badge on the Records tab', (await page.textContent('#pendingBadge')).trim() === '1');
  await page.click('#dbBtn'); await page.waitForTimeout(800);
  t('Data button opens Collected data (admin panel) with the stats and table', !(await page.$eval('#dataView', e => e.hidden)) && !(await page.$eval('#adminPanel', e => e.hidden)) && (await page.$$eval('#adminTable tbody tr', r => r.length)) === 1 && (await page.$eval('#editView', e => e.hidden)));
  t('Edit view no longer contains the admin panel', await page.$eval('#adminPanel', e => e.closest('#dataView') !== null));
  await page.click('.tab[data-view="responsesView"]'); await page.waitForTimeout(700);
  t('Records tab shows the summary at top', !(await page.$eval('#responsesView', e => e.hidden)) && /waiting on this phone/.test(await page.textContent('#localSummary')), await page.textContent('#localSummary'));
  await page.evaluate(() => syncPending(true)); await page.waitForTimeout(800); // pulls db rows with the key
  const pdfs = await page.$$eval('#localTable [data-pdf]', b => b.map(x => x.dataset.pdf));
  t('every row has a PDF button (local + database)', pdfs.includes('loc-1') && pdfs.includes('db-1'), pdfs.join(','));
  const [dl1] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#localTable [data-pdf="loc-1"]')]);
  const f1 = fs.readFileSync(await dl1.path()); t('local record → PDF downloaded', /\.pdf$/.test(dl1.suggestedFilename()) && f1.slice(0, 4).toString() === '%PDF', dl1.suggestedFilename());
  const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#localTable [data-pdf="db-1"]')]);
  const f2 = fs.readFileSync(await dl2.path()); t('database row → PDF with Drive links', f2.slice(0, 4).toString() === '%PDF' && /drive\.google\.com\/file\/d\/AAA/.test(f2.toString('latin1')), dl2.suggestedFilename());
  await page.click('.tab[data-view="formView"]'); await page.waitForTimeout(200);
  const [dl3] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#pdfBtn')]);
  t('current-form PDF still works from the action bar', /\.pdf$/.test(dl3.suggestedFilename()));
  t('no page errors', !errors.length, errors.join(','));
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
