/* GeoSurvey — AI-assisted socio-economic survey
 * Static app: Gemini / OpenRouter / Chrome built-in AI (auto-fill from photos, whole form or per section),
 * Geolocation + OSM Nominatim, geo/time-stamped photos, Google Apps Script (Sheets + Drive) backend
 * with offline queue, admin panel, CSV/JSON/SPSS/KMZ export.
 */
'use strict';

const APP_VERSION = '1.5.4';
const MAX_PHOTOS = 12;

/* ------------------------------------------------------------------ */
/* Questionnaire schema — edit here to change the survey.               */
/* ai:true → exposed to the AI for auto-fill; photoHint → per-section   */
/* guidance shown to the enumerator and sent to the model               */
/* ------------------------------------------------------------------ */
const LOCATION_FIELDS = [
  { k: 'surveyor', label: 'Enumerator name', type: 'text', required: true },
  { k: 'survey_date', label: 'Survey date', type: 'date', ro: true },
  { k: 'latitude', label: 'Latitude', type: 'text', ro: true },
  { k: 'longitude', label: 'Longitude', type: 'text', ro: true },
  { k: 'gps_accuracy_m', label: 'GPS accuracy (m)', type: 'text', ro: true },
  { k: 'altitude_m', label: 'Altitude (m)', type: 'text', ro: true },
  { k: 'village', label: 'Village / Locality', type: 'text', ro: true },
  { k: 'postcode', label: 'PIN / Postal code', type: 'text', ro: true },
  { k: 'block', label: 'Block / Tehsil / Sub-district', type: 'text', ro: true },
  { k: 'district', label: 'District', type: 'text', ro: true },
  { k: 'state', label: 'State / Province', type: 'text', ro: true },
  { k: 'country', label: 'Country', type: 'text', ro: true },
  { k: 'full_address', label: 'Full address (from map)', type: 'textarea', wide: true, ro: true },
];

