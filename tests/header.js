const { chromium } = require('playwright-core');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..'); const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const srv = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); }).listen(8797);
const t = (n, ok, extra = '') => console.log((ok ? 'PASS' : 'FAIL') + ' ' + n + (extra ? ' — ' + extra : ''));
(async () => {
  const b = await chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: 'chrome' }) });
  let fails = 0;
  for (const w of [320, 360, 375, 390, 412, 480, 640, 1024]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 760 }, deviceScaleFactor: 1 }); const page = await ctx.newPage();
    await page.route(u => /script\.google\.com|nominatim|generativelanguage/.test(u.hostname), r => r.abort());
    await page.addInitScript(() => { try { localStorage.setItem('gs_welcomed', '"x"'); } catch {} });
    await page.goto('http://localhost:8797/'); await page.waitForTimeout(500);
    await page.click('#obSample'); await page.waitForTimeout(300);
    // pending badge on: worst case for the tabs row
    await page.evaluate(() => { const r = getRecords(); r.unshift({ id: 'p1', submitted_at: new Date().toISOString(), status: 'pending', photo_count: 0 }); saveRecords(r); if (typeof updatePendingBadge === 'function') updatePendingBadge(); });
    await page.waitForTimeout(200);
    const info = await page.evaluate(() => {
      const r = s => { const e = document.querySelector(s); const b = e.getBoundingClientRect(); return { x: Math.round(b.left), r: Math.round(b.right), w: Math.round(b.width), h: Math.round(b.height), top: Math.round(b.top), vis: !!(b.width && b.height) && getComputedStyle(e).display !== 'none' }; };
      const name = document.querySelector('.brand-name');
      return { name: r('.brand-name'), qr: r('#qrBtn'), db: r('#dbBtn'), edit: r('#editBtn'), set: r('#settingsBtn'), tabs: r('.tabs'), bar: r('.topbar'), lbl: getComputedStyle(document.querySelector('#dbBtn .lbl')).display, clipped: name.scrollWidth > name.clientWidth, docW: document.documentElement.scrollWidth };
    });
    const sameRow = info.name.top === info.qr.top || Math.abs((info.name.top + info.name.h / 2) - (info.qr.top + info.qr.h / 2)) < 12;
    const noOverlap = info.lbl !== "none" && info.name.r <= info.qr.x && info.qr.r <= info.db.x && info.db.r <= info.edit.x && info.edit.r <= info.set.x && info.set.r <= w;
    const ok = info.name.vis && !info.clipped && noOverlap && info.docW <= w;
    if (!ok) fails++;
    t(`${w}px: brand visible, unclipped, no overlap (labels ${info.lbl === 'none' ? 'hidden' : 'shown'}, bar ${info.bar.h}px${sameRow ? '' : ', header wrapped'})`, ok, JSON.stringify(info));
    await page.screenshot({ path: `out/brand-${w}.png`, clip: { x: 0, y: 0, width: w, height: Math.min(200, info.bar.h + 40) } });
    await ctx.close();
  }
  await b.close(); srv.close(); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
