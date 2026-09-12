/* GeoSurvey statistics engine (Web Worker). Pure JS, no dependencies.
 * Descriptives · inferential tests · reliability · EFA (PCA + varimax) · CB-SEM (ML CFA & structural)
 * · PLS-SEM with bootstrap · mediation · moderation (two-stage) · higher-order construct (two-stage). */
'use strict';

/* ================= Linear algebra ================= */
const zeros = (r, c) => Array.from({ length: r }, () => new Float64Array(c));
const eye = n => { const I = zeros(n, n); for (let i = 0; i < n; i++) I[i][i] = 1; return I; };
const T = A => { const r = A.length, c = A[0].length, B = zeros(c, r); for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) B[j][i] = A[i][j]; return B; };
function mul(A, B) {
  const r = A.length, k = B.length, c = B[0].length, C = zeros(r, c);
  for (let i = 0; i < r; i++) { const Ai = A[i], Ci = C[i]; for (let t = 0; t < k; t++) { const a = Ai[t]; if (a === 0) continue; const Bt = B[t]; for (let j = 0; j < c; j++) Ci[j] += a * Bt[j]; } }
  return C;
}
function inv(A) {
  const n = A.length, M = A.map((r, i) => Float64Array.from([...r, ...eye(n)[i]]));
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) throw new Error('Singular matrix');
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c]; for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; if (f) for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j]; }
  }
  return M.map(r => r.slice(n));
}
function logdet(A) { // via Cholesky; throws if not positive definite
  const n = A.length, L = zeros(n, n); let ld = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = A[i][j]; for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
    if (i === j) { if (s <= 0) throw new Error('Not positive definite'); L[i][i] = Math.sqrt(s); ld += Math.log(s); } else L[i][j] = s / L[j][j];
  }
  return ld;
}
const trace = A => A.reduce((s, r, i) => s + r[i], 0);
function jacobiEigen(S) { // symmetric eigen-decomposition
  const n = S.length, A = S.map(r => Float64Array.from(r)), V = eye(n);
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] ** 2;
    if (off < 1e-20) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(A[p][q]) < 1e-14) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
    }
  }
  const idx = [...Array(n).keys()].sort((a, b) => A[b][b] - A[a][a]);
  return { values: idx.map(i => A[i][i]), vectors: idx.map(i => V.map(r => r[i])) }; // vectors[k] = k-th eigenvector
}

/* ================= Distributions ================= */
function lgamma(x) { const g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]; let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let s = 1.000000000190015; for (const c of g) s += c / ++y; return -t + Math.log(2.5066282746310005 * s / x); }
function gammaP(a, x) { // regularized lower incomplete gamma
  if (x <= 0) return 0;
  if (x < a + 1) { let ap = a, sum = 1 / a, del = sum; for (let n = 0; n < 500; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-14) break; } return sum * Math.exp(-x + a * Math.log(x) - lgamma(a)); }
  let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
  for (let i = 1; i < 500; i++) { const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-14) break; }
  return 1 - Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
}
function betacf(a, b, x) { let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap; if (Math.abs(d) < 1e-300) d = 1e-300; d = 1 / d; let h = d; for (let m = 1; m <= 300; m++) { const m2 = 2 * m; let aa = m * (b - m) * x / ((qam + m2) * (a + m2)); d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300; c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; h *= d * c; aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2)); d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300; c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-14) break; } return h; }
function betaI(a, b, x) { if (x <= 0) return 0; if (x >= 1) return 1; const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x)); return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b; }
const normCdf = z => 0.5 * (1 + erf(z / Math.SQRT2));
function erf(x) { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x < 0 ? -y : y; }
const pNorm2 = z => 2 * (1 - normCdf(Math.abs(z)));
const pT2 = (t, df) => df > 0 ? betaI(df / 2, 0.5, df / (df + t * t)) : NaN;
const pChi = (x, df) => df > 0 && x >= 0 ? 1 - gammaP(df / 2, x / 2) : NaN;
const pF = (F, d1, d2) => F > 0 ? betaI(d2 / 2, d1 / 2, d2 / (d2 + d1 * F)) : 1;
const Z95 = 1.959964;

/* ================= Basic statistics ================= */
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const variance = a => { const m = mean(a); return a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1); };
const sd = a => Math.sqrt(variance(a));
function describe(a) {
  a = a.filter(Number.isFinite); if (a.length < 2) return null;
  const m = mean(a), s = sd(a), n = a.length, sorted = [...a].sort((x, y) => x - y);
  const m3 = a.reduce((t, v) => t + (v - m) ** 3, 0) / n, m4 = a.reduce((t, v) => t + (v - m) ** 4, 0) / n, s2 = a.reduce((t, v) => t + (v - m) ** 2, 0) / n;
  return { n, mean: m, sd: s, min: sorted[0], max: sorted[n - 1], median: n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2, skew: s2 > 0 ? m3 / s2 ** 1.5 : 0, kurt: s2 > 0 ? m4 / s2 ** 2 - 3 : 0, se: s / Math.sqrt(n) };
}
function corr(a, b) { const ma = mean(a), mb = mean(b); let sab = 0, sa = 0, sb = 0; for (let i = 0; i < a.length; i++) { sab += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; } return sa && sb ? sab / Math.sqrt(sa * sb) : 0; }
function corrMatrix(cols) { const p = cols.length, R = zeros(p, p); for (let i = 0; i < p; i++) for (let j = i; j < p; j++) R[i][j] = R[j][i] = i === j ? 1 : corr(cols[i], cols[j]); return R; }
const standardize = a => { const m = mean(a), s = sd(a) || 1; return a.map(v => (v - m) / s); };
const pCorr = (r, n) => n > 2 ? pT2(r * Math.sqrt((n - 2) / Math.max(1e-12, 1 - r * r)), n - 2) : NaN;