const SECTIONS = [
  {
    id: 'household', title: 'Household head & family',
    photoHint: 'Photograph an ID card, ration card, or the filled paper form to read names, ages, family size and contact number.',
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
    id: 'economic', title: 'Income, land & livelihood',
    photoHint: 'Photograph farmland, crops, livestock, shop or workplace, land documents or bank/ration card.',
    fields: [
      { k: 'monthly_income', label: 'Monthly household income', type: 'select', options: ['< 5,000', '5,000 – 10,000', '10,000 – 20,000', '20,000 – 35,000', '35,000 – 50,000', '50,000 – 1,00,000', '> 1,00,000'], ai: true },
      { k: 'income_sources', label: 'Income sources', type: 'multi', options: ['Agriculture', 'Wage labour', 'Salary', 'Business', 'Livestock', 'Remittance', 'Pension', 'Rent', 'Other'], ai: true },
      { k: 'land_ownership', label: 'Agricultural land owned', type: 'select', options: ['Landless', '< 1 acre', '1 – 2.5 acres', '2.5 – 5 acres', '5 – 10 acres', '> 10 acres'], ai: true },
      { k: 'land_use', label: 'Land use / crop seen', type: 'select', options: ['Paddy', 'Wheat', 'Vegetables', 'Orchard / plantation', 'Fallow', 'Mixed', 'Not applicable'], ai: true },
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
    id: 'housing', title: 'House condition & materials',
    photoHint: 'Photograph the front of the house, roof, walls and the approach road.',
    fields: [
      { k: 'house_type', label: 'House type', type: 'select', options: ['Kutcha', 'Semi-pucca', 'Pucca'], ai: true },
      { k: 'house_condition', label: 'House condition', type: 'select', options: ['Good', 'Livable', 'Dilapidated'], ai: true },
      { k: 'house_ownership', label: 'Ownership', type: 'select', options: ['Owned', 'Rented', 'Provided (employer / govt)', 'Other'], ai: true },
      { k: 'rooms', label: 'Number of rooms', type: 'number', min: 0, max: 50, ai: true },
      { k: 'floors', label: 'Number of storeys', type: 'number', min: 1, max: 20, ai: true },
      { k: 'roof_material', label: 'Roof material', type: 'select', options: ['Thatch / grass', 'Tiles', 'Asbestos / tin sheet', 'RCC / concrete', 'Plastic / tarpaulin', 'Other'], ai: true },
      { k: 'wall_material', label: 'Wall material', type: 'select', options: ['Mud / unburnt brick', 'Bamboo / wood', 'Burnt brick', 'Concrete', 'Stone', 'Tin sheet', 'Other'], ai: true },
      { k: 'floor_material', label: 'Floor material', type: 'select', options: ['Mud', 'Cement', 'Tiles / marble', 'Wood', 'Other'], ai: true },
      { k: 'road_access', label: 'Approach road', type: 'select', options: ['Paved / pucca', 'Gravel / kutcha', 'No road'], ai: true },
      { k: 'surroundings', label: 'Surroundings', type: 'select', options: ['Clean', 'Some waste / water-logging', 'Unhygienic'], ai: true },
    ],
  },
  {
    id: 'amenities', title: 'Water, sanitation & energy',
    photoHint: 'Photograph the drinking-water source (tap, hand pump, well), toilet, kitchen / cooking stove, electricity meter or solar panel.',
    fields: [
      { k: 'electricity', label: 'Electricity connection', type: 'select', options: ['Grid', 'Solar', 'Both', 'None'], ai: true },
      { k: 'water_source', label: 'Drinking water source', type: 'select', options: ['Piped (tap in house)', 'Public tap', 'Hand pump / tube-well', 'Open well', 'Pond / river', 'Tanker', 'Bottled', 'Other'], ai: true },
      { k: 'water_distance', label: 'Distance to water source', type: 'select', options: ['Within premises', '< 100 m', '100 – 500 m', '> 500 m'], ai: true },
      { k: 'water_treatment', label: 'Water treatment before drinking', type: 'select', options: ['None', 'Boiling', 'Filter / purifier', 'Chlorination', 'Other'], ai: true },
      { k: 'toilet', label: 'Toilet facility', type: 'select', options: ['Flush – septic / sewer', 'Pit latrine', 'Shared / community', 'Open defecation'], ai: true },
      { k: 'cooking_fuel', label: 'Cooking fuel', type: 'select', options: ['LPG / PNG', 'Firewood', 'Cow-dung cake', 'Kerosene', 'Electric', 'Biogas', 'Other'], ai: true },
      { k: 'waste_disposal', label: 'Waste disposal', type: 'select', options: ['Municipal collection', 'Burning', 'Open dumping', 'Composting', 'Other'], ai: true },
      { k: 'drainage', label: 'Drainage', type: 'select', options: ['Covered drain', 'Open drain', 'No drainage'], ai: true },
    ],
  },
  {
    id: 'assets', title: 'Assets & possessions',
    photoHint: 'Photograph the living room, vehicles, appliances and equipment.',
    fields: [
      { k: 'assets', label: 'Tick all that apply', type: 'multi', wide: true, options: ['Television', 'Refrigerator', 'Washing machine', 'Fan', 'Air cooler / AC', 'Basic mobile phone', 'Smartphone', 'Computer / laptop', 'Internet connection', 'Bicycle', 'Motorcycle / scooter', 'Car / jeep', 'Tractor', 'Pump set', 'Solar panel', 'Sewing machine', 'None'], ai: true },
    ],
  },
  {
    id: 'health', title: 'Health & education access',
    photoHint: 'Photograph health cards, insurance documents or school ID / report cards.',
    fields: [
      { k: 'nearest_health', label: 'Nearest health facility', type: 'select', options: ['< 1 km', '1 – 3 km', '3 – 5 km', '5 – 10 km', '> 10 km'], ai: true },
      { k: 'nearest_school', label: 'Nearest primary school', type: 'select', options: ['< 1 km', '1 – 3 km', '3 – 5 km', '> 5 km'], ai: true },
      { k: 'children_in_school', label: 'All school-age children enrolled?', type: 'select', options: ['Yes', 'No', 'Not applicable'], ai: true },
      { k: 'health_insurance', label: 'Health insurance', type: 'select', options: ['Yes', 'No'], ai: true },
      { k: 'chronic_illness', label: 'Any member with chronic illness / disability', type: 'select', options: ['Yes', 'No'], ai: true },
    ],
  },
];

/* Latent constructs measured by 5-point Likert items (used by reliability, EFA/CFA, SEM in the Analysis tab). */
const CONSTRUCTS = {
  ES: { name: 'Economic Security', items: ['es1', 'es2', 'es3', 'es4'] },
  AS: { name: 'Access to Services', items: ['as1', 'as2', 'as3', 'as4'] },
  GS: { name: 'Government Support', items: ['gs1', 'gs2', 'gs3'] },
  SC: { name: 'Social Capital', items: ['sc1', 'sc2', 'sc3'] },
  WB: { name: 'Well-being', items: ['wb1', 'wb2', 'wb3', 'wb4'] },
};
/* Hypothesised structural model (from → to). ES mediates AS/GS → WB; SC moderates ES → WB;
 * higher-order "Livelihood Capacity" (LC) = ES + AS + SC → WB. */
const STRUCTURAL_MODEL = {
  paths: [['AS', 'ES'], ['GS', 'ES'], ['ES', 'WB'], ['AS', 'WB'], ['SC', 'WB'], ['GS', 'WB']],
  mediations: [['AS', 'ES', 'WB'], ['GS', 'ES', 'WB']],
  moderation: { predictor: 'ES', moderator: 'SC', outcome: 'WB' },
  higherOrder: { key: 'LC', name: 'Livelihood Capacity', lower: ['ES', 'AS', 'SC'], outcome: 'WB', covariates: ['GS'] },
};
const LIKERT = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'];
SECTIONS.push({
  id: 'perception', title: 'Perceptions (1 = strongly disagree … 5 = strongly agree)',
  fields: [
    { k: 'es1', label: 'Our household income is enough to meet basic needs', type: 'likert', c: 'ES' },
    { k: 'es2', label: 'We are able to save some money every month', type: 'likert', c: 'ES' },
    { k: 'es3', label: 'We can cope with an unexpected expense (illness, repair)', type: 'likert', c: 'ES' },
    { k: 'es4', label: 'Our income is stable throughout the year', type: 'likert', c: 'ES' },
    { k: 'as1', label: 'A health facility is easily reachable when needed', type: 'likert', c: 'AS' },
    { k: 'as2', label: 'Children can attend a good school nearby', type: 'likert', c: 'AS' },
    { k: 'as3', label: 'Safe drinking water is available throughout the year', type: 'likert', c: 'AS' },
    { k: 'as4', label: 'Roads and transport connect us well to the market / town', type: 'likert', c: 'AS' },
    { k: 'gs1', label: 'Government schemes have improved our living conditions', type: 'likert', c: 'GS' },
    { k: 'gs2', label: 'It is easy to access the government benefits we are entitled to', type: 'likert', c: 'GS' },
    { k: 'gs3', label: 'Local officials respond to our community’s needs', type: 'likert', c: 'GS' },
    { k: 'sc1', label: 'People in this community can be trusted', type: 'likert', c: 'SC' },
    { k: 'sc2', label: 'We take part in community groups / SHGs / meetings', type: 'likert', c: 'SC' },
    { k: 'sc3', label: 'Neighbours would help us in a crisis', type: 'likert', c: 'SC' },
    { k: 'wb1', label: 'Overall, I am satisfied with my life', type: 'likert', c: 'WB' },
    { k: 'wb2', label: 'Our housing conditions are adequate for the family', type: 'likert', c: 'WB' },
    { k: 'wb3', label: 'I feel optimistic about my family’s future', type: 'likert', c: 'WB' },
    { k: 'wb4', label: 'Our household feels safe and secure', type: 'likert', c: 'WB' },
  ],
});

const REMARKS_FIELDS = [
  { k: 'ai_observations', label: 'AI observations (from photos)', type: 'textarea', wide: true, ai: true },
  { k: 'remarks', label: 'Enumerator remarks', type: 'textarea', wide: true },
];

const ALL_FIELDS = [...LOCATION_FIELDS, ...SECTIONS.flatMap(s => s.fields), ...REMARKS_FIELDS];
const AI_FIELDS = ALL_FIELDS.filter(f => f.ai);
const SECTION_BY_ID = Object.fromEntries(SECTIONS.map(s => [s.id, s]));
// Columns that exist on a record but are not questionnaire fields (used by exports)
const META_FIELDS = [
  { k: 'id', label: 'Record ID', type: 'text' }, { k: 'submitted_at', label: 'Submitted at', type: 'text' },
  { k: 'photo_count', label: 'Photo count', type: 'number' }, { k: 'photo_urls', label: 'Photo URLs', type: 'text' },
  { k: 'ai_engine', label: 'AI engine used', type: 'text' }, { k: 'app_version', label: 'App version', type: 'text' },
];

/* ------------------------------------------------------------------ */
/* Storage: settings + records in localStorage, photos in IndexedDB     */
/* ------------------------------------------------------------------ */
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { toast('Browser storage is full — export and remove synced records', 'err'); } },
};
const DEFAULT_SETTINGS = { engine: 'auto', geminiKey: '', model: 'gemini-3.5-flash-lite', orKey: '', orModel: 'google/gemini-2.5-flash-lite', endpoint: '', surveyor: '', maxDim: 1024, stamp: true, uploadPhotos: true };
let settings = Object.assign({}, DEFAULT_SETTINGS, LS.get('gs_settings', {}));

const PhotoDB = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      const r = indexedDB.open('geosurvey', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('photos', { keyPath: 'id' });
      r.onsuccess = () => res(this.db = r.result);
      r.onerror = () => rej(r.error);
    });
  },
  async tx(mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const t = db.transaction('photos', mode); const rq = fn(t.objectStore('photos'));
      t.oncomplete = () => res(rq && rq.result); t.onerror = () => rej(t.error);
    });
  },
  put(id, photos) { return this.tx('readwrite', st => st.put({ id, photos })); },
  async get(id) { const r = await this.tx('readonly', st => st.get(id)); return r ? r.photos : []; },
  del(id) { return this.tx('readwrite', st => st.delete(id)); },
};

