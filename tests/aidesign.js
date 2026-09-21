const { chromium } = require('playwright-core');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..'); const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const srv = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); }).listen(8783);
const DB = 'https://script.google.com/macros/s/AKfycbAIDESIGN/exec';
const t = (n, ok, extra = '') => console.log((ok ? 'PASS' : 'FAIL') + ' ' + n + (extra ? ' — ' + extra : ''));
const designed = { title: 'Water Access Survey', sections: [{ title: 'Respondent', photoHint: 'the house', fields: [{ key: 'name', label: 'Name', type: 'text', required: true }, { key: 'source', label: 'Main water source', type: 'select', options: ['Tap', 'Hand pump', 'Well', 'Other'] }] }, { title: 'Perceptions', photoHint: '', fields: [{ key: 'p1', label: 'Water is safe to drink', type: 'likert', construct: 'WS', scale_max: 5, scale_low: 'Strongly disagree', scale_high: 'Strongly agree' }] }] };
const formatted = { title: 'Pasted form', sections: [{ title: 'Section 1', photoHint: '', fields: [{ key: 'respondent_name', label: 'Name of respondent', type: 'text' }, { key: 'age', label: 'Age', type: 'number' }, { key: 'occupation', label: 'Main occupation', type: 'select', options: ['farming', 'daily wage', 'service', 'other'] }] }] };
(async () => {
  const b = await chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: 'chrome' }) });
  const ctx = await b.newContext({ viewport: { width: 1100, height: 850 } }); const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); const prompts = [];
  page.on('dialog', d => d.type() === 'prompt' ? d.accept('GeoSurvey') : d.accept());
  await page.route(u => /nominatim/.test(u.hostname), r => r.abort());
  await page.route(u => u.hostname === 'script.google.com', async r => {
    const u = new URL(r.request().url()); const method = r.request().method(); const body = method === 'POST' ? JSON.parse(r.request().postData() || '{}') : {}; const action = u.searchParams.get('action') || body.action; let out;
    if (action === 'schema') out = { ok: true, schema: null, active: '', questionnaires: [], ai: true, version: '1.17.1' };
    else if (action === 'list') out = { ok: true, rows: [], total: 0, sheetUrl: 'x', version: '1.17.1' };
    else if (action === 'ai') { const text = body.body.contents[0].parts[0].text; prompts.push(text); const isFormat = /QUESTIONNAIRE TEXT:/.test(text); out = { ok: true, version: '1.17.1', candidates: [{ content: { parts: [{ text: JSON.stringify(isFormat ? formatted : designed) }] } }] }; }
    else out = { ok: true, version: '1.17.1' };
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) });
  });
  await page.addInitScript(() => { try { localStorage.setItem('gs_welcomed', '"x"'); } catch {} });
  await page.goto(`http://localhost:8783/?db=${encodeURIComponent(DB)}`); await page.waitForTimeout(700);
  // start-page tile → dialog
  await page.click('#obAi'); await page.waitForTimeout(600);
  t('start-page tile opens the Design-with-AI dialog in the editor', (await page.$eval('#aiDesignDlg', d => d.open)) && !(await page.$eval('#editView', e => e.hidden)));
  await page.fill('#aiDesignText', 'Household water access survey in rural West Bengal with perceptions on safety'); await page.click('#aiDesignRun'); await page.waitForTimeout(800);
  t('one-line brief uses the design prompt', prompts.length === 1 && /Design a COMPLETE, field-ready questionnaire/.test(prompts[0]));
  t('designed questionnaire loaded into the draft', !(await page.$eval('#aiDesignDlg', d => d.open)) && /Water Access Survey/.test(await page.evaluate(() => JSON.parse(localStorage.getItem('gs_designer_draft')).title)) && (await page.evaluate(() => JSON.parse(localStorage.getItem('gs_designer_draft')).sections.length)) === 2);
  t('likert construct and select options preserved', await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('gs_designer_draft')); const f = d.sections[1].fields[0]; const s = d.sections[0].fields[1]; return f.type === 'likert' && f.c === 'WS' && s.options.length === 4; }));
  t('status says designed', /Designed 2 sections/.test(await page.textContent('#designerStatus')), await page.textContent('#designerStatus'));
  // pasted numbered text → format prompt (auto mode)
  await page.click('#designerTextAiBtn'); await page.waitForTimeout(200);
  await page.fill('#aiDesignText', '1. Name of respondent ____\n2. Age ____\n3. Main occupation: (a) farming (b) daily wage (c) service (d) other\n4. Household size ____');
  await page.click('#aiDesignRun'); await page.waitForTimeout(800);
  t('numbered text auto-detected as a questionnaire → format prompt', prompts.length === 2 && /QUESTIONNAIRE TEXT:/.test(prompts[1]) && /TRANSCRIBE IT FAITHFULLY/.test(prompts[1]));
  t('formatted questionnaire replaces the draft', /Pasted form/.test(await page.evaluate(() => JSON.parse(localStorage.getItem('gs_designer_draft')).title)));
  t('no page errors', !errors.length, errors.join(','));
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