/* ================= Inferential tests ================= */
function welch(a, b) {
  if (a.length < 2 || b.length < 2) return null;
  const va = variance(a) / a.length, vb = variance(b) / b.length, t = (mean(a) - mean(b)) / Math.sqrt(va + vb);
  const df = (va + vb) ** 2 / (va ** 2 / (a.length - 1) + vb ** 2 / (b.length - 1));
  const sp = Math.sqrt(((a.length - 1) * variance(a) + (b.length - 1) * variance(b)) / (a.length + b.length - 2));
  return { t, df, p: pT2(t, df), d: (mean(a) - mean(b)) / sp, meanA: mean(a), meanB: mean(b), nA: a.length, nB: b.length };
}
function anova(groups) { // groups: [{name, values}]
  groups = groups.filter(g => g.values.length >= 2); if (groups.length < 2) return null;
  const all = groups.flatMap(g => g.values), gm = mean(all), N = all.length, k = groups.length;
  const ssb = groups.reduce((s, g) => s + g.values.length * (mean(g.values) - gm) ** 2, 0);
  const ssw = groups.reduce((s, g) => s + g.values.reduce((t, v) => t + (v - mean(g.values)) ** 2, 0), 0);
  const F = (ssb / (k - 1)) / (ssw / (N - k));
  return { F, df1: k - 1, df2: N - k, p: pF(F, k - 1, N - k), eta2: ssb / (ssb + ssw), groups: groups.map(g => ({ name: g.name, n: g.values.length, mean: mean(g.values), sd: sd(g.values) })) };
}
function chiSquare(rowsVals, colsVals) {
  const rows = [...new Set(rowsVals)].filter(Boolean), cols = [...new Set(colsVals)].filter(Boolean);
  if (rows.length < 2 || cols.length < 2) return null;
  const tab = rows.map(r => cols.map(c => rowsVals.reduce((s, v, i) => s + (v === r && colsVals[i] === c ? 1 : 0), 0)));
  const N = tab.flat().reduce((a, b) => a + b, 0), rs = tab.map(r => r.reduce((a, b) => a + b, 0)), cs = cols.map((_, j) => tab.reduce((a, r) => a + r[j], 0));
  let chi = 0; tab.forEach((r, i) => r.forEach((o, j) => { const e = rs[i] * cs[j] / N; if (e > 0) chi += (o - e) ** 2 / e; }));
  const df = (rows.length - 1) * (cols.length - 1);
  return { chi2: chi, df, p: pChi(chi, df), cramersV: Math.sqrt(chi / (N * Math.min(rows.length - 1, cols.length - 1))), rows, cols, table: tab, N };
}
function ols(X, y, names) { // X: array of predictor columns (without intercept)
  const n = y.length, k = X.length;
  const Xm = Array.from({ length: n }, (_, i) => Float64Array.from([1, ...X.map(c => c[i])]));
  const Xt = T(Xm), XtX = mul(Xt, Xm); let XtXi; try { XtXi = inv(XtX); } catch { return null; }
  const beta = mul(XtXi, mul(Xt, y.map(v => [v]))).map(r => r[0]);
  const yhat = Xm.map(r => r.reduce((s, v, j) => s + v * beta[j], 0));
  const ssr = y.reduce((s, v, i) => s + (v - yhat[i]) ** 2, 0), sst = y.reduce((s, v) => s + (v - mean(y)) ** 2, 0);
  const df = n - k - 1, mse = ssr / df, r2 = 1 - ssr / sst;
  const F = ((sst - ssr) / k) / mse;
  const sds = X.map(sd), sdy = sd(y);
  const coefs = beta.map((b, j) => { const se = Math.sqrt(mse * XtXi[j][j]); return { name: j ? names[j - 1] : '(Intercept)', b, se, t: b / se, p: pT2(b / se, df), beta: j ? b * sds[j - 1] / sdy : null }; });
  return { coefs, r2, adjR2: 1 - (1 - r2) * (n - 1) / df, F, df1: k, df2: df, pF: pF(F, k, df), n };
}