/* ------------------------------------------------------------------ */
/* DOM helpers                                                          */
/* ------------------------------------------------------------------ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = iso => { const d = new Date(iso); return isNaN(d) ? String(iso ?? '') : d.toLocaleString(); };
function toast(msg, type = '') {
  const t = document.createElement('div');
  t.className = `toast ${type}`; t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), type === 'err' ? 6000 : 3500);
}
function setStatus(el, msg, type = '', spin = false) {
  if (!el) return;
  el.className = `status ${type}`;
  el.innerHTML = (spin ? '<span class="spinner"></span>' : '') + esc(msg);
}
function download(name, content, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
const UPLOAD_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>';
const AI_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 17l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/><path d="M4 3l.5 1.5L6 5l-1.5.5L4 7l-.5-1.5L2 5l1.5-.5z"/></svg>';
const CAMERA_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';

/* ------------------------------------------------------------------ */
/* Form rendering                                                       */
/* ------------------------------------------------------------------ */
function fieldHTML(f) {
  const id = `f_${f.k}`;
  const req = f.required ? ' <span class="req">*</span>' : '';
  let ctrl;
  switch (f.type) {
    case 'select':
      ctrl = `<select id="${id}" data-key="${f.k}"><option value="">Select…</option>${f.options.map(o => `<option>${esc(o)}</option>`).join('')}</select>`; break;
    case 'multi':
      ctrl = `<div class="checks" data-key="${f.k}">${f.options.map(o => `<label><input type="checkbox" value="${esc(o)}">${esc(o)}</label>`).join('')}</div>`; break;
    case 'likert':
      ctrl = `<div class="likert" data-key="${f.k}" role="radiogroup">${LIKERT.map((l, i) => `<label title="${esc(l)}"><input type="radio" name="${id}" value="${i + 1}"><span>${i + 1}</span></label>`).join('')}</div>`; break;
    case 'textarea':
      ctrl = `<textarea id="${id}" data-key="${f.k}" ${f.ro ? 'readonly' : ''}></textarea>`; break;
    default:
      ctrl = `<input id="${id}" data-key="${f.k}" type="${f.type}" ${f.ro ? 'readonly' : ''} ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''} ${f.type === 'number' ? 'inputmode="numeric"' : ''}>`;
  }
  return `<div class="field ${f.wide || f.type === 'likert' ? 'wide' : ''} ${f.type === 'likert' ? 'likert-field' : ''}" data-field="${f.k}"><label for="${id}">${esc(f.label)}${req}</label>${ctrl}<span class="ai-tag">AI</span></div>`;
}

function renderForm() {
  $('#locFields').innerHTML = LOCATION_FIELDS.map(fieldHTML).join('');
  $('#sections').innerHTML = SECTIONS.map((s, i) => `
    <div class="card" data-section="${s.id}">
      <div class="section-head">
        <button type="button" class="section-toggle">
          <span class="step">${String(i + 2).padStart(2, '0')}</span><h2>${esc(s.title)}</h2><span class="section-count" data-count="${s.id}"></span><span class="chev">▼</span>
        </button>
        ${s.photoHint ? `<div class="sec-tools">
          <div class="sec-thumbs" data-thumbs="${s.id}"></div>
          <label class="tool" title="Capture a photo for this section with the camera">${CAMERA_SVG}<input type="file" accept="image/*" capture="environment" data-sec="${s.id}" hidden></label>
          <button type="button" class="tool tool-ai" data-ai="${s.id}" title="Analyze this section's photos with AI and fill the fields">${AI_SVG}<span class="tool-badge" hidden>0</span></button>
        </div>` : ''}
      </div>
      ${s.photoHint ? `<p class="sub sec-hint">${esc(s.photoHint)}</p>` : `<p class="sub sec-hint">Ask the respondent to rate each statement from 1 (strongly disagree) to 5 (strongly agree).</p>`}
      <div class="status sec-status" data-status="${s.id}"></div>
      ${s.fields.every(f => f.type === 'likert')
        ? `<div class="likert-grid"><div class="likert-head"><span>Statement</span><div class="scale"><span>Strongly disagree</span><span>2</span><span>3</span><span>4</span><span>Strongly agree</span></div></div>${s.fields.map(fieldHTML).join('')}</div>`
        : `<div class="grid">${s.fields.map(fieldHTML).join('')}</div>`}
    </div>`).join('');
  $('#remarksStep').textContent = String(SECTIONS.length + 2).padStart(2, '0');
  $('#remarksFields').innerHTML = REMARKS_FIELDS.map(fieldHTML).join('');
  $$('.section-toggle').forEach(b => b.addEventListener('click', () => b.closest('.card').classList.toggle('collapsed')));
  $$('input[data-sec]').forEach(inp => inp.addEventListener('change', async e => {
    const sec = e.target.dataset.sec; const files = [...e.target.files]; e.target.value = '';
    if (!files.length) return;
    await addFiles(files, sec);
  }));
  $$('button[data-ai]').forEach(b => b.addEventListener('click', () => analyzePhotos(b.dataset.ai)));
  $('#formView').addEventListener('input', e => {
    const fld = e.target.closest('.field');
    if (fld) fld.classList.remove('ai', 'invalid');
    scheduleDraftSave(); updateProgress();
  });
}

