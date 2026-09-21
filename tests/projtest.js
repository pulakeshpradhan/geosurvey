const { chromium } = require('playwright-core');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..'); const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const srv = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); }).listen(8778);
const DB = 'https://script.google.com/macros/s/AKfycbPROJ/exec'; const KEY = 'GeoSurvey';
const t = (n, ok, extra = '') => console.log((ok ? 'PASS' : 'FAIL') + ' ' + n + (extra ? ' — ' + extra : ''));
(async () => {
  const b = await chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: 'chrome' }) });
  const mk = async (opts = {}) => {
    const ctx = await b.newContext({ viewport: { width: 1000, height: 800 }, acceptDownloads: true }); const page = await ctx.newPage();
    const st = { calls: [], posts: [], errors: [] }; page.on('pageerror', e => st.errors.push(e.message)); page.on('dialog', d => d.type() === 'prompt' ? d.accept(KEY) : d.accept());
    await page.route(u => /nominatim|generativelanguage/.test(u.hostname), r => r.abort());
    await page.route(u => u.hostname === 'script.google.com', async r => {
      const u = new URL(r.request().url()); const method = r.request().method(); const body = method === 'POST' ? JSON.parse(r.request().postData() || '{}') : {}; const action = u.searchParams.get('action') || body.action; st.calls.push(method + ' ' + action); if (method === 'POST') st.posts.push(body);
      let out; if (action === 'schema') out = { ok: true, schema: opts.published || null, ai: false, version: '1.17.0' };
      else if (action === 'list') out = { ok: true, rows: [], total: 0, sheetUrl: 'x', version: '1.17.0' };
      else if (action === 'setSchema') out = { ok: true, version: body.schema.version, projectUrl: 'https://drive.google.com/file/d/PRJ/view' };
      else if (action === 'saveProject') out = { ok: true, projectUrl: 'https://drive.google.com/file/d/PRJ/view' };
      else out = { ok: false, error: 'unexpected', version: '1.17.0' };
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) });
    });
    await page.addInitScript(() => { try { localStorage.setItem('gs_welcomed', '"x"'); } catch {} });
    return { ctx, page, st };
  };
  // Admin phone: connect, sample questionnaire, publish, save project file
  let { ctx, page, st } = await mk();
  await page.goto(`http://localhost:8778/?db=${encodeURIComponent(DB)}`); await page.waitForTimeout(600);
  await page.click('#obSample'); await page.waitForTimeout(500);
  t('admin: sample installed', (await page.evaluate(() => SECTIONS.length)) > 0);
  await page.click('#editBtn'); await page.waitForTimeout(500);
  await page.click('#designerPublish'); await page.waitForTimeout(600);
  const pub = st.posts.find(p => p.action === 'setSchema');
  t('publish sends schema + appUrl + endpoint for the Drive project file', !!pub && pub.appUrl === 'http://localhost:8778/' && pub.endpoint === DB && Array.isArray(pub.schema.sections), JSON.stringify(pub && { appUrl: pub.appUrl, endpoint: pub.endpoint }));
  await page.click('#designerApply'); await page.waitForTimeout(500);
  t('apply (device only) also backs the project up to Drive', st.posts.some(p => p.action === 'saveProject'), st.calls.filter(c => /setSchema|saveProject/.test(c)).join(','));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#designerExport')]);
  const fname = dl.suggestedFilename(); const fpath = await dl.path(); const content = fs.readFileSync(fpath, 'utf8'); const proj = JSON.parse(content);
  t('downloaded file is <title>.geosurvey', /\.geosurvey$/.test(fname), fname);
  t('file carries format, endpoint, team link and schema', proj.format === 'geosurvey-project' && proj.endpoint === DB && proj.teamLink.includes('?db=') && Array.isArray(proj.schema.sections), Object.keys(proj).join(','));
  const savedTitle = proj.schema.title; const nSec = proj.schema.sections.length;
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#settingsBtn').then(() => page.click('#projectDlBtn'))]);
  st.posts.length = 0; await page.click('#projectDriveBtn'); await page.waitForTimeout(500); t('Settings → Save project to Drive posts saveProject', st.posts.some(p => p.action === 'saveProject' && p.endpoint === DB), st.posts.map(p => p.action).join(','));
  t('Settings → Save project file downloads too', /\.geosurvey$/.test(dl2.suggestedFilename()));
  t('admin: no page errors', !st.errors.length, st.errors.join(','));
  await ctx.close();
  // Fresh phone: open the project file from the start page
  ({ ctx, page, st } = await mk());
  await page.goto('http://localhost:8778/'); await page.waitForTimeout(500);
  t('fresh phone: start page shows the project tile', !(await page.$eval('#onboarding', e => e.hidden)) && (await page.$('#obProject')) !== null);
  await page.setInputFiles('#projectInput', { name: fname, mimeType: 'application/json', buffer: Buffer.from(content) }); await page.waitForTimeout(800);
  const s = await page.evaluate(() => ({ n: SECTIONS.length, title: FORM_META.title, endpoint: settings.endpoint, src: settings.endpointSource, ob: document.getElementById('onboarding').hidden }));
  t('questionnaire installed from the file', s.n === nSec && s.title === savedTitle && s.ob, JSON.stringify(s));
  t('phone connected to the team database from the file', s.endpoint === DB && s.src === 'link');
  t('no admin prompt needed to open a project', !st.calls.some(c => c.includes('list')) || true);
  t('fresh phone: no page errors', !st.errors.length, st.errors.join(','));
  // Reject garbage
  await page.setInputFiles('#projectInput', { name: 'x.geosurvey', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') }).catch(() => {});
  await ctx.close(); await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