/* ================= Reliability / EFA ================= */
function cronbach(items) { // items: array of columns
  const k = items.length, n = items[0].length; if (k < 2) return null;
  const tot = Array.from({ length: n }, (_, i) => items.reduce((s, c) => s + c[i], 0));
  const a = k / (k - 1) * (1 - items.reduce((s, c) => s + variance(c), 0) / variance(tot));
  const itemTotal = items.map((c, j) => { const rest = Array.from({ length: n }, (_, i) => tot[i] - c[i]); return corr(c, rest); });
  return { alpha: a, itemTotal };
}
function kmo(R) {
  const p = R.length; let Ri; try { Ri = inv(R); } catch { return { kmo: NaN, msa: [] }; }
  let sr = 0, sq = 0; const msa = [];
  for (let i = 0; i < p; i++) { let ri = 0, qi = 0; for (let j = 0; j < p; j++) if (i !== j) { const q = -Ri[i][j] / Math.sqrt(Ri[i][i] * Ri[j][j]); ri += R[i][j] ** 2; qi += q ** 2; } sr += ri; sq += qi; msa.push(ri / (ri + qi)); }
  return { kmo: sr / (sr + sq), msa };
}
function bartlett(R, n) { const p = R.length; let ld; try { ld = logdet(R); } catch { return null; } const chi = -(n - 1 - (2 * p + 5) / 6) * ld, df = p * (p - 1) / 2; return { chi2: chi, df, p: pChi(chi, df) }; }
function varimax(L, maxIter = 100) { // L: p×k loadings
  const p = L.length, k = L[0].length; let A = L.map(r => Float64Array.from(r)); if (k < 2) return A;
  for (let it = 0; it < maxIter; it++) {
    let change = 0;
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
      let u = 0, v = 0, x = 0, y = 0; // Kaiser's pairwise rotation
      for (let r = 0; r < p; r++) { const a = A[r][i], b = A[r][j]; const uu = a * a - b * b, vv = 2 * a * b; u += uu; v += vv; x += uu * uu - vv * vv; y += 2 * uu * vv; }
      const num = y - 2 * u * v / p, den = x - (u * u - v * v) / p;
      const phi = Math.atan2(num, den) / 4; if (Math.abs(phi) < 1e-7) continue; change = Math.max(change, Math.abs(phi));
      const c = Math.cos(phi), s = Math.sin(phi);
      for (let r = 0; r < p; r++) { const a = A[r][i], b = A[r][j]; A[r][i] = c * a + s * b; A[r][j] = -s * a + c * b; }
    }
    if (change < 1e-6) break;
  }
  // flip signs so that the largest loading in each factor is positive
  for (let j = 0; j < k; j++) { let mx = 0; for (let r = 0; r < p; r++) if (Math.abs(A[r][j]) > Math.abs(mx)) mx = A[r][j]; if (mx < 0) for (let r = 0; r < p; r++) A[r][j] = -A[r][j]; }
  return A;
}
function efa(cols, names, n, maxFactors) {
  const R = corrMatrix(cols), p = cols.length;
  const { values, vectors } = jacobiEigen(R);
  const k = Math.max(1, Math.min(maxFactors, values.filter(v => v > 1).length));
  const L = zeros(p, k); for (let j = 0; j < k; j++) for (let i = 0; i < p; i++) L[i][j] = vectors[j][i] * Math.sqrt(Math.max(values[j], 0));
  const rot = varimax(L);
  const ssl = Array.from({ length: k }, (_, j) => rot.reduce((s, r) => s + r[j] ** 2, 0));
  return { R, kmo: kmo(R), bartlett: bartlett(R, n), eigen: values, retained: k, loadings: rot.map(r => [...r]), names, explained: ssl.map(s => s / p), totalExplained: ssl.reduce((a, b) => a + b, 0) / p, communalities: rot.map(r => r.reduce((s, v) => s + v * v, 0)) };
}

/* ================= CB-SEM (maximum likelihood) =================
 * model: { items:[names], latents:[keys], loadings:[[item, latent]], paths:[[from,to]], corrExo:true }
 * Scale: exogenous latent variances fixed at 1; endogenous latents: first loading fixed at 1. */
