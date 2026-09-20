/* GeoSurvey — AI-assisted socio-economic survey
 * Static app: Gemini / OpenRouter / Gemma 4 via the team backend / Chrome built-in AI (auto-fill from photos,
 * whole form or per section), Geolocation + OSM Nominatim, geo/time-stamped photos, Google Apps Script
 * (Sheets + Drive) backend with offline queue, admin panel, CSV/JSON/SPSS/KMZ export.
 */
'use strict';

const APP_VERSION = '1.17.1';
const MAX_PHOTOS = 12;
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { toast('Browser storage is full — export and remove synced records', 'err'); } },
};

/* ------------------------------------------------------------------ */
/* Questionnaire schema — edit here to change the survey.               */
/* ai:true → exposed to the AI for auto-fill; photoHint → per-section   */
/* guidance shown to the enumerator and sent to the model               */
/* ------------------------------------------------------------------ */
let LOCATION_FIELDS = [
  { k: 'surveyor', label: 'Enumerator name', type: 'text', required: true },
  { k: 'survey_date', label: 'Survey date', type: 'date', ro: true },
  { k: 'latitude', label: 'Latitude', type: 'text', ro: true },
  { k: 'longitude', label: 'Longitude', type: 'text', ro: true },
  { k: 'gps_accuracy_m', label: 'GPS accuracy (m)', type: 'text', ro: true },
  { k: 'altitude_m', label: 'Altitude (m)', type: 'text', ro: true },
  { k: 'village', label: 'Village / Locality', type: 'text', auto: true },
  { k: 'postcode', label: 'PIN / Postal code', type: 'text', auto: true },
  { k: 'block', label: 'Block / Tehsil / Sub-district', type: 'text', auto: true },
  { k: 'district', label: 'District', type: 'text', auto: true },
  { k: 'state', label: 'State / Province', type: 'text', auto: true },
  { k: 'country', label: 'Country', type: 'text', auto: true },
  { k: 'full_address', label: 'Full address (from map)', type: 'textarea', wide: true, auto: true },
];

let SECTIONS = [
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
let CONSTRUCTS = {
  ES: { name: 'Economic Security', items: ['es1', 'es2', 'es3', 'es4'] },
  AS: { name: 'Access to Services', items: ['as1', 'as2', 'as3', 'as4'] },
  GS: { name: 'Government Support', items: ['gs1', 'gs2', 'gs3'] },
  SC: { name: 'Social Capital', items: ['sc1', 'sc2', 'sc3'] },
  WB: { name: 'Well-being', items: ['wb1', 'wb2', 'wb3', 'wb4'] },
};
/* Hypothesised structural model (from → to). ES mediates AS/GS → WB; SC moderates ES → WB;
 * higher-order "Livelihood Capacity" (LC) = ES + AS + SC → WB. */
let STRUCTURAL_MODEL = {
  paths: [['AS', 'ES'], ['GS', 'ES'], ['ES', 'WB'], ['AS', 'WB'], ['SC', 'WB'], ['GS', 'WB']],
  mediations: [['AS', 'ES', 'WB'], ['GS', 'ES', 'WB']],
  moderation: { predictor: 'ES', moderator: 'SC', outcome: 'WB' },
  higherOrder: { key: 'LC', name: 'Livelihood Capacity', lower: ['ES', 'AS', 'SC'], outcome: 'WB', covariates: ['GS'] },
};
const LIKERT = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'];
/** Linear-scale definition for a Likert-type question: { max, lo, hi, labels[] } (default 1–5 agreement scale). */
function scaleOf(f) {
  const max = Math.min(10, Math.max(3, +(f.scale?.max || 5)));
  const custom = f.scale && (f.scale.max || f.scale.lo || f.scale.hi);
  const lo = f.scale?.lo || (custom && max !== 5 ? 'Lowest' : LIKERT[0]), hi = f.scale?.hi || (custom && max !== 5 ? 'Highest' : LIKERT[4]);
  const labels = max === 5 && !f.scale?.lo && !f.scale?.hi ? LIKERT : Array.from({ length: max }, (_, i) => i === 0 ? `${i + 1} – ${lo}` : i === max - 1 ? `${i + 1} – ${hi}` : String(i + 1));
  return { max, lo, hi, labels };
}
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

let REMARKS_FIELDS = [
  { k: 'ai_observations', label: 'AI observations (from photos)', type: 'textarea', wide: true, ai: true },
  { k: 'remarks', label: 'Enumerator remarks', type: 'textarea', wide: true },
];

let ALL_FIELDS, AI_FIELDS, SECTION_BY_ID;
const FIELD_TYPES = ['text', 'number', 'date', 'tel', 'select', 'multi', 'likert', 'textarea'];
const clone = o => JSON.parse(JSON.stringify(o));
const DEFAULT_SCHEMA = clone({ version: 1, sections: SECTIONS, remarks: REMARKS_FIELDS, constructNames: Object.fromEntries(Object.entries(CONSTRUCTS).map(([k, c]) => [k, c.name])), model: STRUCTURAL_MODEL });
const DEFAULT_CONSTRUCT_KEYS = Object.keys(CONSTRUCTS).join(',');

/** Constructs are derived from Likert fields tagged with a construct code (f.c). */
function deriveConstructs(sections, names = {}) {
  const out = {};
  sections.flatMap(s => s.fields).forEach(f => { if (f.type === 'likert' && f.c) { const c = String(f.c).toUpperCase(); (out[c] = out[c] || { name: names[c] || DEFAULT_SCHEMA.constructNames[c] || c, items: [] }).items.push(f.k); } });
  Object.keys(out).forEach(c => { if (out[c].items.length < 2) delete out[c]; }); // a construct needs ≥ 2 items
  return out;
}
/** Structural model: the designed default when its constructs exist, a stored valid model, otherwise "all → last". */
function deriveModel(constructs, stored) {
  const keys = Object.keys(constructs);
  if (keys.join(',') === DEFAULT_CONSTRUCT_KEYS) return clone(DEFAULT_SCHEMA.model);
  const valid = m => m && Array.isArray(m.paths) && m.paths.every(([a, b]) => keys.includes(a) && keys.includes(b));
  if (valid(stored)) return { paths: stored.paths, mediations: (stored.mediations || []).filter(t => t.every(k => keys.includes(k))), moderation: stored.moderation && [stored.moderation.predictor, stored.moderation.moderator, stored.moderation.outcome].every(k => keys.includes(k)) ? stored.moderation : null, higherOrder: stored.higherOrder && stored.higherOrder.lower.every(k => keys.includes(k)) && keys.includes(stored.higherOrder.outcome) ? stored.higherOrder : null };
  if (keys.length < 2) return { paths: [], mediations: [], moderation: null, higherOrder: null };
  const outcome = keys[keys.length - 1];
  return { paths: keys.filter(k => k !== outcome).map(k => [k, outcome]), mediations: [], moderation: null, higherOrder: null };
}
const EMPTY_SCHEMA = { version: 0, title: '', description: '', sections: [], remarks: clone(REMARKS_FIELDS), constructNames: {}, model: null };
let formListenersBound = false;
/** Install a questionnaire schema (default or designed in the Edit tab) and re-render the form. */
/** Identity of the installed questionnaire on the backend: its id and dedicated response tab (empty for device-only use). */
let SCHEMA_META = { qid: '', sheet: '' };
function applySchema(schema, rerender = true) {
  const s = schema || DEFAULT_SCHEMA;
  SCHEMA_META = { qid: s.qid || '', sheet: s.sheet || '' };
  FORM_META = { title: s.title || 'Socio-Economic Household Survey', description: s.description || '' };
  SECTIONS = clone(s.sections);
  REMARKS_FIELDS = clone(s.remarks || DEFAULT_SCHEMA.remarks);
  CONSTRUCTS = deriveConstructs(SECTIONS, s.constructNames || {});
  STRUCTURAL_MODEL = deriveModel(CONSTRUCTS, s.model);
  ALL_FIELDS = [...LOCATION_FIELDS, ...SECTIONS.flatMap(x => x.fields), ...REMARKS_FIELDS];
  AI_FIELDS = ALL_FIELDS.filter(f => f.ai || f.type === 'likert'); // rating scales are answered from the interview
  SECTION_BY_ID = Object.fromEntries(SECTIONS.map(x => [x.id, x]));
  if (rerender) {
    const keep = collect();
    renderForm();
    Object.entries(keep).forEach(([k, v]) => setValue(k, v));
    renderThumbs(); updateProgress();
    if (typeof Analysis !== 'undefined') Analysis.schedule();
    if (SECTIONS.length && !getValue('latitude')) autoLocate();
  }
}
let FORM_META = { title: 'Socio-Economic Household Survey', description: '' };
function currentSchema() { return { version: (LS.get('gs_schema', null) || {}).version || 1, qid: SCHEMA_META.qid || undefined, sheet: SCHEMA_META.sheet || undefined, title: FORM_META.title, description: FORM_META.description, sections: clone(SECTIONS), remarks: clone(REMARKS_FIELDS), constructNames: Object.fromEntries(Object.entries(CONSTRUCTS).map(([k, c]) => [k, c.name])), model: clone(STRUCTURAL_MODEL) }; }
/** Install a questionnaire received from the backend (or a project file) as this phone's form. */
function adoptSchema(s, why = '') { const prev = SCHEMA_META.qid; LS.set('gs_schema', s); applySchema(s); if ((s.qid || '') !== (prev || '')) resetDbCache(); if (why) toast(why, 'ok'); }
applySchema(LS.get('gs_schema', null) || EMPTY_SCHEMA, false);
/** Install the built-in sample questionnaire (18 Likert items, 5 constructs, structural model). */
function useSampleQuestionnaire() { const d = clone(DEFAULT_SCHEMA); d.version = Date.now(); LS.set('gs_schema', d); applySchema(d); toast('Sample questionnaire installed — customise it any time in Edit', 'ok'); autoLocate(); }
// Columns that exist on a record but are not questionnaire fields (used by exports)
const META_FIELDS = [
  { k: 'id', label: 'Record ID', type: 'text' }, { k: 'submitted_at', label: 'Submitted at', type: 'text' },
  { k: 'photo_count', label: 'Photo count', type: 'number' }, { k: 'photo_urls', label: 'Photo URLs', type: 'text' },
  { k: 'app_version', label: 'App version', type: 'text' },
  { k: 'interview_transcript', label: 'Interview transcript', type: 'text' },
  { k: 'audio_count', label: 'Audio clips', type: 'number' }, { k: 'audio_duration_s', label: 'Audio duration (s)', type: 'number' }, { k: 'audio_urls', label: 'Audio URLs', type: 'text' }, { k: 'transcript_url', label: 'Transcript URL', type: 'text' },
];

/* ------------------------------------------------------------------ */
/* Storage: settings + records in localStorage, photos in IndexedDB     */
/* ------------------------------------------------------------------ */
const DEFAULT_SETTINGS = { engine: 'auto', geminiKey: '', model: 'gemini-3.5-flash-lite', orKey: '', orModel: 'google/gemini-2.5-flash-lite', gemmaModel: 'gemma-4-26b-a4b-it', endpoint: '', surveyor: '', maxDim: 1024, stamp: true, uploadPhotos: true, sampleTools: false };
let settings = Object.assign({}, DEFAULT_SETTINGS, LS.get('gs_settings', {}));
// Random per-device secret: submitted with every record so this phone can read back its own rows without the team key
if (!settings.deviceId) { settings.deviceId = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2); LS.set('gs_settings', settings); }

