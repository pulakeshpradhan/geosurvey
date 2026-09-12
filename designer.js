/* GeoSurvey — questionnaire designer (Edit tab), Google-Forms style:
 * click-to-edit question cards with live preview, type picker, option rows, required / AI switches, help text,
 * drag-and-drop ordering, floating toolbar, section cards, autosaved draft, AI draft from an uploaded PDF / photos,
 * Approve & apply (device) / Approve & publish (team via backend).
 * Depends on app.js globals: LOCATION_FIELDS, DEFAULT_SCHEMA, FIELD_TYPES, LIKERT, applySchema, currentSchema, deriveConstructs,
 * deriveModel, clone, LS, settings, activeEngine, engineReady, openSettings, geminiCall, GEMINI_FALLBACK, extractJson,
 * compressImage, canvasToDataUrl, adminToken, publishSchema, download, toast, setStatus, esc, $, $$. */
'use strict';

const Designer = (() => {
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const DRAFT_KEY = 'gs_designer_draft';
  let draft = null, pages = [], dirty = false, active = null; // active = 's:f' key of the expanded question card
  let drag = null;

  const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'q';
  const uniqueKey = (base, taken) => { let k = base, i = 2; while (taken.has(k)) k = `${base}_${i++}`; taken.add(k); return k; };
  const allKeys = d => new Set([...LOCATION_FIELDS.map(f => f.k), ...d.sections.flatMap(s => s.fields.map(f => f.k)), ...d.remarks.map(f => f.k)]);
  const TYPES = [
    ['text', 'Short answer', '≡'], ['textarea', 'Paragraph', '¶'], ['select', 'Multiple choice', '◉'], ['multi', 'Checkboxes', '☑'],
    ['likert', 'Linear scale 1–5', '⇹'], ['number', 'Number', '#'], ['date', 'Date', '📅'], ['tel', 'Phone', '☎'],
  ];
  const typeName = t => (TYPES.find(x => x[0] === t) || TYPES[0])[1];

  /* ---------- state ---------- */
  function load() { const saved = LS.get(DRAFT_KEY, null); draft = saved && saved.sections ? saved : currentSchema(); dirty = !!saved; active = null; render(); }
  function persist() { LS.set(DRAFT_KEY, draft); dirty = true; $('#designerDirty').hidden = false; }
  function reset() { if (!confirm('Replace the draft with the default questionnaire?')) return; draft = clone(DEFAULT_SCHEMA); active = null; persist(); render(); }
  function discard() { draft = currentSchema(); LS.set(DRAFT_KEY, null); dirty = false; active = null; render(); }

  /* ---------- rendering ---------- */
  function previewControl(f) {
    switch (f.type) {
      case 'select': return `<div class="pv-opts">${(f.options || []).slice(0, 6).map(o => `<div><span class="pv-radio"></span>${esc(o)}</div>`).join('')}${(f.options || []).length > 6 ? `<div class="dim">+ ${f.options.length - 6} more</div>` : ''}</div>`;
      case 'multi': return `<div class="pv-opts">${(f.options || []).slice(0, 6).map(o => `<div><span class="pv-check"></span>${esc(o)}</div>`).join('')}${(f.options || []).length > 6 ? `<div class="dim">+ ${f.options.length - 6} more</div>` : ''}</div>`;
      case 'likert': return `<div class="pv-scale"><span class="dim">${esc(LIKERT[0])}</span>${[1, 2, 3, 4, 5].map(n => `<span class="pv-num">${n}</span>`).join('')}<span class="dim">${esc(LIKERT[4])}</span></div>`;
      case 'textarea': return `<div class="pv-line long">Long answer text</div>`;
      case 'date': return `<div class="pv-line">Month, day, year</div>`;
      case 'number': return `<div class="pv-line">Number</div>`;
      case 'tel': return `<div class="pv-line">Phone number</div>`;
      default: return `<div class="pv-line">Short answer text</div>`;
    }
  }
  function questionCard(si, fi) {
    const f = draft.sections[si].fields[fi]; const key = `${si}:${fi}`; const isActive = active === key;
    const hasOpts = f.type === 'select' || f.type === 'multi';
    if (!isActive) return `<div class="gq" data-s="${si}" data-f="${fi}" draggable="true"><div class="gq-grip" title="Drag to reorder">⋮⋮</div>
      <div class="gq-title">${esc(f.label) || '<span class="dim">Untitled question</span>'}${f.required ? ' <span class="req">*</span>' : ''}</div>
      ${f.help ? `<div class="gq-help">${esc(f.help)}</div>` : ''}${previewControl(f)}</div>`;
    return `<div class="gq active" data-s="${si}" data-f="${fi}" draggable="true"><div class="gq-grip" title="Drag to reorder">⋮⋮</div>
      <div class="gq-edit">
        <input class="input gq-label" data-prop="label" value="${esc(f.label)}" placeholder="Question">
        <select class="input gq-type" data-prop="type">${TYPES.map(([t, n, ic]) => `<option value="${t}" ${f.type === t ? 'selected' : ''}>${ic}  ${n}</option>`).join('')}</select>
      </div>
      ${f.help != null ? `<input class="input gq-helpin" data-prop="help" value="${esc(f.help)}" placeholder="Description / help text shown under the question">` : ''}
      ${hasOpts ? `<div class="gq-opts">${(f.options || []).map((o, oi) => `<div class="gq-opt"><span class="${f.type === 'select' ? 'pv-radio' : 'pv-check'}"></span><input class="input" data-opt="${oi}" value="${esc(o)}" placeholder="Option ${oi + 1}"><button type="button" class="icon-btn" data-act="odel" data-oi="${oi}" title="Remove option">✕</button></div>`).join('')}
        <div class="gq-opt add"><span class="${f.type === 'select' ? 'pv-radio' : 'pv-check'}"></span><button type="button" class="link-btn" data-act="oadd">Add option</button></div></div>` : ''}
      ${f.type === 'likert' ? `<div class="gq-scale"><div class="pv-scale"><span class="dim">1 · ${esc(LIKERT[0])}</span>${[1, 2, 3, 4, 5].map(n => `<span class="pv-num">${n}</span>`).join('')}<span class="dim">5 · ${esc(LIKERT[4])}</span></div>
        <label class="gq-inline">Construct code <input class="input input-xs" data-prop="c" value="${esc(f.c || '')}" placeholder="ES" maxlength="4"><span class="dim">statements sharing a code form one construct for reliability, factor analysis and SEM (≥ 2 items)</span></label></div>` : ''}
      ${['text', 'number', 'date', 'tel', 'textarea'].includes(f.type) ? previewControl(f) : ''}
      <div class="gq-foot">
        <button type="button" class="icon-btn" data-act="fdup" title="Duplicate">⧉</button>
        <button type="button" class="icon-btn" data-act="fdel" title="Delete">🗑</button>
        <span class="gq-sep"></span>
        <label class="switch"><input type="checkbox" data-prop="required" ${f.required ? 'checked' : ''}><span></span>Required</label>
        ${f.type !== 'likert' ? `<label class="switch"><input type="checkbox" data-prop="ai" ${f.ai ? 'checked' : ''}><span></span>AI fill</label>` : ''}
        <button type="button" class="icon-btn" data-act="more" title="More options">⋮</button>
        <div class="gq-more" hidden><button type="button" class="link-btn" data-act="help">${f.help != null ? 'Remove description' : 'Add description'}</button><span class="dim">key <code>${esc(f.k || 'auto')}</code></span></div>
      </div>
    </div>`;
  }
  function render() {
    const host = $('#designerBody'); if (!host || !draft) return;
    const n = draft.sections.length;
    host.innerHTML = `<div class="gsec gform-head"><div class="gform-bar"></div>
        <input class="input gform-title" data-form="title" value="${esc(draft.title || 'Socio-Economic Household Survey')}" placeholder="Form title">
        <input class="input gform-desc" data-form="description" value="${esc(draft.description || '')}" placeholder="Form description (shown on the PDF)">
      </div>` +
      draft.sections.map((s, si) => `
      <div class="gsec" data-s="${si}" draggable="true">
        <div class="gsec-chip">Section ${si + 1} of ${n}<span class="gsec-tools"><button type="button" class="icon-btn" data-act="sup" title="Move section up">↑</button><button type="button" class="icon-btn" data-act="sdown" title="Move section down">↓</button><button type="button" class="icon-btn" data-act="sdel" title="Delete section">🗑</button></span></div>
        <div class="gsec-head"><input class="input gsec-title" data-prop="title" value="${esc(s.title)}" placeholder="Section title">
        <input class="input gsec-desc" data-prop="photoHint" value="${esc(s.photoHint || '')}" placeholder="What should the enumerator photograph for this section? (leave empty for sections without photo / AI tools)"></div>
        <div class="gq-list" data-list="${si}">${s.fields.map((f, fi) => questionCard(si, fi)).join('')}${s.fields.length ? '' : '<div class="gq-empty">No questions yet — use ⊕ or drop a question here.</div>'}</div>
        <div class="gsec-foot"><button type="button" class="btn btn-outline btn-sm" data-act="fadd">⊕ Add question</button></div>
      </div>`).join('') +
      `<div class="gsec"><div class="gsec-chip">Closing</div><div class="gsec-head"><h2>Remarks</h2></div><div class="gq-list">${draft.remarks.map((f, i) => `<div class="gq"><div class="gq-title"><input class="input gq-label" data-r="${i}" value="${esc(f.label)}"></div><div class="pv-line long">Long answer text</div></div>`).join('')}</div></div>`;
    const cs = deriveConstructs(draft.sections, draft.constructNames || {});
    $('#designerModel').innerHTML = Object.keys(cs).length
      ? `<b>Constructs:</b> ${Object.entries(cs).map(([k, c]) => `<span class="chip">${esc(k)} <input class="input input-xs wide" data-cname="${esc(k)}" value="${esc(c.name)}" title="Construct name"> ${c.items.length} items</span>`).join(' ')}<div class="dim">Structural model for the Analysis tab: ${describeModel(deriveModel(cs, draft.model))}</div>`
      : '<span class="dim">No linear-scale constructs yet — add scale questions sharing a construct code to enable reliability, factor analysis and SEM.</span>';
    $('#designerDirty').hidden = !dirty;
    if (active) { const el = $(`.gq.active`); el?.querySelector('.gq-label')?.focus({ preventScroll: true }); }
  }
  const describeModel = m => m.paths.length ? m.paths.map(([a, b]) => `${a} → ${b}`).join(', ') + (m.mediations?.length ? ` · mediation via ${[...new Set(m.mediations.map(t => t[1]))].join(', ')}` : '') + (m.moderation ? ` · ${m.moderation.moderator} moderates ${m.moderation.predictor} → ${m.moderation.outcome}` : '') + (m.higherOrder ? ` · higher-order ${m.higherOrder.key}` : '') : 'none (needs ≥ 2 constructs)';

  /* ---------- editing ---------- */
  function fieldAt(el) { const q = el.closest('.gq'); const s = el.closest('[data-s]'); if (!q || !s) return {}; const si = +s.dataset.s, fi = +q.dataset.f; return { si, fi, sec: draft.sections[si], f: draft.sections[si].fields[fi] }; }
  function onInput(e) {
    const t = e.target;
    if (t.dataset.form) { draft[t.dataset.form] = t.value; persist(); return; }
    if (t.dataset.cname) { draft.constructNames = draft.constructNames || {}; draft.constructNames[t.dataset.cname] = t.value; persist(); return; }
    if (t.dataset.r != null) { draft.remarks[+t.dataset.r].label = t.value; persist(); return; }
    if (t.dataset.opt != null) { const { f } = fieldAt(t); f.options[+t.dataset.opt] = t.value; persist(); return; }
    const prop = t.dataset.prop; if (!prop) return;
    const sec = draft.sections[+t.closest('[data-s]').dataset.s]; const { f } = fieldAt(t); const target = f || sec;
    if (t.type === 'checkbox') target[prop] = t.checked;
    else if (prop === 'c') target.c = t.value.toUpperCase().trim();
    else target[prop] = t.value;
    persist();
    if (prop === 'type' && f) { if ((f.type === 'select' || f.type === 'multi') && !(f.options || []).length) f.options = ['Option 1', 'Option 2']; if (f.type === 'likert') { f.ai = false; if (!f.c) f.c = 'C1'; } render(); }
    if (prop === 'c' || prop === 'title' || (prop === 'label' && !t.closest('.gq'))) { clearTimeout(onInput.t); onInput.t = setTimeout(render, 700); }
    if (prop === 'label' && f) { const card = t.closest('.gq'); /* keep preview text in sync lazily */ card.dataset.label = t.value; }
  }
  function onClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b) { // click on an inactive question card → activate
      const q = e.target.closest('.gq'); if (q && q.dataset.f != null && !q.classList.contains('active')) { active = `${q.closest('[data-s]').dataset.s}:${q.dataset.f}`; render(); }
      return;
    }
    const act = b.dataset.act; const secEl = b.closest('[data-s]'); const si = secEl ? +secEl.dataset.s : -1; const sec = draft.sections[si];
    const q = b.closest('.gq'); const fi = q ? +q.dataset.f : -1; const f = fi >= 0 ? sec.fields[fi] : null;
    const move = (a, i, d) => { const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; };
    switch (act) {
      case 'fadd': sec.fields.push({ k: '', label: '', type: 'text', ai: true }); active = `${si}:${sec.fields.length - 1}`; break;
      case 'fdel': sec.fields.splice(fi, 1); active = null; break;
      case 'fdup': { const c = clone(f); c.k = ''; sec.fields.splice(fi + 1, 0, c); active = `${si}:${fi + 1}`; break; }
      case 'oadd': f.options = f.options || []; f.options.push(`Option ${f.options.length + 1}`); break;
      case 'odel': f.options.splice(+b.dataset.oi, 1); break;
      case 'help': if (f.help == null) f.help = ''; else delete f.help; break;
      case 'more': { const m = b.parentElement.querySelector('.gq-more'); m.hidden = !m.hidden; return; }
      case 'sup': move(draft.sections, si, -1); break;
      case 'sdown': move(draft.sections, si, 1); break;
      case 'sdel': if (!confirm(`Delete section "${sec.title}" and its ${sec.fields.length} questions?`)) return; draft.sections.splice(si, 1); active = null; break;
      default: return;
    }
    persist(); render();
    if (act === 'oadd') { const inputs = $$('.gq.active .gq-opt input'); inputs[inputs.length - 1]?.focus(); }
  }
  function addSection() { const id = uniqueKey('section_' + (draft.sections.length + 1), new Set(draft.sections.map(s => s.id))); draft.sections.push({ id, title: 'Untitled section', photoHint: 'Photograph the relevant items for this section.', fields: [] }); active = null; persist(); render(); $$('.gsec').at(-2)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  function addQuestion() {
    let si = active ? +active.split(':')[0] : draft.sections.length - 1; if (si < 0) { addSection(); si = 0; }
    const sec = draft.sections[si]; const at = active ? +active.split(':')[1] + 1 : sec.fields.length;
    sec.fields.splice(at, 0, { k: '', label: '', type: 'text', ai: true }); active = `${si}:${at}`; persist(); render();
    $('.gq.active')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  /* drag & drop: questions between/within sections, sections among themselves */
  function onDragStart(e) {
    const q = e.target.closest('.gq'); const s = e.target.closest('.gsec[data-s]');
    if (q && q.dataset.f != null) { drag = { type: 'q', si: +q.closest('[data-s]').dataset.s, fi: +q.dataset.f }; q.classList.add('dragging'); }
    else if (s) { drag = { type: 's', si: +s.dataset.s }; s.classList.add('dragging'); }
    else return;
    e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', ''); } catch {}
  }
  function onDragOver(e) { if (!drag) return; e.preventDefault(); $$('.drop-before, .drop-after').forEach(x => x.classList.remove('drop-before', 'drop-after')); const tgt = drag.type === 'q' ? e.target.closest('.gq[data-f], .gq-list') : e.target.closest('.gsec[data-s]'); if (!tgt) return; const r = tgt.getBoundingClientRect(); tgt.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after'); }
  function onDrop(e) {
    if (!drag) return; e.preventDefault();
    if (drag.type === 'q') {
      const list = e.target.closest('.gq-list'); if (!list || list.dataset.list == null) return cleanupDrag();
      const toSi = +list.dataset.list; const over = e.target.closest('.gq[data-f]');
      const [item] = draft.sections[drag.si].fields.splice(drag.fi, 1);
      let at = draft.sections[toSi].fields.length;
      if (over) { const oi = +over.dataset.f; const r = over.getBoundingClientRect(); at = oi + (e.clientY < r.top + r.height / 2 ? 0 : 1); if (toSi === drag.si && drag.fi < oi) at--; }
      draft.sections[toSi].fields.splice(at, 0, item); active = `${toSi}:${at}`;
    } else {
      const over = e.target.closest('.gsec[data-s]'); if (!over) return cleanupDrag();
      const to = +over.dataset.s; if (to === drag.si) return cleanupDrag();
      const [sec] = draft.sections.splice(drag.si, 1); const r = over.getBoundingClientRect(); let at = to + (e.clientY < r.top + r.height / 2 ? 0 : 1); if (drag.si < to) at--; draft.sections.splice(at, 0, sec); active = null;
    }
    cleanupDrag(); persist(); render();
  }
  function cleanupDrag() { drag = null; $$('.dragging, .drop-before, .drop-after').forEach(x => x.classList.remove('dragging', 'drop-before', 'drop-after')); }

  /* ---------- validation + apply ---------- */
  function normalise(d) {
    const taken = new Set(LOCATION_FIELDS.map(f => f.k));
    d.sections.forEach((s, i) => {
      s.id = slug(s.id || s.title || `section_${i + 1}`); s.title = (s.title || '').trim();
      s.fields.forEach(f => {
        f.k = uniqueKey(slug(f.k || f.label), taken); f.label = (f.label || '').trim();
        if (!FIELD_TYPES.includes(f.type)) f.type = 'text';
        if (f.type === 'select' || f.type === 'multi') f.options = (f.options || []).map(o => String(o).trim()).filter(Boolean); else delete f.options;
        if (f.type === 'likert') { f.c = String(f.c || '').toUpperCase(); delete f.ai; } else delete f.c;
        if (f.type === 'multi' && f.options?.length > 6) f.wide = true;
        if (!f.help) delete f.help;
      });
      if (!s.photoHint?.trim()) delete s.photoHint;
    });
    return d;
  }
  function validate(d) {
    const errs = []; const ids = new Set();
    if (!d.sections.length) errs.push('Add at least one section.');
    d.sections.forEach((s, i) => {
      if (!s.title) errs.push(`Section ${i + 1} needs a title.`);
      if (ids.has(s.id)) errs.push(`Duplicate section id "${s.id}".`); ids.add(s.id);
      if (!s.fields.length) errs.push(`Section "${s.title || i + 1}" has no questions.`);
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
    LS.set('gs_schema', d); applySchema(d); LS.set(DRAFT_KEY, null); draft = currentSchema(); dirty = false; active = null; render();
    toast('Questionnaire approved — survey, AI, exports, PDF and analysis now use it', 'ok');
    if (publish) {
      if (!settings.endpoint) return toast('Set a database endpoint in Settings to publish to the team', 'err');
      if (!adminToken()) { const t = prompt('Admin token (from the Apps Script backend) to publish this questionnaire to all devices:'); if (!t) return; sessionStorage.setItem('gs_admin', t.trim()); }
      try { await publishSchema(d); toast('Published — every device adopts this questionnaire on its next start', 'ok'); }
      catch (e) { toast('Publish failed: ' + e.message, 'err'); }
    }
  }
  function exportJson() { download(`geosurvey_questionnaire_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(normalise(clone(draft)), null, 2), 'application/json'); }
  async function importJson(file) { try { const d = JSON.parse(await file.text()); if (!Array.isArray(d.sections)) throw new Error('not a questionnaire file'); draft = { ...draft, ...d, remarks: d.remarks || clone(DEFAULT_SCHEMA.remarks) }; active = null; persist(); render(); toast('Questionnaire loaded into the draft — review and approve'); } catch (e) { toast('Import failed: ' + e.message, 'err'); } }

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
    $('#designerIntake').hidden = !pages.length;
  }

  /* ---------- AI refinement ---------- */
  const AI_PROMPT = () => `You are a survey-methodology assistant. The images show a paper questionnaire (or notes) for a household socio-economic survey. Produce a refined digital questionnaire that captures every question in the document, organised into logical sections, with clear neutral wording and closed options wherever the document implies categories.

Rules:
- Output JSON: { "sections": [ { "title", "photoHint", "fields": [ { "key", "label", "help", "type", "options", "required", "construct" } ] } ] }.
- type ∈ text | number | date | tel | select | multi | likert | textarea. Use select for single choice, multi for tick-all-that-apply, likert for 1–5 agreement statements (put agreement statements of one theme together with the same 2-letter "construct" code, e.g. ES, at least 3 items per construct), textarea for open answers.
- key: short snake_case identifier, unique. Reuse a key from the EXISTING questionnaire when the question means the same thing so historical data stays comparable.
- help: optional one-line instruction for the enumerator (null if none).
- photoHint: one sentence on what a field enumerator should photograph so an AI can pre-fill that section (empty string for Likert-only sections).
- Do not include location / GPS / enumerator fields — they are captured automatically.
- Keep good existing questions that the document does not contradict; drop existing ones the document clearly replaces.

EXISTING questionnaire (JSON):
${JSON.stringify({ sections: draft.sections.map(s => ({ title: s.title, fields: s.fields.map(f => ({ key: f.k, label: f.label, type: f.type, options: f.options, construct: f.c })) })) })}`;
  const AI_SCHEMA = { type: 'OBJECT', properties: { sections: { type: 'ARRAY', items: { type: 'OBJECT', properties: { title: { type: 'STRING' }, photoHint: { type: 'STRING', nullable: true }, fields: { type: 'ARRAY', items: { type: 'OBJECT', properties: { key: { type: 'STRING' }, label: { type: 'STRING' }, help: { type: 'STRING', nullable: true }, type: { type: 'STRING', enum: FIELD_TYPES }, options: { type: 'ARRAY', items: { type: 'STRING' }, nullable: true }, required: { type: 'BOOLEAN', nullable: true }, construct: { type: 'STRING', nullable: true } }, required: ['key', 'label', 'type'] } } }, required: ['title', 'fields'] } } }, required: ['sections'] };
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
      draft = { ...draft, sections: out.sections.map((s, i) => ({ id: slug(s.title || `section_${i + 1}`), title: s.title || `Section ${i + 1}`, photoHint: s.photoHint || undefined, fields: (s.fields || []).map(f => { const t = FIELD_TYPES.includes(f.type) ? f.type : 'text'; const q = { k: uniqueKey(slug(f.key || f.label), taken), label: f.label || '', type: t, required: !!f.required }; if (f.help) q.help = f.help; if (t === 'select' || t === 'multi') q.options = (f.options || []).filter(Boolean); if (t === 'likert') q.c = String(f.construct || 'C1').toUpperCase().slice(0, 4); else q.ai = true; return q; }) })) };
      active = null; persist(); render();
      setStatus(st, `AI drafted ${draft.sections.length} sections / ${draft.sections.reduce((n, s) => n + s.fields.length, 0)} questions from the document. Review, edit, then Approve & apply.`, 'ok');
      toast('Draft questionnaire ready for review', 'ok'); $('#designerBody').scrollIntoView({ behavior: 'smooth' });
    } catch (e) { setStatus(st, 'AI error: ' + e.message, 'err'); toast('AI error: ' + e.message, 'err'); }
    finally { btn.disabled = !pages.length; }
  }

  function open() { if (!draft) load(); }
  function init() {
    const body = $('#designerBody'); if (!body) return;
    body.addEventListener('input', onInput); body.addEventListener('change', onInput); body.addEventListener('click', onClick);
    body.addEventListener('dragstart', onDragStart); body.addEventListener('dragover', onDragOver); body.addEventListener('drop', onDrop); body.addEventListener('dragend', cleanupDrag);
    body.addEventListener('keydown', e => { if (e.key === 'Escape') { active = null; render(); } });
    $('#designerModel').addEventListener('input', onInput);
    $('#designerFile').onchange = e => { intake([...e.target.files]); e.target.value = ''; };
    $('#designerAiBtn').onclick = aiDraft;
    $('#designerAddQ').onclick = addQuestion;
    $('#designerAddSec').onclick = addSection;
    $('#designerApply').onclick = () => approve(false);
    $('#designerPublish').onclick = () => approve(true);
    $('#designerReset').onclick = reset;
    $('#designerExport').onclick = exportJson;
    $('#designerImport').onchange = e => { if (e.target.files[0]) importJson(e.target.files[0]); e.target.value = ''; };
    $('#designerDiscard').onclick = discard;
  }
  document.addEventListener('DOMContentLoaded', init);
  return { open, load, approve };
})();