function getValue(k) {
  const el = $(`[data-key="${k}"]`);
  if (!el) return '';
  if (el.classList.contains('checks')) return $$('input:checked', el).map(i => i.value);
  if (el.classList.contains('likert')) return $('input:checked', el)?.value || '';
  return el.value.trim();
}
function setValue(k, v, fromAI = false) {
  const el = $(`[data-key="${k}"]`);
  if (!el || v == null || v === '') return false;
  const fld = el.closest('.field');
  if (el.classList.contains('checks')) {
    const vals = (Array.isArray(v) ? v : String(v).split(/[;,]/)).map(s => String(s).trim().toLowerCase());
    let hit = false;
    $$('input', el).forEach(i => { const on = vals.includes(i.value.toLowerCase()); i.checked = fromAI ? (i.checked || on) : on; hit = hit || on; });
    if (!hit) return false;
  } else if (el.classList.contains('likert')) {
    const r = $(`input[value="${String(v).trim()}"]`, el); if (!r) return false; r.checked = true;
  } else if (el.tagName === 'SELECT') {
    const norm = s => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
    const opt = [...el.options].find(o => o.value && norm(o.value) === norm(v));
    if (!opt) return false;
    el.value = opt.value;
  } else if (fromAI && k === 'ai_observations' && el.value) {
    el.value = el.value + '\n' + v; // accumulate observations across section analyses
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
function clearForm() {
  const surveyor = getValue('surveyor');
  ALL_FIELDS.forEach(f => {
    const el = $(`[data-key="${f.k}"]`);
    if (el.classList.contains('checks') || el.classList.contains('likert')) $$('input', el).forEach(i => i.checked = false); else el.value = '';
    el.closest('.field').classList.remove('ai', 'invalid');
  });
  setValue('surveyor', surveyor || settings.surveyor);
  setValue('survey_date', new Date().toISOString().slice(0, 10));
  photos = []; renderThumbs();
  if ($('#aiContext')) $('#aiContext').value = '';
  setStatus($('#aiStatus'), ''); setStatus($('#locStatus'), '');
  $$('.sec-status').forEach(s => setStatus(s, ''));
  LS.set('gs_draft', null);
  updateProgress();
}
function updateProgress() {
  const fields = ALL_FIELDS.filter(f => !f.ro && !['ai_observations', 'remarks', 'full_address'].includes(f.k));
  const filled = f => { const v = getValue(f.k); return Array.isArray(v) ? v.length > 0 : v !== ''; };
  const done = fields.filter(filled).length;
  const pct = Math.round(done / fields.length * 100);
  $('#progressFill').style.width = pct + '%';
  $('#progressText').textContent = `${pct}% · ${done}/${fields.length}`;
  SECTIONS.forEach(s => { $(`[data-count="${s.id}"]`).textContent = `${s.fields.filter(filled).length}/${s.fields.length}`; });
}
let draftTimer;
function scheduleDraftSave() { clearTimeout(draftTimer); draftTimer = setTimeout(() => LS.set('gs_draft', collect()), 400); }
function restoreDraft() { const d = LS.get('gs_draft', null); if (d) Object.entries(d).forEach(([k, v]) => setValue(k, v)); }

/* ------------------------------------------------------------------ */
/* Location: Geolocation API + OSM Nominatim reverse geocoding          */
/* ------------------------------------------------------------------ */
let lastFix = null; // { lat, lon, acc, alt, time, place }

function getPosition(opts) {
  return new Promise((res, rej) => navigator.geolocation ? navigator.geolocation.getCurrentPosition(res, rej, opts) : rej(new Error('Geolocation not supported')));
}
async function reverseGeocode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1&accept-language=en`;
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('Reverse geocoding failed (' + r.status + ')');
  const j = await r.json(); const a = j.address || {};
  return {
    village: a.village || a.hamlet || a.town || a.suburb || a.neighbourhood || a.city || a.locality || '',
    postcode: a.postcode || '',
    block: a.municipality || a.county || a.city_district || a.subdistrict || '',
    district: a.state_district || a.district || a.county || '',
    state: a.state || a.region || '', country: a.country || '', full_address: j.display_name || '',
  };
}
function placeLabel(p) { return p ? [p.village, p.district, p.state, p.postcode].filter(Boolean).join(', ') : ''; }

async function detectLocation(silent = false) {
  const st = $('#locStatus');
  if (!silent) { setStatus(st, 'Getting GPS fix…', '', true); $('#locateBtn').disabled = true; }
  try {
    const pos = await getPosition({ enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
    const { latitude, longitude, accuracy, altitude } = pos.coords;
    lastFix = { lat: latitude, lon: longitude, acc: accuracy, alt: altitude, time: Date.now(), place: null };
    setValue('latitude', latitude.toFixed(6)); setValue('longitude', longitude.toFixed(6));
    setValue('gps_accuracy_m', Math.round(accuracy));
    if (altitude != null) setValue('altitude_m', Math.round(altitude));
    if (!silent) setStatus(st, `GPS ±${Math.round(accuracy)} m · looking up address…`, '', true);
    const place = await reverseGeocode(latitude, longitude);
    lastFix.place = place;
    Object.entries(place).forEach(([k, v]) => setValue(k, v));
    st.className = 'status ok';
    st.innerHTML = `${esc(placeLabel(place))} · ±${Math.round(accuracy)} m · <a href="https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}" target="_blank" rel="noopener">open map</a>`;
    if (!silent) toast('Location and address detected', 'ok');
    return lastFix;
  } catch (e) {
    const msg = e.code === 1 ? 'Location permission denied — allow location access and retry.' : (e.message || 'Location error');
    if (!silent) setStatus(st, msg, 'err');
    return lastFix;
  } finally {
    $('#locateBtn').disabled = false; scheduleDraftSave(); updateProgress();
  }
}

/* ------------------------------------------------------------------ */
/* Photos: capture/upload → compress → geo/time stamp → preview         */
/* ------------------------------------------------------------------ */
let photos = []; // [{ dataUrl, bytes, w, h, name, section, taken_at, lat, lon, acc, place, stamped }]

async function loadBitmap(file) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch {
    return new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = URL.createObjectURL(file); });
  }
}
async function compressImage(file, maxDim, quality = 0.8) {
  const bmp = await loadBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const cw = Math.round(bmp.width * scale), ch = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas'); canvas.width = cw; canvas.height = ch;
  canvas.getContext('2d', { alpha: false }).drawImage(bmp, 0, 0, cw, ch);
  if (bmp.close) bmp.close();
  return { canvas, w: cw, h: ch, quality };
}
function stampCanvas(canvas, meta) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const fs = Math.max(11, Math.round(W / 46)), pad = Math.round(fs * 0.6);
  const lines = [
    new Date(meta.taken_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    meta.lat != null ? `${meta.lat.toFixed(6)}, ${meta.lon.toFixed(6)}  ±${Math.round(meta.acc)} m` : 'GPS unavailable',
    placeLabel(meta.place),
    `GeoSurvey${meta.surveyor ? ' · ' + meta.surveyor : ''}${meta.section ? ' · ' + meta.section : ''}`,
  ].filter(Boolean);
  ctx.font = `600 ${fs}px ${getComputedStyle(document.body).fontFamily}`;
  const lh = Math.round(fs * 1.35), bh = lines.length * lh + pad * 2;
  const bw = Math.min(W, Math.max(...lines.map(l => ctx.measureText(l).width)) + pad * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, H - bh, bw, bh);
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'top';
  lines.forEach((l, i) => ctx.fillText(l, pad, H - bh + pad + i * lh, W - pad * 2));
  return canvas;
}
function canvasToDataUrl(canvas, q) { const dataUrl = canvas.toDataURL('image/jpeg', q); return { dataUrl, bytes: Math.round((dataUrl.length - 23) * 3 / 4) }; }
async function makeThumb(dataUrl, maxDim = 320) { const c = await compressImage(await (await fetch(dataUrl)).blob(), maxDim, 0.6); return canvasToDataUrl(c.canvas, 0.6).dataUrl; }
function fmtBytes(b) { return b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB'; }

async function currentFix() {
  if (lastFix && Date.now() - lastFix.time < 120000) return lastFix; // reuse a fresh fix
  try {
    const pos = await getPosition({ enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
    lastFix = { lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy, alt: pos.coords.altitude, time: Date.now(), place: lastFix?.place || null };
    if (!getValue('latitude')) { setValue('latitude', lastFix.lat.toFixed(6)); setValue('longitude', lastFix.lon.toFixed(6)); setValue('gps_accuracy_m', Math.round(lastFix.acc)); }
    if (!lastFix.place && navigator.onLine) {
      try { lastFix.place = await reverseGeocode(lastFix.lat, lastFix.lon); Object.entries(lastFix.place).forEach(([k, v]) => { if (!getValue(k)) setValue(k, v); }); } catch {}
    }
    return lastFix;
  } catch { return lastFix; }
}

async function addFiles(files, section = '') {
  const st = section ? $(`[data-status="${section}"]`) : $('#aiStatus');
  const list = [...files].filter(f => f.type.startsWith('image/'));
  const added = [];
  if (!list.length) return added;
  if (settings.stamp) setStatus(st, 'Getting location for the photo stamp…', '', true);
  const fix = settings.stamp ? await currentFix() : null;
  for (const file of list) {
    if (photos.length >= MAX_PHOTOS) { toast(`Maximum ${MAX_PHOTOS} photos per submission`); break; }
    setStatus(st, `Compressing ${file.name || 'photo'} (${fmtBytes(file.size)})…`, '', true);
    const t0 = performance.now();
    const recent = file.lastModified && Date.now() - file.lastModified < 3600e3;
    const meta = { taken_at: new Date(recent ? file.lastModified : Date.now()).toISOString(), lat: fix?.lat ?? null, lon: fix?.lon ?? null, acc: fix?.acc ?? null, place: fix?.place || null, surveyor: getValue('surveyor'), section: section ? SECTION_BY_ID[section].title : '' };
    const c = await compressImage(file, settings.maxDim);
    if (settings.stamp) stampCanvas(c.canvas, meta);
    const { dataUrl, bytes } = canvasToDataUrl(c.canvas, c.quality);
    const p = { dataUrl, bytes, w: c.w, h: c.h, name: `photo_${photos.length + 1}${section ? '_' + section : ''}.jpg`, section, taken_at: meta.taken_at, lat: meta.lat, lon: meta.lon, acc: meta.acc, place: meta.place, stamped: !!settings.stamp };
    photos.push(p); added.push(p);
    setStatus(st, `Compressed ${fmtBytes(file.size)} → ${fmtBytes(bytes)} (${c.w}×${c.h}) in ${Math.round(performance.now() - t0)} ms${settings.stamp && fix?.lat != null ? ' · geo-stamped' : ''}`, 'ok');
  }
  renderThumbs();
  return added;
}
function renderThumbs() {
  $('#thumbStrip').innerHTML = photos.map((p, i) =>
    `<div class="thumb ${p.stamped && p.lat != null ? 'stamped' : ''}" data-i="${i}" title="${esc(p.section ? SECTION_BY_ID[p.section].title : 'General')}"><img src="${p.dataUrl}" alt="photo ${i + 1}"><button class="x" data-i="${i}" title="Remove">✕</button><span class="sz">${p.section ? esc(SECTION_BY_ID[p.section].title.split(' ')[0]) : fmtBytes(p.bytes)}</span></div>`).join('');
  $$('#thumbStrip .x').forEach(b => b.onclick = e => { e.stopPropagation(); photos.splice(+b.dataset.i, 1); renderThumbs(); });
  $$('#thumbStrip .thumb').forEach(t => t.onclick = () => openGallery('Photos for this submission', photos));
  $('#analyzeBtn').disabled = photos.length === 0;
  $$('button[data-ai]').forEach(b => { const n = photos.filter(p => p.section === b.dataset.ai).length; const bd = $('.tool-badge', b); bd.textContent = n; bd.hidden = !n; b.classList.toggle('ready', n > 0); });
  // small thumbnails beside each section's tools, each with its own delete
  $$('[data-thumbs]').forEach(strip => {
    const sec = strip.dataset.thumbs;
    strip.innerHTML = photos.map((p, i) => p.section === sec ? `<div class="sthumb" data-i="${i}" title="${esc(p.name)} · click to view"><img src="${p.dataUrl}" alt=""><button type="button" class="x" data-i="${i}" title="Remove photo">✕</button></div>` : '').join('');
    $$('.sthumb', strip).forEach(t => t.onclick = () => openGallery(SECTION_BY_ID[sec].title, photos.filter(p => p.section === sec)));
    $$('.sthumb .x', strip).forEach(x => x.onclick = e => { e.stopPropagation(); photos.splice(+x.dataset.i, 1); renderThumbs(); });
  });
  $('#photoCount').textContent = photos.length ? `${photos.length}/${MAX_PHOTOS} photos` : '';
}
function openGallery(title, list) {
  $('#photoDlgTitle').textContent = title;
  $('#photoDlgGallery').innerHTML = list.map((p, i) => `<figure><img src="${p.dataUrl}" alt="photo ${i + 1}"><figcaption>${esc(p.name || '')} · ${fmtDate(p.taken_at)}${p.lat != null ? ` · ${(+p.lat).toFixed(5)}, ${(+p.lon).toFixed(5)}` : ''}</figcaption></figure>`).join('');
  $('#photoDlg').showModal();
}

/* ------------------------------------------------------------------ */
/* AI providers: Gemini (native), OpenRouter (OpenAI-style),            */
/* Chrome built-in Prompt API (Gemini Nano, no key — when available)    */
/* ------------------------------------------------------------------ */
let chromeAI = null; // null = unknown, false = unavailable, 'available' | 'downloadable'
async function detectChromeAI() {
  try {
    if (!('LanguageModel' in self)) return chromeAI = false;
    const a = await LanguageModel.availability({ expectedInputs: [{ type: 'image' }, { type: 'text' }] });
    chromeAI = a === 'unavailable' ? false : a;
  } catch { chromeAI = false; }
  updateEngineChip();
  return chromeAI;
}
function activeEngine() {
  if (settings.engine !== 'auto') return settings.engine;
  if (settings.geminiKey) return 'gemini';
  if (settings.orKey) return 'openrouter';
  if (chromeAI) return 'chrome';
  return 'gemini';
}
function engineReady() {
  const e = activeEngine();
  return e === 'gemini' ? !!settings.geminiKey : e === 'openrouter' ? !!settings.orKey : !!chromeAI;
}
function engineLabel(e = activeEngine()) {
  return e === 'gemini' ? `Gemini · ${settings.model}` : e === 'openrouter' ? `OpenRouter · ${settings.orModel}` : 'Chrome built-in AI (no key)';
}
function updateEngineChip() {
  const chip = $('#engineChip');
  if (chip) { chip.textContent = engineLabel(); chip.className = 'chip ' + (engineReady() ? 'on' : ''); }
  const opt = $('#setEngine option[value="chrome"]');
  if (opt) opt.textContent = 'Chrome built-in AI (Gemini Nano, no key)' + (chromeAI ? (chromeAI === 'available' ? ' — ready' : ' — needs one-time download') : ' — not available in this browser');
}

function promptFor(fields, ctx, sectionTitle) {
  const cat = fields.filter(f => f.options);
  return `You are an assistant for a field enumerator conducting a household socio-economic survey. You will receive one or more photos of the same household. They may show: the outside or inside of a dwelling, household members, assets, livestock, farmland, water sources, toilets, kitchens, surroundings, a filled-in paper questionnaire, an ID/ration card, or other documents. Photos may carry a small semi-transparent stamp at the bottom-left with date, coordinates and address — you may use that address for location fields but otherwise ignore it.
${sectionTitle ? `\nFOCUS: fill only the "${sectionTitle}" section fields listed below, based on what these photos show.` : ''}
Rules:
- Use ONLY the allowed values for categorical fields; leave a field null if it cannot be determined.
- If a paper form, ID or document is visible, transcribe its values exactly (names, ages, numbers, phone, village, PIN).
- Infer housing / amenity / asset / land fields from what is visibly present across ALL photos (roof, walls, floor, wires and meters, taps and hand pumps, toilets, stoves and LPG cylinders, appliances, vehicles, solar panels, crops, animals…).
- For multi-select fields return every option you can see. Include "None" only when clearly none of the listed items exist.
- Never guess personal fields (name, age, religion, caste, income, phone) from appearance — only read them from documents.
- ai_observations: 1–3 short sentences on what the photos show and which fields you inferred vs. read.
${ctx ? `\nEnumerator hint: ${ctx}\n` : ''}
Fields and allowed values:
${cat.map(f => `- ${f.k}${f.type === 'multi' ? ' (multi-select)' : ''}: ${f.options.join(' | ')}`).join('\n')}
${fields.filter(f => !f.options).map(f => `- ${f.k}: ${f.type === 'number' ? 'integer' : 'text'}`).join('\n')}
Respond with a single JSON object using these field keys only.`;
}
function geminiSchema(fields) {
  const props = {};
  fields.forEach(f => {
    if (f.type === 'select') props[f.k] = { type: 'STRING', enum: f.options, nullable: true };
    else if (f.type === 'multi') props[f.k] = { type: 'ARRAY', items: { type: 'STRING', enum: f.options }, nullable: true };
    else if (f.type === 'number') props[f.k] = { type: 'INTEGER', nullable: true };
    else props[f.k] = { type: 'STRING', nullable: true };
  });
  return { type: 'OBJECT', properties: props };
}
function jsonSchema(fields) {
  const props = {};
  fields.forEach(f => {
    if (f.type === 'select') props[f.k] = { type: ['string', 'null'], enum: [...f.options, null] };
    else if (f.type === 'multi') props[f.k] = { type: ['array', 'null'], items: { type: 'string', enum: f.options } };
    else if (f.type === 'number') props[f.k] = { type: ['integer', 'null'] };
    else props[f.k] = { type: ['string', 'null'] };
  });
  return { type: 'object', properties: props, required: Object.keys(props), additionalProperties: false };
}
function extractJson(text) {
  try { return JSON.parse(text); } catch {}
  const m = String(text).match(/\{[\s\S]*\}/); if (m) return JSON.parse(m[0]);
  throw new Error('Model did not return JSON');
}

async function analyzeGemini(fields, list, prompt, onStatus) {
  if (!settings.geminiKey) throw new Error('No Gemini API key set (Settings)');
  onStatus(`Analyzing ${list.length} photo(s) with ${settings.model}…`);
  const parts = [{ text: prompt }, ...list.map(p => ({ inline_data: { mime_type: 'image/jpeg', data: p.dataUrl.split(',')[1] } }))];
  const body = { contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', responseSchema: geminiSchema(fields), temperature: 0.1 } };
  // Minimise reasoning latency: Gemini 3.x takes thinkingLevel, 2.5 takes thinkingBudget
  body.generationConfig.thinkingConfig = /^gemini-3/.test(settings.model) ? { thinkingLevel: 'low' } : { thinkingBudget: 0 };
  const call = async b => (await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': settings.geminiKey }, body: JSON.stringify(b) })).json();
  let data = await call(body);
  if (data.error && /thinking/i.test(data.error.message || '')) { delete body.generationConfig.thinkingConfig; data = await call(body); }
  if (data.error) throw new Error(data.error.message || 'Gemini error');
  return extractJson(data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '');
}
async function analyzeOpenRouter(fields, list, prompt, onStatus) {
  if (!settings.orKey) throw new Error('No OpenRouter API key set (Settings)');
  onStatus(`Analyzing ${list.length} photo(s) with ${settings.orModel} via OpenRouter…`);
  const content = [{ type: 'text', text: prompt }, ...list.map(p => ({ type: 'image_url', image_url: { url: p.dataUrl } }))];
  const base = { model: settings.orModel, messages: [{ role: 'user', content }], temperature: 0.1, max_tokens: 2048 };
  const call = async b => (await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.orKey}`, 'HTTP-Referer': location.origin, 'X-Title': 'GeoSurvey' }, body: JSON.stringify(b) })).json();
  // Strict schema → json_object → free text: degrade gracefully across models
  let data = await call({ ...base, response_format: { type: 'json_schema', json_schema: { name: 'survey', strict: true, schema: jsonSchema(fields) } } });
  if (data.error) data = await call({ ...base, response_format: { type: 'json_object' } });
  if (data.error) data = await call(base);
  if (data.error) throw new Error(data.error.message || 'OpenRouter error');
  const c = data.choices?.[0]?.message?.content;
  return extractJson(typeof c === 'string' ? c : (c || []).map(t => t.text || '').join(''));
}
let chromeSession = null;
async function analyzeChrome(fields, list, prompt, onStatus) {
  if (!chromeAI) throw new Error('Chrome built-in AI is not available in this browser');
  if (!chromeSession) {
    onStatus(chromeAI === 'available' ? 'Starting Chrome built-in AI…' : 'Downloading Chrome built-in model (one-time)…');
    chromeSession = await LanguageModel.create({
      expectedInputs: [{ type: 'image' }, { type: 'text' }],
      monitor(m) { m.addEventListener('downloadprogress', e => onStatus(`Downloading built-in model… ${Math.round((e.loaded / (e.total || 1)) * 100)}%`)); },
    });
  }
  onStatus(`Analyzing ${list.length} photo(s) with Chrome built-in AI…`);
  const content = [{ type: 'text', value: prompt }];
  for (const p of list) content.push({ type: 'image', value: await (await fetch(p.dataUrl)).blob() });
  const session = await chromeSession.clone();
  let text;
  try { text = await session.prompt([{ role: 'user', content }], { responseConstraint: jsonSchema(fields) }); }
  catch { text = await session.prompt([{ role: 'user', content }]); }
  return extractJson(text);
}