/* Database endpoint, in order of precedence: typed in Settings → ?db= link → config.js team default. */
const TEAM_ENDPOINT = (typeof GS_CONFIG !== 'undefined' && GS_CONFIG.endpoint || '').trim();
const ENDPOINT_RE = /^https:\/\/script\.google\.com\/(?:a\/macros\/[^/]+\/|macros\/)s\/[\w-]+\/exec$/;
function setEndpoint(url, source) {
  if (url === settings.endpoint && settings.endpointSource === source) return false;
  if (url !== settings.endpoint) { delete settings.backendAI; delete settings.backendVersion; delete settings.folderUrl; }
  settings.endpoint = url; settings.endpointSource = source; LS.set('gs_settings', settings);
  return true;
}
const teamLink = () => settings.endpoint ? `${location.origin}${location.pathname}?db=${encodeURIComponent(settings.endpoint)}` : '';
/** Team-link popup: the link as a QR code, built from the configured endpoint. */
function openTeamQr() {
  const link = teamLink();
  $('#qrSettings').hidden = !!link; $('#qrCopy').hidden = !link; $('#qrShare').hidden = !link || !navigator.share;
  if (!link) { $('#qrSub').textContent = 'Set the database endpoint in Settings first — the team link is built from it automatically.'; $('#qrCode').innerHTML = ''; $('#qrLink').textContent = ''; }
  else { $('#qrSub').textContent = 'Point the phone camera at this code: the app opens already connected to this database, nothing to type.'; $('#qrCode').innerHTML = QR.svg(link); $('#qrLink').textContent = link; }
  $('#qrDlg').showModal();
}
/* ---- Project file (.geosurvey): the questionnaire plus the team connection in one portable JSON file ---- */
const PROJECT_FORMAT = 'geosurvey-project';
function projectFile(schema = currentSchema()) {
  return { format: PROJECT_FORMAT, version: 1, app: APP_VERSION, saved_at: new Date().toISOString(), title: schema.title || FORM_META.title, endpoint: settings.endpoint || '', teamLink: teamLink(), recLang: settings.recLang || '', schema };
}
const projectFileName = title => `${String(title || 'GeoSurvey').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'GeoSurvey'}.geosurvey`;
function downloadProject(schema) { const p = projectFile(schema); download(projectFileName(p.title), JSON.stringify(p, null, 2), 'application/json'); toast('Project file saved — keep it safe; it restores the questionnaire and the team connection', 'ok'); }
/** Read a .geosurvey (or plain questionnaire JSON) file. Returns { schema, endpoint, recLang } or throws. */
async function parseProjectFile(file) {
  let p; try { p = JSON.parse(await file.text()); } catch { throw new Error('not a GeoSurvey project file'); }
  const schema = p.format === PROJECT_FORMAT ? p.schema : Array.isArray(p.sections) ? p : null;
  if (!schema || !Array.isArray(schema.sections)) throw new Error('not a GeoSurvey project file');
  return { schema, endpoint: p.format === PROJECT_FORMAT && ENDPOINT_RE.test(p.endpoint || '') ? p.endpoint : '', recLang: p.recLang || '' };
}
/** Start-page action: install the questionnaire and connect to the team database from a project file. */
async function openProjectFile(file) {
  try {
    const { schema, endpoint, recLang } = await parseProjectFile(file);
    const parts = [`questionnaire "${schema.title || 'untitled'}" installed`];
    if (endpoint && setEndpoint(endpoint, 'link')) parts.push('connected to the team database');
    if (recLang) { settings.recLang = recLang; LS.set('gs_settings', settings); }
    const s = { ...schema, version: schema.version || Date.now() };
    adoptSchema(s);
    if (endpoint) { settings.pinnedQid = s.qid || ''; LS.set('gs_settings', settings); } // the file names the questionnaire this phone should use
    toast('Project opened — ' + parts.join(', '), 'ok');
    updateEngineChip(); probeBackend(); autoLocate();
  } catch (e) { toast('Could not open the file: ' + e.message, 'err'); }
}
/** Adopt the endpoint from a ?db= link or from config.js unless the enumerator typed their own. */
function resolveEndpoint() {
  const qp = new URLSearchParams(location.search); const link = (qp.get('db') || qp.get('endpoint') || '').trim();
  if (link) { history.replaceState(null, '', location.pathname + location.hash); if (ENDPOINT_RE.test(link) && setEndpoint(link, 'link')) toast('Connected to the team database from the link', 'ok'); else if (!ENDPOINT_RE.test(link)) toast('The link carries an invalid database URL — ask your admin for a new team link', 'err'); }
  if (TEAM_ENDPOINT && (!settings.endpoint || settings.endpointSource === 'team')) setEndpoint(TEAM_ENDPOINT, 'team');
}

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
  put(id, photos, audio = []) { return this.tx('readwrite', st => st.put({ id, photos, audio })); },
  async get(id) { const r = await this.tx('readonly', st => st.get(id)); return r ? r.photos : []; },
  async getAudio(id) { const r = await this.tx('readonly', st => st.get(id)); return r ? (r.audio || []) : []; },
  del(id) { return this.tx('readwrite', st => st.delete(id)); },
  putKV(id, data) { return this.tx('readwrite', st => st.put({ id, ...data })); },
  getKV(id) { return this.tx('readonly', st => st.get(id)); },
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
const MIC_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 17v4M8 21h8"/></svg>';
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
    case 'likert': {
      const sc = scaleOf(f);
      ctrl = `<div class="likert" data-key="${f.k}" role="radiogroup" style="--n:${sc.max}"><span class="lk-end lo">${esc(sc.lo)}</span>${sc.labels.map((l, i) => `<label title="${esc(l)}"><input type="radio" name="${id}" value="${i + 1}"><span>${i + 1}</span></label>`).join('')}<span class="lk-end hi">${esc(sc.hi)}</span></div>`; break;
    }
    case 'textarea':
      ctrl = `<textarea id="${id}" data-key="${f.k}" ${f.ro ? 'readonly' : ''}></textarea>`; break;
    default:
      ctrl = `<input id="${id}" data-key="${f.k}" type="${f.type}" ${f.ro ? 'readonly' : ''} ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''} ${f.type === 'number' ? 'inputmode="numeric"' : ''}>`;
  }
  return `<div class="field ${f.wide || f.type === 'likert' ? 'wide' : ''} ${f.type === 'likert' ? 'likert-field' : ''}" data-field="${f.k}"><label for="${id}">${esc(f.label)}${req}${f.help ? `<small class="help">${esc(f.help)}</small>` : ''}</label>${ctrl}<span class="ai-tag">AI</span></div>`;
}

function renderForm() {
  const empty = SECTIONS.length === 0;
  $('#onboarding').hidden = !empty;
  ['#photoCard', '#locationCard', '#remarksCard'].forEach(s => { const el = $(s); if (el) el.hidden = empty; });
  $('#actionBar').classList.toggle('disabled', empty);
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
          <button type="button" class="tool tool-ai" data-ai="${s.id}" title="Analyze this section's photos and recordings with AI and fill the fields">${AI_SVG}<span class="tool-badge" hidden>0</span></button>
          <button type="button" class="tool tool-mic" data-mic="${s.id}" title="Record the answers for this section — tap again to stop; the section is filled automatically">${MIC_SVG}</button>
        </div>` : `<div class="sec-tools"><div class="sec-thumbs" data-thumbs="${s.id}"></div><button type="button" class="tool tool-ai" data-ai="${s.id}" title="Fill this section from the recorded interview / transcript with AI">${AI_SVG}<span class="tool-badge" hidden>0</span></button><button type="button" class="tool tool-mic" data-mic="${s.id}" title="Record the answers for this section — tap again to stop; the section is filled automatically">${MIC_SVG}</button></div>`}
      </div>
      ${s.photoHint ? `<p class="sub sec-hint">${esc(s.photoHint)}</p>` : `<p class="sub sec-hint">Ask the respondent to rate each statement on the scale shown.</p>`}
      <div class="status sec-status" data-status="${s.id}"></div>
      ${s.fields.every(f => f.type === 'likert')
        ? `<div class="likert-grid"><div class="likert-head"><span>Statement</span><span>Rating</span></div>${s.fields.map(fieldHTML).join('')}</div>`
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
  $$('button[data-mic]').forEach(b => b.addEventListener('click', () => toggleSectionRecording(b.dataset.mic)));
  if (!formListenersBound) {
    formListenersBound = true;
    $('#formView').addEventListener('input', e => {
      const fld = e.target.closest('.field');
      if (fld) fld.classList.remove('ai', 'invalid');
      scheduleDraftSave(); updateProgress();
    });
  }
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
    const n = Math.round(parseFloat(v)); const r = Number.isFinite(n) ? $(`input[value="${n}"]`, el) : null; if (!r) return false; r.checked = true;
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
  if (recording) { recSection = ''; stopRecording(); }
  audioClips = []; renderClips();
  if ($('#transcript')) { $('#transcript').value = ''; $('#transcriptWrap').hidden = true; }
  if ($('#aiContext')) $('#aiContext').value = '';
  setStatus($('#aiStatus'), ''); setStatus($('#locStatus'), '');
  $$('.sec-status').forEach(s => setStatus(s, ''));
  LS.set('gs_draft', null);
  updateProgress();
  autoLocate(true); // next household: fresh precise fix
}
function updateProgress() {
  const fields = ALL_FIELDS.filter(f => !f.ro && !f.auto && !['ai_observations', 'remarks'].includes(f.k));
  const filled = f => { const v = getValue(f.k); return Array.isArray(v) ? v.length > 0 : v !== ''; };
  const done = fields.filter(filled).length;
  const pct = fields.length ? Math.round(done / fields.length * 100) : 0;
  $('#progressFill').style.width = pct + '%';
  $('#progressText').textContent = `${pct}% · ${done}/${fields.length}`;
  SECTIONS.forEach(s => { $(`[data-count="${s.id}"]`).textContent = `${s.fields.filter(filled).length}/${s.fields.length}`; });
}
let draftTimer;
function scheduleDraftSave() { clearTimeout(draftTimer); draftTimer = setTimeout(() => LS.set('gs_draft', { ...collect(), __transcript: $('#transcript')?.value || '' }), 400); }
function restoreDraft() { const d = LS.get('gs_draft', null); if (!d) return; Object.entries(d).forEach(([k, v]) => { if (k === '__transcript') { if (v && $('#transcript')) { $('#transcript').value = v; $('#transcriptWrap').hidden = false; updateAnalyzeBtn(); } } else if (k === '__translation') { /* legacy draft field, ignored */ } else setValue(k, v); }); }

/* ------------------------------------------------------------------ */
/* Location: Geolocation API + Google geocoder via backend, OSM fallback  */
/* ------------------------------------------------------------------ */
let lastFix = null; // { lat, lon, acc, alt, time, place }

function getPosition(opts) {
  return new Promise((res, rej) => navigator.geolocation ? navigator.geolocation.getCurrentPosition(res, rej, opts) : rej(new Error('Geolocation not supported')));
}
/* Address lookup: Google's geocoder through the team backend (same data as GPS Map Camera, no key on the phone),
 * falling back to OpenStreetMap's Nominatim when there is no backend or it cannot answer. */
async function reverseGeocode(lat, lon) {
  if (settings.endpoint) { // an older backend answers without a place and we fall through
    try {
      const r = await fetch(settings.endpoint + (settings.endpoint.includes('?') ? '&' : '?') + `action=geocode&lat=${lat}&lon=${lon}`);
      const j = await r.json();
      if (j.ok && j.place && (j.place.village || j.place.district || j.place.postcode)) return j.place;
    } catch { /* fall through to OSM */ }
  }
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1&accept-language=en`;
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('Reverse geocoding failed (' + r.status + ')');
  const j = await r.json(); const a = j.address || {};
  return {
    village: a.village || a.hamlet || a.town || a.suburb || a.neighbourhood || a.city || a.locality || '',
    postcode: a.postcode || '',
    block: a.municipality || a.county || a.city_district || a.subdistrict || '',
    district: a.state_district || a.district || a.county || '',
    state: a.state || a.region || '', country: a.country || '', full_address: j.display_name || '', source: 'osm',
  };
}
function placeLabel(p) { return p ? [p.village, p.block, p.district, p.state, p.postcode].filter(Boolean).join(', ') : ''; }

/* Automatic precise location (like delivery apps): start a high-accuracy watch on open / new record / foreground,
 * keep the best fix, refine until ≤ GOOD_ACC m or the time budget ends, then reverse-geocode. No button needed. */
const GOOD_ACC = 15, LOCATE_BUDGET_MS = 25000;
let watchId = null, watchTimer = null, geocodedAt = null, locating = false;
function distanceM(a, b) { const R = 6371000, toR = x => x * Math.PI / 180; const dLat = toR(b.lat - a.lat), dLon = toR(b.lon - a.lon); const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); }
function applyFix(fix) {
  setValue('latitude', fix.lat.toFixed(6)); setValue('longitude', fix.lon.toFixed(6)); setValue('gps_accuracy_m', Math.round(fix.acc));
  if (fix.alt != null) setValue('altitude_m', Math.round(fix.alt));
}
function stopLocating() { if (watchId != null) { navigator.geolocation.clearWatch(watchId); watchId = null; } clearTimeout(watchTimer); locating = false; $('#locateBtn').disabled = false; }
async function finishLocating() {
  stopLocating();
  const st = $('#locStatus'); if (!lastFix) return;
  const moved = !geocodedAt || distanceM(geocodedAt, lastFix) > 40;
  if (moved && navigator.onLine) {
    setStatus(st, `GPS ±${Math.round(lastFix.acc)} m · looking up address…`, '', true);
    try { lastFix.place = await reverseGeocode(lastFix.lat, lastFix.lon); geocodedAt = { lat: lastFix.lat, lon: lastFix.lon }; Object.entries(lastFix.place).forEach(([k, v]) => setValue(k, v)); }
    catch { /* keep coordinates; address can be retried with Refresh */ }
  } else if (!moved && lastFix.place) Object.entries(lastFix.place).forEach(([k, v]) => { if (!getValue(k)) setValue(k, v); });
  st.className = 'status ok';
  st.innerHTML = `${lastFix.place ? esc(placeLabel(lastFix.place)) + ' · ' : ''}±${Math.round(lastFix.acc)} m${lastFix.acc > GOOD_ACC ? ' (best available)' : ''} · <a href="https://www.google.com/maps?q=${lastFix.lat},${lastFix.lon}" target="_blank" rel="noopener">map</a>${lastFix.place ? ` <span class="dim">· address via ${lastFix.place.source === 'google' ? 'Google' : 'OpenStreetMap'}</span>` : ''}`;
  scheduleDraftSave(); updateProgress();
}
function autoLocate(force = false) {
  if (!navigator.geolocation || !SECTIONS.length) return;
  if (locating) return;
  if (!force && lastFix && Date.now() - lastFix.time < 120000 && lastFix.acc <= GOOD_ACC && getValue('latitude')) return; // fresh & precise already
  const st = $('#locStatus'); locating = true; $('#locateBtn').disabled = true;
  setStatus(st, 'Locating… waiting for GPS', '', true);
  let best = force ? null : lastFix;
  watchId = navigator.geolocation.watchPosition(pos => {
    const { latitude, longitude, accuracy, altitude } = pos.coords;
    const fix = { lat: latitude, lon: longitude, acc: accuracy, alt: altitude, time: Date.now(), place: lastFix?.place || null };
    if (!best || accuracy <= best.acc || Date.now() - best.time > 60000) { best = fix; lastFix = fix; applyFix(fix); }
    setStatus(st, `Locating… ±${Math.round(accuracy)} m${accuracy > GOOD_ACC ? ' — improving' : ''}`, '', true);
    if (accuracy <= GOOD_ACC) finishLocating();
  }, err => {
    if (err.code !== 1 && best) return finishLocating(); // transient GPS hiccup after a fix: keep the best position
    stopLocating();
    setStatus(st, err.code === 1 ? 'Location permission denied — allow location for this site, then tap Refresh.' : (err.code === 3 ? 'GPS timed out — move to open sky and tap Refresh.' : 'Location unavailable — tap Refresh.'), 'err');
  }, { enableHighAccuracy: true, maximumAge: 0, timeout: LOCATE_BUDGET_MS });
  watchTimer = setTimeout(() => { if (locating) { if (lastFix) finishLocating(); else { stopLocating(); setStatus(st, 'No GPS fix yet — move to open sky and tap Refresh.', 'err'); } } }, LOCATE_BUDGET_MS);
}


