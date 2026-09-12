/* GeoSurvey — AI-assisted socio-economic survey
 * Static app: Gemini (auto-fill from photos), Geolocation + OSM Nominatim (address/postal),
 * Google Apps Script (Sheets DB) with offline queue. No build step, no frameworks.
 */
'use strict';

const APP_VERSION = '1.0.0';

/* ------------------------------------------------------------------ */
/* Questionnaire schema — edit here to change the survey.               */
/* ai:true  → field is exposed to Gemini for auto-fill                  */
/* ------------------------------------------------------------------ */
const LOCATION_FIELDS = [
  { k: 'surveyor', label: 'Enumerator name', type: 'text', required: true },
  { k: 'survey_date', label: 'Survey date', type: 'date' },
  { k: 'latitude', label: 'Latitude', type: 'text', ro: true },
  { k: 'longitude', label: 'Longitude', type: 'text', ro: true },
  { k: 'gps_accuracy_m', label: 'GPS accuracy (m)', type: 'text', ro: true },
  { k: 'altitude_m', label: 'Altitude (m)', type: 'text', ro: true },
  { k: 'village', label: 'Village / Locality', type: 'text' },
  { k: 'postcode', label: 'PIN / Postal code', type: 'text' },
  { k: 'block', label: 'Block / Tehsil / Sub-district', type: 'text' },
  { k: 'district', label: 'District', type: 'text' },
  { k: 'state', label: 'State / Province', type: 'text' },
  { k: 'country', label: 'Country', type: 'text' },
  { k: 'full_address', label: 'Full address (from map)', type: 'textarea', wide: true },
];

