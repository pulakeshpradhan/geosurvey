/* GeoSurvey — minimal QR code encoder (byte mode, error-correction level M, versions 1–20 ≈ 660 bytes).
 * QR.svg(text) → inline SVG string; QR.encode(text) → { size, get(x, y) }. No network, no dependencies. */
'use strict';

const QR = (() => {
  // Per version (level M): [EC codewords per block, group-1 blocks, group-1 data codewords, group-2 blocks, group-2 data codewords]
  const EC = [null,
    [10, 1, 16, 0, 0], [16, 1, 28, 0, 0], [26, 1, 44, 0, 0], [18, 2, 32, 0, 0], [24, 2, 43, 0, 0],
    [16, 4, 27, 0, 0], [18, 4, 31, 0, 0], [22, 2, 38, 2, 39], [22, 3, 36, 2, 37], [26, 4, 43, 1, 44],
    [30, 1, 50, 4, 51], [22, 6, 36, 2, 37], [22, 8, 37, 1, 38], [24, 4, 40, 5, 41], [24, 5, 41, 5, 42],
    [28, 7, 45, 3, 46], [28, 10, 46, 1, 47], [26, 9, 43, 4, 44], [26, 3, 44, 11, 45], [26, 3, 41, 13, 42]];
  const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
    [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70], [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86], [6, 34, 62, 90]];

  const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  const mul = (a, b) => a && b ? EXP[LOG[a] + LOG[b]] : 0;
  function rsGenerator(n) {
    let g = [1];
    for (let i = 0; i < n; i++) { const ng = new Array(g.length + 1).fill(0); for (let j = 0; j < g.length; j++) { ng[j] ^= g[j]; ng[j + 1] ^= mul(g[j], EXP[i]); } g = ng; }
    return g.slice(1);
  }
  function rsRemainder(data, n) {
    const g = rsGenerator(n), res = new Array(n).fill(0);
    for (const b of data) { const f = b ^ res[0]; res.shift(); res.push(0); if (f) for (let j = 0; j < n; j++) res[j] ^= mul(g[j], f); }
    return res;
  }

  function codewords(bytes) {
    let v = 1;
    while (v <= 20 && EC[v][1] * EC[v][2] + EC[v][3] * EC[v][4] < bytes.length + (v < 10 ? 2 : 3)) v++;
    if (v > 20) throw new Error('Too much text for a QR code');
    const e = EC[v], cap = e[1] * e[2] + e[3] * e[4], bits = [];
    const push = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    push(4, 4); push(bytes.length, v < 10 ? 8 : 16); bytes.forEach(b => push(b, 8));
    push(0, Math.min(4, cap * 8 - bits.length)); while (bits.length % 8) bits.push(0);
    for (let p = 0xec; bits.length < cap * 8; p ^= 0xec ^ 0x11) push(p, 8);
    const data = []; for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    const blocks = []; let off = 0;
    for (let g = 0; g < 2; g++) for (let i = 0; i < e[1 + 2 * g]; i++) { const n = e[2 + 2 * g]; const d = data.slice(off, off + n); off += n; blocks.push({ d, ec: rsRemainder(d, e[0]) }); }
    const out = [], maxD = Math.max(...blocks.map(b => b.d.length));
    for (let i = 0; i < maxD; i++) for (const b of blocks) if (i < b.d.length) out.push(b.d[i]);
    for (let i = 0; i < e[0]; i++) for (const b of blocks) out.push(b.ec[i]);
    return { v, out };
  }

  function encode(text) {
    const { v, out } = codewords(new TextEncoder().encode(text));
    const size = v * 4 + 17, mod = Array.from({ length: size }, () => new Uint8Array(size)), fn = Array.from({ length: size }, () => new Uint8Array(size));
    const set = (x, y, dark) => { if (x >= 0 && y >= 0 && x < size && y < size) { mod[y][x] = dark ? 1 : 0; fn[y][x] = 1; } };
    const finder = (cx, cy) => { for (let dy = -1; dy <= 7; dy++) for (let dx = -1; dx <= 7; dx++) { const inside = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6; set(cx + dx, cy + dy, inside && (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4))); } };
    finder(0, 0); finder(size - 7, 0); finder(0, size - 7);
    for (let i = 8; i < size - 8; i++) { set(i, 6, i % 2 === 0); set(6, i, i % 2 === 0); }
    const al = ALIGN[v], last = al[al.length - 1];
    for (const cx of al) for (const cy of al) {
      if ((cx === 6 && cy === 6) || (cx === 6 && cy === last) || (cx === last && cy === 6)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    for (let i = 0; i < 9; i++) { set(8, i, false); set(i, 8, false); }            // format areas (values written per mask)
    for (let i = 0; i < 8; i++) { set(size - 1 - i, 8, false); set(8, size - 1 - i, false); }
    set(8, size - 8, true);                                                       // dark module
    if (v >= 7) {
      let rem = v; for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const bits = (v << 12) | rem;
      for (let i = 0; i < 18; i++) { const bit = (bits >>> i) & 1, a = size - 11 + (i % 3), b = Math.floor(i / 3); set(a, b, bit); set(b, a, bit); }
    }
    // Data placement: zigzag from the bottom-right, two columns at a time, skipping the vertical timing column
    let bi = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
        const x = right - j, y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
        if (!fn[y][x] && bi < out.length * 8) { mod[y][x] = (out[bi >>> 3] >>> (7 - (bi & 7))) & 1; bi++; }
      }
    }
    const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
      (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0];
    const applyMask = m => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[m](x, y)) mod[y][x] ^= 1; };
    const formatBits = m => {
      const data = m; let rem = data;                                              // level M = 00
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const bits = ((data << 10) | rem) ^ 0x5412, b = i => (bits >>> i) & 1;
      for (let i = 0; i <= 5; i++) set(8, i, b(i));
      set(8, 7, b(6)); set(8, 8, b(7)); set(7, 8, b(8));
      for (let i = 9; i < 15; i++) set(14 - i, 8, b(i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, b(i));
      for (let i = 8; i < 15; i++) set(8, size - 15 + i, b(i));
      set(8, size - 8, true);
    };
    const penalty = () => {
      let p = 0;
      const line = get => { let run = 0, prev = -1, s = ''; for (let i = 0; i < size; i++) { const c = get(i); s += c; if (c === prev) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else { prev = c; run = 1; } } p += 40 * ((s.match(/10111010000/g) || []).length + (s.match(/00001011101/g) || []).length); };
      for (let y = 0; y < size; y++) line(x => mod[y][x]);
      for (let x = 0; x < size; x++) line(y => mod[y][x]);
      for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = mod[y][x]; if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3; }
      let dark = 0; for (const row of mod) for (const c of row) dark += c;
      p += 10 * Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size));
      return p;
    };
    let best = 0, bestP = Infinity;
    for (let m = 0; m < 8; m++) { formatBits(m); applyMask(m); const p = penalty(); if (p < bestP) { bestP = p; best = m; } applyMask(m); }
    formatBits(best); applyMask(best);
    return { size, get: (x, y) => mod[y][x] === 1 };
  }

  function svg(text, quiet = 4) {
    const q = encode(text), n = q.size + quiet * 2; let d = '';
    for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++) if (q.get(x, y)) d += `M${x + quiet} ${y + quiet}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  }
  return { encode, svg };
})();