async function detectLocation(silent = false) { autoLocate(true); return lastFix; }
async function detectLocationLegacy(silent = false) {
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
  if (lastFix && (locating || Date.now() - lastFix.time < 120000)) return lastFix; // reuse the live / fresh fix
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
  updateAnalyzeBtn();
  $$('button[data-ai]').forEach(b => { const n = photos.filter(p => p.section === b.dataset.ai).length + audioClips.filter(c => c.section === b.dataset.ai).length; const bd = $('.tool-badge', b); bd.textContent = n; bd.hidden = !n; b.classList.toggle('ready', n > 0 || (audioClips.length > 0 && !SECTION_BY_ID[b.dataset.ai]?.photoHint)); });
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
/* Voice: record the interview → live speech-to-text (Web Speech API, free, on-device/browser) →       */
/* transcript feeds Analyze & fill. Fallback: MediaRecorder audio → Gemini transcription.                */
/* ------------------------------------------------------------------ */
let recording = false, mediaRec = null, mediaChunks = [], recStart = 0, recTimer = null, recSection = '';
let audioClips = []; // [{ dataUrl, mime, bytes, duration, taken_at, lat, lon }] — evidence, and input for Analyze & fill
function fmtDur(s) { s = Math.round(s || 0); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
function updateAnalyzeBtn() { const t = ($('#transcript')?.value || '').trim(); $('#analyzeBtn').disabled = photos.length === 0 && !t && audioClips.length === 0; }
function renderClips() {
  const host = $('#audioClips'); if (!host) return;
  host.innerHTML = audioClips.map((c, i) => `<div class="clip"><span class="clip-ic">🎙</span><span class="clip-meta">Clip ${i + 1}${c.section && SECTION_BY_ID[c.section] ? ' · ' + esc(SECTION_BY_ID[c.section].title) : ''} · ${fmtDur(c.duration)} · ${fmtBytes(c.bytes)}${c.lat != null ? ' · GPS' : ''}</span><audio controls preload="none" src="${c.dataUrl}"></audio><button type="button" class="link-btn" data-tx="${i}" title="Transcribe this clip only (Analyze & fill also transcribes)">Transcribe</button><button type="button" class="icon-btn" data-clip="${i}" title="Delete clip">✕</button></div>`).join('');
  $$('#audioClips [data-clip]').forEach(b => b.onclick = () => { if (confirm('Delete this recording?')) { audioClips.splice(+b.dataset.clip, 1); renderClips(); updateAnalyzeBtn(); } });
  $$('#audioClips [data-tx]').forEach(b => b.onclick = async () => { if (!settings.geminiKey) { openSettings(); return toast('Add a Gemini API key to transcribe audio', 'err'); } b.disabled = true; try { await transcribeClip(audioClips[+b.dataset.tx]); } finally { b.disabled = false; } });
  host.hidden = !audioClips.length; if (audioClips.length) $('#transcriptWrap').hidden = false;
  updateAnalyzeBtn(); if (typeof renderThumbs === 'function') $$('button[data-ai]').forEach(b => { const n = photos.filter(p => p.section === b.dataset.ai).length + audioClips.filter(c => c.section === b.dataset.ai).length; const bd = $('.tool-badge', b); bd.textContent = n; bd.hidden = !n; b.classList.toggle('ready', n > 0 || (audioClips.length > 0 && !SECTION_BY_ID[b.dataset.ai]?.photoHint)); });
}
function setRecUI(on) {
  const b = $('#recBtn'); b.classList.toggle('recording', on && !recSection); b.querySelector('span').textContent = on && !recSection ? 'Stop' : 'Record';
  $$('button[data-mic]').forEach(m => m.classList.toggle('recording', on && m.dataset.mic === recSection));
  const st = recSection ? $(`[data-status="${recSection}"]`) : $('#recStatus');
  if (on) { if (!recSection) $('#transcriptWrap').hidden = false; recStart = Date.now(); recTimer = setInterval(() => setStatus(st, `● Recording ${fmtDur((Date.now() - recStart) / 1000)} — ${settings.recLang || 'any Indian language'}; ${recSection ? 'tap the mic again to stop and fill this section' : 'press Stop when done'}`, 'err'), 1000); }
  else clearInterval(recTimer);
}
/** Section mic: record → stop → the clip is kept (tagged with the section) and the section is filled automatically. */
async function toggleSectionRecording(section) {
  if (recording) { const same = recSection === section; await stopRecording(); if (!same) toast('Previous recording saved'); return; }
  recSection = section; await startRecording();
  if (!recording) recSection = '';
}
function appendTranscript(text) { const ta = $('#transcript'); const cur = ta.value.replace(/\s+$/, ''); ta.value = (cur ? cur + '\n' : '') + text.trim(); ta.scrollTop = ta.scrollHeight; $('#transcriptWrap').hidden = false; updateAnalyzeBtn(); scheduleDraftSave(); }
async function toggleRecording() { if (recording) await stopRecording(); else await startRecording(); }
async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast('This browser cannot record audio — type the transcript instead', 'err');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find(m => MediaRecorder.isTypeSupported(m)) || '';
    mediaChunks = []; mediaRec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 32000 });
    mediaRec.ondataavailable = e => { if (e.data.size) mediaChunks.push(e.data); };
    mediaRec._stream = stream; mediaRec._start = Date.now(); mediaRec._fix = lastFix; mediaRec._section = recSection;
    mediaRec.start(1000); recording = true; setRecUI(true);
  } catch (e) { toast(e.name === 'NotAllowedError' ? 'Microphone access denied — allow the microphone and try again' : 'Microphone error: ' + e.message, 'err'); }
}
function finishClip() {
  return new Promise(res => {
    if (!mediaRec || mediaRec.state === 'inactive') return res(null);
    const rec = mediaRec; mediaRec = null;
    rec.onstop = () => {
      rec._stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(mediaChunks, { type: rec.mimeType || 'audio/webm' });
      if (blob.size < 1000) return res(null);
      const fr = new FileReader();
      fr.onload = () => { const clip = { dataUrl: fr.result, mime: blob.type.split(';')[0], bytes: blob.size, duration: (Date.now() - rec._start) / 1000, taken_at: new Date(rec._start).toISOString(), lat: rec._fix?.lat ?? null, lon: rec._fix?.lon ?? null, section: rec._section || '' }; audioClips.push(clip); renderClips(); res(clip); };
      fr.readAsDataURL(blob);
    };
    rec.stop();
  });
}
async function stopRecording() {
  recording = false; const section = recSection; setRecUI(false); recSection = '';
  const clip = await finishClip();
  if (section) {
    const st = $(`[data-status="${section}"]`);
    if (!clip) return setStatus(st, 'Nothing was recorded — check the microphone permission and try again', 'err');
    setStatus(st, `Clip saved (${fmtDur(clip.duration)}) — filling this section…`, '', true);
    await analyzePhotos(section, null, { audio: [clip] }); // automatic fill from this recording (+ section photos)
    return;
  }
  setStatus($('#recStatus'), clip ? `Clip ${audioClips.length} saved (${fmtDur(clip.duration)}). Press Analyze & fill — Gemini listens to the recording${photos.length ? ' and looks at the photos' : ''}, transcribes it and fills the form.` : 'Nothing was recorded — check the microphone permission and try again', clip ? 'ok' : 'err');
}
function langHint() { const l = settings.recLang || ''; return (l ? `The interview is primarily in ${l} — treat ${l} as the default language, but auto-detect any switches to English, Hindi or other languages within the speech and transcribe each utterance in the language and script actually spoken` : 'Auto-detect the language of each utterance (an Indian language, Hindi or English, possibly mixed) and transcribe in the language and script actually spoken') + '; keep numbers as digits'; }
const AUDIO_PROMPT = () => `Transcribe this field-interview recording verbatim. ${langHint()}; do not summarise or translate. Return only the transcript text.`;
async function transcribeClip(clip) {
  const st = $('#recStatus');
  setStatus(st, `Transcribing ${fmtDur(clip.duration)} of audio with Gemini…`, '', true);
  try {
    const body = { contents: [{ role: 'user', parts: [{ text: AUDIO_PROMPT() }, { inline_data: { mime_type: clip.mime, data: clip.dataUrl.split(',')[1] } }] }] };
    let d = await geminiCall(settings.model, body); if (d.error) d = await geminiCall(GEMINI_FALLBACK, body); if (d.error) throw new Error(d.error.message);
    const text = d.candidates?.[0]?.content?.parts?.map(x => x.text).join('') || ''; if (!text.trim()) throw new Error('empty transcript (was anything said?)');
    appendTranscript(text); setStatus(st, `Transcribed ${fmtDur(clip.duration)} of audio — review it, then Analyze & fill`, 'ok'); toast('Transcript ready', 'ok');
  } catch (e) { setStatus(st, 'Transcription failed: ' + e.message, 'err'); toast('Transcription failed: ' + e.message, 'err'); }
}