const SECTIONS = [
  {
    id: 'household', title: '👤 Household head & family',
    fields: [
      { k: 'head_name', label: 'Name of household head', type: 'text', required: true, ai: true },
      { k: 'head_age', label: 'Age', type: 'number', min: 0, max: 120, ai: true },
      { k: 'head_gender', label: 'Gender', type: 'select', options: ['Male', 'Female', 'Other'], ai: true },
      { k: 'marital_status', label: 'Marital status', type: 'select', options: ['Married', 'Unmarried', 'Widowed', 'Divorced/Separated'], ai: true },
      { k: 'education', label: 'Education of head', type: 'select', options: ['Illiterate', 'Primary', 'Middle', 'Secondary', 'Higher secondary', 'Graduate', 'Post-graduate & above'], ai: true },
      { k: 'occupation', label: 'Primary occupation', type: 'select', options: ['Cultivator', 'Agricultural labour', 'Non-agricultural labour', 'Salaried (private)', 'Salaried (government)', 'Self-employed / business', 'Artisan', 'Fishing', 'Livestock rearing', 'Unemployed', 'Retired / pensioner', 'Student', 'Homemaker', 'Other'], ai: true },
      { k: 'social_category', label: 'Social category', type: 'select', options: ['General', 'OBC', 'SC', 'ST', 'Other', 'Prefer not to say'], ai: true },
      { k: 'religion', label: 'Religion', type: 'select', options: ['Hindu', 'Muslim', 'Christian', 'Sikh', 'Buddhist', 'Jain', 'Other', 'Prefer not to say'], ai: true },
      { k: 'household_size', label: 'Household size (members)', type: 'number', min: 1, max: 50, ai: true },
      { k: 'children_under_14', label: 'Children under 14', type: 'number', min: 0, max: 30, ai: true },
      { k: 'earning_members', label: 'Earning members', type: 'number', min: 0, max: 30, ai: true },
      { k: 'phone', label: 'Contact number (optional)', type: 'tel', ai: true },
    ],
  },
  {
    id: 'economic', title: '💰 Income, land & finance',
    fields: [
      { k: 'monthly_income', label: 'Monthly household income', type: 'select', options: ['< 5,000', '5,000 – 10,000', '10,000 – 20,000', '20,000 – 35,000', '35,000 – 50,000', '50,000 – 1,00,000', '> 1,00,000'], ai: true },
      { k: 'income_sources', label: 'Income sources', type: 'multi', options: ['Agriculture', 'Wage labour', 'Salary', 'Business', 'Livestock', 'Remittance', 'Pension', 'Rent', 'Other'], ai: true },
      { k: 'land_ownership', label: 'Agricultural land owned', type: 'select', options: ['Landless', '< 1 acre', '1 – 2.5 acres', '2.5 – 5 acres', '5 – 10 acres', '> 10 acres'], ai: true },
      { k: 'irrigation', label: 'Irrigation source', type: 'select', options: ['None / rain-fed', 'Canal', 'Well / tube-well', 'Pond / tank', 'River / lift', 'Other'], ai: true },
      { k: 'livestock', label: 'Livestock owned', type: 'multi', options: ['Cattle', 'Buffalo', 'Goat / sheep', 'Poultry', 'Pig', 'Fish', 'None'], ai: true },
      { k: 'bank_account', label: 'Bank account', type: 'select', options: ['Yes', 'No'], ai: true },
      { k: 'ration_card', label: 'Ration card type', type: 'select', options: ['None', 'APL', 'BPL', 'Antyodaya (AAY)', 'Other'], ai: true },
      { k: 'govt_schemes', label: 'Government schemes availed', type: 'multi', options: ['PM Awas', 'MGNREGA', 'PM Kisan', 'Ujjwala (LPG)', 'Jan Dhan', 'Ayushman Bharat', 'Old-age / widow pension', 'Scholarship', 'None'], ai: true },
      { k: 'has_loan', label: 'Outstanding loan / debt', type: 'select', options: ['No', 'Yes – bank', 'Yes – SHG / MFI', 'Yes – moneylender', 'Yes – relatives / friends'], ai: true },
      { k: 'monthly_expense', label: 'Approx. monthly expenditure', type: 'number', min: 0, ai: true },
    ],
  },
  {
    id: 'housing', title: '🏠 Housing & amenities',
    fields: [
      { k: 'house_type', label: 'House type', type: 'select', options: ['Kutcha', 'Semi-pucca', 'Pucca'], ai: true },
      { k: 'house_ownership', label: 'Ownership', type: 'select', options: ['Owned', 'Rented', 'Provided (employer / govt)', 'Other'], ai: true },
      { k: 'rooms', label: 'Number of rooms', type: 'number', min: 0, max: 50, ai: true },
      { k: 'floors', label: 'Number of storeys', type: 'number', min: 1, max: 20, ai: true },
      { k: 'roof_material', label: 'Roof material', type: 'select', options: ['Thatch / grass', 'Tiles', 'Asbestos / tin sheet', 'RCC / concrete', 'Plastic / tarpaulin', 'Other'], ai: true },
      { k: 'wall_material', label: 'Wall material', type: 'select', options: ['Mud / unburnt brick', 'Bamboo / wood', 'Burnt brick', 'Concrete', 'Stone', 'Tin sheet', 'Other'], ai: true },
      { k: 'floor_material', label: 'Floor material', type: 'select', options: ['Mud', 'Cement', 'Tiles / marble', 'Wood', 'Other'], ai: true },
      { k: 'electricity', label: 'Electricity connection', type: 'select', options: ['Grid', 'Solar', 'Both', 'None'], ai: true },
      { k: 'water_source', label: 'Drinking water source', type: 'select', options: ['Piped (tap in house)', 'Public tap', 'Hand pump / tube-well', 'Open well', 'Pond / river', 'Tanker', 'Bottled', 'Other'], ai: true },
      { k: 'toilet', label: 'Toilet facility', type: 'select', options: ['Flush – septic / sewer', 'Pit latrine', 'Shared / community', 'Open defecation'], ai: true },
      { k: 'cooking_fuel', label: 'Cooking fuel', type: 'select', options: ['LPG / PNG', 'Firewood', 'Cow-dung cake', 'Kerosene', 'Electric', 'Biogas', 'Other'], ai: true },
      { k: 'waste_disposal', label: 'Waste disposal', type: 'select', options: ['Municipal collection', 'Burning', 'Open dumping', 'Composting', 'Other'], ai: true },
      { k: 'road_access', label: 'Approach road', type: 'select', options: ['Paved / pucca', 'Gravel / kutcha', 'No road'], ai: true },
    ],
  },
  {
    id: 'assets', title: '📺 Assets owned',
    fields: [
      { k: 'assets', label: 'Tick all that apply', type: 'multi', wide: true, options: ['Television', 'Refrigerator', 'Washing machine', 'Fan', 'Air cooler / AC', 'Basic mobile phone', 'Smartphone', 'Computer / laptop', 'Internet connection', 'Bicycle', 'Motorcycle / scooter', 'Car / jeep', 'Tractor', 'Pump set', 'Solar panel', 'Sewing machine', 'None'], ai: true },
    ],
  },
  {
    id: 'health', title: '🩺 Health & education access',
    fields: [
      { k: 'nearest_health', label: 'Nearest health facility', type: 'select', options: ['< 1 km', '1 – 3 km', '3 – 5 km', '5 – 10 km', '> 10 km'], ai: true },
      { k: 'nearest_school', label: 'Nearest primary school', type: 'select', options: ['< 1 km', '1 – 3 km', '3 – 5 km', '> 5 km'], ai: true },
      { k: 'children_in_school', label: 'All school-age children enrolled?', type: 'select', options: ['Yes', 'No', 'Not applicable'], ai: true },
      { k: 'health_insurance', label: 'Health insurance', type: 'select', options: ['Yes', 'No'], ai: true },
      { k: 'chronic_illness', label: 'Any member with chronic illness / disability', type: 'select', options: ['Yes', 'No'], ai: true },
    ],
  },
];