let lastEngine = '';
/** Analyze photos and fill fields. section = '' → whole questionnaire with all photos. */
async function analyzePhotos(section = '', list = null) {
  list = list || (section ? photos.filter(p => p.section === section) : photos);
  if (!list.length) return toast(section ? 'Capture or upload a photo for this section first (the boxes next to the AI icon)' : 'Add a photo first');
  const st = section ? $(`[data-status="${section}"]`) : $('#aiStatus');
  const btn = $('#analyzeBtn');
  const engine = activeEngine();
  if (!engineReady()) { openSettings(); return toast('Add a Gemini or OpenRouter API key in Settings first', 'err'); }
  const fields = section ? [...SECTION_BY_ID[section].fields.filter(f => f.ai), ALL_FIELDS.find(f => f.k === 'ai_observations')] : AI_FIELDS;
  const prompt = promptFor(fields, ($('#aiContext')?.value || '').trim(), section ? SECTION_BY_ID[section].title : '');
  btn.disabled = true; $$('.sec-tools').forEach(l => l.classList.add('disabled'));
  const t0 = performance.now();
  const onStatus = m => setStatus(st, m, '', true);
  try {
    const fn = engine === 'gemini' ? analyzeGemini : engine === 'openrouter' ? analyzeOpenRouter : analyzeChrome;
    const out = await fn(fields, list, prompt, onStatus);
    let n = 0;
    const allowed = new Set(fields.map(f => f.k));
    Object.entries(out || {}).forEach(([k, v]) => {
      if (!allowed.has(k) || v == null || v === '' || (Array.isArray(v) && !v.length)) return;
      if (setValue(k, v, true)) n++;
    });
    lastEngine = engine === 'gemini' ? settings.model : engine === 'openrouter' ? 'openrouter:' + settings.orModel : 'chrome-builtin';
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    setStatus(st, `${n} field${n === 1 ? '' : 's'} filled in ${secs}s — highlighted in yellow, please review.`, 'ok');
    toast(`${n} fields filled in ${secs}s`, 'ok');
    if (section) $(`[data-section="${section}"]`).classList.remove('collapsed'); else $$('.card.collapsed').forEach(c => c.classList.remove('collapsed'));
  } catch (e) {
    setStatus(st, 'AI error: ' + e.message, 'err');
  } finally {
    btn.disabled = photos.length === 0; $$('.sec-tools').forEach(l => l.classList.remove('disabled'));
    scheduleDraftSave(); updateProgress();
  }
}