/* ------------------------------------------------------------------ */
/* AI providers: Gemini (native), OpenRouter (OpenAI-style),            */
/* Gemma 4 through the Apps Script backend (key held by the admin),     */
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
/** Backend Gemma: true once the backend reported a configured key, false when it reported none, undefined = not asked yet. */
const backendGemma = () => !!settings.endpoint && settings.backendAI !== false;
/** What "Auto" resolves to for a given set of keys (defaults to the saved settings). */
function autoEngine(s = settings) {
  if (s.geminiKey) return 'gemini';
  if (s.orKey) return 'openrouter';
  if (s.endpoint && s.backendAI) return 'gemma';
  if (chromeAI) return 'chrome';
  return 'gemini';
}
function activeEngine() { return settings.engine !== 'auto' ? settings.engine : autoEngine(); }
function engineReady() {
  const e = activeEngine();
  return e === 'gemini' ? !!settings.geminiKey : e === 'openrouter' ? !!settings.orKey : e === 'gemma' ? backendGemma() : !!chromeAI;
}
function engineLabel(e = activeEngine()) {
  return e === 'gemini' ? `Gemini · ${settings.model}` : e === 'openrouter' ? `OpenRouter · ${settings.orModel}` : e === 'gemma' ? `Gemma 4 via backend · ${settings.gemmaModel}` : 'Chrome built-in AI (no key)';
}
const NO_ENGINE_MSG = 'Set up AI in Settings first: an API key, or a database backend with Gemma 4 enabled';
function updateEngineChip() {
  const chip = $('#engineChip');
  if (chip) { chip.textContent = engineLabel(); chip.className = 'chip ' + (engineReady() ? 'on' : ''); }
  if ($('#settingsDlg')?.open) updateProviderUI();
}
const ENGINE_NAMES = { gemini: 'Gemini', openrouter: 'OpenRouter', gemma: 'Gemma 4', chrome: 'Chrome AI' };
/** Settings dialog: status badge per provider (live from the typed keys) and show only the fields the chosen provider needs. */
function updateProviderUI() {
  const dlg = $('#settingsDlg'); if (!dlg) return;
  const typed = { ...settings, geminiKey: $('#setKey').value.trim(), orKey: $('#setOrKey').value.trim(), endpoint: $('#setEndpoint').value.trim() || TEAM_ENDPOINT };
  const st = {
    gemini: typed.geminiKey ? ['ok', 'key saved'] : ['warn', 'needs key'],
    openrouter: typed.orKey ? ['ok', 'key saved'] : ['warn', 'needs key'],
    gemma: !typed.endpoint ? ['off', 'no database'] : settings.backendAI === false ? ['warn', 'no AI key in Code.gs'] : settings.backendAI ? ['ok', 'ready'] : ['', 'not checked'],
    chrome: chromeAI ? (chromeAI === 'available' ? ['ok', 'ready'] : ['warn', 'needs download']) : ['off', 'not available'],
  };
  const a = autoEngine(typed); st.auto = st[a][0] === 'ok' ? ['ok', '→ ' + ENGINE_NAMES[a]] : ['warn', 'nothing set up yet'];
  $$('.rstat[data-stat]').forEach(el => { const [cls, txt] = st[el.dataset.stat]; el.className = 'rstat ' + cls; el.textContent = txt; });
  const eng = $('input[name="engine"]:checked')?.value || 'auto';
  $$('[data-for]').forEach(el => el.hidden = !el.dataset.for.split(' ').includes(eng));
  updateSettingsStatus();
}
/** The two status tiles at the top of Settings: collection (database) and AI, from the saved state. */
function updateSettingsStatus() {
  const db = $('#stDb'), ai = $('#stAi'); if (!db || !ai) return;
  const pending = getRecords().filter(r => r.status !== 'synced').length;
  let dbCls = 'off', dbTxt = 'Not connected — paste the Web app URL below, scan your team\'s QR or open a project file';
  if (settings.endpoint) {
    const bits = [settings.backendVersion ? `Connected · backend v${settings.backendVersion}` : 'Endpoint set · not tested yet'];
    if (pending) bits.push(`${pending} record${pending === 1 ? '' : 's'} waiting to send`);
    if (dbRowsAt) bits.push(`${dbRows.length} ${dbScope === 'all' ? 'team' : 'of your'} record${dbRows.length === 1 ? '' : 's'} in the database`);
    dbCls = settings.backendVersion ? (pending ? 'warn' : 'ok') : 'warn'; dbTxt = bits.join(' · ');
  }
  db.className = 'stat-tile clickable ' + dbCls; $('#stDbText').textContent = dbTxt + (settings.endpoint ? ' · tap to test' : '');
  const ready = engineReady();
  ai.className = 'stat-tile clickable ' + (ready ? 'ok' : 'warn');
  $('#stAiText').textContent = ready ? `Ready · ${engineLabel()} · tap to test` : 'Not set up — tap to get a free key, or ask your admin to enable Gemma 4 on the backend';
  $('#quickQr').disabled = $('#teamLinkBtn').disabled = !(settings.endpoint || TEAM_ENDPOINT);
}
/** Tile actions: Database → test (or focus the URL field); AI → test when ready, otherwise guide to a key. */
function tileDbAction() {
  if (!$('#setEndpoint').value.trim() && !TEAM_ENDPOINT) { $('#setEndpoint').focus(); $('#setEndpoint').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  $('#testDbBtn').click(); $('#testDbStatus').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function tileAiAction() {
  if (engineReady()) { $('#testAiBtn').click(); $('#testAiStatus').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  const gemmaPossible = !!(settings.endpoint || TEAM_ENDPOINT) && settings.backendAI;
  const pick = gemmaPossible ? 'gemma' : 'gemini';
  $$('input[name="engine"]').forEach(r => r.checked = r.value === pick); updateProviderUI();
  $('#engineRadios').scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (pick === 'gemini') { setTimeout(() => $('#setKey').focus(), 350); window.open('https://aistudio.google.com/app/apikey', '_blank', 'noopener'); }
}

function promptFor(fields, ctx, sectionTitle, transcript = '', nAudio = 0) {
  const cat = fields.filter(f => f.options);
  return `You are an assistant for a field enumerator conducting a household socio-economic survey. You will receive ${nAudio ? `${nAudio} audio recording(s) of the interview${transcript ? ', a transcript' : ''} and possibly ` : transcript ? 'an interview transcript and possibly ' : ''}one or more photos of the same household.${nAudio ? `\nAUDIO: listen to the recording(s) carefully. ${langHint()}. Extract every answer the respondent or enumerator states and map it to the closest allowed value; prefer spoken answers over photos when they conflict. Also return "interview_transcript": a verbatim transcript of the recording(s) in the language and script spoken (no summary).` : ''}
OUTPUT LANGUAGE: every field value, observation and free-text answer you return MUST be in English only (Latin script). Translate answers given in any other language; write personal and place names in Latin transliteration (e.g. "Sita Mondal", "Bowbazar"). The only exception is "interview_transcript", which stays verbatim. They may show: the outside or inside of a dwelling, household members, assets, livestock, farmland, water sources, toilets, kitchens, surroundings, a filled-in paper questionnaire, an ID/ration card, or other documents. Photos may carry a small semi-transparent stamp at the bottom-left with date, coordinates and address — you may use that address for location fields but otherwise ignore it.
${sectionTitle ? `\nFOCUS: fill only the "${sectionTitle}" section fields listed below, based on what these photos show.` : ''}
Rules:
- Use ONLY the allowed values for categorical fields; leave a field null if it cannot be determined.
- If a paper form, ID or document is visible, transcribe its values exactly (names, ages, numbers, phone, village, PIN).
- Infer housing / amenity / asset / land fields from what is visibly present across ALL photos (roof, walls, floor, wires and meters, taps and hand pumps, toilets, stoves and LPG cylinders, appliances, vehicles, solar panels, crops, animals…).
- For multi-select fields return every option you can see. Include "None" only when clearly none of the listed items exist.
- Never guess personal fields (name, age, religion, caste, income, phone) from appearance — only read them from documents.
- ai_observations: 1–3 short sentences on what the photos show and which fields you inferred vs. read.
${ctx ? `\nEnumerator hint: ${ctx}\n` : ''}${transcript ? `\nINTERVIEW TRANSCRIPT (spoken by the enumerator and/or respondent; it may be in any language or mixed languages — extract every answer that is stated, map it to the closest allowed value, and prefer the transcript over photos when they conflict):
<<<
${transcript}
>>>
` : ''}
Fields and allowed values:
${cat.map(f => `- ${f.k}${f.type === 'multi' ? ' (multi-select)' : ''}: ${f.options.join(' | ')}`).join('\n')}
${fields.filter(f => !f.options && f.type !== 'likert').map(f => `- ${f.k}: ${f.type === 'number' ? 'integer' : 'text'}`).join('\n')}
${fields.filter(f => f.type === 'likert').map(f => { const sc = scaleOf(f); return `- ${f.k}: rating 1–${sc.max} (1 = ${sc.lo}, ${sc.max} = ${sc.hi}) for the statement "${f.label}"`; }).join('\n')}
${fields.some(f => f.type === 'likert') ? `Rating statements: give the integer only when the interview (or a filled form in a photo) indicates the respondent's view — map words to the scale (e.g. "strongly agree / very satisfied" = highest, "agree / mostly" = second highest, "neutral / somewhat" = middle, "disagree" = second lowest, "strongly disagree / not at all" = lowest). Never invent ratings.` : ''}
Respond with a single JSON object using these field keys only.`;
}
function geminiSchema(fields, withTranscript = false) {
  const props = {};
  if (withTranscript) props.interview_transcript = { type: 'STRING', nullable: true };
  fields.forEach(f => {
    if (f.type === 'select') props[f.k] = { type: 'STRING', enum: f.options, nullable: true };
    else if (f.type === 'multi') props[f.k] = { type: 'ARRAY', items: { type: 'STRING', enum: f.options }, nullable: true };
    else if (f.type === 'number' || f.type === 'likert') props[f.k] = { type: 'INTEGER', nullable: true };
    else props[f.k] = { type: 'STRING', nullable: true };
  });
  return { type: 'OBJECT', properties: props };
}
function jsonSchema(fields) {
  const props = {};
  fields.forEach(f => {
    if (f.type === 'select') props[f.k] = { type: ['string', 'null'], enum: [...f.options, null] };
    else if (f.type === 'multi') props[f.k] = { type: ['array', 'null'], items: { type: 'string', enum: f.options } };
    else if (f.type === 'number' || f.type === 'likert') props[f.k] = { type: ['integer', 'null'] };
    else props[f.k] = { type: ['string', 'null'] };
  });
  return { type: 'object', properties: props, required: Object.keys(props), additionalProperties: false };
}
function extractJson(text) {
  try { return JSON.parse(text); } catch {}
  const m = String(text).match(/\{[\s\S]*\}/); if (m) return JSON.parse(m[0]);
  throw new Error('Model did not return JSON');
}

const GEMINI_FALLBACK = 'gemini-2.5-flash';
async function geminiCall(model, body) {
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': settings.geminiKey }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok && !j.error) j.error = { message: `HTTP ${r.status}` };
    return j;
  } catch (e) { return { error: { message: 'Network error: ' + e.message } }; }
}
/** Errors that no retry with a simpler request can fix. */
const GEMMA_FATAL = /no AI key|old Code\.gs|Network error|endpoint|from the backend/i;
/** Same request/response shape as geminiCall, but the backend adds the key and forwards it to Google. */
async function gemmaCall(model, body) {
  if (!settings.endpoint) return { error: { message: 'No database endpoint set (Settings)' } };
  try {
    const r = await fetch(settings.endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'ai', model, body }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { error: { message: `HTTP ${r.status} from the backend` } };
    if (!j.version) return { error: { message: 'Backend is older than this app — ' + PASTE_ONCE } };
    noteBackend(j);
    if (j.error === 'AI_NOT_CONFIGURED') { settings.backendAI = false; LS.set('gs_settings', settings); updateEngineChip(); return { error: { message: 'The backend has no AI key yet — the sheet owner pastes a free Google AI Studio key into AI_KEY in Code.gs and runs updateBackend' } }; }
    if (typeof j.error === 'string') return { error: { message: j.error } };
    if (!j.error && settings.backendAI !== true) { settings.backendAI = true; LS.set('gs_settings', settings); updateEngineChip(); }
    return j;
  } catch (e) { return { error: { message: 'Network error: ' + e.message } }; }
}
/** Small text-only round trip to verify the configured provider. */
async function testConnection() {
  const e = activeEngine();
  if (e === 'gemini') { const d = await geminiCall(settings.model, { contents: [{ role: 'user', parts: [{ text: 'Reply with the single word OK.' }] }] }); if (d.error) throw new Error(d.error.message); return `Gemini ${settings.model}: ${d.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'reply received'}`; }
  if (e === 'gemma') { const d = await gemmaCall(settings.gemmaModel, { contents: [{ role: 'user', parts: [{ text: 'Reply with the single word OK.' }] }] }); if (d.error) throw new Error(d.error.message); return `Gemma ${settings.gemmaModel} via backend v${d.version}: ${d.candidates?.[0]?.content?.parts?.map(p => p.text).join('').trim() || 'reply received'}`; }
  if (e === 'openrouter') { const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.orKey}` }, body: JSON.stringify({ model: settings.orModel, messages: [{ role: 'user', content: 'Reply with the single word OK.' }], max_tokens: 5 }) }); const d = await r.json(); if (d.error) throw new Error(d.error.message); return `OpenRouter ${settings.orModel}: ${d.choices?.[0]?.message?.content?.trim() || 'reply received'}`; }
  if (!chromeAI) throw new Error('Chrome built-in AI not available'); return 'Chrome built-in AI available';
}
async function analyzeGemini(fields, list, prompt, onStatus, audio = []) {
  if (!settings.geminiKey) throw new Error('No Gemini API key set (Settings)');
  onStatus(`Analyzing ${list.length ? `${list.length} photo(s)` : ''}${list.length && audio.length ? ' + ' : ''}${audio.length ? `${audio.length} recording(s)` : ''}${!list.length && !audio.length ? 'the transcript' : ''} with ${settings.model}…`);
  const parts = [{ text: prompt }, ...list.map(p => ({ inline_data: { mime_type: 'image/jpeg', data: p.dataUrl.split(',')[1] } })), ...audio.map(c => ({ inline_data: { mime_type: c.mime, data: c.dataUrl.split(',')[1] } }))];
  const body = { contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', responseSchema: geminiSchema(fields, audio.length > 0), temperature: 0.1 } };
  // Minimise reasoning latency: Gemini 3.x takes thinkingLevel, 2.5 takes thinkingBudget
  body.generationConfig.thinkingConfig = /^gemini-3/.test(settings.model) ? { thinkingLevel: 'low' } : { thinkingBudget: 0 };
  // Self-healing attempt chain: as configured → no thinking config → no strict schema → fallback model
  const attempts = [
    { model: settings.model, body },
    { model: settings.model, body: { ...body, generationConfig: { ...body.generationConfig, thinkingConfig: undefined } } },
    { model: settings.model, body: { ...body, generationConfig: { responseMimeType: 'application/json', temperature: 0.1 } } },
    { model: GEMINI_FALLBACK, body: { ...body, generationConfig: { responseMimeType: 'application/json', responseSchema: geminiSchema(fields, audio.length > 0), temperature: 0.1 } } },
  ];
  let lastErr = 'Gemini error';
  for (const a of attempts) {
    if (a.model === GEMINI_FALLBACK && settings.model === GEMINI_FALLBACK) break;
    const data = await geminiCall(a.model, a.body);
    if (data.error) { lastErr = `${data.error.message || data.error.status || 'Gemini error'} (${a.model})`; continue; }
    const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
    if (!text) { lastErr = data.candidates?.[0]?.finishReason ? `Empty response (${data.candidates[0].finishReason})` : 'Empty response'; continue; }
    if (a.model !== settings.model) toast(`Model ${settings.model} failed — used ${a.model} instead`);
    return extractJson(text);
  }
  throw new Error(lastErr);
}
async function analyzeGemma(fields, list, prompt, onStatus) {
  if (!backendGemma()) throw new Error('Gemma 4 needs a database backend with AI enabled (Settings)');
  onStatus(`Analyzing ${list.length ? `${list.length} photo(s)` : 'the transcript'} with ${settings.gemmaModel} on the team backend…`);
  const parts = [{ text: prompt }, ...list.map(p => ({ inline_data: { mime_type: 'image/jpeg', data: p.dataUrl.split(',')[1] } }))];
  const contents = [{ role: 'user', parts }];
  const schema = geminiSchema(fields);
  // Structured output support varies across Gemma releases: strict schema → JSON mode → free text
  const attempts = [
    { contents, generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.1, thinkingConfig: { thinkingLevel: 'minimal' } } },
    { contents, generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.1 } },
    { contents, generationConfig: { responseMimeType: 'application/json', temperature: 0.1 } },
    { contents, generationConfig: { temperature: 0.1 } },
  ];
  let lastErr = 'Gemma error';
  for (const body of attempts) {
    const data = await gemmaCall(settings.gemmaModel, body);
    if (data.error) { lastErr = data.error.message || data.error.status || 'Gemma error'; if (GEMMA_FATAL.test(lastErr)) break; continue; }
    const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
    if (!text) { lastErr = data.candidates?.[0]?.finishReason ? `Empty response (${data.candidates[0].finishReason})` : 'Empty response'; continue; }
    return extractJson(text);
  }
  throw new Error(lastErr);
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
async function analyzePhotos(section = '', list = null, opts = {}) {
  list = list || (section ? photos.filter(p => p.section === section) : photos);
  const transcript = ($('#transcript')?.value || '').trim();
  let audio = opts.audio ? opts.audio.slice() : section ? (audioClips.filter(c => c.section === section).length ? audioClips.filter(c => c.section === section) : audioClips.slice()) : audioClips.slice();
  if (!list.length && !transcript && !audio.length) return toast(section ? 'Capture a photo for this section or record the interview first' : 'Capture a photo or record the interview first');
  const st = section ? $(`[data-status="${section}"]`) : $('#aiStatus');
  const btn = $('#analyzeBtn');
  const engine = activeEngine();
  if (!engineReady()) { openSettings(); return toast(NO_ENGINE_MSG, 'err'); }
  if (audio.length && engine !== 'gemini') { toast('Audio analysis needs Gemini — using the typed transcript only'); audio = []; }
  const budget = 18e6 - list.reduce((s, p) => s + p.bytes, 0); let acc = 0; audio = audio.filter(c => (acc += c.bytes) < budget); // stay under the 20 MB request limit
  const fields = section ? [...SECTION_BY_ID[section].fields.filter(f => f.ai || f.type === 'likert'), ALL_FIELDS.find(f => f.k === 'ai_observations')] : AI_FIELDS;
  const prompt = promptFor(fields, ($('#aiContext')?.value || '').trim(), section ? SECTION_BY_ID[section].title : '', transcript, audio.length);
  btn.disabled = true; $$('.sec-tools').forEach(l => l.classList.add('disabled'));
  const t0 = performance.now();
  const onStatus = m => setStatus(st, m, '', true);
  try {
    const fn = engine === 'gemini' ? analyzeGemini : engine === 'openrouter' ? analyzeOpenRouter : engine === 'gemma' ? analyzeGemma : analyzeChrome;
    const out = await fn(fields, list, prompt, onStatus, audio);
    let n = 0;
    if (out && out.interview_transcript && String(out.interview_transcript).trim()) {
      const ta = $('#transcript'); const text = String(out.interview_transcript).trim();
      if (opts.audio && section) { if (!ta.value.includes(text)) appendTranscript(`[${SECTION_BY_ID[section].title}] ${text}`); ta.dataset.auto = '1'; }
      else if (!ta.value.trim() || ta.dataset.auto === '1') { ta.value = text; ta.dataset.auto = '1'; $('#transcriptWrap').hidden = false; }
    }
    const allowed = new Set(fields.map(f => f.k));
    Object.entries(out || {}).forEach(([k, v]) => {
      if (!allowed.has(k) || v == null || v === '' || (Array.isArray(v) && !v.length)) return;
      if (setValue(k, v, true)) n++;
    });
    lastEngine = engine === 'gemini' ? settings.model : engine === 'openrouter' ? 'openrouter:' + settings.orModel : engine === 'gemma' ? 'backend:' + settings.gemmaModel : 'chrome-builtin';
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    const src = [list.length ? `${list.length} photo(s)` : '', audio.length ? `${audio.length} recording(s)` : '', transcript && !audio.length ? 'the transcript' : ''].filter(Boolean).join(' + ');
    setStatus(st, `${n} field${n === 1 ? '' : 's'} filled in ${secs}s from ${src} — highlighted in yellow, please review.`, 'ok');
    toast(`${n} fields filled in ${secs}s`, 'ok');
    if (section) $(`[data-section="${section}"]`).classList.remove('collapsed'); else $$('.card.collapsed').forEach(c => c.classList.remove('collapsed'));
  } catch (e) {
    setStatus(st, 'AI error: ' + e.message, 'err'); toast('AI error: ' + e.message, 'err');
  } finally {
    updateAnalyzeBtn(); $$('.sec-tools').forEach(l => l.classList.remove('disabled'));
    scheduleDraftSave(); updateProgress();
  }
}