const REMARKS_FIELDS = [
  { k: 'ai_observations', label: 'AI observations (from photos)', type: 'textarea', wide: true, ai: true },
  { k: 'remarks', label: 'Enumerator remarks', type: 'textarea', wide: true },
];

const ALL_FIELDS = [...LOCATION_FIELDS, ...SECTIONS.flatMap(s => s.fields), ...REMARKS_FIELDS];
const AI_FIELDS = ALL_FIELDS.filter(f => f.ai);

/* ------------------------------------------------------------------ */
/* Storage helpers                                                      */
/* ------------------------------------------------------------------ */
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { toast('Storage full — export & clear synced records', 'err'); } },
};
const DEFAULT_SETTINGS = { geminiKey: '', model: 'gemini-2.5-flash', endpoint: '', surveyor: '', maxDim: 1024, thumb: true };
let settings = Object.assign({}, DEFAULT_SETTINGS, LS.get('gs_settings', {}));

/* ------------------------------------------------------------------ */
/* DOM helpers                                                          */
/* ------------------------------------------------------------------ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg, type = '') {
  const t = document.createElement('div');
  t.className = `toast ${type}`; t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), type === 'err' ? 6000 : 3500);
}
function setStatus(el, msg, type = '', spin = false) {
  el.className = `status ${type}`;
  el.innerHTML = (spin ? '<span class="spinner"></span>' : '') + esc(msg);
}

/* ------------------------------------------------------------------ */
/* Form rendering                                                       */
/* ------------------------------------------------------------------ */
function fieldHTML(f) {
  const id = `f_${f.k}`;
  const req = f.required ? ' <span class="req">*</span>' : '';
  let ctrl = '';
  switch (f.type) {
    case 'select':
      ctrl = `<select id="${id}" data-key="${f.k}"><option value="">— select —</option>${f.options.map(o => `<option>${esc(o)}</option>`).join('')}</select>`;
      break;
    case 'multi':
      ctrl = `<div class="checks" data-key="${f.k}">${f.options.map(o => `<label><input type="checkbox" value="${esc(o)}"> ${esc(o)}</label>`).join('')}</div>`;
      break;
    case 'textarea':
      ctrl = `<textarea id="${id}" data-key="${f.k}"></textarea>`;
      break;
    default:
      ctrl = `<input id="${id}" data-key="${f.k}" type="${f.type}" ${f.ro ? 'readonly' : ''} ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''} ${f.type === 'number' ? 'inputmode="numeric"' : ''}>`;
  }
  return `<div class="field ${f.wide ? 'wide' : ''}" data-field="${f.k}"><label for="${id}">${esc(f.label)}${req}</label>${ctrl}<span class="ai-tag">AI</span></div>`;
}

function renderForm() {
  $('#locFields').innerHTML = LOCATION_FIELDS.map(fieldHTML).join('');
  $('#sections').innerHTML = SECTIONS.map(s => `
    <div class="card" data-section="${s.id}">
      <button type="button" class="section-toggle card-head">
        <h2>${s.title}</h2><span class="section-count" data-count="${s.id}"></span><span class="chev">▼</span>
      </button>
      <div class="grid">${s.fields.map(fieldHTML).join('')}</div>
    </div>`).join('');
  $('#remarksFields').innerHTML = REMARKS_FIELDS.map(fieldHTML).join('');

  $$('.section-toggle').forEach(b => b.addEventListener('click', () => b.closest('.card').classList.toggle('collapsed')));

  // Any manual edit removes the AI highlight and autosaves a draft
  $('#formView').addEventListener('input', e => {
    const fld = e.target.closest('.field');
    if (fld) { fld.classList.remove('ai', 'invalid'); }
    scheduleDraftSave(); updateProgress();
  });
}