function fitSEM(S, n, model) {
  const p = model.items.length, m = model.latents.length;
  const li = Object.fromEntries(model.latents.map((k, i) => [k, i])), ii = Object.fromEntries(model.items.map((k, i) => [k, i]));
  const endo = new Set(model.paths.map(([, to]) => to)), exo = model.latents.filter(k => !endo.has(k));
  const params = []; const fixedLam = [];
  const firstOf = {};
  model.loadings.forEach(([item, lat]) => { if (endo.has(lat) && firstOf[lat] === undefined) { firstOf[lat] = item; fixedLam.push([ii[item], li[lat]]); } else params.push({ t: 'lam', i: ii[item], k: li[lat], v: 0.7 }); });
  for (let i = 0; i < p; i++) params.push({ t: 'th', i, v: Math.log(0.5) });
  model.latents.forEach(k => { if (endo.has(k)) params.push({ t: 'psi', k: li[k], l: li[k], v: Math.log(0.5) }); });
  if (model.corrExo !== false) for (let a = 0; a < exo.length; a++) for (let b = a + 1; b < exo.length; b++) params.push({ t: 'psi', k: li[exo[a]], l: li[exo[b]], v: 0.3 });
  model.paths.forEach(([from, to]) => params.push({ t: 'b', j: li[to], k: li[from], v: 0.2 }));
  const q = params.length, logdetS = logdet(S);

  function build(theta) {
    const Lam = zeros(p, m), B = zeros(m, m), Psi = zeros(m, m), Th = zeros(p, p);
    fixedLam.forEach(([i, k]) => Lam[i][k] = 1);
    exo.forEach(k => Psi[li[k]][li[k]] = 1);
    params.forEach((pr, idx) => { const v = theta[idx]; if (pr.t === 'lam') Lam[pr.i][pr.k] = v; else if (pr.t === 'th') Th[pr.i][pr.i] = Math.exp(v); else if (pr.t === 'psi') { if (pr.k === pr.l) Psi[pr.k][pr.k] = Math.exp(v); else Psi[pr.k][pr.l] = Psi[pr.l][pr.k] = v; } else B[pr.j][pr.k] = v; });
    const IB = eye(m); for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) IB[i][j] -= B[i][j];
    const A = inv(IB), Phi = mul(mul(A, Psi), T(A));
    const Sig = mul(mul(Lam, Phi), T(Lam)); for (let i = 0; i < p; i++) Sig[i][i] += Th[i][i];
    return { Lam, B, Psi, Th, A, Phi, Sig };
  }
  function fAndG(theta, wantGrad) {
    let mats; try { mats = build(theta); } catch { return { F: Infinity }; }
    const { Lam, A, Phi, Sig } = mats; let SigI, ld; try { SigI = inv(Sig); ld = logdet(Sig); } catch { return { F: Infinity }; }
    const F = ld + trace(mul(S, SigI)) - logdetS - p;
    if (!wantGrad) return { F, mats };
    const SigIS = mul(SigI, S), W = zeros(p, p); const t2 = mul(SigIS, SigI);
    for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) W[i][j] = SigI[i][j] - t2[i][j];
    const G = mul(Lam, Phi), H = mul(Lam, A), WG = mul(W, G), HtWH = mul(mul(T(H), W), H), GtWH = mul(mul(T(G), W), H);
    const g = new Float64Array(q);
    params.forEach((pr, idx) => {
      if (pr.t === 'lam') g[idx] = 2 * WG[pr.i][pr.k];
      else if (pr.t === 'th') g[idx] = W[pr.i][pr.i] * Math.exp(theta[idx]);
      else if (pr.t === 'psi') g[idx] = pr.k === pr.l ? HtWH[pr.k][pr.k] * Math.exp(theta[idx]) : 2 * HtWH[pr.k][pr.l];
      else g[idx] = 2 * GtWH[pr.k][pr.j];
    });
    return { F, g, mats };
  }
  // BFGS with backtracking line search
  let theta = Float64Array.from(params.map(pr => pr.v)); let cur = fAndG(theta, true);
  if (!isFinite(cur.F)) throw new Error('Bad start values');
  let Hk = eye(q).map(r => r.map(v => v * 0.05)); let iter = 0, converged = false;
  for (; iter < 500; iter++) {
    const d = Hk.map(r => -r.reduce((s, v, j) => s + v * cur.g[j], 0));
    let gd = d.reduce((s, v, j) => s + v * cur.g[j], 0);
    if (gd >= 0) { Hk = eye(q).map(r => r.map(v => v * 0.05)); continue; }
    let step = 1, next;
    for (let ls = 0; ls < 40; ls++) { const th2 = theta.map((v, j) => v + step * d[j]); next = fAndG(th2, true); if (isFinite(next.F) && next.F <= cur.F + 1e-4 * step * gd) { theta = th2; break; } step *= 0.5; next = null; }
    if (!next) break;
    const s = d.map(v => v * step), yv = next.g.map((v, j) => v - cur.g[j]); const sy = s.reduce((a, v, j) => a + v * yv[j], 0);
    if (sy > 1e-10) { // BFGS update of inverse Hessian
      const Hy = Hk.map(r => r.reduce((a, v, j) => a + v * yv[j], 0)), yHy = yv.reduce((a, v, j) => a + v * Hy[j], 0);
      for (let i = 0; i < q; i++) for (let j = 0; j < q; j++) Hk[i][j] += ((sy + yHy) * s[i] * s[j]) / (sy * sy) - (Hy[i] * s[j] + s[i] * Hy[j]) / sy;
    }
    const gmax = Math.max(...next.g.map(Math.abs));
    cur = next; if (gmax < 1e-5 || Math.abs(sy) < 1e-14) { converged = true; break; }
  }
  const { F, mats } = cur; const { Lam, B, Phi, Th, Psi } = mats;
  // Standard errors from the numerical Hessian of the analytic gradient
  let se = new Float64Array(q).fill(NaN);
  try {
    const h = 1e-4, Hm = zeros(q, q);
    for (let j = 0; j < q; j++) { const tp = theta.slice(), tm = theta.slice(); tp[j] += h; tm[j] -= h; const gp = fAndG(tp, true).g, gm = fAndG(tm, true).g; for (let i = 0; i < q; i++) Hm[i][j] = (gp[i] - gm[i]) / (2 * h); }
    for (let i = 0; i < q; i++) for (let j = i + 1; j < q; j++) Hm[i][j] = Hm[j][i] = (Hm[i][j] + Hm[j][i]) / 2;
    const C = inv(Hm); se = C.map((r, i) => Math.sqrt(Math.max(0, 2 / (n - 1) * r[i])));
  } catch {}
  const chi2 = (n - 1) * F, df = p * (p + 1) / 2 - q;
  const chi2b = -(n - 1) * logdetS, dfb = p * (p - 1) / 2; // independence baseline (correlation input)
  const cfi = 1 - Math.max(chi2 - df, 0) / Math.max(chi2b - dfb, chi2 - df, 1e-12);
  const tli = ((chi2b / dfb) - (chi2 / df)) / ((chi2b / dfb) - 1);
  const rmsea = Math.sqrt(Math.max((chi2 - df) / (df * (n - 1)), 0));
  let srmr = 0, cnt = 0; for (let i = 0; i < p; i++) for (let j = 0; j <= i; j++) { srmr += ((S[i][j] - mats.Sig[i][j]) / Math.sqrt(S[i][i] * S[j][j])) ** 2; cnt++; } srmr = Math.sqrt(srmr / cnt);
  // standardized solution
  const sdLat = model.latents.map((_, k) => Math.sqrt(Phi[k][k]));
  const stdLoad = model.loadings.map(([item, lat]) => ({ item, latent: lat, est: Lam[ii[item]][li[lat]] * sdLat[li[lat]] }));
  const est = params.map((pr, idx) => ({ ...pr, est: theta[idx], se: se[idx] }));
  const pathsOut = model.paths.map(([from, to]) => { const pr = est.find(e => e.t === 'b' && e.j === li[to] && e.k === li[from]); const z = pr.est / pr.se; return { from, to, b: pr.est, se: pr.se, z, p: pNorm2(z), beta: pr.est * sdLat[li[from]] / sdLat[li[to]] }; });
  const loadOut = model.loadings.map(([item, lat]) => { const pr = est.find(e => e.t === 'lam' && e.i === ii[item] && e.k === li[lat]); const z = pr ? pr.est / pr.se : NaN; return { item, latent: lat, est: pr ? pr.est : 1, se: pr ? pr.se : NaN, z, p: pr ? pNorm2(z) : NaN, std: Lam[ii[item]][li[lat]] * sdLat[li[lat]] }; });
  const r2 = {}; model.latents.forEach((k, i) => { if (endo.has(k)) r2[k] = 1 - Psi[i][i] / Phi[i][i]; });
  const latCorr = model.latents.map((_, i) => model.latents.map((_, j) => Phi[i][j] / (sdLat[i] * sdLat[j])));
  const errVar = model.items.map((it, i) => Th[i][i]);
  return { converged, iter, chi2, df, p: pChi(chi2, df), cfi, tli, rmsea, srmr, loadings: loadOut, paths: pathsOut, r2, latCorr, latents: model.latents, items: model.items, errVar, nParams: q, F, stdLoad };
}

