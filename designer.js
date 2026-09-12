/* GeoSurvey — questionnaire designer (Edit tab): upload a paper questionnaire (PDF / photos) → pages become images →
 * AI drafts a refined questionnaire → edit sections & questions like a form builder → Approve & apply (device) / Publish (team).
 * Depends on app.js globals: SECTIONS, REMARKS_FIELDS, CONSTRUCTS, DEFAULT_SCHEMA, FIELD_TYPES, applySchema, currentSchema,
 * clone, LS, settings, activeEngine, engineReady, geminiCall, GEMINI_FALLBACK, extractJson, compressImage, canvasToDataUrl, toast, esc, $, $$. */
'use strict';

const Designer = (() => {
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  let draft = null;     // { sections, remarks, constructNames, model }
  let pages = [];       // [{ dataUrl, label }] rendered document pages / photos for the AI
  let dirty = false;

  const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'q';
  const uniqueKey = (base, taken) => { let k = base, i = 2; while (taken.has(k)) k = `${base}_${i++}`; taken.add(k); return k; };
  const allKeys = d => new Set([...LOCATION_FIELDS.map(f => f.k), ...d.sections.flatMap(s => s.fields.map(f => f.k)), ...d.remarks.map(f => f.k)]);

  /* ---------- state ---------- */
  function load() { draft = currentSchema(); dirty = false; render(); }
  function reset() { if (!confirm('Replace the draft with the default questionnaire?')) return; draft = clone(DEFAULT_SCHEMA); dirty = true; render(); }

  /* ---------- rendering ---------- */
  const typeLabel = { text: 'Short text', number: 'Number', date: 'Date', tel: 'Phone', select: 'Single choice', multi: 'Multiple choice', likert: 'Likert 1–5', textarea: 'Paragraph' };
  function fieldRow(s, f, i) {
    const fld = draft.sections[s].fields[i];
    const hasOpts = fld.type === 'select' || fld.type === 'multi';
    return `<div class="dq" data-s="${s}" data-f="${i}">
      <div class="dq-main">
        <input class="input dq-label" data-prop="label" value="${esc(fld.label)}" placeholder="Question text">
        <select class="input dq-type" data-prop="type">${FIELD_TYPES.map(t => `<option value="${t}" ${fld.type === t ? 'selected' : ''}>${typeLabel[t]}</option>`).join('')}</select>
      </div>
      ${hasOpts ? `<textarea class="input dq-opts" data-prop="options" placeholder="One option per line">${esc((fld.options || []).join('\n'))}</textarea>` : ''}
      ${fld.type === 'likert' ? `<div class="dq-row"><label>Construct code <input class="input input-xs" data-prop="c" value="${esc(fld.c || '')}" placeholder="e.g. ES" maxlength="4"></label><span class="dim">Likert items sharing a code form one construct for reliability / factor analysis / SEM (needs ≥ 2 items).</span></div>` : ''}
      <div class="dq-row">
        <label class="check-inline"><input type="checkbox" data-prop="required" ${fld.required ? 'checked' : ''}> Required</label>
        ${fld.type !== 'likert' ? `<label class="check-inline"><input type="checkbox" data-prop="ai" ${fld.ai ? 'checked' : ''}> AI may fill from photos</label>` : ''}
        <span class="dq-key">key: <code>${esc(fld.k || 'auto from question text')}</code></span>
        <span class="dq-actions">
          <button type="button" class="link-btn" data-act="fup" title="Move up">↑</button>
          <button type="button" class="link-btn" data-act="fdown" title="Move down">↓</button>
          <button type="button" class="link-btn" data-act="fdup" title="Duplicate">⧉</button>
          <button type="button" class="link-btn danger" data-act="fdel" title="Delete">Delete</button>
        </span>
      </div>
    </div>`;
  }
  function render() {
    const host = $('#designerBody'); if (!host || !draft) return;
    host.innerHTML = draft.sections.map((s, si) => `
      <div class="card dsec" data-s="${si}">
        <div class="dsec-head">
          <span class="step">${String(si + 2).padStart(2, '0')}</span>
          <input class="input dsec-title" data-prop="title" value="${esc(s.title)}" placeholder="Section title">
          <span class="dq-actions">
            <button type="button" class="link-btn" data-act="sup" title="Move section up">↑</button>
            <button type="button" class="link-btn" data-act="sdown" title="Move section down">↓</button>
            <button type="button" class="link-btn danger" data-act="sdel">Delete section</button>
          </span>
        </div>
        <input class="input dsec-hint" data-prop="photoHint" value="${esc(s.photoHint || '')}" placeholder="Photo guidance for this section (leave empty for sections without photo/AI tools, e.g. Likert scales)">
        <div class="dq-list">${s.fields.map((f, fi) => fieldRow(si, f, fi)).join('')}</div>
        <button type="button" class="btn btn-outline btn-sm" data-act="fadd">+ Add question</button>
      </div>`).join('') +
      `<div class="card dsec"><div class="dsec-head"><span class="step">${String(draft.sections.length + 2).padStart(2, '0')}</span><h2>Remarks</h2></div><div class="dq-list">${draft.remarks.map((f, i) => `<div class="dq"><input class="input dq-label" data-r="${i}" value="${esc(f.label)}"></div>`).join('')}</div></div>`;
    const cs = deriveConstructs(draft.sections, draft.constructNames || {});
    $('#designerModel').innerHTML = Object.keys(cs).length
      ? `<b>Constructs detected:</b> ${Object.entries(cs).map(([k, c]) => `<span class="chip">${esc(k)} · <input class="input input-xs" data-cname="${esc(k)}" value="${esc(c.name)}" title="Construct name"> (${c.items.length} items)</span>`).join(' ')}<br><span class="dim">Structural model: ${describeModel(deriveModel(cs, draft.model))}</span>`
      : '<span class="dim">No Likert constructs — reliability, factor analysis and SEM will be skipped in the Analysis tab. Add Likert questions with a shared construct code to enable them.</span>';
    $('#designerDirty').hidden = !dirty;
  }
  const describeModel = m => m.paths.length ? m.paths.map(([a, b]) => `${a} → ${b}`).join(', ') + (m.mediations?.length ? ` · mediation via ${[...new Set(m.mediations.map(t => t[1]))].join(', ')}` : '') + (m.moderation ? ` · ${m.moderation.moderator} moderates ${m.moderation.predictor} → ${m.moderation.outcome}` : '') + (m.higherOrder ? ` · higher-order ${m.higherOrder.key}` : '') : 'none (needs ≥ 2 constructs)';

  /* ---------- editing (event delegation) ---------- */
  function onInput(e) {
    const t = e.target; const prop = t.dataset.prop;
    if (t.dataset.cname) { draft.constructNames = draft.constructNames || {}; draft.constructNames[t.dataset.cname] = t.value; dirty = true; return; }
    if (t.dataset.r != null) { draft.remarks[+t.dataset.r].label = t.value; dirty = true; return; }
    if (!prop) return;
    const sec = draft.sections[+t.closest('[data-s]').dataset.s];
    const q = t.closest('.dq'); const f = q ? sec.fields[+q.dataset.f] : null;
    const target = f || sec;
    if (t.type === 'checkbox') target[prop] = t.checked;
    else if (prop === 'options') target.options = t.value.split('\n').map(s => s.trim()).filter(Boolean);
    else if (prop === 'c') target.c = t.value.toUpperCase().trim();
    else target[prop] = t.value;
    dirty = true; $('#designerDirty').hidden = false;
    if (prop === 'type') { if ((f.type === 'select' || f.type === 'multi') && !f.options) f.options = ['Yes', 'No']; if (f.type === 'likert') { f.ai = false; if (!f.c) f.c = 'C1'; } render(); }
    if (prop === 'c' || prop === 'title') { clearTimeout(onInput.t); onInput.t = setTimeout(render, 600); }
  }
  function onClick(e) {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act; const si = +b.closest('[data-s]').dataset.s; const q = b.closest('.dq'); const fi = q ? +q.dataset.f : -1;
    const sec = draft.sections[si]; const arr = draft.sections;
    const move = (a, i, d) => { const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; };
    if (act === 'fadd') sec.fields.push({ k: '', label: '', type: 'text', ai: true }); // key is derived from the question text on approval
    else if (act === 'fdel') { if (!confirm('Delete this question?')) return; sec.fields.splice(fi, 1); }
    else if (act === 'fdup') { const c = clone(sec.fields[fi]); c.k = c.k ? uniqueKey(c.k, allKeys(draft)) : ''; sec.fields.splice(fi + 1, 0, c); }
    else if (act === 'fup') move(sec.fields, fi, -1);
    else if (act === 'fdown') move(sec.fields, fi, 1);
    else if (act === 'sup') move(arr, si, -1);
    else if (act === 'sdown') move(arr, si, 1);
    else if (act === 'sdel') { if (!confirm(`Delete section "${sec.title}" and its ${sec.fields.length} questions?`)) return; arr.splice(si, 1); }
    dirty = true; render();
    if (act === 'fadd') { const last = $$('.dq', $(`.dsec[data-s="${si}"]`)).pop(); last?.querySelector('.dq-label')?.focus(); }
  }
  function addSection() { const id = uniqueKey('section_' + (draft.sections.length + 1), new Set(draft.sections.map(s => s.id))); draft.sections.push({ id, title: 'New section', photoHint: 'Photograph the relevant items for this section.', fields: [] }); dirty = true; render(); }

  /* ---------- validation + apply ---------- */
  function normalise(d) {
    const taken = new Set(LOCATION_FIELDS.map(f => f.k));
    d.sections.forEach((s, i) => {
      s.id = slug(s.id || s.title || `section_${i + 1}`);
      s.fields.forEach(f => {
        f.k = uniqueKey(slug(f.k || f.label), taken); f.label = (f.label || '').trim();
        if (!FIELD_TYPES.includes(f.type)) f.type = 'text';
        if (f.type === 'select' || f.type === 'multi') f.options = (f.options || []).map(o => String(o).trim()).filter(Boolean); else delete f.options;
        if (f.type === 'likert') { f.c = String(f.c || '').toUpperCase(); delete f.ai; } else delete f.c;
        if (f.type === 'multi' && f.options?.length > 6) f.wide = true;
      });
      if (!s.photoHint) delete s.photoHint;
    });
    return d;
  }
  function validate(d) {
    const errs = [];
    if (!d.sections.length) errs.push('Add at least one section.');
    const ids = new Set();
    d.sections.forEach((s, i) => {
      if (!s.title.trim()) errs.push(`Section ${i + 1} needs a title.`);
      if (ids.has(s.id)) errs.push(`Duplicate section id "${s.id}".`); ids.add(s.id);
      if (!s.fields.length) errs.push(`Section "${s.title}" has no questions.`);
      s.fields.forEach((f, j) => {
        if (!f.label) errs.push(`Question ${j + 1} in "${s.title}" needs text.`);
        if ((f.type === 'select' || f.type === 'multi') && (f.options || []).length < 2) errs.push(`"${f.label || 'Question ' + (j + 1)}" needs at least two options.`);
      });
    });
    return errs;
  }
  async function approve(publish = false) {
    const d = normalise(clone(draft));
    const errs = validate(d);
    if (errs.length) return toast(errs[0] + (errs.length > 1 ? ` (+${errs.length - 1} more)` : ''), 'err');
    d.version = Date.now();
    LS.set('gs_schema', d); applySchema(d); draft = currentSchema(); dirty = false; render();
    toast('Questionnaire approved — survey, AI, exports, PDF and analysis now use it', 'ok');
    if (publish) {
      if (!settings.endpoint) return toast('Set a database endpoint in Settings to publish to the team', 'err');
      if (!adminToken()) { const t = prompt('Admin token (from the Apps Script backend) to publish this questionnaire to all devices:'); if (!t) return; sessionStorage.setItem('gs_admin', t.trim()); }
      try { await publishSchema(d); toast('Published — every device adopts this questionnaire on its next start', 'ok'); }
      catch (e) { toast('Publish failed: ' + e.message, 'err'); }
    }
  }
  function exportJson() { download(`geosurvey_questionnaire_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(normalise(clone(draft)), null, 2), 'application/json'); }
  async function importJson(file) { try { const d = JSON.parse(await file.text()); if (!Array.isArray(d.sections)) throw new Error('not a questionnaire file'); draft = { sections: d.sections, remarks: d.remarks || clone(DEFAULT_SCHEMA.remarks), constructNames: d.constructNames || {}, model: d.model }; dirty = true; render(); toast('Questionnaire loaded into the draft — review and approve'); } catch (e) { toast('Import failed: ' + e.message, 'err'); } }

  /* ---------- document intake: PDF / images → page images ---------- */
  function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load PDF renderer (offline?)')); document.head.appendChild(s); }); }
  async function pdfToImages(file, maxPages = 12) {
    if (!window.pdfjsLib) { await loadScript(PDFJS); window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; }
    const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const out = [];
    for (let i = 1; i <= Math.min(pdf.numPages, maxPages); i++) {
      const page = await pdf.getPage(i); const vp = page.getViewport({ scale: 1.6 });
      const cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height;
      await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
      out.push({ dataUrl: cv.toDataURL('image/jpeg', 0.85), label: `${file.name} · page ${i}` });
    }
    if (pdf.numPages > maxPages) toast(`Only the first ${maxPages} pages were used`);
    return out;
  }
  async function intake(files) {
    const st = $('#designerStatus');
    for (const f of files) {
      try {
        setStatus(st, `Reading ${f.name}…`, '', true);
        if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) pages.push(...await pdfToImages(f));
        else if (f.type.startsWith('image/')) { const c = await compressImage(f, 1600); pages.push({ dataUrl: canvasToDataUrl(c.canvas, 0.85).dataUrl, label: f.name }); }
      } catch (e) { toast(`${f.name}: ${e.message}`, 'err'); }
    }
    setStatus(st, pages.length ? `${pages.length} page image(s) ready — click "AI: draft questionnaire".` : '', 'ok');
    renderPages();
  }
  function renderPages() {
    $('#designerPages').innerHTML = pages.map((p, i) => `<div class="thumb dpage" title="${esc(p.label)}"><img src="${p.dataUrl}" alt=""><button class="x" data-i="${i}">✕</button><span class="sz">${i + 1}</span></div>`).join('');
    $$('#designerPages .x').forEach(b => b.onclick = () => { pages.splice(+b.dataset.i, 1); renderPages(); });
    $('#designerAiBtn').disabled = !pages.length;
  }

  /* ---------- AI refinement ---------- */
  const AI_PROMPT = () => `You are a survey-methodology assistant. The images show a paper questionnaire (or notes) for a household socio-economic survey. Produce a refined digital questionnaire that captures every question in the document, organised into logical sections, with clear neutral wording and closed options wherever the document implies categories.

Rules:
- Output JSON: { "sections": [ { "title", "photoHint", "fields": [ { "key", "label", "type", "options", "required", "construct" } ] } ] }.
- type ∈ text | number | date | tel | select | multi | likert | textarea. Use select for single choice, multi for tick-all-that-apply, likert for 1–5 agreement statements (put agreement statements of one theme together with the same 2-letter "construct" code, e.g. ES, and at least 3 items per construct), textarea for open answers.
- key: short snake_case identifier, unique. Reuse a key from the EXISTING questionnaire when the question means the same thing so historical data stays comparable.
- photoHint: one sentence on what a field enumerator should photograph so an AI can pre-fill that section (empty string for Likert-only sections).
- Do not include location / GPS / enumerator fields — they are captured automatically.
- Keep good existing questions that the document does not contradict; drop existing ones the document clearly replaces.

EXISTING questionnaire (JSON):
${JSON.stringify({ sections: draft.sections.map(s => ({ title: s.title, fields: s.fields.map(f => ({ key: f.k, label: f.label, type: f.type, options: f.options, construct: f.c })) })) })}`;
  const AI_SCHEMA = { type: 'OBJECT', properties: { sections: { type: 'ARRAY', items: { type: 'OBJECT', properties: { title: { type: 'STRING' }, photoHint: { type: 'STRING', nullable: true }, fields: { type: 'ARRAY', items: { type: 'OBJECT', properties: { key: { type: 'STRING' }, label: { type: 'STRING' }, type: { type: 'STRING', enum: FIELD_TYPES }, options: { type: 'ARRAY', items: { type: 'STRING' }, nullable: true }, required: { type: 'BOOLEAN', nullable: true }, construct: { type: 'STRING', nullable: true } }, required: ['key', 'label', 'type'] } } }, required: ['title', 'fields'] } } }, required: ['sections'] };
  async function aiDraft() {
    if (!pages.length) return;
    if (!engineReady()) { openSettings(); return toast('Add a Gemini or OpenRouter API key in Settings first', 'err'); }
    const st = $('#designerStatus'); const btn = $('#designerAiBtn'); btn.disabled = true;
    setStatus(st, `Reading ${pages.length} page(s) with AI and drafting the questionnaire…`, '', true);
    try {
      let out;
      if (activeEngine() === 'gemini') {
        const body = { contents: [{ role: 'user', parts: [{ text: AI_PROMPT() }, ...pages.map(p => ({ inline_data: { mime_type: 'image/jpeg', data: p.dataUrl.split(',')[1] } }))] }], generationConfig: { responseMimeType: 'application/json', responseSchema: AI_SCHEMA, temperature: 0.2 } };
        let d = await geminiCall(settings.model, body);
        if (d.error) d = await geminiCall(settings.model, { ...body, generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } });
        if (d.error) d = await geminiCall(GEMINI_FALLBACK, body);
        if (d.error) throw new Error(d.error.message);
        out = extractJson(d.candidates?.[0]?.content?.parts?.map(x => x.text).join('') || '');
      } else if (activeEngine() === 'openrouter') {
        const content = [{ type: 'text', text: AI_PROMPT() }, ...pages.map(p => ({ type: 'image_url', image_url: { url: p.dataUrl } }))];
        const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.orKey}`, 'HTTP-Referer': location.origin, 'X-Title': 'GeoSurvey' }, body: JSON.stringify({ model: settings.orModel, messages: [{ role: 'user', content }], temperature: 0.2, max_tokens: 6000, response_format: { type: 'json_object' } }) });
        const d = await r.json(); if (d.error) throw new Error(d.error.message);
        const c = d.choices?.[0]?.message?.content; out = extractJson(typeof c === 'string' ? c : (c || []).map(t => t.text || '').join(''));
      } else throw new Error('Questionnaire drafting needs Gemini or OpenRouter');
      if (!Array.isArray(out.sections) || !out.sections.length) throw new Error('AI returned no sections');
      const taken = new Set(LOCATION_FIELDS.map(f => f.k));
      draft = { ...draft, sections: out.sections.map((s, i) => ({ id: slug(s.title || `section_${i + 1}`), title: s.title || `Section ${i + 1}`, photoHint: s.photoHint || undefined, fields: (s.fields || []).map(f => { const t = FIELD_TYPES.includes(f.type) ? f.type : 'text'; const q = { k: uniqueKey(slug(f.key || f.label), taken), label: f.label || '', type: t, required: !!f.required }; if (t === 'select' || t === 'multi') q.options = (f.options || []).filter(Boolean); if (t === 'likert') q.c = String(f.construct || 'C1').toUpperCase().slice(0, 4); else q.ai = true; return q; }) })) };
      dirty = true; render();
      setStatus(st, `AI drafted ${draft.sections.length} sections / ${draft.sections.reduce((n, s) => n + s.fields.length, 0)} questions from the document. Review, edit, then Approve & apply.`, 'ok');
      toast('Draft questionnaire ready for review', 'ok'); $('#designerBody').scrollIntoView({ behavior: 'smooth' });
    } catch (e) { setStatus(st, 'AI error: ' + e.message, 'err'); toast('AI error: ' + e.message, 'err'); }
    finally { btn.disabled = !pages.length; }
  }

  function open() { if (!draft) load(); }
  function init() {
    const body = $('#designerBody'); if (!body) return;
    body.addEventListener('input', onInput); body.addEventListener('change', onInput); body.addEventListener('click', onClick);
    $('#designerModel').addEventListener('input', onInput);
    $('#designerFile').onchange = e => { intake([...e.target.files]); e.target.value = ''; };
    $('#designerAiBtn').onclick = aiDraft;
    $('#designerAddSec').onclick = addSection;
    $('#designerApply').onclick = () => approve(false);
    $('#designerPublish').onclick = () => approve(true);
    $('#designerReset').onclick = reset;
    $('#designerExport').onclick = exportJson;
    $('#designerImport').onchange = e => { if (e.target.files[0]) importJson(e.target.files[0]); e.target.value = ''; };
    $('#designerDiscard').onclick = () => { draft = currentSchema(); dirty = false; render(); };
  }
  document.addEventListener('DOMContentLoaded', init);
  return { open, load, approve };
})();