function getValue(k) {
  const el = $(`[data-key="${k}"]`);
  if (!el) return '';
  if (el.classList.contains('checks')) return $$('input:checked', el).map(i => i.value);
  return el.value.trim();
}
function setValue(k, v, fromAI = false) {
  const el = $(`[data-key="${k}"]`);
  if (!el || v == null || v === '') return false;
  const fld = el.closest('.field');
  if (el.classList.contains('checks')) {
    const vals = Array.isArray(v) ? v : String(v).split(/[;,]/).map(s => s.trim());
    let hit = false;
    $$('input', el).forEach(i => { i.checked = vals.includes(i.value); hit = hit || i.checked; });
    if (!hit) return false;
  } else if (el.tagName === 'SELECT') {
    // Tolerant match for AI output (case/whitespace insensitive)
    const norm = s => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
    const opt = [...el.options].find(o => norm(o.value) === norm(v));
    if (!opt) return false;
    el.value = opt.value;
  } else {
    el.value = v;
  }
  fld.classList.toggle('ai', fromAI);
  return true;
}
function collect() {
  const rec = {};
  ALL_FIELDS.forEach(f => { const v = getValue(f.k); rec[f.k] = Array.isArray(v) ? v.join('; ') : v; });
  return rec;
}
function clearForm(keepEnumerator = true) {
  const surveyor = getValue('surveyor');
  ALL_FIELDS.forEach(f => {
    const el = $(`[data-key="${f.k}"]`);
    if (el.classList.contains('checks')) $$('input', el).forEach(i => i.checked = false);
    else el.value = '';
    el.closest('.field').classList.remove('ai', 'invalid');
  });
  if (keepEnumerator) setValue('surveyor', surveyor || settings.surveyor);
  setValue('survey_date', new Date().toISOString().slice(0, 10));
  photos = []; renderThumbs();
  $('#aiContext').value = '';
  setStatus($('#aiStatus'), ''); setStatus($('#locStatus'), '');
  LS.set('gs_draft', null);
  updateProgress();
}

function updateProgress() {
  const fields = ALL_FIELDS.filter(f => !f.ro && f.k !== 'ai_observations' && f.k !== 'remarks' && f.k !== 'full_address');
  const done = fields.filter(f => { const v = getValue(f.k); return Array.isArray(v) ? v.length : v !== ''; }).length;
  const pct = Math.round(done / fields.length * 100);
  $('#progressFill').style.width = pct + '%';
  $('#progressText').textContent = `${pct}% · ${done}/${fields.length}`;
  SECTIONS.forEach(s => {
    const d = s.fields.filter(f => { const v = getValue(f.k); return Array.isArray(v) ? v.length : v !== ''; }).length;
    $(`[data-count="${s.id}"]`).textContent = `${d}/${s.fields.length}`;
  });
}

let draftTimer;
function scheduleDraftSave() { clearTimeout(draftTimer); draftTimer = setTimeout(() => LS.set('gs_draft', collect()), 400); }
function restoreDraft() {
  const d = LS.get('gs_draft', null);
  if (!d) return;
  Object.entries(d).forEach(([k, v]) => setValue(k, v));
}