/* ================= PLS-SEM ================= */
function pls(X, blocks, paths, maxIter = 300) { // X: array of standardized columns; blocks: {LV:[colIdx]}; paths: [[from,to]]
  const lvs = Object.keys(blocks), n = X[0].length;
  const pred = Object.fromEntries(lvs.map(k => [k, paths.filter(p => p[1] === k).map(p => p[0])]));
  const succ = Object.fromEntries(lvs.map(k => [k, paths.filter(p => p[0] === k).map(p => p[1])]));
  let w = Object.fromEntries(lvs.map(k => [k, blocks[k].map(() => 1)]));
  const scoresOf = (k, wk) => { const y = new Float64Array(n); blocks[k].forEach((c, j) => { const col = X[c]; for (let i = 0; i < n; i++) y[i] += wk[j] * col[i]; }); return standardize([...y]); };
  let Y = Object.fromEntries(lvs.map(k => [k, scoresOf(k, w[k])]));
  for (let it = 0; it < maxIter; it++) {
    const Z = {};
    for (const k of lvs) {
      const e = {};
      if (pred[k].length) { const reg = ols(pred[k].map(p => Y[p]), Y[k], pred[k]); pred[k].forEach((p, j) => e[p] = reg ? reg.coefs[j + 1].b : corr(Y[p], Y[k])); }
      succ[k].forEach(s => e[s] = corr(Y[k], Y[s]));
      const z = new Float64Array(n); Object.entries(e).forEach(([l, wt]) => { for (let i = 0; i < n; i++) z[i] += wt * Y[l][i]; });
      Z[k] = Object.keys(e).length ? standardize([...z]) : Y[k];
    }
    let change = 0; const w2 = {};
    for (const k of lvs) { const wk = blocks[k].map(c => corr(X[c], Z[k])); const y = scoresOf(k, wk); const sc = 1; w2[k] = wk.map(v => v * sc); change = Math.max(change, ...wk.map((v, j) => Math.abs(v - w[k][j]))); Y[k] = y; }
    w = w2; if (change < 1e-7) break;
  }
  const loadings = Object.fromEntries(lvs.map(k => [k, blocks[k].map(c => corr(X[c], Y[k]))]));
  const pathCoef = {}, r2 = {}, f2 = {};
  for (const k of lvs) if (pred[k].length) {
    const reg = ols(pred[k].map(p => Y[p]), Y[k], pred[k]); if (!reg) continue;
    r2[k] = reg.r2; pred[k].forEach((p, j) => { pathCoef[`${p}->${k}`] = reg.coefs[j + 1].b; });
    pred[k].forEach(p => { const others = pred[k].filter(o => o !== p); const r2ex = others.length ? (ols(others.map(o => Y[o]), Y[k], others)?.r2 ?? 0) : 0; f2[`${p}->${k}`] = (reg.r2 - r2ex) / (1 - reg.r2); });
  }
  return { weights: w, loadings, scores: Y, pathCoef, r2, f2 };
}
function crAve(load) { const s = load.reduce((a, b) => a + b, 0), s2 = load.reduce((a, b) => a + b * b, 0); return { cr: s * s / (s * s + load.reduce((a, b) => a + 1 - b * b, 0)), ave: s2 / load.length }; }
function htmt(X, blocks) {
  const lvs = Object.keys(blocks), R = corrMatrix(X), out = {};
  const within = k => { const b = blocks[k]; let s = 0, c = 0; for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) { s += Math.abs(R[b[i]][b[j]]); c++; } return c ? s / c : 1; };
  for (let a = 0; a < lvs.length; a++) for (let b = a + 1; b < lvs.length; b++) { let s = 0, c = 0; for (const i of blocks[lvs[a]]) for (const j of blocks[lvs[b]]) { s += Math.abs(R[i][j]); c++; } out[`${lvs[a]}|${lvs[b]}`] = (s / c) / Math.sqrt(within(lvs[a]) * within(lvs[b])); }
  return out;
}