/* ------------------------------------------------------------------ */
/* Submissions: local queue + Apps Script (Sheets + Drive) sync          */
/* ------------------------------------------------------------------ */
function getRecords() { return LS.get('gs_records', []); }
function saveRecords(r) { LS.set('gs_records', r); updatePendingBadge(); if (typeof Analysis !== 'undefined') Analysis.schedule(); }
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
  if (!SECTIONS.length) return toast('Design or load a questionnaire first (Edit)', 'err');
  if (!validate()) return toast('Please fill the required fields (*)', 'err');
  const btn = $('#submitBtn'); btn.disabled = true;
  try {
    const id = crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2);
    const rec = { id, submitted_at: new Date().toISOString(), ...collect(), photo_count: photos.length, photo_thumb: '', photo_urls: '', app_version: APP_VERSION, device_id: settings.deviceId, qid: SCHEMA_META.qid || undefined, interview_transcript: ($('#transcript')?.value || '').trim(), audio_count: audioClips.length, audio_duration_s: Math.round(audioClips.reduce((s, c) => s + c.duration, 0)), audio_urls: '', status: 'pending' };
    if (photos.length || audioClips.length) {
      if (photos.length) { try { rec.photo_thumb = await makeThumb(photos[0].dataUrl); } catch {} }
      await PhotoDB.put(id, photos.map(p => ({ name: p.name, section: p.section, dataUrl: p.dataUrl, taken_at: p.taken_at, lat: p.lat, lon: p.lon, acc: p.acc })), audioClips.map((c, i) => ({ name: `audio_${i + 1}${c.section ? '_' + c.section : ''}.${c.mime.includes('mp4') ? 'm4a' : c.mime.includes('ogg') ? 'ogg' : 'webm'}`, ...c })));
    }
    const records = getRecords(); records.unshift(rec); saveRecords(records);
    clearForm(); lastEngine = '';
    toast('Saved on device — syncing…');
  } finally { btn.disabled = false; }
  await syncPending(false);
}
const DRIVE_HELP = 'Drive is not authorised for the backend. In the Apps Script editor pick the function "authorizeDrive", click Run and allow access. Then retry.';
const friendlyErr = m => /permission to call DriveApp|DRIVE_NOT_AUTHORIZED|drive\.readonly/i.test(String(m)) ? DRIVE_HELP : String(m);
function noteBackend(j) {
  if (!j) return;
  if (j.folderUrl) settings.folderUrl = j.folderUrl;
  if (j.version) settings.backendVersion = j.version;
  if (j.sheet) settings.backendSheet = j.sheet;
  if (typeof j.active === 'string') settings.activeQid = j.active;
  if (Array.isArray(j.questionnaires)) settings.questionnaires = j.questionnaires;
  if (typeof j.rows === 'number') settings.backendRows = j.rows;
  if (Array.isArray(j.sheets)) settings.backendSheets = j.sheets;
  if (typeof j.ai === 'boolean' && j.ai !== settings.backendAI) { settings.backendAI = j.ai; updateEngineChip(); }
  if (j.folderUrl || j.sheet || typeof j.ai === 'boolean') LS.set('gs_settings', settings);
}
/* ---- Backend self-update: the Apps Script fetches the latest Code.gs from GitHub and re-points its own deployment ---- */
const newerVersion = (a, b) => { const x = String(a).split('.'), y = String(b).split('.'); for (let i = 0; i < 3; i++) { const p = +x[i] || 0, q = +y[i] || 0; if (p !== q) return p > q; } return false; };
const PASTE_ONCE = 'this backend is too old to update itself. One last manual step for the sheet owner: paste the latest backend/Code.gs and appsscript.json, switch on the Google Apps Script API at script.google.com/home/usersettings, run "authorizeDrive" once, then Deploy → New version. From then on it updates automatically.';
const UPDATE_HELP = {
  APPS_SCRIPT_API_DISABLED: 'the sheet owner must switch on the Google Apps Script API once at script.google.com/home/usersettings — after that the backend updates itself',
  NOT_AUTHORIZED: 'the sheet owner must paste backend/appsscript.json (Project Settings → show manifest) and run "authorizeDrive" once more in the Apps Script editor to allow self-updates',
  UPDATE_RUNNING: 'an update is already running — try again in a minute',
};
/** Ask the backend to pull the latest release. Resolves to { updated, version, latest, throttled }. */
async function updateBackend(force = false) {
  const r = await fetch(settings.endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'selfUpdate', force }) });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) { if (!j.version) throw new Error(PASTE_ONCE); throw new Error(UPDATE_HELP[j.error] || j.error || `HTTP ${r.status}`); }
  if (j.updated) { settings.backendVersion = j.version; LS.set('gs_settings', settings); }
  return j;
}
/** Update quietly when the backend is behind the app; at most one attempt per session, one explanation per day. */
async function autoUpdateBackend(backendVersion) {
  if (!backendVersion || !newerVersion(APP_VERSION, backendVersion) || sessionStorage.getItem('gs_upd_tried')) return;
  sessionStorage.setItem('gs_upd_tried', '1');
  try { const u = await updateBackend(); if (u.updated) { toast(`Database backend updated itself to v${u.version}`, 'ok'); probeBackend(); } }
  catch (e) { if (Date.now() - (LS.get('gs_upd_note', 0)) > 86400e3) { LS.set('gs_upd_note', Date.now()); toast(`Backend v${backendVersion} is older than the app: ${e.message}`, 'err'); } }
}
/** Verify the database endpoint: backend version, sheet and Drive folder; brings an older backend up to date. */
async function testDatabase() {
  if (!settings.endpoint) throw new Error('No database endpoint set');
  const ping = async () => { const r = await fetch(settings.endpoint + (settings.endpoint.includes('?') ? '&' : '?') + 'action=ping'); const j = await r.json().catch(() => ({})); if (!j.ok) throw new Error(j.error || `HTTP ${r.status}`); return j; };
  let j = await ping();
  if (!j.version) throw new Error('Connected, but ' + PASTE_ONCE);
  let upd = '';
  if (newerVersion(APP_VERSION, j.version)) {
    try { const u = await updateBackend(true); if (u.updated) { upd = ` · updated itself from v${j.version} to v${u.version}`; j = await ping(); } else upd = ` · up to date with GitHub (app v${APP_VERSION})`; }
    catch (e) { upd = ` · not updated: ${e.message}`; }
  }
  noteBackend(j);
  if (j.driveError) throw new Error(`Backend v${j.version} reached, but Drive access failed. ${friendlyErr(j.driveError)}`);
  const ai = j.ai ? ` · Gemma 4 enabled for the team (${j.aiModel})` : typeof j.ai === 'boolean' ? ' · Gemma 4 off (no AI_KEY in Code.gs)' : '';
  return `Backend v${j.version} OK · ${j.rows} rows in the sheet · Drive folder "${j.folderName}" ready${ai}${upd}`;
}
/** Adopt the team questionnaire (the default one, or the one this phone was pinned to), learn whether the backend serves
 *  Gemma 4, and trigger a self-update if it is behind. */