/* ------------------------------------------------------------------ */
/* Location: Geolocation API + OSM Nominatim reverse geocoding          */
/* ------------------------------------------------------------------ */
async function detectLocation() {
  const st = $('#locStatus');
  if (!navigator.geolocation) return setStatus(st, 'Geolocation not supported by this browser.', 'err');
  setStatus(st, 'Getting GPS fix…', '', true);
  $('#locateBtn').disabled = true;
  try {
    const pos = await new Promise((res, rej) =>
      navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }));
    const { latitude, longitude, accuracy, altitude } = pos.coords;
    setValue('latitude', latitude.toFixed(6));
    setValue('longitude', longitude.toFixed(6));
    setValue('gps_accuracy_m', Math.round(accuracy));
    if (altitude != null) setValue('altitude_m', Math.round(altitude));
    setStatus(st, `GPS ±${Math.round(accuracy)} m. Looking up address…`, '', true);

    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1&accept-language=en`;
    const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!r.ok) throw new Error('Reverse geocoding failed (' + r.status + ')');
    const j = await r.json();
    const a = j.address || {};
    setValue('village', a.village || a.hamlet || a.town || a.suburb || a.neighbourhood || a.city || a.locality || '');
    setValue('postcode', a.postcode || '');
    setValue('block', a.municipality || a.county || a.city_district || a.subdistrict || '');
    setValue('district', a.state_district || a.district || a.county || '');
    setValue('state', a.state || a.region || '');
    setValue('country', a.country || '');
    setValue('full_address', j.display_name || '');
    st.className = 'status ok';
    st.innerHTML = `📍 ${esc(a.village || a.town || a.city || '')} ${esc(a.postcode || '')} · ±${Math.round(accuracy)} m · <a href="https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}" target="_blank" rel="noopener">open map</a>`;
    toast('Location & address detected', 'ok');
  } catch (e) {
    const msg = e.code === 1 ? 'Location permission denied. Allow location access and retry.' : (e.message || 'Location error');
    setStatus(st, msg, 'err');
  } finally {
    $('#locateBtn').disabled = false;
    scheduleDraftSave(); updateProgress();
  }
}

/* ------------------------------------------------------------------ */
/* Images: capture/upload → compress → preview                          */
/* ------------------------------------------------------------------ */
let photos = []; // [{dataUrl, bytes}]

async function loadBitmap(file) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img); img.onerror = rej;
      img.src = URL.createObjectURL(file);
    });
  }
}
async function compressImage(file, maxDim, quality = 0.78) {
  const bmp = await loadBitmap(file);
  const w = bmp.width, h = bmp.height;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const cw = Math.round(w * scale), ch = Math.round(h * scale);
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  canvas.getContext('2d', { alpha: false }).drawImage(bmp, 0, 0, cw, ch);
  if (bmp.close) bmp.close();
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  return { dataUrl, bytes: Math.round((dataUrl.length - 23) * 3 / 4), w: cw, h: ch };
}
async function makeThumb(dataUrl, maxDim = 320) {
  const blob = await (await fetch(dataUrl)).blob();
  return (await compressImage(blob, maxDim, 0.6)).dataUrl;
}
function fmtBytes(b) { return b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB'; }

async function addFiles(files) {
  const st = $('#aiStatus');
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    if (photos.length >= 4) { toast('Maximum 4 photos per submission'); break; }
    setStatus(st, `Compressing ${file.name || 'photo'} (${fmtBytes(file.size)})…`, '', true);
    const t0 = performance.now();
    const c = await compressImage(file, settings.maxDim);
    photos.push(c);
    setStatus(st, `Compressed ${fmtBytes(file.size)} → ${fmtBytes(c.bytes)} (${c.w}×${c.h}) in ${Math.round(performance.now() - t0)} ms`, 'ok');
  }
  renderThumbs();
}
function renderThumbs() {
  $('#thumbStrip').innerHTML = photos.map((p, i) =>
    `<div class="thumb"><img src="${p.dataUrl}" alt="photo ${i + 1}"><button class="x" data-i="${i}" title="Remove">✕</button><span class="sz">${fmtBytes(p.bytes)}</span></div>`).join('');
  $$('#thumbStrip .x').forEach(b => b.onclick = () => { photos.splice(+b.dataset.i, 1); renderThumbs(); });
  $('#analyzeBtn').disabled = photos.length === 0;
}

/* ------------------------------------------------------------------ */
/* Gemini: structured JSON auto-fill                                    */
/* ------------------------------------------------------------------ */
function buildResponseSchema() {
  const props = {};
  AI_FIELDS.forEach(f => {
    if (f.type === 'select') props[f.k] = { type: 'STRING', enum: f.options, nullable: true };
    else if (f.type === 'multi') props[f.k] = { type: 'ARRAY', items: { type: 'STRING', enum: f.options }, nullable: true };
    else if (f.type === 'number') props[f.k] = { type: 'INTEGER', nullable: true };
    else props[f.k] = { type: 'STRING', nullable: true };
  });
  return { type: 'OBJECT', properties: props };
}

const SYSTEM_PROMPT = `You are an assistant for a field enumerator conducting a household socio-economic survey. You will receive one or more photos. They may show: the outside or inside of a dwelling, household members, assets, livestock, farmland, the surroundings, a filled-in paper questionnaire, an ID/ration card, or other documents.

