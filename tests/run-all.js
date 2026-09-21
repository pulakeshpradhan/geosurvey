/* Runs every suite in this folder, prints a summary and exits 1 if any check fails.
 * Each suite serves the repository root on its own port, mocks script.google.com and
 * drives Google Chrome (set CHROME=/path/to/chrome to use another binary). */
const { spawnSync } = require('child_process'); const fs = require('fs'); const path = require('path');
const SUITES = ['uitest', 'settest', 'streamtest', 'edittest', 'projtest', 'multiq', 'aidesign', 'noai', 'welcome2', 'sizes', 'geotest', 'pdftest', 'header'];
fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
let pass = 0, fail = 0; const failed = [];
for (const s of SUITES) {
  const r = spawnSync(process.execPath, [s + '.js'], { cwd: __dirname, encoding: 'utf8', timeout: 300000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const p = (out.match(/^PASS /gm) || []).length, f = (out.match(/^FAIL /gm) || []).length;
  pass += p; fail += f; if (f || r.status) failed.push(s);
  console.log(`${(f || r.status) ? '✗' : '✓'} ${s.padEnd(11)} ${p} pass, ${f} fail${r.status ? ` (exit ${r.status})` : ''}`);
  if (f || r.status) console.log(out.split('\n').filter(l => /^FAIL |Error|error/.test(l)).map(l => '    ' + l).join('\n'));
}
console.log(`\n${pass} checks passed, ${fail} failed${failed.length ? ' — ' + failed.join(', ') : ''}`);
process.exit(failed.length ? 1 : 0);
