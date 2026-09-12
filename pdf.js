/* GeoSurvey — A4 PDF of the currently filled questionnaire (jsPDF, loaded on demand; print fallback).
 * Depends on app.js globals: LOCATION_FIELDS, SECTIONS, REMARKS_FIELDS, LIKERT, collect, photos, settings, toast, esc. */
'use strict';

const PdfExport = (() => {
  const JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  const C = { ink: [11, 14, 19], muted: [79, 84, 96], blue: [52, 84, 158], line: [196, 207, 230], soft: [236, 239, 248], cream: [253, 250, 239], rust: [164, 74, 48], tan: [246, 237, 218] };
  // Standard PDF fonts are Latin-1 only: normalise the few symbols the questionnaire uses
  const clean = s => String(s ?? '').replace(/→/g, '->').replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/₹/g, 'Rs ').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/×/g, 'x').replace(/[^\x09\x0A\x20-\x7E\xA0-\xFF]/g, '');

  function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load PDF library (offline?)')); document.head.appendChild(s); }); }
  async function jsPDF() { if (!window.jspdf) await loadScript(JSPDF_URL); return window.jspdf.jsPDF; }

  async function generate() {
    const rec = collect();
    const title = clean(rec.head_name ? `Household of ${rec.head_name}` : 'Household survey record');
    const ref = `GS-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    let JsPDF;
    try { JsPDF = await jsPDF(); } catch (e) { toast(e.message + ' — opening print view instead'); return printFallback(rec, ref); }

    const doc = new JsPDF({ unit: 'mm', format: 'a4', compress: true });
    const W = 210, H = 297, M = 15, CW = W - 2 * M, BOTTOM = H - 18;
    let y = 0, page = 1;
    const totalPlaceholder = '{tp}';

    const setFont = (style = 'normal', size = 10, color = C.ink) => { doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...color); };
    const header = () => {
      doc.setFillColor(...C.cream); doc.rect(0, 0, W, 26, 'F');
      doc.setFillColor(...C.blue); doc.roundedRect(M, 7, 8, 8, 2, 2, 'F');
      doc.setFillColor(255, 255, 255); doc.circle(M + 4, 10.6, 1.6, 'F');
      setFont('bold', 15); doc.text('Socio-Economic Household Survey', M + 12, 12.5);
      setFont('normal', 8.5, C.muted); doc.text('GeoSurvey · AI-assisted field questionnaire', M + 12, 17.5);
      setFont('bold', 8.5, C.blue); doc.text(`Ref ${ref}`, W - M, 11, { align: 'right' });
      setFont('normal', 8.5, C.muted); doc.text(clean(`${rec.survey_date || new Date().toISOString().slice(0, 10)} · ${rec.surveyor || 'Enumerator'}`), W - M, 16, { align: 'right' });
      doc.setDrawColor(...C.line); doc.setLineWidth(0.4); doc.line(M, 26, W - M, 26);
      y = 33;
    };
    const footer = () => {
      doc.setDrawColor(...C.line); doc.setLineWidth(0.3); doc.line(M, H - 12, W - M, H - 12);
      setFont('normal', 7.5, C.muted);
      doc.text(clean(`GeoSurvey · ${title} · generated ${new Date().toLocaleString()}`), M, H - 8);
      doc.text(`Page ${page} of ${totalPlaceholder}`, W - M, H - 8, { align: 'right' });
    };
    let onNewPage = null; // e.g. re-draw a table header after a page break
    const newPage = () => { footer(); doc.addPage(); page++; header(); if (onNewPage) onNewPage(); };
    const ensure = h => { if (y + h > BOTTOM) newPage(); };

    const sectionTitle = (num, text) => {
      ensure(14); y += 3;
      doc.setFillColor(...C.soft); doc.roundedRect(M, y - 4.5, CW, 8, 1.5, 1.5, 'F');
      setFont('bold', 8, C.blue); doc.text(num, M + 3, y + 0.8);
      setFont('bold', 10.5, C.ink); doc.text(clean(text), M + 12, y + 0.8);
      y += 8;
    };
    const valueOf = f => { const v = rec[f.k]; if (v === '' || v == null) return '-'; if (f.type === 'likert') return `${v} - ${LIKERT[+v - 1] || ''}`; return clean(String(v)).replace(/;\s*/g, ', '); };
    // two-column key/value grid with wrapping
    const kvGrid = (fields, cols = 2) => {
      const gap = 6, cw = (CW - gap * (cols - 1)) / cols;
      for (let i = 0; i < fields.length; i += cols) {
        const row = fields.slice(i, i + cols);
        const cells = row.map(f => { setFont('normal', 9.5); const lines = doc.splitTextToSize(valueOf(f), cw - 2); return { f, lines }; });
        const h = 4.5 + Math.max(...cells.map(c => c.lines.length)) * 4.2 + 3;
        ensure(h);
        cells.forEach((c, j) => {
          const x = M + j * (cw + gap);
          setFont('normal', 7.5, C.muted); doc.text(clean(c.f.label), x, y);
          setFont(c.lines[0] === '-' ? 'normal' : 'bold', 9.5, c.lines[0] === '-' ? C.muted : C.ink); doc.text(c.lines, x, y + 4.4);
          doc.setDrawColor(...C.line); doc.setLineWidth(0.2); doc.line(x, y + h - 4.5, x + cw, y + h - 4.5);
        });
        y += h;
      }
    };
    const paragraph = (label, text) => {
      setFont('normal', 9.5); const lines = doc.splitTextToSize(clean(text || '-'), CW - 4);
      ensure(8 + lines.length * 4.2);
      setFont('normal', 7.5, C.muted); doc.text(clean(label), M, y);
      setFont('normal', 9.5, C.ink); doc.text(lines, M, y + 4.4); y += 6 + lines.length * 4.2;
    };

    header();
    // Title block
    setFont('bold', 13); doc.text(title, M, y); y += 5.5;
    setFont('normal', 9, C.muted);
    const loc = [rec.village, rec.block, rec.district, rec.state, rec.postcode ? `PIN ${rec.postcode}` : ''].filter(Boolean).join(', ');
    doc.text(clean(loc || 'Location not recorded'), M, y); y += 4.5;
    if (rec.latitude) { doc.text(clean(`GPS ${rec.latitude}, ${rec.longitude}${rec.gps_accuracy_m ? ` (±${rec.gps_accuracy_m} m)` : ''}${rec.altitude_m ? ` · alt ${rec.altitude_m} m` : ''}`), M, y); y += 4.5; }
    y += 2;

    sectionTitle('01', 'Location & enumerator');
    kvGrid(LOCATION_FIELDS.filter(f => f.type !== 'textarea'), 3);
    if (rec.full_address) paragraph('Full address (from map)', rec.full_address);

    SECTIONS.forEach((s, i) => {
      const num = String(i + 2).padStart(2, '0');
      if (s.fields.every(f => f.type === 'likert')) {
        sectionTitle(num, 'Perceptions (1 = strongly disagree, 5 = strongly agree)');
        const colW = 9, tblW = CW, stmtW = tblW - 5 * colW - 4;
        const likertHead = () => {
          setFont('bold', 7.5, C.blue); doc.text('Statement', M + 1, y);
          [1, 2, 3, 4, 5].forEach((n, j) => doc.text(String(n), M + stmtW + 4 + j * colW + colW / 2, y, { align: 'center' }));
          doc.setDrawColor(...C.line); doc.line(M, y + 1.5, M + tblW, y + 1.5); y += 5;
        };
        ensure(9); likertHead(); onNewPage = likertHead;
        s.fields.forEach((f, idx) => {
          setFont('normal', 8.8, C.ink); const lines = doc.splitTextToSize(clean(f.label), stmtW - 2); const h = Math.max(6.5, lines.length * 3.9 + 2.5);
          ensure(h);
          if (idx % 2 === 0) { doc.setFillColor(250, 250, 253); doc.rect(M, y - 4, tblW, h, 'F'); }
          doc.text(lines, M + 1, y);
          const v = +rec[f.k];
          [1, 2, 3, 4, 5].forEach((n, j) => { const cx = M + stmtW + 4 + j * colW + colW / 2, cy = y - 1.2; doc.setDrawColor(...C.line); doc.setLineWidth(0.3); if (v === n) { doc.setFillColor(...C.blue); doc.circle(cx, cy, 1.9, 'F'); } else doc.circle(cx, cy, 1.9, 'S'); });
          y += h;
        });
        onNewPage = null; y += 2;
      } else {
        sectionTitle(num, s.title);
        kvGrid(s.fields, s.fields.some(f => f.type === 'multi' && f.wide) ? 1 : 2);
      }
    });

    sectionTitle(String(SECTIONS.length + 2).padStart(2, '0'), 'Remarks');
    REMARKS_FIELDS.forEach(f => paragraph(f.label, rec[f.k]));

    // Photos
    if (photos.length) {
      sectionTitle(String(SECTIONS.length + 3).padStart(2, '0'), `Photographs (${photos.length})`);
      const gap = 6, pw = (CW - gap) / 2, maxH = 62;
      for (let i = 0; i < photos.length; i += 2) {
        const pair = photos.slice(i, i + 2);
        const dims = pair.map(p => { const r = Math.min(pw / p.w, maxH / p.h); return { w: p.w * r, h: p.h * r }; });
        const rowH = Math.max(...dims.map(d => d.h)) + 10;
        ensure(rowH);
        pair.forEach((p, j) => {
          const x = M + j * (pw + gap);
          doc.setFillColor(...C.soft); doc.roundedRect(x, y, pw, dims[j].h + 1, 1.5, 1.5, 'F');
          try { doc.addImage(p.dataUrl, 'JPEG', x + (pw - dims[j].w) / 2, y + 0.5, dims[j].w, dims[j].h); } catch {}
          setFont('normal', 7.5, C.muted);
          const cap = clean(`${p.section ? SECTIONS.find(s => s.id === p.section)?.title + ' · ' : ''}${new Date(p.taken_at).toLocaleString()}${p.lat != null ? ` · ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}` : ''}`);
          doc.text(doc.splitTextToSize(cap, pw), x, y + dims[j].h + 5);
        });
        y += rowH + 2;
      }
    }

    // Declaration + signatures
    ensure(34); y += 4;
    setFont('normal', 8.5, C.muted);
    doc.text(doc.splitTextToSize('Declaration: The information above was collected with the informed consent of the respondent and recorded as stated. Fields marked with a dash were not answered.', CW), M, y); y += 12;
    const sigW = (CW - 12) / 3;
    ['Respondent signature', 'Enumerator signature', 'Date & place'].forEach((l, j) => { const x = M + j * (sigW + 6); doc.setDrawColor(...C.muted); doc.setLineWidth(0.3); doc.line(x, y + 8, x + sigW, y + 8); setFont('normal', 7.5, C.muted); doc.text(l, x, y + 12); });
    y += 16;
    footer();
    if (typeof doc.putTotalPages === 'function') doc.putTotalPages(totalPlaceholder);

    const name = `GeoSurvey_${clean(rec.head_name || 'record').replace(/[^A-Za-z0-9]+/g, '_')}_${rec.survey_date || new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(name);
    toast('PDF generated: ' + name, 'ok');
  }

  /* Fallback: styled print view (browser "Save as PDF") when the library cannot load. */
  function printFallback(rec, ref) {
    const v = f => { const x = rec[f.k]; return x === '' || x == null ? '—' : f.type === 'likert' ? `${x} – ${LIKERT[+x - 1] || ''}` : esc(String(x).replace(/;\s*/g, ', ')); };
    const sec = (num, title, fields) => `<h2><span>${num}</span>${esc(title)}</h2><div class="g">${fields.map(f => `<div><small>${esc(f.label)}</small><b>${v(f)}</b></div>`).join('')}</div>`;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(ref)}</title><style>
@page{size:A4;margin:15mm} body{font:10.5pt/1.4 Nunito,system-ui,sans-serif;color:#0b0e13;margin:0}
h1{font-size:16pt;margin:0 0 2px} .sub{color:#4f5460;font-size:9pt;margin-bottom:10px;border-bottom:1px solid #c4cfe6;padding-bottom:8px}
h2{font-size:11pt;background:#eceff8;padding:4px 8px;border-radius:4px;margin:14px 0 6px;break-after:avoid} h2 span{color:#34549e;margin-right:10px;font-size:9pt}
.g{display:grid;grid-template-columns:1fr 1fr;gap:6px 14px} .g div{border-bottom:1px solid #e5e7eb;padding:3px 0;break-inside:avoid} small{display:block;color:#4f5460;font-size:8pt} b{font-weight:700}
table{width:100%;border-collapse:collapse;font-size:9.5pt} td,th{padding:3px 4px;border-bottom:1px solid #e5e7eb;text-align:center} td:first-child{text-align:left} .on{background:#34549e;color:#fff;border-radius:50%;display:inline-block;width:14px;height:14px;line-height:14px;font-size:8pt}
.ph{display:grid;grid-template-columns:1fr 1fr;gap:8px} .ph figure{margin:0;break-inside:avoid} .ph img{width:100%;border-radius:4px} figcaption{font-size:8pt;color:#4f5460}
.sig{display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;margin-top:30px;font-size:8pt;color:#4f5460} .sig div{border-top:1px solid #4f5460;padding-top:4px}
</style></head><body>
<h1>Socio-Economic Household Survey</h1><div class="sub">GeoSurvey · Ref ${esc(ref)} · ${esc(rec.survey_date || '')} · ${esc(rec.surveyor || '')}</div>
${sec('01', 'Location & enumerator', LOCATION_FIELDS)}
${SECTIONS.map((s, i) => s.fields.every(f => f.type === 'likert')
  ? `<h2><span>${String(i + 2).padStart(2, '0')}</span>Perceptions (1 = strongly disagree, 5 = strongly agree)</h2><table><tr><th style="text-align:left">Statement</th>${[1, 2, 3, 4, 5].map(n => `<th>${n}</th>`).join('')}</tr>${s.fields.map(f => `<tr><td>${esc(f.label)}</td>${[1, 2, 3, 4, 5].map(n => `<td>${+rec[f.k] === n ? '<span class="on">●</span>' : '○'}</td>`).join('')}</tr>`).join('')}</table>`
  : sec(String(i + 2).padStart(2, '0'), s.title, s.fields)).join('')}
${sec(String(SECTIONS.length + 2).padStart(2, '0'), 'Remarks', REMARKS_FIELDS)}
${photos.length ? `<h2><span>${String(SECTIONS.length + 3).padStart(2, '0')}</span>Photographs (${photos.length})</h2><div class="ph">${photos.map(p => `<figure><img src="${p.dataUrl}"><figcaption>${esc(new Date(p.taken_at).toLocaleString())}${p.lat != null ? ` · ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}` : ''}</figcaption></figure>`).join('')}</div>` : ''}
<div class="sig"><div>Respondent signature</div><div>Enumerator signature</div><div>Date &amp; place</div></div>
<script>setTimeout(() => print(), 400)</script></body></html>`;
    const w = window.open('', '_blank'); if (!w) return toast('Allow pop-ups to open the print view', 'err');
    w.document.write(html); w.document.close();
  }

  document.addEventListener('DOMContentLoaded', () => {
    const b = document.querySelector('#pdfBtn'); if (!b) return;
    b.onclick = async () => { b.disabled = true; try { await generate(); } catch (e) { toast('PDF error: ' + e.message, 'err'); } finally { b.disabled = false; } };
  });
  return { generate };
})();