Task: fill as many questionnaire fields as you can with reasonable confidence, using ONLY the allowed values for categorical fields. Rules:
- If a paper form, ID or document is visible, transcribe its values exactly (names, ages, numbers, phone).
- Infer housing/amenity/asset fields from what is visibly present (roof, walls, floor, electricity wires/meters/bulbs, water taps/hand pumps, toilets, LPG cylinder, TV, fridge, vehicles, solar panels...).
- For multi-select fields return every option you can see. For "assets", include "None" only if the photo clearly shows a home with none of the listed items.
- Do NOT guess personal fields (name, age, religion, caste, income, phone) unless a document/form shows them. Leave unknown fields null.
- ai_observations: 2-4 short sentences summarising the socio-economic condition evident in the photo(s) and which fields you inferred vs. read.
Respond with JSON only.`;

async function analyzePhotos() {
  if (!settings.geminiKey) { openSettings(); return toast('Add your Gemini API key in Settings first', 'err'); }
  if (!photos.length) return;
  const st = $('#aiStatus');
  const btn = $('#analyzeBtn');
  btn.disabled = true;
  setStatus(st, `Analyzing ${photos.length} photo(s) with ${settings.model}…`, '', true);
  const t0 = performance.now();
  const ctx = $('#aiContext').value.trim();
  const parts = [{ text: SYSTEM_PROMPT + (ctx ? `\n\nEnumerator context: ${ctx}` : '') }];
  photos.forEach(p => parts.push({ inline_data: { mime_type: 'image/jpeg', data: p.dataUrl.split(',')[1] } }));
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: buildResponseSchema(),
      temperature: 0.1,
      thinkingConfig: { thinkingBudget: 0 }, // speed: skip reasoning tokens on 2.5 flash
    },
  };
  try {
    let data = await geminiRequest(body);
    if (data.error && /thinking/i.test(data.error.message || '')) {
      delete body.generationConfig.thinkingConfig; // model doesn't accept thinkingConfig
      data = await geminiRequest(body);
    }
    if (data.error) throw new Error(data.error.message || 'Gemini error');
    const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
    let out;
    try { out = JSON.parse(text); }
    catch { out = JSON.parse(text.replace(/^```json\s*|```$/g, '').trim()); }
    let n = 0;
    Object.entries(out).forEach(([k, v]) => {
      if (v == null || v === '' || (Array.isArray(v) && !v.length)) return;
      if (setValue(k, v, true)) n++;
    });
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    setStatus(st, `AI filled ${n} fields in ${secs}s — highlighted in yellow; please review and edit.`, 'ok');
    toast(`✨ ${n} fields filled in ${secs}s`, 'ok');
    $$('.card.collapsed').forEach(c => c.classList.remove('collapsed'));
  } catch (e) {
    setStatus(st, 'AI error: ' + e.message, 'err');
  } finally {
    btn.disabled = false; scheduleDraftSave(); updateProgress();
  }
}
async function geminiRequest(body) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:generateContent`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': settings.geminiKey },
    body: JSON.stringify(body),
  });
  return r.json();
}

/* ------------------------------------------------------------------ */
/* Submissions: local queue + Apps Script (Google Sheets) sync          */
/* ------------------------------------------------------------------ */
function getRecords() { return LS.get('gs_records', []); }
function saveRecords(r) { LS.set('gs_records', r); updatePendingBadge(); }
function updatePendingBadge() {
  const n = getRecords().filter(r => r.status !== 'synced').length;
  const b = $('#pendingBadge'); b.textContent = n; b.hidden = n === 0;
}

function validate() {
  let ok = true;
  ALL_FIELDS.filter(f => f.required).forEach(f => {
    const fld = $(`[data-field="${f.k}"]`);
    const bad = !getValue(f.k);
    fld.classList.toggle('invalid', bad);
    if (bad && ok) { fld.scrollIntoView({ behavior: 'smooth', block: 'center' }); ok = false; }
  });
  return ok;
}

