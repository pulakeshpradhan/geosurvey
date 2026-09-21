const { chromium } = require('playwright-core');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..'); const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const srv = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); }).listen(8782);
const DB = 'https://script.google.com/macros/s/AKfycbMULTI/exec'; const KEY = 'GeoSurvey';
const t = (n, ok, extra = '') => console.log((ok ? 'PASS' : 'FAIL') + ' ' + n + (extra ? ' — ' + extra : ''));
// Mock of the multi-questionnaire backend
const be = { list: [], active: '', schemas: {}, rows: {}, posts: [] };
const tabs = () => { const seen = new Set(); return be.list.filter(q => !seen.has(q.sheet) && seen.add(q.sheet)).map(q => ({ name: q.sheet, rows: (be.rows[q.sheet] || []).length })); };
function handle(method, u, body) {
  const action = u.searchParams.get('action') || body.action;
  if (method === 'POST') be.posts.push(body);
  if (action === 'schema') { const qid = u.searchParams.get('q') || be.active; const s = be.schemas[qid] || null; return { ok: true, schema: s, active: be.active, questionnaires: be.list, ai: false, sheet: s ? s.sheet : 'Responses', version: '1.17.0' }; }
  if (action === 'ping') return { ok: true, version: '1.17.0', sheetUrl: 'x', folderUrl: 'y', folderName: 'GeoSurvey Photos', driveError: '', rows: (tabs()[0] || { rows: 0 }).rows, sheet: (be.list.find(q => q.id === be.active) || {}).sheet || 'Responses', sheets: tabs(), active: be.active, questionnaires: be.list, ai: false };
  if (action === 'list') { const q = u.searchParams.get('q'); const sheet = u.searchParams.get('sheet') || (be.list.find(x => x.id === (q || be.active)) || {}).sheet; return { ok: true, rows: be.rows[sheet] || [], total: 0, sheetUrl: 'x', version: '1.17.0' }; }
  if (action === 'setSchema') {
    let qid = body.qid, e = be.list.find(x => x.id === qid);
    if (!e) { qid = 'q' + (be.list.length + 1); e = { id: qid, title: body.schema.title, sheet: 'Responses – ' + body.schema.title, version: body.schema.version }; be.list.push(e); be.rows[e.sheet] = []; }
    else { if (body.sheetMode === 'new') { e.sheet = body.sheetName || ('Responses – ' + e.title + ' v2'); be.rows[e.sheet] = []; } e.title = body.schema.title; e.version = body.schema.version; }
    be.schemas[qid] = { ...body.schema, qid, sheet: e.sheet };
    if (body.setActive || be.list.length === 1) be.active = qid;
    return { ok: true, qid, version: body.schema.version, sheet: e.sheet, active: be.active, questionnaires: be.list, projectUrl: 'https://drive.google.com/file/d/P/view' };
  }
  if (action === 'setActive') { be.active = body.qid; return { ok: true, active: be.active, questionnaires: be.list }; }
  if (action === 'deleteQuestionnaire') { const e = be.list.find(x => x.id === body.qid); const n = (be.rows[e.sheet] || []).length; be.list = be.list.filter(x => x.id !== body.qid); delete be.schemas[body.qid]; let tabDeleted = false; if (body.deleteSheet && n === 0) { delete be.rows[e.sheet]; tabDeleted = true; } if (be.active === body.qid) be.active = be.list[0] ? be.list[0].id : ''; return { ok: true, deleted: body.qid, tabDeleted, rowsInTab: n, active: be.active, questionnaires: be.list }; }
  if (action === 'saveProject') return { ok: true, projectUrl: 'https://drive.google.com/file/d/P/view' };
  if (method === 'POST' && !body.action) { const sheet = (be.list.find(x => x.id === body.qid) || be.list.find(x => x.id === be.active)).sheet; (be.rows[sheet] = be.rows[sheet] || []).push({ id: body.id, head_name: body.head_name, device_id: body.device_id, submitted_at: body.submitted_at }); return { ok: true, id: body.id, row: 1, version: '1.17.0' }; }
  return { ok: false, error: 'unexpected', version: '1.17.0' };
}
(async () => {
  const b = await chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: 'chrome' }) });
  const ctx = await b.newContext({ viewport: { width: 1100, height: 850 } }); const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); let promptAnswer = KEY, confirmAnswer = true;
  page.on('dialog', d => d.type() === 'prompt' ? d.accept(promptAnswer) : d.type() === 'confirm' ? (confirmAnswer ? d.accept() : d.dismiss()) : d.accept());
  await page.route(u => /nominatim|generativelanguage/.test(u.hostname), r => r.abort());
  await page.route(u => u.hostname === 'script.google.com', async r => { const u = new URL(r.request().url()); const method = r.request().method(); const body = method === 'POST' ? JSON.parse(r.request().postData() || '{}') : {}; await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(handle(method, u, body)) }); });
  await page.addInitScript(() => { try { localStorage.setItem('gs_welcomed', '"x"'); } catch {} });
  await page.goto(`http://localhost:8782/?db=${encodeURIComponent(DB)}`); await page.waitForTimeout(600);
  await page.click('#obSample'); await page.waitForTimeout(400);
  await page.click('#editBtn'); await page.waitForTimeout(500);
  t('bar visible with "not published yet" for a fresh backend', !(await page.$eval('#qBar', e => e.hidden)) && /not published yet/.test(await page.$eval('#qPick', s => s.options[s.selectedIndex].textContent)), await page.$eval('#qPick', s => s.options[s.selectedIndex].textContent));
  // 1. First publish → creates q1 with its own tab, becomes default
  await page.click('#designerPublish'); await page.waitForTimeout(600);
  t('first publish creates a questionnaire with a dedicated tab', be.list.length === 1 && be.list[0].sheet === 'Responses – Socio-Economic Household Survey' && be.active === 'q1', JSON.stringify(be.list));
  t('phone schema carries qid + sheet', (await page.evaluate(() => [SCHEMA_META.qid, SCHEMA_META.sheet].join('|'))) === 'q1|Responses – Socio-Economic Household Survey');
  t('bar shows it as default', /★ default/.test(await page.$eval('#qPick', s => s.options[s.selectedIndex].textContent)));
  // submit a record → lands in q1's tab with qid
  await page.evaluate(() => { const r = getRecords(); r.unshift({ id: 'rec-1', submitted_at: new Date().toISOString(), surveyor: 'A', head_name: 'H1', device_id: settings.deviceId, qid: SCHEMA_META.qid, photo_count: 0, status: 'pending' }); saveRecords(r); });
  await page.evaluate(() => syncPending(true)); await page.waitForTimeout(600);
  t('record routed to the questionnaire tab', (be.rows['Responses – Socio-Economic Household Survey'] || []).length === 1);
  // 2. Update q1 → sheet dialog (rows > 0) → continue
  await page.click('#settingsBtn'); await page.click('#testDbBtn'); await page.waitForTimeout(400); await page.click('#cancelSettingsBtn');
  await page.click('#designerPublish'); await page.waitForTimeout(400);
  t('updating a questionnaire with data asks where responses go', await page.$eval('#sheetDlg', d => d.open) && /\(1 record\)/.test(await page.textContent('#sheetDlgSub')), await page.textContent('#sheetDlgSub'));
  await page.click('#sheetOk'); await page.waitForTimeout(500);
  t('"continue" keeps q1 on the same tab', be.list[0].sheet === 'Responses – Socio-Economic Household Survey' && be.posts.filter(p => p.action === 'setSchema').length === 2);
  // 3. New questionnaire (not default) → own tab, phone pinned to it
  promptAnswer = 'Water Survey'; confirmAnswer = false; await page.click('#qNew'); await page.waitForTimeout(300);
  t('New starts a fresh draft titled from the prompt', (await page.evaluate(() => document.querySelector('#qPick').value)) === '' && /Water Survey/.test(await page.$eval('#qPick', s => s.options[s.selectedIndex].textContent)));
  promptAnswer = KEY; await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('gs_designer_draft')); d.sections[0].fields[0] = { k: 'source', label: 'Water source', type: 'text', ai: true }; localStorage.setItem('gs_designer_draft', JSON.stringify(d)); }); await page.evaluate(() => Designer.load());
  await page.click('#designerPublish'); await page.waitForTimeout(600);
  t('second questionnaire created with its own tab, default unchanged', be.list.length === 2 && be.list[1].sheet === 'Responses – Water Survey' && be.active === 'q1', JSON.stringify({ n: be.list.length, active: be.active }));
  t('this phone now uses q2 and is pinned to it', (await page.evaluate(() => [SCHEMA_META.qid, settings.pinnedQid].join('|'))) === 'q2|q2');
  // reload: phone stays on the pinned questionnaire
  await page.reload(); await page.waitForTimeout(900);
  t('after reload the phone keeps the pinned questionnaire', (await page.evaluate(() => SCHEMA_META.qid)) === 'q2');
  // 4. Make default
  await page.click('#editBtn'); await page.waitForTimeout(500); await page.click('#qDefault'); await page.waitForTimeout(400);
  t('Make default switches the team default', be.active === 'q2' && (await page.evaluate(() => settings.pinnedQid)) === '');
  // 5. Delete q1 (has 1 record) → tab kept
  await page.selectOption('#qPick', 'q1'); await page.waitForTimeout(500);
  confirmAnswer = true; await page.click('#qDelete'); await page.waitForTimeout(700);
  t('Delete removes the questionnaire but keeps its tab with data', be.list.length === 1 && be.list[0].id === 'q2' && be.rows['Responses – Socio-Economic Household Survey'].length === 1 && be.posts.some(p => p.action === 'deleteQuestionnaire' && p.deleteSheet === false));
  t('editor moved to the remaining questionnaire', (await page.evaluate(() => document.querySelector('#qPick').value)) === 'q2');
  t('no page errors', !errors.length, errors.join(','));
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
