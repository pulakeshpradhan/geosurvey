/* Minimal SPSS system-file (.sav) writer — pure JS, no dependencies.
 * Produces an uncompressed, little-endian, UTF-8 .sav with variable labels, value labels, measurement levels,
 * long variable names and DATETIME variables. Format follows the PSPP "System File Format" documentation.
 *
 * writeSav(vars, rows) → Uint8Array
 *   vars: [{ name, label, kind: 'num' | 'str' | 'datetime', width, decimals, values: [[code, label]], measure: 'nominal'|'ordinal'|'scale', get(row) }]
 *   rows: array of records; get(row) returns a number (or '' / null / NaN for missing), a string, or a Date / ISO string for datetime. */
'use strict';

function writeSav(vars, rows, fileLabel = 'GeoSurvey export') {
  const enc = new TextEncoder();
  const SYSMIS = -Number.MAX_VALUE;
  const chunks = []; let total = 0;
  const push = u8 => { chunks.push(u8); total += u8.length; };
  const i32 = n => { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, n, true); push(b); };
  const f64 = n => { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, n, true); push(b); };
  const bytesFit = (s, n, pad = 0x20) => { // UTF-8 bytes truncated at a char boundary, padded to n bytes
    let b = enc.encode(String(s ?? '')); if (b.length > n) { let cut = n; while (cut > 0 && (b[cut] & 0xC0) === 0x80) cut--; b = b.slice(0, cut); }
    const out = new Uint8Array(n).fill(pad); out.set(b); return out;
  };
  const str = (s, n) => push(bytesFit(s, n));

  // ---- dictionary preparation: short (≤8 byte, upper-case, unique) names for the variable records ----
  const shortNames = new Set();
  const specs = vars.map((v, idx) => {
    let base = String(v.name).toUpperCase().replace(/[^A-Z0-9_]/g, '_').replace(/^[^A-Z]/, 'V$&').slice(0, 8) || 'V';
    let sn = base, i = 1; while (shortNames.has(sn)) { const suf = String(i++); sn = base.slice(0, 8 - suf.length) + suf; } shortNames.add(sn);
    const isStr = v.kind === 'str';
    const width = isStr ? Math.max(1, Math.min(255, v.width || 8)) : 0;
    const segs = isStr ? Math.ceil(width / 8) : 1;
    const fmt = v.kind === 'datetime' ? (22 << 16) | (20 << 8) : isStr ? (1 << 16) | (width << 8) : (5 << 16) | ((v.width || 8) << 8) | (v.decimals || 0);
    return { v, sn, isStr, width, segs, fmt, idx };
  });
  const nslots = specs.reduce((s, x) => s + x.segs, 0);

  // ---- file header ----
  str('$FL2', 4);
  str('@(#) SPSS DATA FILE GeoSurvey', 60);
  i32(2); i32(nslots); i32(0); i32(0); i32(rows.length); f64(100);
  const d = new Date(); const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  str(`${String(d.getDate()).padStart(2, '0')} ${mon} ${String(d.getFullYear()).slice(2)}`, 9);
  str(d.toTimeString().slice(0, 8), 8);
  str(fileLabel, 64); str('', 3);

  // ---- variable records ----
  let slot = 1; const slotOf = {};
  specs.forEach(s => {
    slotOf[s.idx] = slot;
    const label = s.v.label ? bytesFit(s.v.label, 255).subarray(0, Math.min(255, enc.encode(s.v.label).length)) : null;
    i32(2); i32(s.isStr ? s.width : 0); i32(label ? 1 : 0); i32(0); i32(s.fmt); i32(s.fmt); str(s.sn, 8);
    if (label) { i32(label.length); push(label); const pad = (4 - label.length % 4) % 4; if (pad) push(new Uint8Array(pad)); }
    for (let k = 1; k < s.segs; k++) { i32(2); i32(-1); i32(0); i32(0); i32(0); i32(0); str('', 8); } // string continuation slots
    slot += s.segs;
  });

  // ---- value labels (numeric variables only) ----
  specs.filter(s => !s.isStr && s.v.values && s.v.values.length).forEach(s => {
    i32(3); i32(s.v.values.length);
    s.v.values.forEach(([code, lab]) => {
      f64(+code);
      const lb = bytesFit(lab, 120).subarray(0, Math.min(120, enc.encode(lab).length));
      push(new Uint8Array([lb.length])); push(lb);
      const pad = (8 - (1 + lb.length) % 8) % 8; if (pad) push(new Uint8Array(pad).fill(0x20));
    });
    i32(4); i32(1); i32(slotOf[s.idx]);
  });

  // ---- extension records ----
  const ext = (subtype, size, items) => { i32(7); i32(subtype); i32(size); i32(items.length / size); };
  // machine integer info: version 25.0.0, machine 0, IEEE floats, compression none, little-endian, UTF-8 (65001)
  i32(7); i32(3); i32(4); i32(8); [25, 0, 0, 0, 1, 1, 2, 65001].forEach(i32);
  // machine float info
  i32(7); i32(4); i32(8); i32(3); f64(SYSMIS); f64(Number.MAX_VALUE); f64(-Number.MAX_VALUE);
  // variable display parameters: measure (1 nominal, 2 ordinal, 3 scale), display width, alignment (0 left, 1 right)
  i32(7); i32(11); i32(4); i32(specs.length * 3);
  specs.forEach(s => { const m = s.v.measure === 'scale' ? 3 : s.v.measure === 'ordinal' ? 2 : 1; i32(m); i32(s.isStr ? Math.min(s.width, 32) : 10); i32(s.isStr ? 0 : 1); });
  // long variable names
  const lvn = enc.encode(specs.map(s => `${s.sn}=${String(s.v.name).slice(0, 64)}`).join('\t'));
  i32(7); i32(13); i32(1); i32(lvn.length); push(lvn);
  // character encoding
  const encName = enc.encode('UTF-8'); i32(7); i32(20); i32(1); i32(encName.length); push(encName);
  // dictionary termination
  i32(999); i32(0);

  // ---- data (uncompressed) ----
  const EPOCH = Date.UTC(1582, 9, 14); // SPSS time origin, seconds
  rows.forEach(r => {
    specs.forEach(s => {
      const raw = s.v.get(r);
      if (s.isStr) push(bytesFit(raw == null ? '' : raw, s.segs * 8));
      else if (s.v.kind === 'datetime') { const t = raw instanceof Date ? raw.getTime() : Date.parse(raw); f64(Number.isFinite(t) ? (t - EPOCH) / 1000 : SYSMIS); }
      else { const n = typeof raw === 'number' ? raw : parseFloat(raw); f64(Number.isFinite(n) ? n : SYSMIS); }
    });
  });

  const out = new Uint8Array(total); let p = 0; for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}
