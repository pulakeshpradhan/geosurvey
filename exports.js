/* GeoSurvey exports: CSV, JSON, SPSS (.sps syntax with embedded data + labels), KMZ (Google Earth / GIS).
 * Depends on ALL_FIELDS / META_FIELDS / LIKERT / download() from app.js and writeSav() from sav.js. */
'use strict';

const Exports = (() => {
  const today = () => new Date().toISOString().slice(0, 10);
  const columns = () => [...META_FIELDS.slice(0, 2), ...ALL_FIELDS, ...META_FIELDS.slice(2)];
  const val = (r, k) => r[k] == null ? '' : (r[k] instanceof Date ? r[k].toISOString() : String(r[k]));

  /* ---------- CSV / JSON ---------- */
  function csv(rows, name = 'geosurvey') {
    if (!rows.length) return toast('Nothing to export');
    const cols = [...columns().map(f => f.k), 'status'];
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const out = [cols.join(','), ...rows.map(r => cols.map(c => q(val(r, c))).join(','))].join('\r\n');
    download(`${name}_${today()}.csv`, '﻿' + out, 'text/csv;charset=utf-8');
  }
  function json(rows, name = 'geosurvey') {
    if (!rows.length) return toast('Nothing to export');
    download(`${name}_${today()}.json`, JSON.stringify(rows.map(({ photo_thumb, ...r }) => r), null, 2), 'application/json');
  }

  /* ---------- SPSS system file (.sav) ----------
   * Binary .sav via sav.js: single-select fields coded 1..n with value labels (nominal), Likert 1–5 with labels (ordinal),
   * multi-select as a string column plus one 0/1 labelled dummy per option, numbers as scale, timestamps as DATETIME. */
  function spssVars() {
    const vars = [];
    const width = get => Math.min(255, Math.max(1, ...rowsRef.map(r => new TextEncoder().encode(get(r)).length)));
    columns().forEach(f => {
      const k = f.k;
      if (k === 'submitted_at') return vars.push({ name: k, label: f.label, kind: 'datetime', measure: 'scale', get: r => val(r, k) });
      if (f.type === 'select') {
        const map = Object.fromEntries(f.options.map((o, i) => [o.toLowerCase(), i + 1]));
        vars.push({ name: k, label: f.label, kind: 'num', width: 2, measure: 'nominal', values: f.options.map((o, i) => [i + 1, o]), get: r => map[val(r, k).toLowerCase()] ?? '' });
      } else if (f.type === 'multi') {
        const getList = r => val(r, k).split(';').map(s => s.trim().toLowerCase()).filter(Boolean);
        vars.push({ name: k, label: f.label + ' (all selected)', kind: 'str', width: width(r => val(r, k)), measure: 'nominal', get: r => val(r, k) });
        f.options.forEach((o, i) => vars.push({ name: `${k}_${i + 1}`, label: `${f.label}: ${o}`, kind: 'num', width: 1, measure: 'nominal', values: [[0, 'No'], [1, 'Yes']], get: r => val(r, k) ? (getList(r).includes(o.toLowerCase()) ? 1 : 0) : '' }));
      } else if (f.type === 'likert') {
        vars.push({ name: k, label: f.label, kind: 'num', width: 2, measure: 'ordinal', values: scaleOf(f).labels.map((l, i) => [i + 1, l]), get: r => { const n = parseInt(val(r, k), 10); return isNaN(n) ? '' : n; } });
      } else if (f.type === 'number' || ['latitude', 'longitude', 'gps_accuracy_m', 'altitude_m'].includes(k)) {
        const dec = ['latitude', 'longitude'].includes(k) ? 6 : 0;
        vars.push({ name: k, label: f.label, kind: 'num', width: dec ? 12 : 8, decimals: dec, measure: 'scale', get: r => { const n = parseFloat(val(r, k)); return isNaN(n) ? '' : n; } });
      } else {
        vars.push({ name: k, label: f.label, kind: 'str', width: width(r => val(r, k)), measure: 'nominal', get: r => val(r, k) });
      }
    });
    return vars;
  }
  let rowsRef = [];
  function spss(rows, name = 'geosurvey') {
    if (!rows.length) return toast('Nothing to export');
    rowsRef = rows;
    const bytes = writeSav(spssVars(), rows, `GeoSurvey export ${new Date().toISOString().slice(0, 10)}`);
    download(`${name}_${today()}.sav`, new Blob([bytes], { type: 'application/x-spss-sav' }));
  }

  /* ---------- KMZ (KML inside a stored ZIP) ---------- */
  const xml = s => String(s ?? '').replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
  function kmz(rows, name = 'geosurvey') {
    const pts = rows.filter(r => isFinite(parseFloat(r.latitude)) && isFinite(parseFloat(r.longitude)));
    if (!pts.length) return toast('No records with coordinates to export');
    const files = {}; // path → Uint8Array
    const marks = pts.map(r => {
      const lat = parseFloat(r.latitude), lon = parseFloat(r.longitude);
      const id = String(r.id || '').slice(0, 8) || Math.random().toString(16).slice(2, 10);
      let img = '';
      if (r.photo_thumb && r.photo_thumb.startsWith('data:image/jpeg')) {
        files[`files/${id}.jpg`] = b64ToBytes(r.photo_thumb.split(',')[1]);
        img = `<img src="files/${id}.jpg" style="max-width:320px;border-radius:6px;margin-bottom:8px"><br>`;
      }
      const links = String(r.photo_urls || '').split(/\s+/).filter(Boolean).map((u, i) => `<a href="${xml(u)}">Photo ${i + 1}</a>`).join(' · ');
      const table = columns().filter(f => val(r, f.k) !== '' && f.k !== 'photo_urls').map(f => `<tr><td style="color:#666;padding:2px 8px 2px 0">${xml(f.label)}</td><td>${xml(val(r, f.k))}</td></tr>`).join('');
      const ext = columns().filter(f => val(r, f.k) !== '').map(f => `<Data name="${xml(f.k)}"><displayName>${xml(f.label)}</displayName><value>${xml(val(r, f.k))}</value></Data>`).join('');
      const when = r.submitted_at && !isNaN(new Date(r.submitted_at)) ? `<TimeStamp><when>${new Date(r.submitted_at).toISOString()}</when></TimeStamp>` : '';
      return `<Placemark><name>${xml(r.head_name || r.village || id)}</name><styleUrl>#hh</styleUrl>${when}
<description><![CDATA[${img}${links ? links + '<br>' : ''}<table style="font:12px sans-serif">${table}</table>]]></description>
<ExtendedData>${ext}</ExtendedData><Point><coordinates>${lon},${lat},0</coordinates></Point></Placemark>`;
    });
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>GeoSurvey ${today()}</name>
<Style id="hh"><IconStyle><scale>1.1</scale><Icon><href>http://maps.google.com/mapfiles/kml/paddle/blu-circle.png</href></Icon></IconStyle><BalloonStyle><text>$[description]</text></BalloonStyle></Style>
<Folder><name>Households (${pts.length})</name>${marks.join('\n')}</Folder></Document></kml>`;
    files['doc.kml'] = new TextEncoder().encode(kml);
    download(`${name}_${today()}.kmz`, new Blob([zipStore(files)], { type: 'application/vnd.google-earth.kmz' }));
    if (pts.length < rows.length) toast(`${rows.length - pts.length} record(s) without coordinates were skipped`);
  }
  function b64ToBytes(b64) { const s = atob(b64); const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }

  // Minimal ZIP writer (method 0 = stored). KMZ readers do not require deflate.
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(a) { let c = 0xFFFFFFFF; for (let i = 0; i < a.length; i++) c = CRC[(c ^ a[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zipStore(files) {
    const enc = new TextEncoder(), parts = [], central = []; let offset = 0;
    const d = new Date(), dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const u16 = n => [n & 0xFF, (n >> 8) & 0xFF], u32 = n => [n & 0xFF, (n >> 8) & 0xFF, (n >> 16) & 0xFF, (n >>> 24) & 0xFF];
    for (const [path, data] of Object.entries(files)) {
      const nm = enc.encode(path), crc = crc32(data);
      const head = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(dosTime), ...u16(dosDate), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nm.length), ...u16(0), ...nm]);
      parts.push(head, data);
      central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(dosTime), ...u16(dosDate), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nm.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...nm]));
      offset += head.length + data.length;
    }
    const cdSize = central.reduce((s, c) => s + c.length, 0);
    const eocd = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(central.length), ...u16(central.length), ...u32(cdSize), ...u32(offset), ...u16(0)]);
    const out = new Uint8Array(offset + cdSize + eocd.length); let p = 0;
    for (const a of [...parts, ...central, eocd]) { out.set(a, p); p += a.length; }
    return out;
  }

  return { csv, json, spss, kmz };
})();