async function submitForm() {
  if (!validate()) return toast('Please fill the required fields (*)', 'err');
  const btn = $('#submitBtn'); btn.disabled = true;
  const rec = {
    id: (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2)),
    submitted_at: new Date().toISOString(),
    ...collect(),
    photo_count: photos.length,
    photo_thumb: '',
    app_version: APP_VERSION,
    user_agent: navigator.userAgent.slice(0, 120),
  };
  if (settings.thumb && photos.length) { try { rec.photo_thumb = await makeThumb(photos[0].dataUrl); } catch {} }
  const records = getRecords();
  records.unshift({ ...rec, status: 'pending' });
  saveRecords(records);
  clearForm();
  toast('Saved on device. Syncing…');
  btn.disabled = false;
  await syncPending();
}

async function sendRecord(rec) {
  const { status, error, ...payload } = rec;
  // text/plain avoids a CORS preflight; Apps Script follows with a redirect that fetch handles.
  const r = await fetch(settings.endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

let syncing = false;
async function syncPending() {
  if (syncing) return;
  const records = getRecords();
  const pending = records.filter(r => r.status !== 'synced');
  if (!pending.length) { renderLocalTable(); return; }
  if (!settings.endpoint) { renderLocalTable(); return toast(`${pending.length} record(s) kept on device — set a database endpoint in Settings to sync.`); }
  if (!navigator.onLine) { renderLocalTable(); return toast('Offline — will sync when connection returns.'); }
  syncing = true; $('#syncBtn').disabled = true;
  let ok = 0, fail = 0;
  for (const rec of pending) {
    try { await sendRecord(rec); rec.status = 'synced'; delete rec.error; ok++; }
    catch (e) { rec.status = 'failed'; rec.error = e.message; fail++; }
    saveRecords(records);
  }
  syncing = false; $('#syncBtn').disabled = false;
  renderLocalTable();
  if (ok) toast(`☁️ ${ok} record(s) synced to database`, 'ok');
  if (fail) toast(`${fail} record(s) failed to sync — check endpoint / connection`, 'err');
}

const TABLE_COLS = ['submitted_at', 'head_name', 'village', 'district', 'postcode', 'house_type', 'monthly_income', 'household_size', 'latitude', 'longitude', 'surveyor'];
function renderLocalTable() {
  const records = getRecords();
  const synced = records.filter(r => r.status === 'synced').length;
  $('#localSummary').textContent = records.length ? `${records.length} record(s) on this device · ${synced} synced · ${records.length - synced} pending/failed` : 'No submissions on this device yet.';
  $('#localTable').innerHTML = records.length ? `<thead><tr><th>Status</th><th>Photo</th>${TABLE_COLS.map(c => `<th>${c}</th>`).join('')}<th></th></tr></thead><tbody>` +
    records.map(r => `<tr><td><span class="pill ${r.status}" title="${esc(r.error || '')}">${r.status}</span></td><td>${r.photo_thumb ? `<img class="mini" src="${r.photo_thumb}">` : ''}</td>${TABLE_COLS.map(c => `<td title="${esc(r[c])}">${esc(c === 'submitted_at' ? new Date(r[c]).toLocaleString() : r[c])}</td>`).join('')}<td><button class="link-btn" data-del="${r.id}">delete</button></td></tr>`).join('') + '</tbody>' : '';
  $$('#localTable [data-del]').forEach(b => b.onclick = () => {
    if (!confirm('Delete this record from the device?')) return;
    saveRecords(getRecords().filter(r => r.id !== b.dataset.del)); renderLocalTable();
  });
  updatePendingBadge();
}

async function loadCloud() {
  const st = $('#cloudStatus');
  if (!settings.endpoint) return setStatus(st, 'No database endpoint configured (Settings).', 'err');
  setStatus(st, 'Loading from Google Sheet…', '', true);
  try {
    const r = await fetch(settings.endpoint + (settings.endpoint.includes('?') ? '&' : '?') + 'limit=200');
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'Bad response');
    const rows = j.rows || [];
    setStatus(st, `${j.total ?? rows.length} row(s) in sheet · showing latest ${rows.length}`, 'ok');
    const cols = TABLE_COLS.filter(c => rows.some(x => c in x));
    $('#cloudTable').innerHTML = rows.length ? `<thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>` +
      rows.map(x => `<tr>${cols.map(c => `<td title="${esc(x[c])}">${esc(x[c])}</td>`).join('')}</tr>`).join('') + '</tbody>' : '';
  } catch (e) { setStatus(st, 'Could not load: ' + e.message, 'err'); }
}

/* ------------------------------------------------------------------ */
/* Export                                                               */
/* ------------------------------------------------------------------ */
function download(name, content, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function exportCSV() {
  const recs = getRecords();
  if (!recs.length) return toast('Nothing to export');
  const cols = ['id', 'submitted_at', 'status', ...ALL_FIELDS.map(f => f.k), 'photo_count', 'app_version'];
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [cols.join(','), ...recs.map(r => cols.map(c => q(r[c])).join(','))].join('\r\n');
  download(`geosurvey_${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + csv, 'text/csv');
}
function exportJSON() {
  const recs = getRecords();
  if (!recs.length) return toast('Nothing to export');
  download(`geosurvey_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(recs, null, 2), 'application/json');
}

/* ------------------------------------------------------------------ */
/* Settings                                                             */
/* ------------------------------------------------------------------ */
function openSettings() {
  $('#setKey').value = settings.geminiKey; $('#setModel').value = settings.model;
  $('#setEndpoint').value = settings.endpoint; $('#setSurveyor').value = settings.surveyor;
  $('#setMaxDim').value = settings.maxDim; $('#setThumb').checked = settings.thumb;
  $('#settingsDlg').showModal();
}
function saveSettings() {
  settings = {
    geminiKey: $('#setKey').value.trim(), model: $('#setModel').value,
    endpoint: $('#setEndpoint').value.trim(), surveyor: $('#setSurveyor').value.trim(),
    maxDim: +$('#setMaxDim').value, thumb: $('#setThumb').checked,
  };
  LS.set('gs_settings', settings);
  if (!getValue('surveyor') && settings.surveyor) setValue('surveyor', settings.surveyor);
  toast('Settings saved', 'ok');
}

/* ------------------------------------------------------------------ */
/* Init                                                                 */
/* ------------------------------------------------------------------ */
function showView(id) {
  $$('.view').forEach(v => v.hidden = v.id !== id);
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === id));
  $('#actionBar').hidden = id !== 'formView';
  if (id === 'responsesView') renderLocalTable();
}