function probeBackend() {
  if (!settings.endpoint || !navigator.onLine) return;
  const pinned = settings.pinnedQid || '';
  const url = settings.endpoint + (settings.endpoint.includes('?') ? '&' : '?') + 'action=schema' + (pinned ? '&q=' + encodeURIComponent(pinned) : '');
  fetch(url).then(r => r.json()).then(j => {
    if (!j.ok) return;
    const wasReady = engineReady();
    noteBackend(j);
    if (!wasReady && engineReady()) toast('Photo auto-fill is ready — Gemma 4 through the team backend', 'ok');
    const local = LS.get('gs_schema', null) || { version: 0 };
    if (pinned && !j.schema) { settings.pinnedQid = ''; LS.set('gs_settings', settings); return probeBackend(); } // pinned questionnaire was deleted → follow the default
    if (j.schema) {
      const switched = (j.schema.qid || '') !== (local.qid || '');
      if (switched || j.schema.version > (local.version || 0)) adoptSchema(j.schema, switched && local.sections?.length ? `Questionnaire changed to "${j.schema.title || 'untitled'}" (team default)` : 'Questionnaire updated to the team version');
    }
    autoUpdateBackend(j.version || '1.14.1'); // schema responses before v1.15.0 carry no version
  }).catch(() => {});
}
async function sendRecord(rec) {
  const { status, error, ...payload } = rec;
  if (settings.uploadPhotos && rec.photo_count) payload.photos = await PhotoDB.get(rec.id);
  if (settings.uploadPhotos && rec.audio_count) payload.audio = await PhotoDB.getAudio(rec.id);
  // text/plain avoids a CORS preflight; Apps Script answers through a redirect that fetch follows.
  const r = await fetch(settings.endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
  noteBackend(j);
  if (!j.version && ((payload.photos || []).length || (payload.audio || []).length)) rec.files_error = 'Files were NOT stored: ' + PASTE_ONCE + ' Then tap "Upload files".';
  else if ((payload.photos || []).length && !j.photo_urls) rec.files_error = 'Backend did not return file links. ' + DRIVE_HELP;
  else if (/ERROR/.test(j.photo_urls || '') || /ERROR/.test(j.audio_urls || '') || /ERROR/.test(j.transcript_url || '')) rec.files_error = friendlyErr([j.photo_urls, j.audio_urls, j.transcript_url].join(' '));
  else delete rec.files_error;
  return j;
}
/** Re-upload a record's photos / audio / transcript to Drive (e.g. after the backend was updated). */
async function attachFiles(rec) {
  const body = { action: 'attach', id: rec.id, photos: await PhotoDB.get(rec.id), audio: await PhotoDB.getAudio(rec.id), interview_transcript: rec.interview_transcript || '' };
  if (!body.photos.length && !body.audio.length && !body.interview_transcript) throw new Error('No files kept on this device for that record');
  const r = await fetch(settings.endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(friendlyErr(j.error) || (j.version ? 'Upload failed' : 'Backend is older than this app — ' + PASTE_ONCE));
  noteBackend(j);
  const bad = [j.photo_urls, j.audio_urls, j.transcript_url].filter(u => /ERROR/.test(u || '')).join(' ');
  if (bad) throw new Error(friendlyErr(bad));
  if (j.photo_urls) rec.photo_urls = j.photo_urls; if (j.audio_urls) rec.audio_urls = j.audio_urls; if (j.transcript_url) rec.transcript_url = j.transcript_url;
  delete rec.files_error; return j;
}
async function uploadMissingFiles() {
  if (!settings.endpoint) return toast('Set the database endpoint in Settings first', 'err');
  const records = getRecords(); const todo = records.filter(r => r.status === 'synced' && filesMissing(r));
  if (!todo.length) return toast('All files of synced records are already in Drive', 'ok');
  let ok = 0, fail = 0;
  let lastErr = '';
  for (const rec of todo) { try { await attachFiles(rec); ok++; } catch (e) { rec.files_error = e.message; lastErr = e.message; fail++; saveRecords(records); if (e.message === DRIVE_HELP) break; } saveRecords(records); }
  if (ok) { try { await refreshDbRows(); await pruneSynced(); } catch {} }
  renderLocalTable();
  if (ok) toast(`${ok} record(s): files uploaded to Drive`, 'ok'); if (fail) toast(lastErr === DRIVE_HELP ? DRIVE_HELP : `${fail} record(s) failed — see the Records table`, 'err');
}
const filesMissing = r => ((r.photo_count > 0 && !(r.photo_urls || '').includes('drive.google.com')) || (r.audio_count > 0 && !(r.audio_urls || '').includes('drive.google.com')) || (r.interview_transcript && !(r.transcript_url || '').includes('drive.google.com')));
let syncing = false;
/** Send this device's pending records, drop the local copies once they (and their files) are in the database, then re-read the
 *  database: this phone's own rows, or every row when a team key is present (all = ask for the key if missing). */
async function syncPending(manual = true, all = false) {
  if (syncing) return;
  const records = getRecords(); const pending = records.filter(r => r.status !== 'synced');
  if (!settings.endpoint) { renderLocalTable(); if (pending.length || manual) toast(pending.length ? `${pending.length} record(s) kept on device — set a database endpoint in Settings to sync.` : 'Set a database endpoint in Settings first'); return; }
  if (!navigator.onLine) { renderLocalTable(); if (manual) toast('Offline — will sync when the connection returns.'); return; }
  if (all && !adminToken() && !askTeamKey()) return;
  // Automatic runs (after Submit, on reconnect) re-read the database at most every 10 minutes when nothing was sent
  const wantList = manual || pending.length > 0 || Date.now() - dbRowsAt > 600000;
  if (!pending.length && !wantList) { renderLocalTable(); return; }
  syncing = true; $('#syncBtn').disabled = true; $('#syncAllBtn').disabled = true;
  let ok = 0, fail = 0;
  for (const rec of pending) {
    try { const j = await sendRecord(rec); rec.status = 'synced'; delete rec.error; if (j.photo_urls) rec.photo_urls = j.photo_urls; if (j.audio_urls) rec.audio_urls = j.audio_urls; if (j.transcript_url) rec.transcript_url = j.transcript_url; ok++; }
    catch (e) { rec.status = 'failed'; rec.error = e.message; fail++; }
    saveRecords(records);
  }
  if (ok) toast(`${ok} record(s) synced to the database`, 'ok');
  if (fail) toast(`${fail} record(s) failed to sync — check endpoint / connection`, 'err');
  if (wantList) {
    try {
      const n = await refreshDbRows();
      await pruneSynced();
      if (manual) toast(dbScope === 'all' ? `${n} record(s) in the team database` : `${n} of your record(s) in the database`, 'ok');
    } catch (e) { if (manual) toast('Could not read the database: ' + e.message, 'err'); }
  }
  syncing = false; $('#syncBtn').disabled = false; $('#syncAllBtn').disabled = false; renderLocalTable();
}
/** Local copies are only a queue: once a record and its files are in the database it is deleted from the phone. */
async function pruneSynced() {
  const records = getRecords(); const inDb = new Set(dbRows.map(r => String(r.id)));
  const drop = records.filter(r => r.status === 'synced' && inDb.has(String(r.id)) && !filesMissing(r));
  if (!drop.length) return 0;
  for (const r of drop) await PhotoDB.del(r.id).catch(() => {});
  saveRecords(records.filter(r => !drop.includes(r)));
  return drop.length;
}

/* Rows read straight from the Google Sheet: this phone's own rows (by device id, no key) or every row (team key), cached in IndexedDB. */
let dbRows = [], dbRowsAt = 0, dbScope = 'mine';
const DB_CACHE_KEY = '__team_rows';
/** Ask for the team key once and keep it in Settings. Returns false when the user cancels. */
function askTeamKey(why = 'It unlocks the records of the whole team on this phone') {
  const k = prompt(`Team key (set as ADMIN_TOKEN in the Apps Script; the default is "GeoSurvey"). ${why}:`, settings.adminKey || '');
  if (k === null) return false;
  const key = k.trim();
  if (key !== settings.adminKey) { settings.adminKey = key; settings.adminKeyOk = false; LS.set('gs_settings', settings); }
  return !!key;
}
/** Confirm the stored key with the backend (cheap list call). Remembers a success so later checks work offline. */
async function verifyTeamKey() {
  if (settings.adminKeyOk) return true;
  if (!navigator.onLine) { toast('Go online once so the team key can be checked', 'err'); return false; }
  const q = new URLSearchParams({ action: 'list', limit: 1, token: adminToken() });
  const r = await fetch(settings.endpoint + (settings.endpoint.includes('?') ? '&' : '?') + q).catch(() => null);
  const j = r ? await r.json().catch(() => ({})) : {};
  if (j.ok) { settings.adminKeyOk = true; LS.set('gs_settings', settings); return true; }
  if (j.error === 'Invalid admin token') { settings.adminKey = ''; settings.adminKeyOk = false; LS.set('gs_settings', settings); sessionStorage.removeItem('gs_admin'); toast('Team key not accepted — ask your admin for the key set in Code.gs (ADMIN_TOKEN)', 'err'); }
  else toast('Could not check the team key: ' + (j.error || 'no answer from the backend'), 'err');
  return false;
}
/** Editing the questionnaire is reserved for whoever holds the team key, as soon as a database is connected. */
async function requireAdmin(why) {
  if (!settings.endpoint) return true; // device-only use: nothing shared to protect
  if (!adminToken() && !askTeamKey(why)) return false;
  return verifyTeamKey();
}
async function loadDbCache() {
  try { const c = await PhotoDB.getKV(DB_CACHE_KEY); if (c && c.endpoint === settings.endpoint) { dbRows = c.rows || []; dbRowsAt = c.at || 0; dbScope = c.scope || 'all'; } } catch {}
}
async function refreshDbRows() {
  if (!settings.endpoint) throw new Error('No database endpoint configured (Settings)');
  const scope = adminToken() ? 'all' : 'mine';
  const q = new URLSearchParams({ action: 'list', limit: 5000 }); if (scope === 'all') q.set('token', adminToken()); else q.set('device', settings.deviceId);
  if (SCHEMA_META.qid) q.set('q', SCHEMA_META.qid); // this phone's questionnaire has its own response tab
  const r = await fetch(settings.endpoint + (settings.endpoint.includes('?') ? '&' : '?') + q);
  const j = await r.json().catch(() => ({}));
  if (!j.ok) {
    if (j.error === 'Invalid admin token') { settings.adminKey = ''; settings.adminKeyOk = false; LS.set('gs_settings', settings); sessionStorage.removeItem('gs_admin'); throw new Error('team key not accepted — ask your admin for the key set in Code.gs (ADMIN_TOKEN)'); }
    if (!j.version) throw new Error('Backend is older than this app — ' + PASTE_ONCE);
    throw new Error(j.error || `HTTP ${r.status}`);
  }
  dbRows = j.rows || []; dbRowsAt = Date.now(); dbScope = scope;
  if (scope === 'all' && !settings.adminKeyOk) { settings.adminKeyOk = true; LS.set('gs_settings', settings); }
  PhotoDB.putKV(DB_CACHE_KEY, { rows: dbRows, at: dbRowsAt, scope, endpoint: settings.endpoint }).catch(() => {});
  if (typeof Analysis !== 'undefined') Analysis.schedule();
  return dbRows.length;
}
/** Pending / failed records still on this phone first, then what the database holds. */
function allRecords() {
  const local = getRecords(); const seen = new Set(local.map(r => r.id));
  return [...local, ...dbRows.filter(r => r.id && !seen.has(String(r.id))).map(r => ({ ...r, status: 'database' }))];
}
/** What the Analysis tab treats as the cloud dataset: the admin listing when connected, else the database rows. */
function cloudRows() { return adminRows.length ? adminRows : dbRows; }

const TABLE_COLS = ['submitted_at', 'head_name', 'village', 'district', 'postcode', 'house_type', 'monthly_income', 'household_size', 'latitude', 'longitude', 'surveyor'];
function renderLocalTable() {
  const local = getRecords(); const records = allRecords();
  const waiting = local.filter(r => r.status !== 'synced').length; const kept = local.length - waiting;
  const parts = [];
  if (waiting) parts.push(`${waiting} waiting on this phone to be sent`);
  if (kept) parts.push(`${kept} sent but files not yet in Drive (kept on the phone until "Upload files" succeeds)`);
  if (dbRowsAt) parts.push(`${dbRows.length} ${dbScope === 'all' ? 'record(s) of the whole team' : 'of your record(s)'} in the database${settings.backendSheet ? ` (sheet "${settings.backendSheet}")` : ''}, as of ${fmtDate(new Date(dbRowsAt).toISOString())}${dbScope === 'mine' ? ' — Sync all shows everyone\'s with the team key' : ''}`);
  else if (settings.endpoint) parts.push('press Sync to read your records from the database' + (adminToken() ? '' : '; Sync all shows the whole team\'s with the team key'));
  $('#localSummary').textContent = parts.length ? parts.join(' · ') + '.' : 'No submissions on this device yet.';
  const link = $('#driveFolderLink'); if (link) { link.hidden = !settings.folderUrl; link.href = settings.folderUrl || '#'; }
  const driveLinks = r => `${String(r.photo_urls || '').split(/\s+/).filter(u => u.includes('drive')).map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener" title="Photo ${i + 1}">📷</a>`).join('')}${String(r.audio_urls || '').split(/\s+/).filter(u => u.includes('drive')).map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener" title="Audio ${i + 1}">🎙</a>`).join('')}${(r.transcript_url || '').includes('drive') ? `<a href="${esc(r.transcript_url)}" target="_blank" rel="noopener" title="Transcript">📝</a>` : ''}`;
  const filesCell = r => {
    if (r.status === 'database') return driveLinks(r) || '<span class="dim">—</span>';
    if (!(r.photo_count || r.audio_count || r.interview_transcript)) return '<span class="dim">—</span>';
    if (r.status !== 'synced') return '<span class="pill pending">on device</span>';
    if (filesMissing(r)) return `<span class="pill failed" title="${esc(r.files_error || 'Files were not stored in Drive')}">not in Drive</span> <button class="link-btn" data-attach="${r.id}">Upload files</button>${r.files_error === DRIVE_HELP ? '<div class="dim" style="white-space:normal;max-width:320px;font-size:11.5px">Drive not authorised: run <code>authorizeDrive</code> in Apps Script, then Upload files.</div>' : ''}`;
    return `<span class="pill synced">in Drive</span> ${driveLinks(r)}`;
  };
  const row = r => r.status === 'database'
    ? `<tr class="team"><td><span class="pill database" title="Stored in the Google Sheet">database</span></td><td>${+r.photo_count ? `<span class="dim">${r.photo_count} 📷</span>` : ''}</td><td>${filesCell(r)}</td>${TABLE_COLS.map(c => `<td title="${esc(r[c])}">${esc(c === 'submitted_at' ? fmtDate(r[c]) : r[c])}</td>`).join('')}<td></td></tr>`
    : `<tr><td><span class="pill ${r.status}" title="${esc(r.error || '')}">${r.status}</span></td><td>${r.photo_thumb ? `<img class="mini" src="${r.photo_thumb}" data-view="${r.id}" title="${r.photo_count} photo(s)">` : ''}${r.audio_count ? `<button class="link-btn" data-audio="${r.id}" title="${r.audio_count} audio clip(s), ${fmtDur(r.audio_duration_s)}">🎙 ${fmtDur(r.audio_duration_s)}</button>` : ''}${r.interview_transcript ? `<button class="link-btn" data-audio="${r.id}" title="Interview transcript">📝</button>` : ''}</td><td>${filesCell(r)}</td>${TABLE_COLS.map(c => `<td title="${esc(r[c])}">${esc(c === 'submitted_at' ? fmtDate(r[c]) : r[c])}</td>`).join('')}<td class="btn-row">${r.photo_count || r.audio_count || r.interview_transcript ? `<button class="link-btn" data-dl="${r.id}">files</button>` : ''}<button class="link-btn danger" data-del="${r.id}">delete</button></td></tr>`;
  $('#localTable').innerHTML = records.length ? `<thead><tr><th>Status</th><th>Photo</th><th>Files in Drive</th>${TABLE_COLS.map(c => `<th>${c}</th>`).join('')}<th></th></tr></thead><tbody>${records.map(row).join('')}</tbody>` : '';
  $$('#localTable [data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('Delete this record (and its photos) from the device?')) return;
    await PhotoDB.del(b.dataset.del); saveRecords(getRecords().filter(r => r.id !== b.dataset.del)); renderLocalTable();
  });
  $$('#localTable [data-view]').forEach(i => i.onclick = async () => openGallery('Stamped photos', await PhotoDB.get(i.dataset.view)));
  $$('#localTable [data-attach]').forEach(b => b.onclick = async () => { b.disabled = true; const records = getRecords(); const rec = records.find(x => x.id === b.dataset.attach); let done = false; try { await attachFiles(rec); done = true; toast('Files uploaded to Drive', 'ok'); } catch (e) { rec.files_error = e.message; toast(e.message, 'err'); } saveRecords(records); if (done) { try { await refreshDbRows(); await pruneSynced(); } catch {} } renderLocalTable(); });
  $$('#localTable [data-audio]').forEach(b => b.onclick = async () => {
    const clips = await PhotoDB.getAudio(b.dataset.audio); const rec = getRecords().find(x => x.id === b.dataset.audio);
    $('#photoDlgTitle').textContent = 'Interview recording & transcript';
    $('#photoDlgGallery').innerHTML = (clips.map((c, i) => `<figure class="audio-fig"><audio controls src="${c.dataUrl}"></audio><figcaption>Clip ${i + 1} · ${fmtDur(c.duration)} · ${fmtDate(c.taken_at)}${c.lat != null ? ` · ${(+c.lat).toFixed(5)}, ${(+c.lon).toFixed(5)}` : ''}</figcaption></figure>`).join('') + (rec?.interview_transcript ? `<div class="transcript-view"><div class="dim">Transcript (verbatim, as recorded)</div><p>${esc(rec.interview_transcript)}</p></div>` : '')) || '<p class="dim">No recording or transcript stored.</p>';
    $('#photoDlg').showModal();
  });
  $$('#localTable [data-dl]').forEach(b => b.onclick = async () => {
    for (const p of await PhotoDB.get(b.dataset.dl)) { download(`${b.dataset.dl.slice(0, 8)}_${p.name}`, await (await fetch(p.dataUrl)).blob()); await new Promise(r => setTimeout(r, 300)); }
    for (const c of await PhotoDB.getAudio(b.dataset.dl)) { download(`${b.dataset.dl.slice(0, 8)}_${c.name || 'audio.webm'}`, await (await fetch(c.dataUrl)).blob()); await new Promise(r => setTimeout(r, 300)); }
    const rec = getRecords().find(x => x.id === b.dataset.dl); if (rec?.interview_transcript) download(`${b.dataset.dl.slice(0, 8)}_transcript.txt`, rec.interview_transcript, 'text/plain;charset=utf-8');
  });
  updatePendingBadge();
}

