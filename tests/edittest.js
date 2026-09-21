const { chromium } = require('playwright-core');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
}).listen(8772);
const DB = 'https://script.google.com/macros/s/AKfycbEDIT/exec'; const KEY = 'GeoSurvey';
(async () => {
  const b = await chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: 'chrome' }) });
  const t = (n, ok, extra = '') => console.log((ok ? 'PASS' : 'FAIL') + ' ' + n + (extra ? ' — ' + extra : ''));
  const mk = async () => {
    const ctx = await b.newContext({ viewport: { width: 1000, height: 800 } }); const page = await ctx.newPage();
    const st = { prompts: 0, answer: null, calls: [], errors: [] }; page.on('pageerror', e => st.errors.push(e.message));
    page.on('dialog', async d => { if (d.type() === 'prompt') { st.prompts++; if (st.answer === null) await d.dismiss(); else await d.accept(st.answer); } else await d.accept(); });
    await page.route(u => /nominatim|generativelanguage/.test(u.hostname), r => r.abort());
    await page.route(u => u.hostname === 'script.google.com', async r => {
      const u = new URL(r.request().url()); const action = u.searchParams.get('action'); const tok = u.searchParams.get('token'); st.calls.push(action + (tok ? ':' + tok : ''));
      let out; if (action === 'schema') out = { ok: true, schema: null, ai: false, version: '1.15.6' };
      else if (action === 'list') out = tok === KEY ? { ok: true, rows: [], total: 0, sheetUrl: 'x', version: '1.15.6' } : tok ? { ok: false, error: 'Invalid admin token', version: '1.15.6' } : { ok: true, rows: [], total: 0, version: '1.15.6' };
      else out = { ok: false, error: 'unexpected', version: '1.15.6' };
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) });
    });
    return { ctx, page, st };
  };
  const editOpen = page => page.$eval('#editView', e => !e.hidden).catch(() => false);
  // With a database connected
  let { ctx, page, st } = await mk();
  await page.addInitScript(() => { try { localStorage.setItem('gs_welcomed', '"x"'); } catch {} }); await page.goto(`http://localhost:8772/?db=${encodeURIComponent(DB)}`); await page.waitForTimeout(700);
  await page.click('#obSample').catch(() => {}); await page.waitForTimeout(300);
  t('onboarding "Use sample" asks for the key too', st.prompts === 1, 'prompts=' + st.prompts);
  st.answer = null; await page.click('#editBtn'); await page.waitForTimeout(300);
  t('Edit without key prompts; cancel keeps the editor closed', st.prompts === 2 && !(await editOpen(page)));
  st.answer = 'wrong'; await page.click('#editBtn'); await page.waitForTimeout(500);
  t('wrong key is checked online and rejected', st.calls.includes('list:wrong') && !(await editOpen(page)), st.calls.join(','));
  t('wrong key cleared', (await page.evaluate(() => JSON.parse(localStorage.getItem('gs_settings')).adminKey)) === '');
  st.answer = KEY; await page.click('#editBtn'); await page.waitForTimeout(700);
  t('right key opens the editor', await editOpen(page));
  t('key marked verified', (await page.evaluate(() => JSON.parse(localStorage.getItem('gs_settings')).adminKeyOk)) === true);
  await page.click('.tab[data-view="formView"]'); const before = st.prompts; const callsBefore = st.calls.length; await page.click('#editBtn'); await page.waitForTimeout(300);
  t('second time: no prompt, no network check', st.prompts === before && (await editOpen(page)), `prompts=${st.prompts} calls+${st.calls.length - callsBefore}`);
  // Offline with a verified key still opens
  await ctx.setOffline(true); await page.click('.tab[data-view="formView"]'); await page.click('#editBtn'); await page.waitForTimeout(300);
  t('offline with verified key opens', await editOpen(page)); await ctx.setOffline(false);
  // Changing the key in Settings forgets the verification
  await page.click('.tab[data-view="formView"]'); await page.click('#settingsBtn'); await page.fill('#setTeamKey', 'another'); await page.click('#saveSettingsBtn'); await page.waitForTimeout(300);
  t('changed key must be re-verified', (await page.evaluate(() => JSON.parse(localStorage.getItem('gs_settings')).adminKeyOk)) === false);
  t('device id survives Settings save', typeof (await page.evaluate(() => JSON.parse(localStorage.getItem('gs_settings')).deviceId)) === 'string');
  t('no page errors', !st.errors.length, st.errors.join(','));
  await ctx.close();
  // Device-only use (no endpoint): editor open without a key
  ({ ctx, page, st } = await mk());
  await page.addInitScript(() => { try { localStorage.setItem('gs_welcomed', '"x"'); } catch {} }); await page.goto('http://localhost:8772/'); await page.waitForTimeout(600);
  await page.click('#obSample').catch(() => {}); await page.waitForTimeout(300); await page.click('#editBtn'); await page.waitForTimeout(300);
  t('no database connected: editor opens without a key', st.prompts === 0 && (await editOpen(page)));
  await ctx.close(); await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