function init() {
  renderForm();
  setValue('survey_date', new Date().toISOString().slice(0, 10));
  if (settings.surveyor) setValue('surveyor', settings.surveyor);
  restoreDraft();
  updateProgress(); updatePendingBadge();

  $$('.tab').forEach(t => t.onclick = () => showView(t.dataset.view));
  $('#settingsBtn').onclick = openSettings;
  $('#settingsDlg').addEventListener('close', () => { if ($('#settingsDlg').returnValue === 'save') saveSettings(); });
  $('#locateBtn').onclick = detectLocation;
  $('#captureInput').onchange = e => { addFiles(e.target.files); e.target.value = ''; };
  $('#uploadInput').onchange = e => { addFiles(e.target.files); e.target.value = ''; };
  $('#analyzeBtn').onclick = analyzePhotos;
  $('#submitBtn').onclick = submitForm;
  $('#resetBtn').onclick = () => { if (confirm('Clear the form?')) clearForm(); };
  $('#syncBtn').onclick = syncPending;
  $('#exportCsvBtn').onclick = exportCSV;
  $('#exportJsonBtn').onclick = exportJSON;
  $('#loadCloudBtn').onclick = loadCloud;
  $('#clearLocalBtn').onclick = () => {
    const n = getRecords().filter(r => r.status === 'synced').length;
    if (!n) return toast('No synced records to clear');
    if (confirm(`Remove ${n} synced record(s) from this device? (They remain in the Google Sheet.)`)) { saveRecords(getRecords().filter(r => r.status !== 'synced')); renderLocalTable(); }
  };

  // Paste an image straight into the page
  document.addEventListener('paste', e => {
    const files = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
    if (files.length) addFiles(files);
  });

  const offline = () => { $('#offlineBar').hidden = navigator.onLine; };
  window.addEventListener('online', () => { offline(); syncPending(); });
  window.addEventListener('offline', offline);
  offline();

  if (!settings.geminiKey) setTimeout(() => toast('Tip: add your Gemini API key in ⚙️ Settings to enable photo auto-fill'), 800);

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
document.addEventListener('DOMContentLoaded', init);
