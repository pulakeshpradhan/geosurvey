/* GeoSurvey — questionnaire designer (Edit tab), Google-Forms style:
 * click-to-edit question cards with live preview, type picker, option rows, required / AI switches, help text,
 * drag-and-drop ordering, floating toolbar, section cards, autosaved draft, AI draft from an uploaded PDF / photos,
 * Approve & apply (device) / Approve & publish (team via backend).
 * Depends on app.js globals: LOCATION_FIELDS, DEFAULT_SCHEMA, FIELD_TYPES, LIKERT, applySchema, currentSchema, deriveConstructs,
 * deriveModel, clone, LS, settings, activeEngine, engineReady, openSettings, geminiCall, gemmaCall, GEMINI_FALLBACK, GEMMA_FATAL, NO_ENGINE_MSG, extractJson,
 * askTeamKey, backupProject, downloadProject, parseProjectFile,
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
    ['likert', 'Linear scale', '⇹'], ['number', 'Number', '#'], ['date', 'Date', '📅'], ['tel', 'Phone', '☎'],
  ];
  const typeName = t => (TYPES.find(x => x[0] === t) || TYPES[0])[1];

  /* ---------- state ---------- */
  function load() { const saved = LS.get(DRAFT_KEY, null); draft = saved && saved.sections ? saved : currentSchema(); dirty = !!saved; active = null; render(); }
  function persist() { LS.set(DRAFT_KEY, draft); dirty = true; $('#designerDirty').hidden = false; }
  function loadSample() { if (draft.sections.length && !confirm('Replace the current draft with the sample questionnaire?')) return; draft = clone(DEFAULT_SCHEMA); active = null; persist(); render(); toast('Sample questionnaire loaded — customise, then Apply', 'ok'); }
  function startBlank(ask = true) { if (ask && draft?.sections.length && !confirm('Start a blank questionnaire? The current draft will be replaced.')) return; draft = { ...clone(EMPTY_SCHEMA), title: draft?.title || '', sections: [{ id: 'section_1', title: 'Section 1', photoHint: '', fields: [{ k: '', label: '', type: 'text', ai: true }] }] }; active = '0:0'; persist(); render(); }
  function discard() { draft = currentSchema(); LS.set(DRAFT_KEY, null); dirty = false; active = null; render(); }

  /* ---------- rendering ---------- */
  function previewControl(f) {
    switch (f.type) {
      case 'select': return `<div class="pv-opts">${(f.options || []).slice(0, 6).map(o => `<div><span class="pv-radio"></span>${esc(o)}</div>`).join('')}${(f.options || []).length > 6 ? `<div class="dim">+ ${f.options.length - 6} more</div>` : ''}</div>`;
      case 'multi': return `<div class="pv-opts">${(f.options || []).slice(0, 6).map(o => `<div><span class="pv-check"></span>${esc(o)}</div>`).join('')}${(f.options || []).length > 6 ? `<div class="dim">+ ${f.options.length - 6} more</div>` : ''}</div>`;
      case 'likert': { const sc = scaleOf(f); return `<div class="pv-scale"><span class="dim">${esc(sc.lo)}</span>${Array.from({ length: sc.max }, (_, n) => `<span class="pv-num">${n + 1}</span>`).join('')}<span class="dim">${esc(sc.hi)}</span></div>`; }
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
      ${f.type === 'likert' ? (() => { const sc = scaleOf(f); return `<div class="gq-scale">
        ${previewControl(f)}
        <div class="gq-scale-row"><span>1</span><span class="dim">to</span><select class="input input-xs" data-scale="max">${[3, 4, 5, 6, 7, 8, 9, 10].map(n => `<option ${sc.max === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="gq-scale-row"><span class="pv-num sm">1</span><input class="input gq-scale-lbl" data-scale="lo" value="${esc(f.scale?.lo || '')}" placeholder="${esc(sc.lo)} (label, optional)"></div>
        <div class="gq-scale-row"><span class="pv-num sm">${sc.max}</span><input class="input gq-scale-lbl" data-scale="hi" value="${esc(f.scale?.hi || '')}" placeholder="${esc(sc.hi)} (label, optional)"></div>
        <label class="gq-inline">Construct code <input class="input input-xs" data-prop="c" value="${esc(f.c || '')}" placeholder="ES" maxlength="4"><span class="dim">scale items sharing a code form one construct for reliability, factor analysis and SEM (≥ 2 items)</span></label></div>`; })() : ''}
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
    if (!draft.sections.length) {
      host.innerHTML = `<div class="gempty"><h2>Start your questionnaire</h2><p class="dim">Design from scratch, load the sample, or upload a paper questionnaire and let the AI draft it.</p>
        <div class="ob-grid"><button class="ob-tile" data-start="blank"><span class="ob-ic">✎</span><b>Design your own</b><span>Sections and questions, form-style.</span></button><button class="ob-tile" data-start="sample"><span class="ob-ic">▤</span><b>Sample questionnaire</b><span>Household survey with 5 perception constructs.</span></button><button class="ob-tile" data-start="upload"><span class="ob-ic">⇪</span><b>Upload paper form</b><span>PDF / photos → converted as printed.</span></button></div></div>`;
      $('#designerModel').innerHTML = ''; $('#designerDirty').hidden = !dirty; return;
    }
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
    if (t.dataset.scale) { const { f } = fieldAt(t); f.scale = f.scale || {}; if (t.dataset.scale === 'max') { f.scale.max = +t.value; persist(); render(); } else { f.scale[t.dataset.scale] = t.value; persist(); } return; }
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
    const st = e.target.closest('[data-start]');
    if (st) { const k = st.dataset.start; if (k === 'blank') startBlank(false); else if (k === 'sample') loadSample(); else $('#designerFile').click(); return; }
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
        if (f.type === 'likert') { f.c = String(f.c || '').toUpperCase(); delete f.ai; if (f.scale) { const sc = { max: Math.min(10, Math.max(3, +f.scale.max || 5)) }; if (f.scale.lo?.trim()) sc.lo = f.scale.lo.trim(); if (f.scale.hi?.trim()) sc.hi = f.scale.hi.trim(); f.scale = sc; if (sc.max === 5 && !sc.lo && !sc.hi) delete f.scale; } } else { delete f.c; delete f.scale; }
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
      if (!adminToken() && !askTeamKey('Publishing the questionnaire to every phone needs it')) return;
      try { const r = await publishSchema(d); toast('Published — every device adopts this questionnaire on its next start' + (r.projectUrl && !/^ERROR/.test(r.projectUrl) ? ' · project file saved to Drive' : ''), 'ok'); }
      catch (e) { toast('Publish failed: ' + e.message, 'err'); }
    } else {
      const r = await backupProject(d); if (r && r.projectUrl && !/^ERROR/.test(r.projectUrl)) toast('Project file backed up to the Drive folder', 'ok');
    }
  }
  async function exportJson() {
    const d = normalise(clone(draft)); downloadProject(d);
    const r = await backupProject(d); if (r && r.projectUrl && !/^ERROR/.test(r.projectUrl)) toast('A copy also went to the Drive folder', 'ok');
  }
  async function importJson(file) { try { const { schema } = await parseProjectFile(file); draft = { ...draft, ...schema, remarks: schema.remarks || clone(DEFAULT_SCHEMA.remarks) }; active = null; persist(); render(); toast('Questionnaire loaded into the draft — review and approve'); } catch (e) { toast('Import failed: ' + e.message, 'err'); } }

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
    setStatus(st, pages.length ? `${pages.length} page image(s) ready — click "Convert" to transcribe them as printed.` : '', 'ok');
    renderPages();
  }
  function renderPages() {
    $('#designerPages').innerHTML = pages.map((p, i) => `<div class="thumb dpage" title="${esc(p.label)}"><img src="${p.dataUrl}" alt=""><button class="x" data-i="${i}">✕</button><span class="sz">${i + 1}</span></div>`).join('');
    $$('#designerPages .x').forEach(b => b.onclick = () => { pages.splice(+b.dataset.i, 1); renderPages(); });
    $('#designerAiBtn').disabled = !pages.length;
    $('#designerIntake').hidden = !pages.length;
  }

  /* ---------- AI: verbatim conversion of an uploaded questionnaire, or improvement of the draft ---------- */
  const SCHEMA_RULES = `Output JSON only: { "title", "sections": [ { "title", "photoHint", "fields": [ { "key", "label", "help", "type", "options", "required", "construct", "scale_max", "scale_low", "scale_high" } ] } ] }.
- type ∈ text | number | date | tel | select | multi | likert | textarea. select = single choice, multi = tick-all-that-apply, likert = a numbered rating scale (give scale_max 3–10 and the printed end labels scale_low / scale_high), textarea = open answer, number/date/tel when the answer is clearly a number/date/phone.
- key: short snake_case identifier, unique. Reuse a key from the EXISTING questionnaire whenever the question means the same thing (keeps historical data comparable).
- construct: for rating-scale statements that belong to one theme, a 2-letter code shared by the theme's statements (null otherwise).
- help: an instruction printed under the question (null if none). photoHint: one sentence on what an enumerator should photograph for the section (empty string for rating-scale sections).
- Do not include location / GPS / date / enumerator fields — they are captured automatically.`;
  const CONVERT_PROMPT = () => `You are converting a paper questionnaire into a digital form. The images are the pages of the questionnaire. TRANSCRIBE IT FAITHFULLY: keep every question, its exact wording, its numbering order, every answer option with its exact text, section headings, instructions and scale end labels exactly as printed. Do NOT add, merge, drop, reorder or reword anything; do not invent options. Only choose the closest field type for each question. If a page is unreadable, transcribe what is legible and keep going.
${SCHEMA_RULES}
EXISTING questionnaire keys you may reuse when a question matches exactly (JSON):
${JSON.stringify({ sections: draft.sections.map(s => ({ title: s.title, fields: s.fields.map(f => ({ key: f.k, label: f.label })) })) })}`;
  const IMPROVE_PROMPT = instr => `You are a survey-methodology expert improving a household socio-economic questionnaire. Return an improved version of the CURRENT questionnaire below: clear, neutral, unambiguous wording; complete and mutually exclusive answer options; sensible field types; logical section order; consistent rating scales; add commonly needed questions only where a gap is obvious; keep everything that already works. Keep existing keys for questions you keep (even if reworded).${instr ? `\n\nSPECIFIC INSTRUCTIONS FROM THE USER (follow these first): ${instr}` : ''}
${SCHEMA_RULES}
CURRENT questionnaire (JSON):
${JSON.stringify({ title: draft.title, sections: draft.sections.map(s => ({ title: s.title, photoHint: s.photoHint, fields: s.fields.map(f => ({ key: f.k, label: f.label, help: f.help, type: f.type, options: f.options, required: f.required, construct: f.c, scale_max: f.scale?.max, scale_low: f.scale?.lo, scale_high: f.scale?.hi })) })) })}`;
  const AI_SCHEMA = { type: 'OBJECT', properties: { title: { type: 'STRING', nullable: true }, sections: { type: 'ARRAY', items: { type: 'OBJECT', properties: { title: { type: 'STRING' }, photoHint: { type: 'STRING', nullable: true }, fields: { type: 'ARRAY', items: { type: 'OBJECT', properties: { key: { type: 'STRING' }, label: { type: 'STRING' }, help: { type: 'STRING', nullable: true }, type: { type: 'STRING', enum: FIELD_TYPES }, options: { type: 'ARRAY', items: { type: 'STRING' }, nullable: true }, required: { type: 'BOOLEAN', nullable: true }, construct: { type: 'STRING', nullable: true }, scale_max: { type: 'INTEGER', nullable: true }, scale_low: { type: 'STRING', nullable: true }, scale_high: { type: 'STRING', nullable: true } }, required: ['key', 'label', 'type'] } } }, required: ['title', 'fields'] } } }, required: ['sections'] };
  async function askAI(prompt, images, temperature) {
    if (activeEngine() === 'gemini') {
      const body = { contents: [{ role: 'user', parts: [{ text: prompt }, ...images.map(p => ({ inline_data: { mime_type: 'image/jpeg', data: p.dataUrl.split(',')[1] } }))] }], generationConfig: { responseMimeType: 'application/json', responseSchema: AI_SCHEMA, temperature, maxOutputTokens: 16000 } };
      let r = await geminiCall(settings.model, body);
      if (r.error) r = await geminiCall(settings.model, { ...body, generationConfig: { responseMimeType: 'application/json', temperature, maxOutputTokens: 16000 } });
      if (r.error) r = await geminiCall(GEMINI_FALLBACK, body);
      if (r.error) throw new Error(r.error.message);
      return extractJson(r.candidates?.[0]?.content?.parts?.map(x => x.text).join('') || '');
    }
    if (activeEngine() === 'gemma') {
      const contents = [{ role: 'user', parts: [{ text: prompt }, ...images.map(p => ({ inline_data: { mime_type: 'image/jpeg', data: p.dataUrl.split(',')[1] } }))] }];
      let r = await gemmaCall(settings.gemmaModel, { contents, generationConfig: { responseMimeType: 'application/json', responseSchema: AI_SCHEMA, temperature, maxOutputTokens: 16000 } });
      if (r.error && !GEMMA_FATAL.test(r.error.message)) r = await gemmaCall(settings.gemmaModel, { contents, generationConfig: { responseMimeType: 'application/json', temperature, maxOutputTokens: 16000 } });
      if (r.error && !GEMMA_FATAL.test(r.error.message)) r = await gemmaCall(settings.gemmaModel, { contents, generationConfig: { temperature, maxOutputTokens: 16000 } });
      if (r.error) throw new Error(r.error.message);
      return extractJson(r.candidates?.[0]?.content?.parts?.map(x => x.text).join('') || '');
    }
    if (activeEngine() === 'openrouter') {
      const content = [{ type: 'text', text: prompt }, ...images.map(p => ({ type: 'image_url', image_url: { url: p.dataUrl } }))];
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.orKey}`, 'HTTP-Referer': location.origin, 'X-Title': 'GeoSurvey' }, body: JSON.stringify({ model: settings.orModel, messages: [{ role: 'user', content }], temperature, max_tokens: 12000, response_format: { type: 'json_object' } }) });
      const j = await r.json(); if (j.error) throw new Error(j.error.message);
      const c = j.choices?.[0]?.message?.content; return extractJson(typeof c === 'string' ? c : (c || []).map(t => t.text || '').join(''));
    }
    throw new Error('Questionnaire conversion needs Gemini, OpenRouter or Gemma 4 via the backend');
  }
  function adoptAI(out, mode) {
    if (!Array.isArray(out.sections) || !out.sections.length) throw new Error('AI returned no sections');
    const taken = new Set(LOCATION_FIELDS.map(f => f.k));
    const sections = out.sections.map((s, i) => ({ id: slug(s.title || `section_${i + 1}`), title: s.title || `Section ${i + 1}`, photoHint: s.photoHint || undefined, fields: (s.fields || []).map(f => {
      const t = FIELD_TYPES.includes(f.type) ? f.type : 'text'; const q = { k: uniqueKey(slug(f.key || f.label), taken), label: f.label || '', type: t, required: !!f.required };
      if (f.help) q.help = f.help; if (t === 'select' || t === 'multi') q.options = (f.options || []).map(String).filter(Boolean);
      if (t === 'likert') { q.c = String(f.construct || '').toUpperCase().slice(0, 4) || 'C1'; const sc = {}; if (f.scale_max && +f.scale_max !== 5) sc.max = +f.scale_max; if (f.scale_low) sc.lo = f.scale_low; if (f.scale_high) sc.hi = f.scale_high; if (Object.keys(sc).length) q.scale = sc; } else q.ai = true;
      return q; }) }));
    draft = { ...draft, title: out.title || draft.title, sections }; active = null; persist(); render();
    const nq = sections.reduce((n, s) => n + s.fields.length, 0);
    setStatus($('#designerStatus'), mode === 'convert' ? `Converted ${pages.length} page(s) into ${sections.length} sections / ${nq} questions, as printed. Check it against the original, then Apply.` : `Improved draft: ${sections.length} sections / ${nq} questions. Review, then Apply.`, 'ok');
    toast(mode === 'convert' ? 'Questionnaire converted — please verify against the original' : 'Improved questionnaire ready for review', 'ok');
    $('#designerBody').scrollIntoView({ behavior: 'smooth' });
  }
  async function aiConvert() {
    if (!pages.length) return toast('Upload the questionnaire pages first');
    if (!engineReady()) { openSettings(); return toast(NO_ENGINE_MSG, 'err'); }
    const st = $('#designerStatus'); $('#designerAiBtn').disabled = true;
    setStatus(st, `Transcribing ${pages.length} page(s) exactly as printed…`, '', true);
    try { adoptAI(await askAI(CONVERT_PROMPT(), pages, 0), 'convert'); }
    catch (e) { setStatus(st, 'AI error: ' + e.message, 'err'); toast('AI error: ' + e.message, 'err'); }
    finally { $('#designerAiBtn').disabled = !pages.length; }
  }
  async function aiImprove() {
    if (!draft.sections.length) return toast('Nothing to improve yet — design, load or convert a questionnaire first');
    if (!engineReady()) { openSettings(); return toast(NO_ENGINE_MSG, 'err'); }
    const instr = prompt('Optional instructions for the AI (e.g. "add questions on migration and debt", "shorten the wording", "make all scales 1–7"). Leave empty for a general improvement.', '');
    if (instr === null) return;
    const st = $('#designerStatus'); $('#designerImproveBtn').disabled = true;
    setStatus(st, 'Improving the questionnaire with AI…', '', true);
    try { adoptAI(await askAI(IMPROVE_PROMPT(instr.trim()), [], 0.3), 'improve'); }
    catch (e) { setStatus(st, 'AI error: ' + e.message, 'err'); toast('AI error: ' + e.message, 'err'); }
    finally { $('#designerImproveBtn').disabled = false; }
  }

  function open() { if (!draft) load(); }
  function init() {
    const body = $('#designerBody'); if (!body) return;
    body.addEventListener('input', onInput); body.addEventListener('change', onInput); body.addEventListener('click', onClick);
    body.addEventListener('dragstart', onDragStart); body.addEventListener('dragover', onDragOver); body.addEventListener('drop', onDrop); body.addEventListener('dragend', cleanupDrag);
    body.addEventListener('keydown', e => { if (e.key === 'Escape') { active = null; render(); } });
    $('#designerModel').addEventListener('input', onInput);
    $('#designerFile').onchange = e => { intake([...e.target.files]); e.target.value = ''; };
    $('#designerAiBtn').onclick = aiConvert;
    $('#designerImproveBtn').onclick = aiImprove;
    $('#designerAddQ').onclick = addQuestion;
    $('#designerAddSec').onclick = addSection;
    $('#designerApply').onclick = () => approve(false);
    $('#designerPublish').onclick = () => approve(true);
    $('#designerReset').onclick = () => startBlank(true);
    $('#designerSample').onclick = loadSample;
    $('#designerExport').onclick = exportJson;
    $('#designerImport').onchange = e => { if (e.target.files[0]) importJson(e.target.files[0]); e.target.value = ''; };
    $('#designerDiscard').onclick = discard;
  }
  document.addEventListener('DOMContentLoaded', init);
  return { open, load, approve, startBlank, loadSample, aiConvert, aiImprove };
})();
