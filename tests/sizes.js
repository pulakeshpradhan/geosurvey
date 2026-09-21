const { chromium } = require('playwright-core');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..'); const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const srv = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f)); }).listen(8777);
(async () => {
  const b = await chromium.launch({ ...(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: 'chrome' }) });
  for (const [w, h, name] of [[320, 568, 'iphone-se'], [360, 740, 'android'], [412, 915, 'pixel'], [740, 360, 'landscape'], [1280, 800, 'desktop']]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } }); const page = await ctx.newPage();
    await page.route(u => /nominatim|script\.google\.com/.test(u.hostname), r => r.abort());
    await page.goto('http://localhost:8777/'); await page.waitForTimeout(900);
    const m = await page.evaluate(() => { const d = document.getElementById('welcomeDlg'); const r = d.getBoundingClientRect(); const wrap = d.querySelector('.cmp-wrap'); const heads = [...d.querySelectorAll('.row.head > div')].map(x => x.getBoundingClientRect()); const overlap = heads.some((a, i) => heads.slice(i + 1).some(b => a.right > b.left + 0.5 && a.left < b.right - 0.5)); const btn = d.querySelector('#welcomeClose').getBoundingClientRect(); return { open: d.open, w: Math.round(r.width), h: Math.round(r.height), inView: r.bottom <= innerHeight + 0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5, wrapScrolls: wrap.scrollHeight > wrap.clientHeight + 1, overlap, btnVisible: btn.bottom <= innerHeight && btn.top >= 0 }; });
    console.log(`${(m.open && m.inView && !m.overlap && m.btnVisible) ? 'PASS' : 'FAIL'} ${name} ${w}x${h}: dialog ${m.w}x${m.h}, inView=${m.inView}, headerOverlap=${m.overlap}, gridScrolls=${m.wrapScrolls}, buttonVisible=${m.btnVisible}`);
    await page.screenshot({ path: `out/size-${name}.png` }); await ctx.close();
  }
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