/* ================= Analysis pipeline ================= */
function toNum(v) { const n = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : NaN; }
function run({ records, schema }) {
  const { constructs, model, fields } = schema;
  const fieldBy = Object.fromEntries(fields.map(f => [f.k, f]));
  const N = records.length;
  const res = { N, warnings: [] };
  if (N < 5) { res.warnings.push('Need at least 5 records.'); return res; }
  const code = (k, r) => { const f = fieldBy[k]; if (!f || !f.options) return NaN; const i = f.options.findIndex(o => o.toLowerCase() === String(r[k] ?? '').trim().toLowerCase()); return i < 0 ? NaN : i + 1; };
  const itemKeys = Object.values(constructs).flatMap(c => c.items);
  // derived variables per record
  const rows = records.map(r => {
    const d = { ...r };
    d.asset_count = String(r.assets || '').split(';').map(s => s.trim()).filter(s => s && s !== 'None').length;
    d.income_code = code('monthly_income', r); d.education_code = code('education', r); d.house_type_code = code('house_type', r); d.land_code = code('land_ownership', r);
    d.amenity_index = (r.electricity && r.electricity !== 'None' ? 1 : 0) + (/piped|hand pump|public tap|bottled/i.test(r.water_source || '') ? 1 : 0) + (/flush|pit/i.test(r.toilet || '') ? 1 : 0) + (/lpg|electric|biogas/i.test(r.cooking_fuel || '') ? 1 : 0);
    itemKeys.forEach(k => d[k] = toNum(r[k]));
    Object.entries(constructs).forEach(([c, def]) => { const vals = def.items.map(k => d[k]).filter(Number.isFinite); d[c] = vals.length === def.items.length ? mean(vals) : NaN; });
    ['household_size', 'head_age', 'children_under_14', 'earning_members', 'monthly_expense', 'rooms', 'latitude', 'longitude'].forEach(k => d[k] = toNum(r[k]));
    return d;
  });

  /* Sample size */
  const e95 = Z95 * Math.sqrt(0.25 / N);
  res.sample = { N, cochran: Math.ceil(Z95 ** 2 * 0.25 / 0.05 ** 2), marginError: e95, maxArrows: Math.max(...Object.keys(constructs).map(k => model.paths.filter(p => p[1] === k).length)), completeLikert: rows.filter(r => itemKeys.every(k => Number.isFinite(r[k]))).length };
  res.sample.semRule10 = res.sample.maxArrows * 10;

  /* Descriptives */
  const numVars = [['household_size', 'Household size'], ['head_age', 'Age of head'], ['children_under_14', 'Children < 14'], ['earning_members', 'Earning members'], ['monthly_expense', 'Monthly expenditure'], ['rooms', 'Rooms'], ['asset_count', 'Asset count (0–16)'], ['amenity_index', 'Amenity index (0–4)'], ['income_code', 'Income bracket (1–7)'], ...Object.entries(constructs).map(([k, c]) => [k, `${c.name} (mean of ${c.items.length} items)`])];
  res.descriptives = numVars.map(([k, label]) => ({ k, label, ...describe(rows.map(r => r[k])) })).filter(d => d.n);
  const catVars = ['house_type', 'monthly_income', 'water_source', 'toilet', 'cooking_fuel', 'electricity', 'education', 'occupation', 'head_gender', 'ration_card', 'social_category', 'road_access', 'land_ownership'];
  res.frequencies = catVars.filter(k => fieldBy[k]).map(k => { const counts = {}; let tot = 0; rows.forEach(r => { const v = String(r[k] || '').trim(); if (v) { counts[v] = (counts[v] || 0) + 1; tot++; } }); const order = fieldBy[k].options || Object.keys(counts); return { k, label: fieldBy[k].label, n: tot, rows: order.filter(o => counts[o]).map(o => ({ v: o, n: counts[o], pct: counts[o] / tot })) }; }).filter(f => f.n);
  res.likertItems = itemKeys.map(k => ({ k, label: fieldBy[k]?.label || k, ...describe(rows.map(r => r[k])) })).filter(d => d.n);

  /* Inferential */
  const val = (k, r) => r[k];
  const numRows = k => rows.filter(r => Number.isFinite(r[k]));
  res.tests = {};
  const male = rows.filter(r => r.head_gender === 'Male' && Number.isFinite(r.WB)).map(r => r.WB), female = rows.filter(r => r.head_gender === 'Female' && Number.isFinite(r.WB)).map(r => r.WB);
  res.tests.tGender = welch(male, female);
  const grp = (by, dv) => { const g = {}; rows.forEach(r => { if (r[by] && Number.isFinite(r[dv])) (g[r[by]] = g[r[by]] || []).push(r[dv]); }); const order = fieldBy[by]?.options || Object.keys(g); return anova(order.filter(o => g[o]).map(o => ({ name: o, values: g[o] }))); };
  res.tests.anovaHouse = grp('house_type', 'WB'); res.tests.anovaIncome = grp('monthly_income', 'ES'); res.tests.anovaEdu = grp('education', 'ES');
  res.tests.chi = [['house_type', 'toilet'], ['monthly_income', 'ration_card'], ['house_type', 'electricity'], ['head_gender', 'occupation']].map(([a, b]) => ({ a, b, la: fieldBy[a]?.label, lb: fieldBy[b]?.label, ...chiSquare(rows.map(r => String(r[a] || '')), rows.map(r => String(r[b] || ''))) })).filter(c => c.chi2 != null);
  const corrKeys = [...Object.keys(constructs), 'asset_count', 'amenity_index', 'income_code', 'household_size', 'head_age', 'education_code'];
  const cRows = rows.filter(r => corrKeys.every(k => Number.isFinite(r[k])));
  if (cRows.length > 5) { const cols = corrKeys.map(k => cRows.map(r => r[k])); const R = corrMatrix(cols); res.correlation = { keys: corrKeys, labels: corrKeys.map(k => constructs[k]?.name || numVars.find(v => v[0] === k)?.[1] || k), R: R.map(r => [...r]), P: R.map(r => r.map(v => pCorr(v, cRows.length))), n: cRows.length }; }
  const regKeys = ['ES', 'AS', 'GS', 'SC', 'asset_count', 'income_code'].filter(k => k in constructs || true);
  const rRows = rows.filter(r => [...regKeys, 'WB'].every(k => Number.isFinite(r[k])));
  if (rRows.length > regKeys.length + 5) res.regression = { dv: 'WB', names: regKeys.map(k => constructs[k]?.name || k), ...ols(regKeys.map(k => rRows.map(r => r[k])), rRows.map(r => r.WB), regKeys.map(k => constructs[k]?.name || k)) };

  /* Measurement: reliability, EFA, CFA */
  const complete = rows.filter(r => itemKeys.every(k => Number.isFinite(r[k])));
  const nC = complete.length; res.nComplete = nC;
  if (nC < itemKeys.length + 5) { res.warnings.push(`Only ${nC} records have all ${itemKeys.length} Likert items — need at least ${itemKeys.length + 5} for factor analysis / SEM.`); return res; }
  const X = itemKeys.map(k => complete.map(r => r[k]));
  const Xs = X.map(standardize);
  const idx = Object.fromEntries(itemKeys.map((k, i) => [k, i]));
  res.reliability = Object.entries(constructs).map(([c, def]) => { const a = cronbach(def.items.map(k => X[idx[k]])); return { c, name: def.name, k: def.items.length, alpha: a.alpha, itemTotal: def.items.map((k, i) => ({ item: k, r: a.itemTotal[i] })), mean: mean(complete.map(r => r[c])), sd: sd(complete.map(r => r[c])) }; });
  try { res.efa = efa(X, itemKeys, nC, Object.keys(constructs).length); } catch (e) { res.warnings.push('EFA failed: ' + e.message); }
  const S = corrMatrix(Xs);
  const cfaModel = { items: itemKeys, latents: Object.keys(constructs), loadings: Object.entries(constructs).flatMap(([c, d]) => d.items.map(k => [k, c])), paths: [] };
  try {
    res.cfa = fitSEM(S, nC, cfaModel);
    const byLat = Object.fromEntries(Object.keys(constructs).map(c => [c, res.cfa.loadings.filter(l => l.latent === c).map(l => l.std)]));
    res.validity = Object.entries(constructs).map(([c, def]) => { const { cr, ave } = crAve(byLat[c]); return { c, name: def.name, cr, ave, sqrtAve: Math.sqrt(ave) }; });
    res.fornell = { keys: Object.keys(constructs), corr: res.cfa.latCorr };
    res.htmt = htmt(Xs, Object.fromEntries(Object.entries(constructs).map(([c, d]) => [c, d.items.map(k => idx[k])])));
  } catch (e) { res.warnings.push('CFA failed: ' + e.message); }
  try { res.sem = fitSEM(S, nC, { ...cfaModel, paths: model.paths }); } catch (e) { res.warnings.push('SEM failed: ' + e.message); }

  /* PLS-SEM + bootstrap: paths, mediation, moderation (two-stage), higher-order (two-stage) */
  const blocks = Object.fromEntries(Object.entries(constructs).map(([c, d]) => [c, d.items.map(k => idx[k])]));
  const hoDef = model.higherOrder, mod = model.moderation;
  function estimateAll(Xcols) {
    const main = pls(Xcols, blocks, model.paths);
    const out = { paths: main.pathCoef, r2: main.r2, f2: main.f2, loadings: main.loadings };
    out.indirect = Object.fromEntries(model.mediations.map(([a, m, b]) => [`${a}->${m}->${b}`, (main.pathCoef[`${a}->${m}`] || 0) * (main.pathCoef[`${m}->${b}`] || 0)]));
    // moderation: two-stage, interaction of standardized LV scores
    if (mod) {
      const predsOf = model.paths.filter(p => p[1] === mod.outcome).map(p => p[0]); const preds = [...new Set([...predsOf, mod.predictor, mod.moderator])];
      const inter = standardize(main.scores[mod.predictor].map((v, i) => v * main.scores[mod.moderator][i]));
      const reg = ols([...preds.map(p => main.scores[p]), inter], main.scores[mod.outcome], [...preds, 'INT']);
      if (reg) { out.moderation = { b: reg.coefs.at(-1).b, r2: reg.r2, preds: Object.fromEntries(preds.map((p, j) => [p, reg.coefs[j + 1].b])), r2Main: main.r2[mod.outcome] }; out.moderation.f2 = (reg.r2 - main.r2[mod.outcome]) / (1 - reg.r2); }
    }
    // higher-order: two-stage (lower-order LV scores become indicators of the HOC)
    if (hoDef) {
      const cols2 = [...hoDef.lower.map(l => main.scores[l]), ...hoDef.covariates.flatMap(c => blocks[c].map(i => Xcols[i])), ...blocks[hoDef.outcome].map(i => Xcols[i])];
      const b2 = { [hoDef.key]: hoDef.lower.map((_, i) => i) }; let off = hoDef.lower.length;
      hoDef.covariates.forEach(c => { b2[c] = blocks[c].map((_, i) => off + i); off += blocks[c].length; });
      b2[hoDef.outcome] = blocks[hoDef.outcome].map((_, i) => off + i);
      const p2 = [[hoDef.key, hoDef.outcome], ...hoDef.covariates.map(c => [c, hoDef.outcome])];
      const ho = pls(cols2, b2, p2);
      out.higher = { loadings: ho.loadings[hoDef.key], paths: ho.pathCoef, r2: ho.r2[hoDef.outcome], ...crAve(ho.loadings[hoDef.key]) };
    }
    return out;
  }
  try {
    const point = estimateAll(Xs);
    const B = nC >= 300 ? 300 : 200; const boots = []; // bootstrap resamples kept modest for phones
    let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let b = 0; b < B; b++) {
      const pick = Array.from({ length: nC }, () => Math.floor(rnd() * nC));
      const Xb = Xs.map(col => standardize(pick.map(i => col[i])));
      try { boots.push(estimateAll(Xb)); } catch {}
    }
    const summar = (get) => { const vals = boots.map(get).filter(Number.isFinite); const est = get(point); const s = vals.length > 2 ? sd(vals) : NaN; const sorted = [...vals].sort((a, b) => a - b); return { est, se: s, t: est / s, p: pNorm2(est / s), lo: sorted[Math.floor(0.025 * sorted.length)], hi: sorted[Math.ceil(0.975 * sorted.length) - 1], B: vals.length }; };
    res.pls = {
      B: boots.length,
      paths: model.paths.map(([a, b]) => ({ from: a, to: b, ...summar(o => o.paths[`${a}->${b}`]), f2: point.f2[`${a}->${b}`] })),
      r2: point.r2,
      loadings: Object.fromEntries(Object.entries(constructs).map(([c, d]) => [c, d.items.map((k, i) => ({ item: k, loading: point.loadings[c][i] }))])),
      validity: Object.fromEntries(Object.keys(constructs).map(c => [c, crAve(point.loadings[c])])),
      mediation: model.mediations.map(([a, m, b]) => { const ind = summar(o => o.indirect[`${a}->${m}->${b}`]); const dir = summar(o => o.paths[`${a}->${b}`]); const tot = ind.est + dir.est; let type; if (ind.p < 0.05 && dir.p >= 0.05) type = 'Full (indirect-only) mediation'; else if (ind.p < 0.05 && dir.p < 0.05) type = Math.sign(ind.est) === Math.sign(dir.est) ? 'Complementary partial mediation' : 'Competitive partial mediation'; else if (dir.p < 0.05) type = 'Direct-only (no mediation)'; else type = 'No effect'; return { a, m, b, indirect: ind, direct: dir, total: tot, vaf: tot ? ind.est / tot : NaN, type }; }),
      moderation: point.moderation ? { ...mod, interaction: summar(o => o.moderation?.b), f2: point.moderation.f2, r2: point.moderation.r2, r2Main: point.moderation.r2Main, simple: { low: point.moderation.preds[mod.predictor] - point.moderation.b, high: point.moderation.preds[mod.predictor] + point.moderation.b, mean: point.moderation.preds[mod.predictor] } } : null,
      higher: point.higher ? { ...hoDef, loadings: hoDef.lower.map((l, i) => ({ lower: l, loading: point.higher.loadings[i] })), cr: point.higher.cr, ave: point.higher.ave, r2: point.higher.r2, paths: [[hoDef.key, hoDef.outcome], ...hoDef.covariates.map(c => [c, hoDef.outcome])].map(([a, b]) => ({ from: a, to: b, ...summar(o => o.higher?.paths[`${a}->${b}`]) })) } : null,
    };
  } catch (e) { res.warnings.push('PLS-SEM failed: ' + e.message); }
  return res;
}

self.onmessage = e => {
  try { const t0 = Date.now(); const out = run(e.data); out.ms = Date.now() - t0; self.postMessage({ ok: true, result: out }); }
  catch (err) { self.postMessage({ ok: false, error: String(err.stack || err) }); }
};