/* ------------------------------------------------------------------ */
/* Admin panel (token-protected, served by the Apps Script backend)     */
/* ------------------------------------------------------------------ */
let adminRows = [];
function adminToken() { return sessionStorage.getItem('gs_admin') || settings.adminKey || ''; }
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
const appUrl = () => location.origin + location.pathname;
/** Publish a questionnaire: update an existing one (opts.qid) or create a new one with its own response tab (no qid).
 *  opts: { qid, sheetMode, sheetName, setActive }. The backend also writes <title>.geosurvey into the Drive folder. */
async function publishSchema(schema, opts = {}) {
  const r = await adminPost({ action: 'setSchema', schema, qid: opts.qid || '', setActive: !!opts.setActive, appUrl: appUrl(), endpoint: settings.endpoint, sheetMode: opts.sheetMode || 'current', sheetName: opts.sheetName || '' });
  noteBackend(r);
  if (r.qid) { schema.qid = r.qid; schema.sheet = r.sheet; }
  if (r.sheet !== SCHEMA_META.sheet) resetDbCache();
  return r;
}
function resetDbCache() { dbRows = []; dbRowsAt = 0; dbScope = 'mine'; PhotoDB.putKV(DB_CACHE_KEY, { rows: [], at: 0, scope: 'mine', endpoint: settings.endpoint }).catch(() => {}); }
async function setDefaultQuestionnaire(qid) { const r = await adminPost({ action: 'setActive', qid }); noteBackend(r); return r; }
async function deleteQuestionnaire(qid, deleteSheet) { const r = await adminPost({ action: 'deleteQuestionnaire', qid, deleteSheet: !!deleteSheet }); noteBackend(r); return r; }
async function fetchQuestionnaire(qid) {
  const r = await fetch(settings.endpoint + (settings.endpoint.includes('?') ? '&' : '?') + 'action=schema&q=' + encodeURIComponent(qid));
  const j = await r.json(); if (!j.ok || !j.schema) throw new Error('Questionnaire not found on the backend'); noteBackend(j); return j.schema;
}
/** Rows currently in a questionnaire's response tab (from the last ping), or null when unknown. */
function rowsInSheet(sheet) { const t = (settings.backendSheets || []).find(x => x.name === sheet); return t ? t.rows : null; }
/** Ask the admin where responses for an updated questionnaire should go. Resolves { sheetMode, sheetName } or null (cancelled). */
function chooseResponseSheet(entry) {
  return new Promise(resolve => {
    const dlg = $('#sheetDlg'), cur = (entry && entry.sheet) || settings.backendSheet || 'Responses', n = rowsInSheet(cur);
    $('#sheetDlgSub').textContent = `"${(entry && entry.title) || FORM_META.title}" currently collects into the sheet "${cur}"${n != null ? ` (${n} record${n === 1 ? '' : 's'})` : ''}. You are publishing a new version of it.`;
    $$('input[name="sheetMode"]').forEach(r => r.checked = r.value === 'current');
    $('#sheetName').value = `Responses ${new Date().toISOString().slice(0, 10)}`; $('#sheetNameWrap').hidden = true;
    const onChange = () => { $('#sheetNameWrap').hidden = $('input[name="sheetMode"]:checked')?.value !== 'new'; };
    $$('input[name="sheetMode"]').forEach(r => r.onchange = onChange);
    const done = () => { dlg.removeEventListener('close', done); if (dlg.returnValue !== 'ok') return resolve(null); const mode = $('input[name="sheetMode"]:checked')?.value || 'current'; resolve({ sheetMode: mode, sheetName: mode === 'new' ? $('#sheetName').value.trim() : '' }); };
    dlg.addEventListener('close', done); $('#sheetCancel').onclick = () => dlg.close('cancel');
    dlg.returnValue = ''; dlg.showModal();
  });
}
/** Back the questionnaire up to Drive without publishing it (needs the team key; silent when unavailable). */
async function backupProject(schema) {
  if (!settings.endpoint || !adminToken() || !navigator.onLine) return null;
  try { return await adminPost({ action: 'saveProject', schema, appUrl: appUrl(), endpoint: settings.endpoint }); } catch { return null; }
}
/** Explicit "Save project to Drive": asks for the key if needed and reports the outcome. */
async function saveProjectToDrive(schema = currentSchema()) {
  if (!SECTIONS.length) return toast('No questionnaire yet — choose or design one first');
  if (!settings.endpoint) return toast('Connect a database first (Settings → Database endpoint)', 'err');
  if (!navigator.onLine) return toast('Offline — the Drive copy needs a connection; use Download instead', 'err');
  if (!await requireAdmin('Saving the project file to Drive needs it')) return;
  try {
    const r = await adminPost({ action: 'saveProject', schema, appUrl: appUrl(), endpoint: settings.endpoint });
    if (!r.projectUrl || /^ERROR/.test(r.projectUrl)) throw new Error(r.projectUrl || 'no file link returned');
    toast(`Project file saved to the Drive folder as ${projectFileName(schema.title || FORM_META.title)}`, 'ok');
  } catch (e) { toast('Could not save to Drive: ' + (/Unknown action/i.test(e.message) ? 'the backend is older than v1.16.0 — Settings → Test database updates it' : e.message), 'err'); }
}
async function adminConnect() {
  const st = $('#adminStatus');
  sessionStorage.setItem('gs_admin', $('#adminToken').value.trim() || adminToken());
  setStatus(st, 'Connecting…', '', true);
  try { await adminLoad(); $('#adminLogin').hidden = true; $('#adminPanel').hidden = false; setStatus(st, ''); if (!settings.adminKeyOk) { settings.adminKeyOk = true; LS.set('gs_settings', settings); } }
  catch (e) {
    setStatus(st, e.message, 'err'); sessionStorage.removeItem('gs_admin');
    if (/Invalid admin token/i.test(e.message)) { settings.adminKey = ''; settings.adminKeyOk = false; LS.set('gs_settings', settings); } // the key changed on the backend
  }
}
let adminSheetSel = ''; // '' = the active response tab
async function adminLoad() {
  // Response tabs (a questionnaire update may have started a new one): let the admin pick which to view
  try { const p = await adminFetch({ action: 'ping' }); noteBackend(p); } catch {}
  const sel = $('#adminSheet'), tabs = settings.backendSheets || [];
  sel.hidden = tabs.length < 2;
  if (tabs.length) { sel.innerHTML = tabs.map(t => `<option value="${esc(t.name)}">${esc(t.name)} (${t.rows})${t.name === settings.backendSheet ? ' · active' : ''}</option>`).join(''); sel.value = adminSheetSel || settings.backendSheet || tabs[0].name; }
  const j = await adminFetch({ action: 'list', limit: 5000, ...(adminSheetSel ? { sheet: adminSheetSel } : {}) });
  adminRows = j.rows || [];
  const link = $('#adminSheetLink'); if (j.sheetUrl) { link.href = j.sheetUrl; link.hidden = false; }
  renderAdmin(); if (typeof Analysis !== 'undefined') Analysis.schedule();
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
  $$('input[name="engine"]').forEach(r => r.checked = r.value === settings.engine); $('#setKey').value = settings.geminiKey;
  $('#setOrKey').value = settings.orKey; $('#setOrModel').value = settings.orModel; $('#setGemmaModel').value = settings.gemmaModel;
  const known = KNOWN_MODELS.includes(settings.model);
  $('#setModel').value = known ? settings.model : 'custom'; $('#setModelCustom').hidden = known; $('#setModelCustom').value = known ? '' : settings.model;
  $('#setEndpoint').value = settings.endpoint; $('#setTeamKey').value = settings.adminKey || ''; $('#setSurveyor').value = settings.surveyor;
  $$('input[name="maxdim"]').forEach(r => r.checked = +r.value === +settings.maxDim); $('#setRecLang').value = settings.recLang || ''; $('#setStamp').checked = settings.stamp; $('#setUploadPhotos').checked = settings.uploadPhotos; $('#setSampleTools').checked = settings.sampleTools;
  $('#setVersion').textContent = 'v' + APP_VERSION + (settings.backendVersion ? ` · backend v${settings.backendVersion}` : '');
  $$('.pw input').forEach(i => { i.type = 'password'; i.nextElementSibling.textContent = '👁'; });
  setStatus($('#testAiStatus'), ''); setStatus($('#testDbStatus'), '');
  updateEndpointHint(); updateProviderUI();
  $('#settingsDlg').returnValue = ''; // Escape keeps the previous value otherwise, which could re-save
  $('#settingsDlg').showModal(); $('.set-body').scrollTop = 0;
}
function updateEndpointHint() {
  const typed = $('#setEndpoint').value.trim(); const h = $('#endpointHint');
  const msg = TEAM_ENDPOINT && (!typed || typed === TEAM_ENDPOINT) ? 'Pre-set by your team — nothing to do here. Type another URL only to use a different database.'
    : TEAM_ENDPOINT ? 'Your own URL overrides the team database built into the app; clear the box to go back to it.'
    : typed && typed === settings.endpoint && settings.endpointSource === 'link' ? 'Set from the team link.' : '';
  h.textContent = msg; h.hidden = !msg;
  $('#teamLinkBtn').disabled = $('#quickQr').disabled = !(typed || TEAM_ENDPOINT);
}
function saveSettings(quiet = false) {
  const modelSel = $('#setModel').value; const prev = settings;
  const typed = $('#setEndpoint').value.trim(); const endpoint = typed || TEAM_ENDPOINT;
  settings = {
    engine: $('input[name="engine"]:checked')?.value || 'auto', geminiKey: $('#setKey').value.trim(),
    model: modelSel === 'custom' ? ($('#setModelCustom').value.trim() || DEFAULT_SETTINGS.model) : modelSel,
    orKey: $('#setOrKey').value.trim(), orModel: $('#setOrModel').value.trim() || DEFAULT_SETTINGS.orModel,
    gemmaModel: $('#setGemmaModel').value || DEFAULT_SETTINGS.gemmaModel,
    endpoint, endpointSource: !endpoint ? '' : endpoint === prev.endpoint ? prev.endpointSource : endpoint === TEAM_ENDPOINT ? 'team' : 'user',
    adminKey: $('#setTeamKey').value.trim(), surveyor: $('#setSurveyor').value.trim(),
    maxDim: +($('input[name="maxdim"]:checked')?.value || DEFAULT_SETTINGS.maxDim), recLang: $('#setRecLang').value, stamp: $('#setStamp').checked, uploadPhotos: $('#setUploadPhotos').checked, sampleTools: $('#setSampleTools').checked,
    folderUrl: endpoint === prev.endpoint ? prev.folderUrl || '' : '',
  };
  // What we know about the backend only holds while the endpoint is unchanged
  if (settings.endpoint === prev.endpoint) { settings.backendAI = prev.backendAI; settings.backendVersion = prev.backendVersion; settings.backendSheet = prev.backendSheet; settings.backendRows = prev.backendRows; settings.backendSheets = prev.backendSheets; }
  settings.deviceId = prev.deviceId; settings.adminKeyOk = settings.endpoint === prev.endpoint && settings.adminKey === prev.adminKey ? prev.adminKeyOk : false;
  if (quiet) return; // dry run for the connection test
  LS.set('gs_settings', settings);
  if (!getValue('surveyor') && settings.surveyor) setValue('surveyor', settings.surveyor);
  if (settings.endpoint !== prev.endpoint) probeBackend();
  updateEngineChip(); toast('Settings saved', 'ok');
  if (typeof Analysis !== 'undefined') Analysis.schedule();
}