/* ------------------------------------------------------------------ */
/* Submissions: local queue + Apps Script (Sheets + Drive) sync          */
/* ------------------------------------------------------------------ */
function getRecords() { return LS.get('gs_records', []); }
function saveRecords(r) { LS.set('gs_records', r); updatePendingBadge(); if (window.Analysis) Analysis.schedule(); }
function updatePendingBadge() {
  const n = getRecords().filter(r => r.status !== 'synced').length;
  const b = $('#pendingBadge'); b.textContent = n; b.hidden = n === 0;
}
function validate() {
  let ok = true;
  ALL_FIELDS.filter(f => f.required).forEach(f => {
    const fld = $(`[data-field="${f.k}"]`); const bad = !getValue(f.k);
    fld.classList.toggle('invalid', bad);
    if (bad && ok) { fld.scrollIntoView({ behavior: 'smooth', block: 'center' }); ok = false; }
  });
  return ok;
}
async function submitForm() {
  if (!validate()) return toast('Please fill the required fields (*)', 'err');
  const btn = $('#submitBtn'); btn.disabled = true;
  try {
    const id = crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2);
    const rec = { id, submitted_at: new Date().toISOString(), ...collect(), photo_count: photos.length, photo_thumb: '', photo_urls: '', ai_engine: lastEngine, app_version: APP_VERSION, status: 'pending' };
    if (photos.length) {
      try { rec.photo_thumb = await makeThumb(photos[0].dataUrl); } catch {}
      await PhotoDB.put(id, photos.map(p => ({ name: p.name, section: p.section, dataUrl: p.dataUrl, taken_at: p.taken_at, lat: p.lat, lon: p.lon, acc: p.acc })));
    }
    const records = getRecords(); records.unshift(rec); saveRecords(records);
    clearForm(); lastEngine = '';
    toast('Saved on device — syncing…');
  } finally { btn.disabled = false; }
  await syncPending();
}
async function sendRecord(rec) {
  const { status, error, ...payload } = rec;
  if (settings.uploadPhotos && rec.photo_count) payload.photos = await PhotoDB.get(rec.id);
  // text/plain avoids a CORS preflight; Apps Script answers through a redirect that fetch follows.
  const r = await fetch(settings.endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}
let syncing = false;
async function syncPending() {
  if (syncing) return;
  const records = getRecords(); const pending = records.filter(r => r.status !== 'synced');
  if (!pending.length) return renderLocalTable();
  if (!settings.endpoint) { renderLocalTable(); return toast(`${pending.length} record(s) kept on device — set a database endpoint in Settings to sync.`); }
  if (!navigator.onLine) { renderLocalTable(); return toast('Offline — will sync when the connection returns.'); }
  syncing = true; $('#syncBtn').disabled = true;
  let ok = 0, fail = 0;
  for (const rec of pending) {
    try { const j = await sendRecord(rec); rec.status = 'synced'; delete rec.error; if (j.photo_urls) rec.photo_urls = j.photo_urls; ok++; }
    catch (e) { rec.status = 'failed'; rec.error = e.message; fail++; }
    saveRecords(records);
  }
  syncing = false; $('#syncBtn').disabled = false;
  renderLocalTable();
  if (ok) toast(`${ok} record(s) synced to the database`, 'ok');
  if (fail) toast(`${fail} record(s) failed to sync — check endpoint / connection`, 'err');
}

const TABLE_COLS = ['submitted_at', 'head_name', 'village', 'district', 'postcode', 'house_type', 'monthly_income', 'household_size', 'latitude', 'longitude', 'surveyor', 'ai_engine'];
function renderLocalTable() {
  const records = getRecords();
  const synced = records.filter(r => r.status === 'synced').length;
  $('#localSummary').textContent = records.length ? `${records.length} record(s) · ${synced} synced · ${records.length - synced} pending or failed. Stamped photos are kept on this device and uploaded to Drive on sync.` : 'No submissions on this device yet.';
  $('#localTable').innerHTML = records.length ? `<thead><tr><th>Status</th><th>Photo</th>${TABLE_COLS.map(c => `<th>${c}</th>`).join('')}<th></th></tr></thead><tbody>` +
    records.map(r => `<tr><td><span class="pill ${r.status}" title="${esc(r.error || '')}">${r.status}</span></td><td>${r.photo_thumb ? `<img class="mini" src="${r.photo_thumb}" data-view="${r.id}" title="${r.photo_count} photo(s)">` : ''}</td>${TABLE_COLS.map(c => `<td title="${esc(r[c])}">${esc(c === 'submitted_at' ? fmtDate(r[c]) : r[c])}</td>`).join('')}<td class="btn-row">${r.photo_count ? `<button class="link-btn" data-dl="${r.id}">photos</button>` : ''}<button class="link-btn danger" data-del="${r.id}">delete</button></td></tr>`).join('') + '</tbody>' : '';
  $$('#localTable [data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('Delete this record (and its photos) from the device?')) return;
    await PhotoDB.del(b.dataset.del); saveRecords(getRecords().filter(r => r.id !== b.dataset.del)); renderLocalTable();
  });
  $$('#localTable [data-view]').forEach(i => i.onclick = async () => openGallery('Stamped photos', await PhotoDB.get(i.dataset.view)));
  $$('#localTable [data-dl]').forEach(b => b.onclick = async () => {
    for (const p of await PhotoDB.get(b.dataset.dl)) { download(`${b.dataset.dl.slice(0, 8)}_${p.name}`, await (await fetch(p.dataUrl)).blob()); await new Promise(r => setTimeout(r, 300)); }
  });
  updatePendingBadge();
}

