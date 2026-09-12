/* GeoSurvey — Analysis tab: assembles data, runs stats-worker.js, renders charts/tables and an interpretation report.
 * Depends on app.js globals (CONSTRUCTS, STRUCTURAL_MODEL, ALL_FIELDS, getRecords, adminRows, LS, toast, esc, download). */
'use strict';

const Analysis = (() => {
  let worker = null, timer = null, last = null, opened = false, running = false, queued = false;

  /* ---------- number formatting ---------- */
  const f = (x, d = 2) => (x == null || !Number.isFinite(x)) ? '—' : x.toFixed(d);
  const pf = p => !Number.isFinite(p) ? '—' : p < 0.001 ? '< .001' : p.toFixed(3);
  const pEq = p => !Number.isFinite(p) ? '= —' : p < 0.001 ? '< .001' : '= ' + p.toFixed(3);
  const stars = p => !Number.isFinite(p) ? '' : p < 0.001 ? '***' : p < 0.01 ? '**' : p < 0.05 ? '*' : '';
  const sigCls = p => Number.isFinite(p) && p < 0.05 ? 'sig' : '';
  const cname = k => CONSTRUCTS[k]?.name || (STRUCTURAL_MODEL.higherOrder?.key === k ? STRUCTURAL_MODEL.higherOrder.name : k);
  const label = k => ALL_FIELDS.find(x => x.k === k)?.label || k;

  /* ---------- HTML / SVG helpers ---------- */
  const table = (head, rows, cls = '') => `<div class="table-wrap"><table class="table ${cls}"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const card = (title, body, sub = '') => `<div class="card an-card"><div class="card-head"><div><h2>${title}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}</div></div>${body}</div>`;
  const note = (t, cls = '') => `<p class="an-note ${cls}">${t}</p>`;
  function barChart(items, { pct = true, max = null } = {}) {
    const m = max ?? Math.max(...items.map(i => i.value), 1e-9);
    return `<div class="bars">${items.map(i => `<div class="bar-row"><span class="bar-label" title="${esc(i.label)}">${esc(i.label)}</span><div class="bar-track"><div class="bar-fill" style="width:${(i.value / m * 100).toFixed(1)}%"></div></div><span class="bar-val">${pct ? (i.value * 100).toFixed(0) + '%' : f(i.value, 1)}${i.n != null ? ` <small>(${i.n})</small>` : ''}</span></div>`).join('')}</div>`;
  }
  function histogram(values, bins = 8) {
    values = values.filter(Number.isFinite); if (!values.length) return '';
    const lo = Math.min(...values), hi = Math.max(...values), w = (hi - lo) / bins || 1, counts = Array(bins).fill(0);
    values.forEach(v => counts[Math.min(bins - 1, Math.floor((v - lo) / w))]++);
    const mx = Math.max(...counts), W = 320, H = 120, bw = W / bins;
    return `<svg viewBox="0 0 ${W} ${H + 24}" class="chart"><g>${counts.map((c, i) => `<rect x="${i * bw + 2}" y="${H - c / mx * H}" width="${bw - 4}" height="${c / mx * H}" rx="2" class="svg-bar"/><text x="${i * bw + bw / 2}" y="${H + 14}" class="svg-tick" text-anchor="middle">${(lo + i * w).toFixed(w < 1 ? 1 : 0)}</text>`).join('')}</g></svg>`;
  }
  function scree(values) {
    const W = 320, H = 130, n = values.length, mx = Math.max(...values), x = i => 24 + i * (W - 40) / Math.max(1, n - 1), y = v => 10 + (1 - v / mx) * (H - 30);
    return `<svg viewBox="0 0 ${W} ${H}" class="chart"><line x1="24" y1="${y(1)}" x2="${W - 10}" y2="${y(1)}" class="svg-ref"/><text x="${W - 8}" y="${y(1) - 3}" class="svg-tick" text-anchor="end">eigenvalue = 1</text><polyline points="${values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}" class="svg-line"/>${values.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="3" class="svg-dot"/><text x="${x(i)}" y="${H - 4}" class="svg-tick" text-anchor="middle">${i + 1}</text>`).join('')}</svg>`;
  }
  function heat(labels, R, P) {
    const cell = (v, p) => { const a = Math.min(1, Math.abs(v)); const bg = v >= 0 ? `rgba(52,84,158,${0.08 + a * 0.6})` : `rgba(164,74,48,${0.08 + a * 0.6})`; return `<td style="background:${bg};color:${a > 0.55 ? '#fff' : 'inherit'}" title="p ${pEq(p)}">${f(v)}${stars(p)}</td>`; };
    return `<div class="table-wrap"><table class="table heat"><thead><tr><th></th>${labels.map(l => `<th title="${esc(l)}">${esc(l.length > 14 ? l.slice(0, 13) + '…' : l)}</th>`).join('')}</tr></thead><tbody>${R.map((row, i) => `<tr><th title="${esc(labels[i])}">${esc(labels[i].length > 22 ? labels[i].slice(0, 21) + '…' : labels[i])}</th>${row.map((v, j) => i === j ? '<td class="diag">1</td>' : cell(v, P[i][j])).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  function pathDiagram(latents, paths, r2 = {}, extra = {}) {
    // layered layout: level = 1 + max level of predecessors
    const level = {}; const lv = k => { if (level[k] != null) return level[k]; const preds = paths.filter(p => p.to === k).map(p => p.from); level[k] = preds.length ? 1 + Math.max(...preds.map(lv)) : 0; return level[k]; };
    latents.forEach(lv); const maxL = Math.max(...Object.values(level));
    const cols = Array.from({ length: maxL + 1 }, (_, l) => latents.filter(k => level[k] === l));
    const W = 640, H = Math.max(200, 90 * Math.max(...cols.map(c => c.length))), bw = 132, bh = 44;
    const pos = {}; cols.forEach((c, l) => c.forEach((k, i) => { pos[k] = { x: 30 + l * (W - 60 - bw) / Math.max(1, maxL), y: (H / (c.length + 1)) * (i + 1) - bh / 2 }; }));
    const boxes = latents.map(k => `<rect x="${pos[k].x}" y="${pos[k].y}" width="${bw}" height="${bh}" rx="8" class="svg-box"/><text x="${pos[k].x + bw / 2}" y="${pos[k].y + 19}" text-anchor="middle" class="svg-box-t">${esc(cname(k))}</text>${r2[k] != null ? `<text x="${pos[k].x + bw / 2}" y="${pos[k].y + 35}" text-anchor="middle" class="svg-r2">R² = ${f(r2[k])}</text>` : ''}`).join('');
    const arrows = paths.map(p => { const a = pos[p.from], b = pos[p.to]; const x1 = a.x + bw, y1 = a.y + bh / 2, x2 = b.x, y2 = b.y + bh / 2; const mx = (x1 + x2) / 2, my = (y1 + y2) / 2; const sig = Number.isFinite(p.p) ? p.p < 0.05 : true; return `<line x1="${x1}" y1="${y1}" x2="${x2 - 6}" y2="${y2}" class="svg-arrow ${sig ? '' : 'ns'}" marker-end="url(#ah)"/><rect x="${mx - 26}" y="${my - 10}" width="52" height="18" rx="4" class="svg-lbl-bg"/><text x="${mx}" y="${my + 4}" text-anchor="middle" class="svg-lbl ${sig ? '' : 'ns'}">${f(p.beta ?? p.est)}${stars(p.p)}</text>`; }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" class="chart path"><defs><marker id="ah" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" class="svg-ah"/></marker></defs>${arrows}${boxes}${extra.caption ? `<text x="${W / 2}" y="${H - 4}" text-anchor="middle" class="svg-tick">${esc(extra.caption)}</text>` : ''}</svg>`;
  }
  const fitRow = (m) => [['χ²', f(m.chi2, 1)], ['df', m.df], ['p', pf(m.p)], ['χ²/df', f(m.chi2 / m.df)], ['CFI', f(m.cfi, 3)], ['TLI', f(m.tli, 3)], ['RMSEA', f(m.rmsea, 3)], ['SRMR', f(m.srmr, 3)]];
  const fitTable = m => `<div class="stats fit">${fitRow(m).map(([l, v]) => `<div class="stat"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('')}</div>` + note(`Thresholds: CFI/TLI ≥ 0.90 (good ≥ 0.95), RMSEA ≤ 0.08 (good ≤ 0.06), SRMR ≤ 0.08, χ²/df ≤ 3. ${m.converged ? '' : '<b>Optimizer did not fully converge — interpret with caution.</b>'}`);
  const fitOk = m => m && m.cfi >= 0.9 && m.rmsea <= 0.08 && m.srmr <= 0.08;

  /* ---------- Sample data generator (structured so SEM effects are visible) ---------- */
  const SAMPLE_VILLAGES = [['Bowbazar', 'Kolkata', 'West Bengal', '700073', 22.5726, 88.3639], ['Rajarhat', 'North 24 Parganas', 'West Bengal', '700135', 22.62, 88.46], ['Sonarpur', 'South 24 Parganas', 'West Bengal', '700150', 22.44, 88.43], ['Bishnupur', 'Bankura', 'West Bengal', '722122', 23.07, 87.32], ['Kalna', 'Purba Bardhaman', 'West Bengal', '713409', 23.22, 88.37], ['Diamond Harbour', 'South 24 Parganas', 'West Bengal', '743331', 22.19, 88.19]];
  const NAMES = ['Ram Das', 'Sita Mondal', 'Abdul Karim', 'Lakshmi Roy', 'Biswajit Ghosh', 'Fatima Bibi', 'Subhash Naskar', 'Rina Sardar', 'Prakash Halder', 'Anita Mahato', 'Rahim Sheikh', 'Kamala Devi', 'Nitai Pal', 'Sabina Khatun', 'Gopal Murmu', 'Jharna Hembram', 'Tapan Dutta', 'Purnima Bera', 'Sk. Mustafa', 'Mamata Jana'];
  let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const pick = a => a[Math.floor(rnd() * a.length)];
  const likert = z => Math.max(1, Math.min(5, Math.round(3.2 + 0.8 * z + 0.7 * gauss())));
  const opt = k => ALL_FIELDS.find(x => x.k === k).options;
  const bracket = (z, k, skew = 0) => { const o = opt(k); return o[Math.max(0, Math.min(o.length - 1, Math.round((o.length - 1) * Math.min(1, Math.max(0, 0.5 + 0.22 * z + skew + 0.12 * gauss())))))]; };
  function sampleRecords(n) {
    seed = 7 + n; const out = [];
    for (let i = 0; i < n; i++) {
      const AS = gauss(), GS = 0.3 * AS + 0.95 * gauss(), SC = 0.25 * AS + 0.97 * gauss();
      const ES = 0.45 * AS + 0.35 * GS + 0.75 * gauss();
      const WB = 0.5 * ES + 0.2 * AS + 0.25 * SC + 0.1 * GS + 0.15 * ES * SC + 0.65 * gauss();
      const v = pick(SAMPLE_VILLAGES), when = new Date(Date.now() - rnd() * 60 * 86400e3);
      const wealth = 0.7 * ES + 0.3 * gauss();
      const assets = opt('assets').filter(o => o !== 'None').filter((o, j) => rnd() < 0.25 + 0.5 * (1 / (1 + Math.exp(-(wealth + 0.5 - j * 0.12)))) ).slice(0, 12);
      const r = {
        id: `sample-${n}-${i}`, submitted_at: when.toISOString(), sample: true, status: 'sample', surveyor: pick(['Enumerator A', 'Enumerator B', 'Enumerator C']), survey_date: when.toISOString().slice(0, 10),
        latitude: (v[4] + gauss() * 0.01).toFixed(6), longitude: (v[5] + gauss() * 0.01).toFixed(6), gps_accuracy_m: Math.round(5 + rnd() * 20), village: v[0], district: v[1], state: v[2], postcode: v[3], country: 'India',
        head_name: pick(NAMES), head_age: Math.round(28 + rnd() * 40), head_gender: rnd() < 0.72 ? 'Male' : 'Female', marital_status: rnd() < 0.8 ? 'Married' : pick(['Widowed', 'Unmarried']),
        education: bracket(0.5 * ES + 0.3 * AS, 'education'), occupation: pick(['Cultivator', 'Agricultural labour', 'Non-agricultural labour', 'Self-employed / business', 'Salaried (private)', 'Fishing', 'Artisan']),
        social_category: pick(['General', 'OBC', 'SC', 'ST']), religion: pick(['Hindu', 'Hindu', 'Muslim']), household_size: Math.max(1, Math.round(4.5 + gauss() * 1.6 - 0.3 * ES)), children_under_14: Math.max(0, Math.round(1.5 + gauss())), earning_members: Math.max(1, Math.round(1.5 + 0.4 * ES + gauss() * 0.6)), phone: '',
        monthly_income: bracket(wealth, 'monthly_income', -0.1), income_sources: pick(['Agriculture', 'Wage labour', 'Agriculture; Livestock', 'Business', 'Salary', 'Wage labour; Remittance']), land_ownership: bracket(0.4 * wealth, 'land_ownership', -0.15), land_use: pick(opt('land_use')), irrigation: pick(opt('irrigation')),
        livestock: pick(['Cattle; Poultry', 'Goat / sheep', 'None', 'Poultry', 'Cattle']), bank_account: rnd() < 0.85 ? 'Yes' : 'No', ration_card: wealth < -0.3 ? pick(['BPL', 'Antyodaya (AAY)', 'BPL']) : pick(['APL', 'APL', 'None', 'BPL']), govt_schemes: pick(['PM Awas; Jan Dhan', 'MGNREGA', 'PM Kisan; Ujjwala (LPG)', 'None', 'Ayushman Bharat', 'Ujjwala (LPG); Jan Dhan']), has_loan: pick(['No', 'No', 'Yes – bank', 'Yes – SHG / MFI', 'Yes – moneylender']), monthly_expense: Math.round(6000 + 4000 * Math.exp(0.5 * wealth) + rnd() * 2000),
        house_type: bracket(wealth, 'house_type'), house_condition: bracket(0.6 * wealth, 'house_condition'), house_ownership: rnd() < 0.85 ? 'Owned' : 'Rented', rooms: Math.max(1, Math.round(2 + wealth + rnd())), floors: rnd() < 0.8 ? 1 : 2,
        roof_material: wealth > 0.3 ? 'RCC / concrete' : pick(['Asbestos / tin sheet', 'Tiles', 'Thatch / grass']), wall_material: wealth > 0 ? pick(['Burnt brick', 'Concrete']) : pick(['Mud / unburnt brick', 'Bamboo / wood', 'Burnt brick']), floor_material: wealth > 0.2 ? pick(['Cement', 'Tiles / marble']) : pick(['Mud', 'Cement']),
        road_access: bracket(-0.5 * AS, 'road_access'), surroundings: bracket(-0.4 * AS, 'surroundings'),
        electricity: rnd() < 0.9 ? 'Grid' : pick(['Solar', 'None']), water_source: AS > 0 ? pick(['Piped (tap in house)', 'Hand pump / tube-well', 'Public tap']) : pick(['Hand pump / tube-well', 'Open well', 'Pond / river', 'Public tap']), water_distance: bracket(-0.5 * AS, 'water_distance'), water_treatment: pick(opt('water_treatment')),
        toilet: wealth > -0.2 ? pick(['Flush – septic / sewer', 'Pit latrine']) : pick(['Pit latrine', 'Shared / community', 'Open defecation']), cooking_fuel: wealth > 0 ? 'LPG / PNG' : pick(['Firewood', 'LPG / PNG', 'Cow-dung cake']), waste_disposal: pick(opt('waste_disposal')), drainage: bracket(-0.4 * AS, 'drainage'),
        assets: assets.join('; ') || 'None', nearest_health: bracket(-0.6 * AS, 'nearest_health'), nearest_school: bracket(-0.6 * AS, 'nearest_school'), children_in_school: rnd() < 0.8 ? 'Yes' : pick(['No', 'Not applicable']), health_insurance: rnd() < 0.45 ? 'Yes' : 'No', chronic_illness: rnd() < 0.25 ? 'Yes' : 'No',
        photo_count: 0, ai_engine: '', app_version: APP_VERSION, remarks: 'Synthetic sample record for testing the analysis pipeline.',
      };
      const lat = { ES, AS, GS, SC, WB };
      Object.entries(CONSTRUCTS).forEach(([c, def]) => def.items.forEach(k => r[k] = likert(lat[c])));
      out.push(r);
    }
    return out;
  }

  /* ---------- data assembly & worker ---------- */
  function dataset() {
    const src = $('#anSource').value; const cloud = typeof adminRows !== 'undefined' && adminRows.length ? adminRows : null;
    let rows = src === 'cloud' ? (cloud || []) : src === 'device' ? getRecords() : (cloud || getRecords());
    const srcLabel = src === 'cloud' || (src === 'auto' && cloud) ? 'cloud (Google Sheet)' : 'this device';
    const sample = settings.sampleTools && $('#anIncludeSample').checked ? LS.get('gs_sample', []) : [];
    return { rows: [...rows, ...sample], srcLabel, nReal: rows.length, nSample: sample.length };
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(run, 600); }
  function run() {
    $('#anSampleTools').hidden = !settings.sampleTools;
    if (running) { queued = true; return; }
    const ds = dataset();
    setStatus($('#anStatus'), `Analyzing ${ds.rows.length} records (${ds.nReal} from ${ds.srcLabel}${ds.nSample ? ` + ${ds.nSample} sample` : ''})…`, '', true);
    if (!worker) { worker = new Worker('stats-worker.js?v=1.6.1'); worker.onmessage = onResult; worker.onerror = e => { running = false; setStatus($('#anStatus'), 'Analysis error: ' + e.message, 'err'); }; }
    running = true;
    const schema = { constructs: CONSTRUCTS, model: STRUCTURAL_MODEL, fields: ALL_FIELDS.map(({ k, label, type, options }) => ({ k, label, type, options })) };
    worker.postMessage({ records: ds.rows.map(({ photo_thumb, ...r }) => r), schema, meta: ds });
    last = { ds };
  }
  function onResult(e) {
    running = false;
    if (queued) { queued = false; run(); }
    if (!e.data.ok) { setStatus($('#anStatus'), 'Analysis error: ' + e.data.error, 'err'); return; }
    last.result = e.data.result;
    const ds = last.ds, r = last.result;
    setStatus($('#anStatus'), `Updated ${new Date().toLocaleTimeString()} · ${r.N} records (${ds.nReal} from ${ds.srcLabel}${ds.nSample ? ` + ${ds.nSample} sample` : ''}) · computed in ${r.ms} ms · re-runs automatically when data changes.`, 'ok');
    render(r);
  }

  /* ---------- rendering ---------- */
  function render(r) {
    const parts = [];
    if (r.warnings?.length) parts.push(note(r.warnings.map(esc).join('<br>'), 'warn'));
    if (r.N < 5) { $('#anBody').innerHTML = parts.join('') + note('Collect a few records (or generate sample data) to start the analysis.'); return; }
    parts.push(card('Interpretation report', `<div class="report">${report(r)}</div>`, 'Auto-written from the results below; regenerated on every update.'));
    // Sample
    const s = r.sample;
    parts.push(card('Sample size & adequacy', `<div class="stats">${[['Records', s.N], ['Complete Likert cases', s.completeLikert], ['Margin of error (95%, p = .5)', '±' + (s.marginError * 100).toFixed(1) + '%'], ['Cochran target (±5%)', s.cochran], ['SEM 10× rule (max ' + s.maxArrows + ' arrows)', s.semRule10]].map(([l, v]) => `<div class="stat"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('')}</div>` + note(`Cochran's formula for a 95% CI at ±5% requires ${s.cochran} responses; the current sample gives a ±${(s.marginError * 100).toFixed(1)}% margin. For PLS-SEM the 10-times rule needs ≥ ${s.semRule10}; CB-SEM guidelines suggest ≥ 200 (minimum ≈ 100–150).`)));
    // Descriptives
    const d = r.descriptives;
    parts.push(card('Descriptive statistics', table(['Variable', 'n', 'Mean', 'SD', 'Median', 'Min', 'Max', 'Skew', 'Kurtosis'], d.map(x => [esc(x.label), x.n, f(x.mean), f(x.sd), f(x.median), f(x.min), f(x.max), f(x.skew), f(x.kurt)])) +
      `<div class="an-grid">${r.frequencies.slice(0, 8).map(fq => `<div><h3 class="an-h3">${esc(fq.label)} <small>(n = ${fq.n})</small></h3>${barChart(fq.rows.map(x => ({ label: x.v, value: x.pct, n: x.n })))}</div>`).join('')}
      <div><h3 class="an-h3">Household size</h3>${histogram(last.ds.rows.map(x => parseFloat(x.household_size)))}</div><div><h3 class="an-h3">Asset count</h3>${histogram(last.ds.rows.map(x => String(x.assets || '').split(';').filter(v => v.trim() && v.trim() !== 'None').length), 8)}</div></div>` +
      note('Skewness within ±2 and kurtosis within ±7 are acceptable for maximum-likelihood estimation (Hair et al.).')));
    parts.push(card('Likert items', table(['Item', 'Statement', 'n', 'Mean', 'SD', 'Skew', 'Kurtosis'], r.likertItems.map(x => [x.k.toUpperCase(), esc(x.label), x.n, f(x.mean), f(x.sd), f(x.skew), f(x.kurt)]))));
    // Inferential
    const t = r.tests; let inf = '';
    const outName = cname(r.outcome), predName = cname(r.predictor);
    if (t.tGender) inf += `<h3 class="an-h3">Independent-samples t-test (Welch): ${esc(outName)} by gender of head</h3>` + table(['Group', 'n', 'Mean'], [['Male', t.tGender.nA, f(t.tGender.meanA)], ['Female', t.tGender.nB, f(t.tGender.meanB)]]) + note(`t(${f(t.tGender.df, 1)}) = ${f(t.tGender.t)}, p ${pEq(t.tGender.p)}, Cohen's d = ${f(t.tGender.d)} → ${t.tGender.p < 0.05 ? 'significant difference' : 'no significant difference'}.`);
    const an = (a, title) => a ? `<h3 class="an-h3">One-way ANOVA: ${title}</h3>` + table(['Group', 'n', 'Mean', 'SD'], a.groups.map(g => [esc(g.name), g.n, f(g.mean), f(g.sd)])) + note(`F(${a.df1}, ${a.df2}) = ${f(a.F)}, p ${pEq(a.p)}, η² = ${f(a.eta2, 3)} → ${a.p < 0.05 ? 'group means differ significantly' : 'no significant group differences'}.`) : '';
    inf += an(t.anovaHouse, `${outName} by house type`) + an(t.anovaIncome, `${predName} by income bracket`) + an(t.anovaEdu, `${predName} by education`);
    if (t.chi?.length) inf += `<h3 class="an-h3">Chi-square tests of independence</h3>` + table(['Variables', 'χ²', 'df', 'p', "Cramér's V", 'Result'], t.chi.map(c => [`${esc(c.la)} × ${esc(c.lb)}`, f(c.chi2), c.df, pf(c.p), f(c.cramersV), c.p < 0.05 ? 'Associated' : 'Independent']));
    if (r.correlation) inf += `<h3 class="an-h3">Pearson correlation matrix (n = ${r.correlation.n})</h3>` + heat(r.correlation.labels, r.correlation.R, r.correlation.P) + note('* p < .05, ** p < .01, *** p < .001');
    if (r.regression) { const g = r.regression; inf += `<h3 class="an-h3">Multiple regression: ${esc(outName)} on other constructs and wealth indicators</h3>` + table(['Predictor', 'B', 'SE', 'β', 't', 'p'], g.coefs.map(c => [esc(c.name), f(c.b, 3), f(c.se, 3), c.beta == null ? '—' : f(c.beta, 3), f(c.t), `<span class="${sigCls(c.p)}">${pf(c.p)}${stars(c.p)}</span>`])) + note(`R² = ${f(g.r2, 3)}, adjusted R² = ${f(g.adjR2, 3)}, F(${g.df1}, ${g.df2}) = ${f(g.F)}, p ${pEq(g.pF)}, n = ${g.n}.`); }
    parts.push(card('Inferential statistics', inf));
    if (!r.reliability) { $('#anBody').innerHTML = parts.join(''); return; }
    // Reliability
    parts.push(card('Reliability (Cronbach\'s α)', table(['Construct', 'Items', 'α', 'Mean', 'SD', 'Item–total correlations', 'Verdict'], r.reliability.map(x => [esc(x.name), x.k, `<b class="${x.alpha >= 0.7 ? 'sig' : 'bad'}">${f(x.alpha, 3)}</b>`, f(x.mean), f(x.sd), x.itemTotal.map(i => `${i.item.toUpperCase()} ${f(i.r)}`).join(', '), x.alpha >= 0.9 ? 'Excellent' : x.alpha >= 0.8 ? 'Good' : x.alpha >= 0.7 ? 'Acceptable' : x.alpha >= 0.6 ? 'Questionable' : 'Poor'])) + note('α ≥ 0.70 acceptable; item–total correlations ≥ 0.30 expected.')));
    // EFA
    if (r.efa) { const e = r.efa; const fac = Array.from({ length: e.retained }, (_, j) => `F${j + 1}`); parts.push(card('Exploratory factor analysis (PCA, varimax)', `<div class="stats">${[['KMO', f(e.kmo.kmo, 3)], ['Bartlett χ²', f(e.bartlett?.chi2, 1)], ['df', e.bartlett?.df], ['p', pf(e.bartlett?.p)], ['Factors (eigen > 1)', e.retained], ['Variance explained', (e.totalExplained * 100).toFixed(1) + '%']].map(([l, v]) => `<div class="stat"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('')}</div><div class="an-grid"><div><h3 class="an-h3">Scree plot</h3>${scree(e.eigen)}</div><div><h3 class="an-h3">Variance by factor</h3>${barChart(e.explained.map((v, j) => ({ label: fac[j], value: v })))}</div></div><h3 class="an-h3">Rotated loadings (|λ| ≥ 0.40 shown bold)</h3>` + table(['Item', ...fac, 'h²'], e.loadings.map((row, i) => [e.names[i].toUpperCase(), ...row.map(v => Math.abs(v) >= 0.4 ? `<b>${f(v)}</b>` : `<span class="dim">${f(v)}</span>`), f(e.communalities[i])])) + note(`KMO ≥ 0.60 (good ≥ 0.80) and a significant Bartlett test indicate the data are suitable for factor analysis. ${e.retained === Object.keys(CONSTRUCTS).length ? 'The number of retained factors matches the designed constructs.' : `The eigenvalue rule retained ${e.retained} factor(s) versus ${Object.keys(CONSTRUCTS).length} designed constructs.`}`))); }
    // CFA
    if (r.cfa) { const c = r.cfa; parts.push(card('Confirmatory factor analysis (CB-SEM, maximum likelihood)', fitTable(c) + `<h3 class="an-h3">Standardized loadings</h3>` + table(['Construct', 'Item', 'λ (std)', 'SE', 'z', 'p'], c.loadings.map(l => [esc(cname(l.latent)), l.item.toUpperCase(), `<b class="${l.std >= 0.5 ? '' : 'bad'}">${f(l.std, 3)}</b>`, f(l.se, 3), f(l.z), Number.isFinite(l.p) ? pf(l.p) + stars(l.p) : 'fixed'])) +
      `<h3 class="an-h3">Convergent & discriminant validity</h3>` + table(['Construct', 'CR', 'AVE', '√AVE', ...r.fornell.keys], r.validity.map((v, i) => [esc(v.name), `<b class="${v.cr >= 0.7 ? '' : 'bad'}">${f(v.cr, 3)}</b>`, `<b class="${v.ave >= 0.5 ? '' : 'bad'}">${f(v.ave, 3)}</b>`, f(v.sqrtAve, 3), ...r.fornell.keys.map((k, j) => j === i ? `<b>${f(v.sqrtAve, 3)}</b>` : j < i ? f(r.fornell.corr[i][j], 3) : '')])) + note('Fornell–Larcker: √AVE (diagonal, bold) should exceed the correlations with other constructs. CR ≥ 0.70, AVE ≥ 0.50.') +
      `<h3 class="an-h3">HTMT ratios</h3>` + table(['Pair', 'HTMT', 'Verdict'], Object.entries(r.htmt).map(([k, v]) => [k.replace('|', ' ↔ ').replace(/[A-Z]{2}/g, m => cname(m)), f(v, 3), v < 0.85 ? 'Discriminant validity OK' : v < 0.9 ? 'Borderline (< 0.90)' : 'Problematic'])))); }
    // SEM
    if (r.sem) { const m = r.sem; parts.push(card('Structural equation model (CB-SEM, maximum likelihood)', pathDiagram(m.latents, m.paths, m.r2, { caption: 'Standardized coefficients; dashed = not significant' }) + fitTable(m) + table(['Path', 'B', 'SE', 'β (std)', 'z', 'p'], m.paths.map(p => [`${esc(cname(p.from))} → ${esc(cname(p.to))}`, f(p.b, 3), f(p.se, 3), f(p.beta, 3), f(p.z), `<span class="${sigCls(p.p)}">${pf(p.p)}${stars(p.p)}</span>`])) + note(Object.entries(m.r2).map(([k, v]) => `R²(${cname(k)}) = ${f(v, 3)}`).join(' · ')))); }
    // PLS
    if (r.pls) {
      const p = r.pls;
      let html = pathDiagram(Object.keys(CONSTRUCTS), p.paths.map(x => ({ ...x, beta: x.est })), p.r2, { caption: `Bootstrapped path coefficients (${p.B} resamples)` });
      html += `<h3 class="an-h3">Structural paths (bootstrap ${p.B})</h3>` + table(['Path', 'β', 'SE', 't', 'p', '95% CI', 'f²', 'Effect'], p.paths.map(x => [`${esc(cname(x.from))} → ${esc(cname(x.to))}`, f(x.est, 3), f(x.se, 3), f(x.t), `<span class="${sigCls(x.p)}">${pf(x.p)}${stars(x.p)}</span>`, `[${f(x.lo, 3)}, ${f(x.hi, 3)}]`, f(x.f2, 3), x.f2 >= 0.35 ? 'Large' : x.f2 >= 0.15 ? 'Medium' : x.f2 >= 0.02 ? 'Small' : 'None']));
      html += note(Object.entries(p.r2).map(([k, v]) => `R²(${cname(k)}) = ${f(v, 3)} (${v >= 0.67 ? 'substantial' : v >= 0.33 ? 'moderate' : v >= 0.19 ? 'weak' : 'negligible'})`).join(' · '));
      html += `<h3 class="an-h3">Outer model (PLS)</h3>` + table(['Construct', 'Loadings', 'CR', 'AVE'], Object.entries(p.loadings).map(([c, ls]) => [esc(cname(c)), ls.map(l => `${l.item.toUpperCase()} ${f(l.loading)}`).join(', '), f(p.validity[c].cr, 3), f(p.validity[c].ave, 3)]));
      if (p.mediation.length) html += `<h3 class="an-h3">Mediation analysis</h3>` + table(['Indirect path', 'Indirect β', '95% CI', 'p', 'Direct β', 'p', 'Total', 'VAF', 'Conclusion'], p.mediation.map(m => [`${esc(cname(m.a))} → ${esc(cname(m.m))} → ${esc(cname(m.b))}`, f(m.indirect.est, 3), `[${f(m.indirect.lo, 3)}, ${f(m.indirect.hi, 3)}]`, `<span class="${sigCls(m.indirect.p)}">${pf(m.indirect.p)}</span>`, f(m.direct.est, 3), pf(m.direct.p), f(m.total, 3), Number.isFinite(m.vaf) ? (m.vaf * 100).toFixed(0) + '%' : '—', m.type])) + note('Indirect effects are tested with bias-free percentile bootstrap CIs; VAF = indirect / total (20–80% ≈ partial, > 80% ≈ full mediation).');
      if (p.moderation) { const mo = p.moderation; html += `<h3 class="an-h3">Moderation: ${esc(cname(mo.moderator))} × ${esc(cname(mo.predictor))} → ${esc(cname(mo.outcome))} (two-stage)</h3>` + table(['Interaction β', 'SE', 't', 'p', '95% CI', 'f²', 'R² with / without'], [[f(mo.interaction.est, 3), f(mo.interaction.se, 3), f(mo.interaction.t), `<span class="${sigCls(mo.interaction.p)}">${pf(mo.interaction.p)}${stars(mo.interaction.p)}</span>`, `[${f(mo.interaction.lo, 3)}, ${f(mo.interaction.hi, 3)}]`, f(mo.f2, 3), `${f(mo.r2, 3)} / ${f(mo.r2Main, 3)}`]]) + `<div class="an-grid"><div><h3 class="an-h3">Simple slopes of ${esc(cname(mo.predictor))} → ${esc(cname(mo.outcome))}</h3>${barChart([{ label: `Low ${cname(mo.moderator)} (−1 SD)`, value: mo.simple.low }, { label: `Mean ${cname(mo.moderator)}`, value: mo.simple.mean }, { label: `High ${cname(mo.moderator)} (+1 SD)`, value: mo.simple.high }], { pct: false, max: Math.max(mo.simple.low, mo.simple.mean, mo.simple.high, 0.01) })}</div></div>`; }
      if (p.higher) { const h = p.higher; html += `<h3 class="an-h3">Higher-order construct: ${esc(h.name)} (reflective–reflective, two-stage)</h3>` + pathDiagram([h.key, ...h.covariates, h.outcome], h.paths.map(x => ({ ...x, beta: x.est })), { [h.outcome]: h.r2 }) + table(['Lower-order component', 'Loading on ' + esc(h.name)], h.loadings.map(l => [esc(cname(l.lower)), f(l.loading, 3)])) + note(`CR = ${f(h.cr, 3)}, AVE = ${f(h.ave, 3)}; R²(${cname(h.outcome)}) = ${f(h.r2, 3)}.`) + table(['Path', 'β', 'SE', 't', 'p', '95% CI'], h.paths.map(x => [`${esc(cname(x.from))} → ${esc(cname(x.to))}`, f(x.est, 3), f(x.se, 3), f(x.t), `<span class="${sigCls(x.p)}">${pf(x.p)}${stars(x.p)}</span>`, `[${f(x.lo, 3)}, ${f(x.hi, 3)}]`])); }
      parts.push(card('PLS-SEM: paths, mediation, moderation, higher-order construct', html));
    }
    $('#anBody').innerHTML = parts.join('');
  }

  /* ---------- interpretation report ---------- */
  function report(r) {
    const P = [];
    const s = r.sample;
    P.push(`<p><b>Sample.</b> ${r.N} household records were analysed (${s.completeLikert} with complete perception items). At 95% confidence the sample supports a margin of error of ±${(s.marginError * 100).toFixed(1)} percentage points${r.N >= s.cochran ? ', meeting' : ` — below`} Cochran's ±5% target of ${s.cochran}. ${s.completeLikert >= 200 ? 'The sample is adequate for covariance-based SEM.' : s.completeLikert >= s.semRule10 ? 'The sample satisfies the PLS-SEM 10-times rule but is below the ≈200 recommended for CB-SEM, so CB-SEM fit indices should be read cautiously.' : 'The sample is too small for reliable SEM; results are indicative only.'}</p>`);
    const fq = k => r.frequencies.find(x => x.k === k); const top = k => { const q = fq(k); if (!q) return null; const m = [...q.rows].sort((a, b) => b.n - a.n)[0]; return `${m.v} (${(m.pct * 100).toFixed(0)}%)`; };
    const dv = k => r.descriptives.find(x => x.k === k);
    P.push(`<p><b>Profile.</b> Households average ${f(dv('household_size')?.mean, 1)} members with ${f(dv('asset_count')?.mean, 1)} of 16 listed assets and an amenity index of ${f(dv('amenity_index')?.mean, 1)}/4. The modal house type is ${top('house_type') || '—'}, the modal income bracket ${top('monthly_income') || '—'}, drinking water mostly from ${top('water_source') || '—'} and sanitation mostly ${top('toilet') || '—'}. Mean construct scores (1–5): ${Object.entries(CONSTRUCTS).map(([k, c]) => `${c.name} ${f(dv(k)?.mean)}`).join(', ')}.</p>`);
    const t = r.tests; const bits = [];
    const on = cname(r.outcome).toLowerCase(), pn = cname(r.predictor).toLowerCase();
    if (t.tGender) bits.push(`${on} ${t.tGender.p < 0.05 ? 'differs' : 'does not differ'} significantly between male- and female-headed households (t = ${f(t.tGender.t)}, p ${pEq(t.tGender.p)}, d = ${f(t.tGender.d)})`);
    if (t.anovaHouse) bits.push(`${on} ${t.anovaHouse.p < 0.05 ? 'varies' : 'does not vary'} by house type (F = ${f(t.anovaHouse.F)}, p ${pEq(t.anovaHouse.p)}, η² = ${f(t.anovaHouse.eta2, 3)})`);
    if (t.anovaIncome) bits.push(`${pn} ${t.anovaIncome.p < 0.05 ? 'differs' : 'does not differ'} across income brackets (F = ${f(t.anovaIncome.F)}, p ${pEq(t.anovaIncome.p)})`);
    const chis = (t.chi || []).filter(c => c.p < 0.05).map(c => `${c.la} × ${c.lb} (V = ${f(c.cramersV)})`);
    if (chis.length) bits.push(`significant associations were found for ${chis.join('; ')}`);
    if (bits.length) P.push(`<p><b>Group differences.</b> ${bits.join('; ')}.</p>`);
    if (r.regression) { const g = r.regression; const sig = g.coefs.slice(1).filter(c => c.p < 0.05).sort((a, b) => Math.abs(b.beta) - Math.abs(a.beta)); P.push(`<p><b>Regression.</b> The predictors explain ${(g.adjR2 * 100).toFixed(0)}% of the variance in ${on} (adj. R² = ${f(g.adjR2, 3)}, F = ${f(g.F)}, p ${pEq(g.pF)}). ${sig.length ? 'Significant predictors: ' + sig.map(c => `${c.name} (β = ${f(c.beta)}, p ${pEq(c.p)})`).join(', ') + '.' : 'No predictor reached significance.'}</p>`); }
    if (r.reliability) { const bad = r.reliability.filter(x => x.alpha < 0.7); P.push(`<p><b>Measurement quality.</b> Cronbach's α ranges from ${f(Math.min(...r.reliability.map(x => x.alpha)), 2)} to ${f(Math.max(...r.reliability.map(x => x.alpha)), 2)}${bad.length ? `; ${bad.map(x => x.name).join(', ')} fall${bad.length === 1 ? 's' : ''} below the 0.70 threshold and may need item revision` : ', so all scales are internally consistent'}. ${r.efa ? `KMO = ${f(r.efa.kmo.kmo, 2)} and Bartlett's test (p ${pEq(r.efa.bartlett?.p)}) ${r.efa.kmo.kmo >= 0.6 && r.efa.bartlett?.p < 0.05 ? 'confirm' : 'question'} factorability; PCA retained ${r.efa.retained} factors explaining ${(r.efa.totalExplained * 100).toFixed(0)}% of variance.` : ''} ${r.validity ? `CFA composite reliability ${r.validity.every(v => v.cr >= 0.7) ? 'exceeds' : 'does not everywhere exceed'} 0.70 and AVE ${r.validity.every(v => v.ave >= 0.5) ? 'exceeds' : 'does not everywhere exceed'} 0.50; HTMT ratios are ${Object.values(r.htmt).every(v => v < 0.85) ? 'all below 0.85, establishing discriminant validity' : 'not all below 0.85, so some constructs overlap'}.` : ''}</p>`); }
    if (r.cfa) P.push(`<p><b>Model fit.</b> The ${Object.keys(CONSTRUCTS).length}-factor CFA ${fitOk(r.cfa) ? 'fits well' : 'shows imperfect fit'} (χ²(${r.cfa.df}) = ${f(r.cfa.chi2, 1)}, CFI = ${f(r.cfa.cfi, 3)}, TLI = ${f(r.cfa.tli, 3)}, RMSEA = ${f(r.cfa.rmsea, 3)}, SRMR = ${f(r.cfa.srmr, 3)}).${r.sem ? ` The structural model ${fitOk(r.sem) ? 'also fits acceptably' : 'fits less well'} (CFI = ${f(r.sem.cfi, 3)}, RMSEA = ${f(r.sem.rmsea, 3)}, SRMR = ${f(r.sem.srmr, 3)}).` : ''}</p>`);
    if (r.pls) {
      const p = r.pls; const sig = p.paths.filter(x => x.p < 0.05), ns = p.paths.filter(x => !(x.p < 0.05));
      P.push(`<p><b>Structural relationships (PLS-SEM, ${p.B} bootstraps).</b> ${sig.length ? 'Supported hypotheses: ' + sig.map(x => `${cname(x.from)} → ${cname(x.to)} (β = ${f(x.est)}, p ${pEq(x.p)})`).join('; ') + '.' : 'No path is significant.'} ${ns.length ? 'Not supported: ' + ns.map(x => `${cname(x.from)} → ${cname(x.to)} (β = ${f(x.est)}, p ${pEq(x.p)})`).join('; ') + '.' : ''} The model explains ${Object.entries(p.r2).map(([k, v]) => `${(v * 100).toFixed(0)}% of ${cname(k)}`).join(' and ')}.</p>`);
      if (p.mediation.length) P.push(`<p><b>Mediation.</b> ${p.mediation.map(m => `${cname(m.a)} → ${cname(m.m)} → ${cname(m.b)}: indirect β = ${f(m.indirect.est, 3)} (95% CI ${f(m.indirect.lo, 3)} to ${f(m.indirect.hi, 3)}), direct β = ${f(m.direct.est, 3)} — ${m.type.toLowerCase()}`).join('; ')}.</p>`);
      if (p.moderation) { const mo = p.moderation; P.push(`<p><b>Moderation.</b> The ${cname(mo.moderator)} × ${cname(mo.predictor)} interaction on ${cname(mo.outcome)} is ${mo.interaction.p < 0.05 ? 'significant' : 'not significant'} (β = ${f(mo.interaction.est, 3)}, p ${pEq(mo.interaction.p)}, f² = ${f(mo.f2, 3)}): the effect of ${cname(mo.predictor)} is ${f(mo.simple.low)} at low, ${f(mo.simple.mean)} at mean and ${f(mo.simple.high)} at high ${cname(mo.moderator)}${mo.interaction.p < 0.05 ? (mo.interaction.est > 0 ? ' — social capital strengthens the pay-off of economic security.' : ' — social capital weakens the effect.') : '.'}</p>`); }
      if (p.higher) { const h = p.higher; const hp = h.paths[0]; P.push(`<p><b>Higher-order construct.</b> ${h.name} (formed by ${h.loadings.map(l => `${cname(l.lower)} λ = ${f(l.loading)}`).join(', ')}; CR = ${f(h.cr)}, AVE = ${f(h.ave)}) ${hp.p < 0.05 ? 'significantly predicts' : 'does not significantly predict'} ${cname(h.outcome)} (β = ${f(hp.est)}, p ${pEq(hp.p)}, R² = ${f(h.r2)}).</p>`); }
    }
    P.push(`<p class="dim"><small>Automated output for exploratory use; verify key results in SPSS/AMOS/SmartPLS/R before publication. * p &lt; .05, ** p &lt; .01, *** p &lt; .001.</small></p>`);
    return P.join('');
  }

  function downloadReport() {
    if (!last?.result) return toast('Run the analysis first');
    const css = [...document.styleSheets].map(s => { try { return [...s.cssRules].map(r => r.cssText).join('\n'); } catch { return ''; } }).join('\n');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>GeoSurvey analysis report</title><style>${css}\nbody{padding:24px;max-width:1000px;margin:auto}</style></head><body><h1>GeoSurvey — analysis report</h1><p class="dim">${esc($('#anStatus').textContent)}</p>${$('#anBody').innerHTML}</body></html>`;
    download(`geosurvey_analysis_${new Date().toISOString().slice(0, 10)}.html`, html, 'text/html');
  }

  function open() { opened = true; if (!last?.result) run(); }
  function init() {
    $('#anRunBtn').onclick = run; $('#anReportBtn').onclick = downloadReport;
    $('#anSource').onchange = run; $('#anIncludeSample').onchange = run;
    $('#anSampleBtn').onclick = () => { const n = parseInt(prompt('How many synthetic households to generate?', '150'), 10); if (!n) return; LS.set('gs_sample', sampleRecords(Math.min(2000, n))); $('#anIncludeSample').checked = true; toast(`${n} sample records generated (kept separate from real data)`, 'ok'); run(); };
    $('#anSampleClearBtn').onclick = () => { LS.set('gs_sample', []); toast('Sample data removed'); run(); };
    $('#anSampleTools').hidden = !settings.sampleTools;
  }
  document.addEventListener('DOMContentLoaded', init);
  return { schedule, run, open, sampleRecords };
})();