/* ------------------------------------------------------------------ */
/* Init                                                                 */
/* ------------------------------------------------------------------ */
function showView(id) {
  $$('.view').forEach(v => v.hidden = v.id !== id);
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === id));
  $('#actionBar').hidden = id !== 'formView';
  $('#pdfBtn').hidden = id !== 'formView';
  $('#editBtn').classList.toggle('active', id === 'editView');
  if (id === 'responsesView') { renderLocalTable(); if (settings.endpoint && navigator.onLine && !syncing && Date.now() - dbRowsAt > 60000) refreshDbRows().then(pruneSynced).then(renderLocalTable).catch(() => {}); }
  if (id === 'analysisView' && typeof Analysis !== 'undefined') Analysis.open();
  if (id === 'editView') { if (typeof Designer !== 'undefined') Designer.open(); if (adminToken() && $('#adminPanel').hidden) adminConnect(); }
}
function init() {
  renderForm();
  setValue('survey_date', new Date().toISOString().slice(0, 10));
  if (settings.surveyor) setValue('surveyor', settings.surveyor);
  resolveEndpoint();
  restoreDraft(); updateProgress(); updatePendingBadge(); updateEngineChip(); detectChromeAI();
  loadDbCache().then(() => { if (!$('#responsesView').hidden) renderLocalTable(); if (typeof Analysis !== 'undefined' && dbRows.length) Analysis.schedule(); });
  autoLocate();
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('#formView').hidden && (!lastFix || Date.now() - lastFix.time > 300000)) autoLocate(); });

  $$('.tab').forEach(t => t.onclick = () => showView(t.dataset.view));
  const EDIT_WHY = 'Only the admin edits the questionnaire';
  $('#editBtn').onclick = async () => { if (await requireAdmin(EDIT_WHY)) showView('editView'); };
  $('#obDesign').onclick = async () => { if (!await requireAdmin(EDIT_WHY)) return; showView('editView'); if (typeof Designer !== 'undefined') Designer.startBlank(); };
  $('#obSample').onclick = async () => { if (await requireAdmin(EDIT_WHY)) useSampleQuestionnaire(); };
  $('#obUpload').onclick = async () => { if (!await requireAdmin(EDIT_WHY)) return; showView('editView'); $('#designerFile').click(); };
  $('#obAi').onclick = async () => { if (!await requireAdmin(EDIT_WHY)) return; showView('editView'); if (typeof Designer !== 'undefined') Designer.aiDesignOpen(); };
  $('#projectInput').onchange = e => { if (e.target.files[0]) openProjectFile(e.target.files[0]); e.target.value = ''; };
  $('#projectDlBtn').onclick = e => { e.preventDefault(); if (!SECTIONS.length) return toast('No questionnaire yet — choose or design one first'); downloadProject(); };
  $('#projectDriveBtn').onclick = e => { e.preventDefault(); saveProjectToDrive(); };
  probeBackend();
  $('#settingsBtn').onclick = openSettings;
  $('#setModel').onchange = e => { $('#setModelCustom').hidden = e.target.value !== 'custom'; };
  $('#testAiBtn').onclick = async e => {
    e.preventDefault(); const st = $('#testAiStatus'); const saved = settings;
    saveSettings(true); setStatus(st, 'Testing…', '', true);
    try { setStatus(st, await testConnection(), 'ok'); } catch (err) { setStatus(st, 'Failed: ' + err.message, 'err'); }
    finally { if (settings.endpoint === saved.endpoint) { saved.backendAI = settings.backendAI; saved.backendVersion = settings.backendVersion; saved.backendSheet = settings.backendSheet; saved.backendRows = settings.backendRows; saved.backendSheets = settings.backendSheets; } settings = saved; LS.set('gs_settings', saved); updateEngineChip(); }
  };
  $('#settingsDlg').addEventListener('close', () => { if ($('#settingsDlg').returnValue === 'save') saveSettings(); });
  $('#cancelSettingsBtn').onclick = $('#closeSettingsX').onclick = () => $('#settingsDlg').close('cancel');
  $$('input[name="engine"]').forEach(r => r.onchange = updateProviderUI);
  ['setKey', 'setOrKey', 'setEndpoint'].forEach(id => $('#' + id).addEventListener('input', updateProviderUI));
  $$('.pw .eye').forEach(b => b.onclick = () => { const i = b.previousElementSibling; i.type = i.type === 'password' ? 'text' : 'password'; b.textContent = i.type === 'password' ? '👁' : '🙈'; });
  $('#chromeDlBtn').onclick = async () => {
    const st = $('#chromeDlStatus'), btn = $('#chromeDlBtn');
    if (!('LanguageModel' in self)) return setStatus(st, 'Not available in this browser — needs recent desktop Chrome with the Prompt API', 'err');
    btn.disabled = true; setStatus(st, 'Checking…', '', true);
    try {
      const a = await LanguageModel.availability({ expectedInputs: [{ type: 'image' }, { type: 'text' }] });
      if (a === 'unavailable') throw new Error('this Chrome cannot run the model (needs desktop Chrome, ~22 GB free disk and a capable GPU)');
      chromeSession = await LanguageModel.create({ expectedInputs: [{ type: 'image' }, { type: 'text' }], monitor(m) { m.addEventListener('downloadprogress', e => setStatus(st, `Downloading… ${Math.round((e.loaded / (e.total || 1)) * 100)}%`, '', true)); } });
      chromeAI = 'available'; setStatus(st, 'Model ready — Chrome built-in AI can be used offline now', 'ok'); updateEngineChip();
    } catch (e) { setStatus(st, 'Could not download: ' + e.message, 'err'); }
    finally { btn.disabled = false; }
  };
  // Enter inside a field must not submit the dialog (the first submit button is Cancel): run the matching test instead
  $('#settingsDlg form').addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
    e.preventDefault();
    if (['setKey', 'setOrKey', 'setOrModel', 'setModelCustom'].includes(e.target.id)) $('#testAiBtn').click();
    else if (e.target.id === 'setEndpoint') $('#testDbBtn').click();
    else e.target.blur();
  });
  $('#setEndpoint').addEventListener('input', updateEndpointHint);
  // First visit only: what GeoSurvey adds over ordinary survey tools. Tapping the backdrop closes it.
  const welcome = $('#welcomeDlg');
  const welcomeDone = () => { LS.set('gs_welcomed', APP_VERSION); if (!welcome.open || welcome.classList.contains('closing')) return; welcome.classList.add('closing'); setTimeout(() => { welcome.close(); welcome.classList.remove('closing'); }, 160); };
  $('#welcomeClose').onclick = welcomeDone;
  welcome.addEventListener('click', e => { if (e.target === welcome) welcomeDone(); });
  welcome.addEventListener('close', () => LS.set('gs_welcomed', APP_VERSION));
  if (!LS.get('gs_welcomed', null)) setTimeout(() => { if (!$('#settingsDlg').open) welcome.showModal(); }, 400);
  $('#qrBtn').onclick = openTeamQr;
  $('#quickQr').onclick = openTeamQr;
  $('#stDb').onclick = tileDbAction; $('#stAi').onclick = tileAiAction;
  $('#qrClose').onclick = () => $('#qrDlg').close();
  $('#qrSettings').onclick = () => { $('#qrDlg').close(); openSettings(); };
  $('#qrCopy').onclick = async () => { const link = teamLink(); try { await navigator.clipboard.writeText(link); toast('Team link copied', 'ok'); } catch { prompt('Copy this link:', link); } };
  $('#qrShare').onclick = () => navigator.share({ title: 'GeoSurvey team link', text: 'Open this link once to connect your phone to our survey database.', url: teamLink() }).catch(() => {});
  $('#teamLinkBtn').onclick = async e => {
    e.preventDefault();
    const url = $('#setEndpoint').value.trim() || TEAM_ENDPOINT; if (!url) return;
    if (!ENDPOINT_RE.test(url)) return toast('Enter the Web app URL first — it ends with /exec', 'err');
    const link = `${location.origin}${location.pathname}?db=${encodeURIComponent(url)}`;
    try { await navigator.clipboard.writeText(link); toast('Team link copied — enumerators who open it are connected to this database automatically', 'ok'); }
    catch { prompt('Copy this link and send it to the enumerators:', link); }
  };
  $('#photoDlgClose').onclick = () => $('#photoDlg').close();
  $('#locateBtn').onclick = () => detectLocation(false);
  $('#captureInput').onchange = e => { addFiles(e.target.files); e.target.value = ''; };
  $('#analyzeBtn').onclick = () => analyzePhotos();
  $('#recBtn').onclick = toggleRecording;
  // Pen: open the transcript box for typed notes; tapping it again while the box is empty closes it
  $('#writeBtn').onclick = () => { const w = $('#transcriptWrap'); const ta = $('#transcript'); if (!w.hidden && !ta.value.trim() && !audioClips.length) { w.hidden = true; return; } w.hidden = false; ta.focus(); ta.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
  $('#transcript').addEventListener('input', () => { $('#transcript').dataset.auto = '0'; updateAnalyzeBtn(); scheduleDraftSave(); });
  $('#transcriptClear').onclick = () => { $('#transcript').value = ''; $('#transcriptWrap').hidden = true; updateAnalyzeBtn(); };
  $('#submitBtn').onclick = submitForm;
  $('#resetBtn').onclick = () => { if (confirm('Clear the form?')) clearForm(); };
  $('#syncBtn').onclick = () => syncPending(true);
  $('#syncAllBtn').onclick = () => syncPending(true, true);
  $('#uploadFilesBtn').onclick = uploadMissingFiles;
  $('#testDbBtn').onclick = async e => {
    e.preventDefault(); const st = $('#testDbStatus'); const saved = settings; saveSettings(true); setStatus(st, 'Checking…', '', true);
    try { const msg = await testDatabase(); saved.folderUrl = settings.folderUrl; saved.backendAI = settings.backendAI; saved.backendVersion = settings.backendVersion; saved.backendSheet = settings.backendSheet; saved.backendRows = settings.backendRows; saved.backendSheets = settings.backendSheets; LS.set('gs_settings', saved); st.className = 'status ok'; st.innerHTML = esc(msg) + (settings.folderUrl ? ` · <a href="${esc(settings.folderUrl)}" target="_blank" rel="noopener">open Drive folder</a>` : ''); }
    catch (err) { setStatus(st, 'Failed: ' + err.message, 'err'); }
    finally { settings = saved; updateEngineChip(); updateSettingsStatus(); }
  };
  $('#exportCsvBtn').onclick = () => Exports.csv(allRecords());
  $('#exportJsonBtn').onclick = () => Exports.json(allRecords());
  $('#exportSpssBtn').onclick = () => Exports.spss(allRecords());
  $('#exportKmzBtn').onclick = () => Exports.kmz(allRecords());
  $('#adminConnectBtn').onclick = adminConnect;
  $('#adminToken').addEventListener('keydown', e => { if (e.key === 'Enter') adminConnect(); });
  $('#adminRefreshBtn').onclick = () => adminLoad().catch(e => toast(e.message, 'err'));
  $('#adminSheet').onchange = e => { adminSheetSel = e.target.value; adminLoad().catch(err => toast(err.message, 'err')); };
  $('#adminSearch').oninput = renderAdmin;
  $('#adminExportBtn').onclick = () => Exports.csv(adminRows, 'geosurvey_all');
  $('#adminExportSpssBtn').onclick = () => Exports.spss(adminRows, 'geosurvey_all');
  $('#adminExportKmzBtn').onclick = () => Exports.kmz(adminRows, 'geosurvey_all');
  $('#adminLogoutBtn').onclick = () => { sessionStorage.removeItem('gs_admin'); $('#adminPanel').hidden = true; $('#adminLogin').hidden = false; $('#adminToken').value = ''; setStatus($('#adminStatus'), ''); };

  const offline = () => { $('#offlineBar').hidden = navigator.onLine; updateEngineChip(); };
  window.addEventListener('online', () => { offline(); syncPending(false); });
  window.addEventListener('offline', offline);
  offline();

  // Hold the tip while the backend probe may still turn Gemma 4 on
  if (!engineReady() && !(settings.endpoint && settings.backendAI === undefined && navigator.onLine)) setTimeout(() => toast('Tip: photo auto-fill needs an API key in Settings, or a database backend with Gemma 4 enabled by your admin'), 800);
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(reg => reg.update()).catch(() => {});
    // When an updated service worker takes over, reload once so HTML and scripts never mix versions
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloaded) return; reloaded = true; if (navigator.serviceWorker.controller) location.reload(); });
  }
}
document.addEventListener('DOMContentLoaded', init);