/* ------------------------------------------------------------------ */
/* Admin panel (token-protected, served by the Apps Script backend)     */
/* ------------------------------------------------------------------ */
let adminRows = [];
function adminToken() { return sessionStorage.getItem('gs_admin') || ''; }
async function adminFetch(params) {
  if (!settings.endpoint) throw new Error('No database endpoint configured (Settings)');
  const q = new URLSearchParams({ ...params, token: adminToken() });
  const r = await fetch(settings.endpoint + (settings.endpoint.includes('?') ? '&' : '?') + q);
  const j = await r.json(); if (!j.ok) throw new Error(j.error || 'Request failed');
  return j;
}
async function adminPost(payload) {
  const r = await fetch(settings.endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...payload, token: adminToken() }) });
  const j = await r.json(); if (!j.ok) throw new Error(j.error || 'Request failed');
  return j;
}
async function adminConnect() {
  const st = $('#adminStatus');
  sessionStorage.setItem('gs_admin', $('#adminToken').value.trim());
  setStatus(st, 'Connecting…', '', true);
  try { await adminLoad(); $('#adminLogin').hidden = true; $('#adminPanel').hidden = false; setStatus(st, ''); }
  catch (e) { setStatus(st, e.message, 'err'); sessionStorage.removeItem('gs_admin'); }
}
async function adminLoad() {
  const j = await adminFetch({ action: 'list', limit: 5000 });
  adminRows = j.rows || [];
  const link = $('#adminSheetLink'); if (j.sheetUrl) { link.href = j.sheetUrl; link.hidden = false; }
  renderAdmin(); if (window.Analysis) Analysis.schedule();
}
function renderAdmin() {
  const q = $('#adminSearch').value.trim().toLowerCase();
  const rows = q ? adminRows.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(q))) : adminRows;
  const day = 86400e3, now = Date.now();
  const within = d => adminRows.filter(r => now - new Date(r.submitted_at) < d).length;
  const uniq = k => new Set(adminRows.map(r => r[k]).filter(Boolean)).size;
  $('#adminStats').innerHTML = [
    ['Total submissions', adminRows.length], ['Last 24 h', within(day)], ['Last 7 days', within(7 * day)],
    ['Enumerators', uniq('surveyor')], ['Villages', uniq('village')], ['Districts', uniq('district')],
    ['With photos', adminRows.filter(r => +r.photo_count > 0).length],
  ].map(([l, v]) => `<div class="stat"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('');
  $('#adminSummary').textContent = `${rows.length} of ${adminRows.length} rows shown`;
  const cols = ['submitted_at', 'surveyor', 'head_name', 'village', 'district', 'postcode', 'house_type', 'monthly_income', 'household_size', 'latitude', 'longitude', 'photo_urls'];
  $('#adminTable').innerHTML = rows.length ? `<thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}<th></th></tr></thead><tbody>` +
    rows.map(r => `<tr>${cols.map(c => `<td title="${esc(r[c])}">${c === 'photo_urls' && r[c] ? String(r[c]).split(/\s+/).filter(Boolean).map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener">${i + 1}</a>`).join(' ') : esc(c === 'submitted_at' ? fmtDate(r[c]) : r[c])}</td>`).join('')}<td><button class="link-btn danger" data-adel="${esc(r.id)}">delete</button></td></tr>`).join('') + '</tbody>' : '';
  $$('#adminTable [data-adel]').forEach(b => b.onclick = async () => {
    if (!confirm('Permanently delete this submission from the Google Sheet?')) return;
    try { await adminPost({ action: 'delete', id: b.dataset.adel }); adminRows = adminRows.filter(r => r.id !== b.dataset.adel); renderAdmin(); toast('Deleted', 'ok'); }
    catch (e) { toast(e.message, 'err'); }
  });
  const breakdown = (k, label) => {
    const counts = {}; adminRows.forEach(r => { const v = r[k] || '(blank)'; counts[v] = (counts[v] || 0) + 1; });
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10); const max = entries[0]?.[1] || 1;
    return `<div class="bd"><h3>${label}</h3>${entries.map(([v, n]) => `<div class="row"><span>${esc(v)}</span><span class="n">${n}</span><div class="bar"><div style="width:${n / max * 100}%"></div></div></div>`).join('') || '<span class="n">No data</span>'}</div>`;
  };
  $('#adminBreakdowns').innerHTML = [['district', 'By district'], ['house_type', 'House type'], ['monthly_income', 'Monthly income'], ['water_source', 'Drinking water'], ['toilet', 'Toilet facility'], ['surveyor', 'By enumerator']].map(a => breakdown(...a)).join('');
}

/* ------------------------------------------------------------------ */
/* Settings                                                             */
/* ------------------------------------------------------------------ */
const KNOWN_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.8-flash', 'gemini-2.5-flash'];
function openSettings() {
  $('#setEngine').value = settings.engine; $('#setKey').value = settings.geminiKey;
  $('#setOrKey').value = settings.orKey; $('#setOrModel').value = settings.orModel;
  const known = KNOWN_MODELS.includes(settings.model);
  $('#setModel').value = known ? settings.model : 'custom'; $('#setModelCustom').hidden = known; $('#setModelCustom').value = known ? '' : settings.model;
  $('#setEndpoint').value = settings.endpoint; $('#setSurveyor').value = settings.surveyor;
  $('#setMaxDim').value = settings.maxDim; $('#setStamp').checked = settings.stamp; $('#setUploadPhotos').checked = settings.uploadPhotos;
  $('#settingsDlg').showModal();
}
function saveSettings() {
  const modelSel = $('#setModel').value;
  settings = {
    engine: $('#setEngine').value, geminiKey: $('#setKey').value.trim(),
    model: modelSel === 'custom' ? ($('#setModelCustom').value.trim() || DEFAULT_SETTINGS.model) : modelSel,
    orKey: $('#setOrKey').value.trim(), orModel: $('#setOrModel').value.trim() || DEFAULT_SETTINGS.orModel,
    endpoint: $('#setEndpoint').value.trim(), surveyor: $('#setSurveyor').value.trim(),
    maxDim: +$('#setMaxDim').value, stamp: $('#setStamp').checked, uploadPhotos: $('#setUploadPhotos').checked,
  };
  LS.set('gs_settings', settings);
  if (!getValue('surveyor') && settings.surveyor) setValue('surveyor', settings.surveyor);
  updateEngineChip(); toast('Settings saved', 'ok');
}

/* ------------------------------------------------------------------ */
/* Init                                                                 */
/* ------------------------------------------------------------------ */
function showView(id) {
  $$('.view').forEach(v => v.hidden = v.id !== id);
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === id));
  $('#actionBar').hidden = id !== 'formView';
  $('#pdfBtn').hidden = id !== 'formView';
  if (id === 'responsesView') renderLocalTable();
  if (id === 'analysisView' && window.Analysis) Analysis.open();
  if (id === 'adminView' && adminToken() && $('#adminPanel').hidden) adminConnect();
}
function init() {
  renderForm();
  setValue('survey_date', new Date().toISOString().slice(0, 10));
  if (settings.surveyor) setValue('surveyor', settings.surveyor);
  restoreDraft(); updateProgress(); updatePendingBadge(); updateEngineChip(); detectChromeAI();

  $$('.tab').forEach(t => t.onclick = () => showView(t.dataset.view));
  $('#settingsBtn').onclick = openSettings;
  $('#setModel').onchange = e => { $('#setModelCustom').hidden = e.target.value !== 'custom'; };
  $('#settingsDlg').addEventListener('close', () => { if ($('#settingsDlg').returnValue === 'save') saveSettings(); });
  $('#photoDlgClose').onclick = () => $('#photoDlg').close();
  $('#locateBtn').onclick = () => detectLocation(false);
  $('#captureInput').onchange = e => { addFiles(e.target.files); e.target.value = ''; };
  $('#analyzeBtn').onclick = () => analyzePhotos();
  $('#submitBtn').onclick = submitForm;
  $('#resetBtn').onclick = () => { if (confirm('Clear the form?')) clearForm(); };
  $('#syncBtn').onclick = syncPending;
  $('#exportCsvBtn').onclick = () => Exports.csv(getRecords());
  $('#exportJsonBtn').onclick = () => Exports.json(getRecords());
  $('#exportSpssBtn').onclick = () => Exports.spss(getRecords());
  $('#exportKmzBtn').onclick = () => Exports.kmz(getRecords());
  $('#clearLocalBtn').onclick = async () => {
    const synced = getRecords().filter(r => r.status === 'synced');
    if (!synced.length) return toast('No synced records to remove');
    if (!confirm(`Remove ${synced.length} synced record(s) and their photos from this device? They remain in the Google Sheet / Drive.`)) return;
    for (const r of synced) await PhotoDB.del(r.id);
    saveRecords(getRecords().filter(r => r.status !== 'synced')); renderLocalTable();
  };
  $('#adminConnectBtn').onclick = adminConnect;
  $('#adminToken').addEventListener('keydown', e => { if (e.key === 'Enter') adminConnect(); });
  $('#adminRefreshBtn').onclick = () => adminLoad().catch(e => toast(e.message, 'err'));
  $('#adminSearch').oninput = renderAdmin;
  $('#adminExportBtn').onclick = () => Exports.csv(adminRows, 'geosurvey_all');
  $('#adminExportSpssBtn').onclick = () => Exports.spss(adminRows, 'geosurvey_all');
  $('#adminExportKmzBtn').onclick = () => Exports.kmz(adminRows, 'geosurvey_all');
  $('#adminLogoutBtn').onclick = () => { sessionStorage.removeItem('gs_admin'); $('#adminPanel').hidden = true; $('#adminLogin').hidden = false; $('#adminToken').value = ''; setStatus($('#adminStatus'), ''); };

  const offline = () => { $('#offlineBar').hidden = navigator.onLine; updateEngineChip(); };
  window.addEventListener('online', () => { offline(); syncPending(); });
  window.addEventListener('offline', offline);
  offline();

  if (!engineReady()) setTimeout(() => toast('Tip: add a Gemini or OpenRouter API key in Settings to enable photo auto-fill'), 800);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
document.addEventListener('DOMContentLoaded', init);
