/**
 * GeoSurvey — Google Apps Script backend (free database on Google Sheets + photos on Google Drive)
 *
 * SETUP (≈3 minutes, once)
 *  1. Create a new Google Sheet (sheets.new).
 *  2. Extensions → Apps Script. Delete the default code, paste this file.
 *     Project Settings (gear) → tick "Show appsscript.json manifest file" → open appsscript.json → paste backend/appsscript.json.
 *  3. Optionally change ADMIN_TOKEN below (the team key; default 'GeoSurvey') — or set a Script Property ADMIN_TOKEN. Save.
 *  4. Enable the Apps Script API once for your account: https://script.google.com/home/usersettings → "Google Apps Script API" ON.
 *  5. Run the function "authorizeDrive" once (▶ Run) and allow access (Sheets, Drive, Apps Script projects).
 *  6. Deploy → New deployment → Type: "Web app"
 *       Execute as: Me            Who has access: Anyone
 *     → Deploy → copy the Web app URL (ends with /exec).
 *  7. Paste that URL into GeoSurvey → Settings → "Database endpoint" and press "Test database".
 *
 * UPDATES ARE AUTOMATIC from here on: the app (and a daily trigger) call updateBackend, which downloads the latest
 * Code.gs from GitHub, keeps your ADMIN_TOKEN / AI_KEY / sheet settings, saves it as a new version and re-points this
 * web app to it. You never paste this file or press "New version" again. (Manual alternative: ▶ Run "updateBackend".)
 *
 * Each submission = one row in "Responses" (new fields become new columns automatically).
 * Stamped photos and interview recordings are saved to the Drive folder PHOTO_FOLDER; links go to "photo_urls" / "audio_urls".
 * Duplicate submission ids (offline re-sync) are ignored. After editing this file, ▶ Run "updateBackend".
 *
 * Once a record is in the sheet the phone deletes its local copy and shows its own rows straight from here
 * (list?device=<its random id>). "Sync all" shows every row of the sheet — only with the team key ADMIN_TOKEN
 * (default 'GeoSurvey'; change it for a real project). Deleting rows and publishing the questionnaire also need the key.
 *
 * OPTIONAL — GEMMA 4 PHOTO ANALYSIS FOR THE WHOLE TEAM (enumerators need no key on their phones)
 *  Get one free key at https://aistudio.google.com/app/apikey, paste it into AI_KEY below (or add a Script
 *  Property named AI_KEY under Project Settings), then ▶ Run "updateBackend". Phones then pick
 *  "Gemma 4 via database backend" automatically. Google serves Gemma 4 free of charge with rate limits.
 */

var BACKEND_VERSION = '1.16.0';                    // reported to the app (Settings → Test database)
var AI_KEY = '';                                   // <-- optional: Google AI Studio key shared by the team (Gemma 4 only)
var AI_MODEL = 'gemma-4-26b-a4b-it';              // default when the app does not ask for a specific Gemma model

/**
 * ONE-TIME DRIVE AUTHORISATION (needed once per script):
 *   In the Apps Script editor choose the function "authorizeDrive" in the toolbar dropdown and click ▶ Run.
 *   Google shows a consent screen → Review permissions → choose your account → Advanced → "Go to … (unsafe)" → Allow.
 *   It also publishes the code as a new version (when the Apps Script API is on). Settings → "Test database" in the app confirms.
 */
function authorizeDrive() {
  var f = folder_();                       // creates "GeoSurvey Photos" in My Drive if missing
  var ss = ss_(); getSheet_(); configSheet_();
  Logger.log('Drive authorised. Folder: ' + f.getUrl() + ' | Sheet: ' + ss.getUrl());
  // Publish this code as a new version and install the daily update check (needs the Apps Script API switched on once)
  try { Logger.log('Publish: ' + JSON.stringify(selfUpdate_(true))); }
  catch (e) { Logger.log('Could not publish automatically (' + e + '). Switch on https://script.google.com/home/usersettings and run updateBackend, or use Deploy → Manage deployments → New version.'); }
}

/* ------------------------------------------------------------------ */
/* Self-update: pull the latest Code.gs from GitHub, keep local settings, publish a new version, re-point the web app */
/* ------------------------------------------------------------------ */
var SOURCE_URL = 'https://raw.githubusercontent.com/pulakeshpradhan/geosurvey/main/backend/Code.gs';
var CONFIG_VARS = ['ADMIN_TOKEN', 'AI_KEY', 'AI_MODEL', 'SHEET_ID', 'SHEET_NAME', 'PHOTO_FOLDER', 'CONFIG_SHEET'];

/** ▶ Run this in the editor: publishes the current code as a new version (no more "New version" clicks) and checks GitHub. */
function updateBackend() { var r = selfUpdate_(true); Logger.log(JSON.stringify(r)); return r; }
/** Daily trigger target. */
function autoUpdateBackend() { try { selfUpdate_(false); } catch (e) { Logger.log('Auto-update: ' + e); } }

function versionOf_(src) { var m = /var BACKEND_VERSION = '([\d.]+)'/.exec(src || ''); return m ? m[1] : '0'; }
function newer_(a, b) { var x = String(a).split('.'), y = String(b).split('.'); for (var i = 0; i < 3; i++) { var p = +x[i] || 0, q = +y[i] || 0; if (p !== q) return p > q; } return false; }
function api_(method, path, body) {
  var opt = { method: method, contentType: 'application/json', headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true };
  if (body) opt.payload = JSON.stringify(body);
  var r = UrlFetchApp.fetch('https://script.googleapis.com/v1/projects/' + ScriptApp.getScriptId() + path, opt);
  var j = {}; try { j = JSON.parse(r.getContentText()); } catch (e) {}
  if (r.getResponseCode() >= 400) {
    var msg = (j.error && j.error.message) || ('HTTP ' + r.getResponseCode());
    if (/not enabled the Apps Script API/i.test(msg)) throw new Error('APPS_SCRIPT_API_DISABLED');
    if (r.getResponseCode() === 403 || /insufficient|scope/i.test(msg)) throw new Error('NOT_AUTHORIZED');
    throw new Error(msg);
  }
  return j;
}
/** Copy this project's settings (team key, AI key, sheet names…) into the freshly downloaded source. */
function carryConfig_(oldSrc, newSrc) {
  CONFIG_VARS.forEach(function (name) {
    var m = new RegExp("var " + name + " = '((?:[^'\\\\]|\\\\.)*)';").exec(oldSrc);
    if (m) newSrc = newSrc.replace(new RegExp("var " + name + " = '(?:[^'\\\\]|\\\\.)*';"), function () { return "var " + name + " = '" + m[1] + "';"; });
  });
  return newSrc;
}
function ensureUpdateTrigger_() {
  var has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'autoUpdateBackend'; });
  if (!has) ScriptApp.newTrigger('autoUpdateBackend').timeBased().everyDays(1).atHour(3).create();
}
/** publishAnyway: create a version and re-point the deployment even when GitHub has nothing newer (used after a manual paste). */
function selfUpdate_(publishAnyway) {
  var lock = LockService.getScriptLock(); if (!lock.tryLock(2000)) return { ok: false, error: 'UPDATE_RUNNING' };
  try {
    var dl = UrlFetchApp.fetch(SOURCE_URL, { muteHttpExceptions: true });
    if (dl.getResponseCode() !== 200) throw new Error('Could not download the latest Code.gs (HTTP ' + dl.getResponseCode() + ')');
    var latestSrc = dl.getContentText(), latest = versionOf_(latestSrc);
    var files = api_('get', '/content').files || [], code = null;
    files.forEach(function (f) { if (f.type === 'SERVER_JS' && /BACKEND_VERSION/.test(f.source || '')) code = f; });
    if (!code) throw new Error('GeoSurvey code file not found in this project');
    var current = versionOf_(code.source), changed = false;
    if (newer_(latest, current)) {
      code.source = carryConfig_(code.source, latestSrc);
      api_('put', '/content', { files: files });   // the manifest is left untouched so no re-authorisation is ever needed
      changed = true; current = latest;
    } else if (!publishAnyway && !newer_(current, BACKEND_VERSION)) { // nothing new on GitHub and the saved code is already what runs
      return { ok: true, updated: false, version: current, latest: latest, deployed: BACKEND_VERSION };
    }
    changed = changed || newer_(current, BACKEND_VERSION);
    var ver = api_('post', '/versions', { description: 'GeoSurvey backend v' + current + (changed ? ' (auto-update)' : '') });
    var deps = api_('get', '/deployments').deployments || [], n = 0;
    deps.forEach(function (d) {
      var web = (d.entryPoints || []).some(function (e) { return e.entryPointType === 'WEB_APP'; });
      if (!web || !d.deploymentConfig || d.deploymentConfig.versionNumber == null) return;   // skip the HEAD (/dev) deployment
      api_('put', '/deployments/' + d.deploymentId, { deploymentConfig: { scriptId: ScriptApp.getScriptId(), versionNumber: ver.versionNumber, manifestFileName: 'appsscript', description: d.deploymentConfig.description || 'GeoSurvey backend' } });
      n++;
    });
    try { ensureUpdateTrigger_(); } catch (e) {}
    return { ok: true, updated: changed, version: current, latest: latest, versionNumber: ver.versionNumber, deployments: n };
  } finally { lock.releaseLock(); }
}
var ADMIN_TOKEN = 'GeoSurvey';                     // <-- team key: "Sync all", delete rows, publish the questionnaire. Change it for a real project.
var SHEET_NAME = 'Responses';
var PHOTO_FOLDER = 'GeoSurvey Photos';
var SHEET_ID = ''; // Optional: spreadsheet ID if this script is NOT bound to the sheet.
var CONFIG_SHEET = 'Config';   // stores the published questionnaire (key/value)

function configSheet_() {
  var ss = ss_(); var sh = ss.getSheetByName(CONFIG_SHEET);
  if (!sh) { sh = ss.insertSheet(CONFIG_SHEET); sh.appendRow(['key', 'value', 'updated_at']); }
  return sh;
}
function getConfig_(key) {
  var sh = configSheet_(); var n = sh.getLastRow(); if (n < 2) return null;
  var rows = sh.getRange(2, 1, n - 1, 2).getValues();
  for (var i = 0; i < rows.length; i++) if (rows[i][0] === key) return rows[i][1];
  return null;
}
function setConfig_(key, value) {
  var sh = configSheet_(); var n = sh.getLastRow(); var rows = n < 2 ? [] : sh.getRange(2, 1, n - 1, 1).getValues();
  for (var i = 0; i < rows.length; i++) if (rows[i][0] === key) { sh.getRange(i + 2, 2, 1, 2).setValues([[value, new Date().toISOString()]]); return; }
  sh.appendRow([key, value, new Date().toISOString()]);
}

function ss_() { return SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet(); }
function getSheet_() {
  var ss = ss_();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['id', 'submitted_at', 'received_at']);
    sh.setFrozenRows(1);
  }
  return sh;
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
/** Team key: a Script Property named ADMIN_TOKEN (Project Settings) overrides the constant above. */
function adminToken_() { var k = ADMIN_TOKEN; try { k = PropertiesService.getScriptProperties().getProperty('ADMIN_TOKEN') || k; } catch (e) {} return String(k || '').trim(); }
function isAdmin_(token) { var k = adminToken_(); return !!k && String(token || '') === k; }
function headers_(sh) {
  var lastCol = Math.max(sh.getLastColumn(), 1);
  return sh.getRange(1, 1, 1, lastCol).getValues()[0].filter(String);
}
function folder_() {
  var it = DriveApp.getFoldersByName(PHOTO_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(PHOTO_FOLDER);
}
function savePhotos_(id, photos, kind) {
  var folder = folder_(), urls = [];
  photos.forEach(function (p, i) {
    try {
      var b64 = String(p.dataUrl || '').split(',')[1];
      if (!b64) return;
      var mime = kind === 'audio' ? (p.mime || 'audio/webm') : 'image/jpeg';
      var blob = Utilities.newBlob(Utilities.base64Decode(b64), mime, (id.slice(0, 8) + '_' + (p.name || ((kind === 'audio' ? 'audio_' : 'photo_') + (i + 1) + (kind === 'audio' ? '.webm' : '.jpg')))));
      var file = folder.createFile(blob);
      file.setDescription(JSON.stringify({ record: id, kind: kind || 'photo', taken_at: p.taken_at, lat: p.lat, lon: p.lon, acc: p.acc, duration: p.duration, section: p.section || '' }));
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      urls.push('https://drive.google.com/file/d/' + file.getId() + '/view');
    } catch (e) { urls.push('ERROR: ' + e); }
  });
  return urls;
}

function aiKey_() {
  var k = AI_KEY; try { k = PropertiesService.getScriptProperties().getProperty('AI_KEY') || k; } catch (e) {}
  return String(k || '').trim();
}
/** {action:'ai', model, body}: forward a generateContent request to Google with the shared key. Gemma models only. */
function aiProxy_(data) {
  var key = aiKey_();
  if (!key) return json_({ ok: false, error: 'AI_NOT_CONFIGURED', version: BACKEND_VERSION });
  var model = String(data.model || AI_MODEL);
  if (!/^gemma-[\w.-]+$/.test(model)) return json_({ ok: false, error: 'This backend only serves Gemma models', version: BACKEND_VERSION });
  var r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
    method: 'post', contentType: 'application/json', headers: { 'x-goog-api-key': key }, payload: JSON.stringify(data.body || {}), muteHttpExceptions: true });
  var text = r.getContentText(), j;
  try { j = JSON.parse(text); } catch (e) { j = { error: { message: 'HTTP ' + r.getResponseCode() + ': ' + text.slice(0, 200) } }; }
  if (r.getResponseCode() >= 400 && !j.error) j.error = { message: 'HTTP ' + r.getResponseCode() };
  j.ok = !j.error; j.version = BACKEND_VERSION;
  return json_(j);
}

/** POST: new submission (JSON body), AI request {action:'ai'}, or admin action {action:'delete', id, token}. */
function doPost(e) {
  var data;
  try { data = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'Bad JSON' }); }
  if (data.action === 'ai') { try { return aiProxy_(data); } catch (err) { return json_({ ok: false, error: String(err), version: BACKEND_VERSION }); } } // no lock: slow and independent of the sheet
  if (data.action === 'selfUpdate') { // any phone may ask the backend to fetch the latest official release; at most once per 10 minutes
    try {
      var props = PropertiesService.getScriptProperties(), last = +(props.getProperty('LAST_UPDATE_CHECK') || 0);
      if (!data.force && Date.now() - last < 600000) return json_({ ok: true, updated: false, throttled: true, version: BACKEND_VERSION });
      props.setProperty('LAST_UPDATE_CHECK', String(Date.now()));
      var res = selfUpdate_(false); res.deployed = BACKEND_VERSION; return json_(res);
    } catch (err) { return json_({ ok: false, error: String(err && err.message || err), version: BACKEND_VERSION }); }
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (data.action === 'attach') return attachFiles_(data); // (re)upload files for an existing row — no token needed
    if (data.action) return adminAction_(data);

    var sh = getSheet_();
    var headers = headers_(sh);
    if (data.id && sh.getLastRow() > 1) {
      var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]); });
      if (ids.indexOf(String(data.id)) !== -1) return json_({ ok: true, id: data.id, duplicate: true });
    }
    var photos = data.photos || []; delete data.photos;
    var audio = data.audio || []; delete data.audio;
    var rid = String(data.id || Utilities.getUuid());
    if (photos.length) data.photo_urls = savePhotos_(rid, photos, 'photo').join('\n');
    if (audio.length) data.audio_urls = savePhotos_(rid, audio, 'audio').join('\n');
    if (data.interview_transcript && String(data.interview_transcript).trim()) {
      try {
        var tf = folder_().createFile(rid.slice(0, 8) + '_transcript.txt', String(data.interview_transcript), 'text/plain');
        tf.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        data.transcript_url = 'https://drive.google.com/file/d/' + tf.getId() + '/view';
      } catch (e2) { data.transcript_url = 'ERROR: ' + e2; }
    }
    data.received_at = new Date().toISOString();

    var added = false;
    Object.keys(data).forEach(function (k) { if (headers.indexOf(k) === -1) { headers.push(k); added = true; } });
    if (added) sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.appendRow(headers.map(function (h) {
      var v = data[h];
      if (v === undefined || v === null) return '';
      return typeof v === 'object' ? JSON.stringify(v) : v;
    }));
    return json_({ ok: true, id: data.id, row: sh.getLastRow(), photo_urls: data.photo_urls || '', audio_urls: data.audio_urls || '', transcript_url: data.transcript_url || '', folderUrl: folderUrlSafe_(), version: BACKEND_VERSION });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/** GET: ?action=list&token=…&limit=N (admin) · ?action=schema (public: published questionnaire) · else total count. */
function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    if (p.action === 'schema') { var js = getConfig_('schema'); return json_({ ok: true, schema: js ? JSON.parse(js) : null, ai: !!aiKey_(), aiModel: AI_MODEL, version: BACKEND_VERSION }); }
    if (p.action === 'geocode') return json_(geocode_(parseFloat(p.lat), parseFloat(p.lon)));
    if (p.action === 'ping') { // health check: version, sheet, Drive folder (created if missing)
      var fu = '', ferr = ''; try { fu = folder_().getUrl(); } catch (e0) { ferr = /permission/i.test(String(e0)) ? 'DRIVE_NOT_AUTHORIZED' : String(e0); }
      return json_({ ok: true, version: BACKEND_VERSION, sheetUrl: ss_().getUrl(), folderUrl: fu, folderName: PHOTO_FOLDER, driveError: ferr, rows: Math.max(0, getSheet_().getLastRow() - 1), ai: !!aiKey_(), aiModel: AI_MODEL });
    }
    var sh = getSheet_();
    var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
    if (p.action === 'list') { // token → every row; device=<id> → only rows that phone submitted (its id is a random secret)
      var admin = isAdmin_(p.token), device = String(p.device || '');
      if (!admin && !device) return json_({ ok: false, error: p.token ? 'Invalid admin token' : 'NO_TOKEN', version: BACKEND_VERSION });
      var sheetUrl = admin ? ss_().getUrl() : '';
      if (lastRow < 2) return json_({ ok: true, total: 0, rows: [], sheetUrl: sheetUrl, version: BACKEND_VERSION });
      var limit = Math.min(parseInt(p.limit || 500, 10), 5000);
      var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
      var skip = headers.indexOf('photo_thumb'), devCol = headers.indexOf('device_id');
      var toObj = function (r) { var o = {}; headers.forEach(function (h, i) { if (h && i !== skip) o[h] = r[i] instanceof Date ? r[i].toISOString() : r[i]; }); return o; };
      if (!admin) {
        if (devCol < 0) return json_({ ok: true, total: 0, rows: [], sheetUrl: '', version: BACKEND_VERSION });
        var all = sh.getRange(2, 1, lastRow - 1, lastCol).getValues(), mine = [];
        for (var i = all.length - 1; i >= 0 && mine.length < limit; i--) if (String(all[i][devCol]) === device) mine.push(toObj(all[i]));
        return json_({ ok: true, total: mine.length, rows: mine, sheetUrl: '', version: BACKEND_VERSION });
      }
      var n = Math.min(limit, lastRow - 1);
      var rows = sh.getRange(lastRow - n + 1, 1, n, lastCol).getValues().reverse().map(toObj);
      return json_({ ok: true, total: lastRow - 1, rows: rows, sheetUrl: sheetUrl, version: BACKEND_VERSION });
    }
    return json_({ ok: true, total: Math.max(0, lastRow - 1) });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function folderUrlSafe_() { try { return folder_().getUrl(); } catch (e) { return ''; } }
/** Write <title>.geosurvey (questionnaire + team connection) into the Drive folder, plus a dated copy under "Questionnaire history". */
function saveProject_(data) {
  var schema = data.schema, url = String(data.endpoint || '') || (ScriptApp.getService() && ScriptApp.getService().getUrl()) || '';
  var appUrl = String(data.appUrl || '');
  var p = { format: 'geosurvey-project', version: 1, backend: BACKEND_VERSION, saved_at: new Date().toISOString(), title: schema.title || 'GeoSurvey',
    endpoint: url, teamLink: appUrl && url ? appUrl + '?db=' + encodeURIComponent(url) : '', schema: schema };
  var base = String(p.title).replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'GeoSurvey';
  var content = JSON.stringify(p, null, 2), folder = folder_();
  var it = folder.getFilesByName(base + '.geosurvey'), file = it.hasNext() ? it.next() : null;
  if (file) file.setContent(content); else file = folder.createFile(base + '.geosurvey', content, 'application/json');
  var hi = folder.getFoldersByName('Questionnaire history'), hist = hi.hasNext() ? hi.next() : folder.createFolder('Questionnaire history');
  hist.createFile(base + '_' + p.saved_at.replace(/[:.]/g, '-') + '.geosurvey', content, 'application/json');
  return 'https://drive.google.com/file/d/' + file.getId() + '/view';
}
function saveProjectSafe_(data) { try { return saveProject_(data); } catch (e) { return 'ERROR: ' + e; } }
/** Reverse geocoding with Google's geocoder (Apps Script Maps service, no API key): village / block / district / PIN. */
function geocode_(lat, lon) {
  if (!isFinite(lat) || !isFinite(lon)) return { ok: false, error: 'lat and lon are required', version: BACKEND_VERSION };
  try {
    var g = Maps.newGeocoder().setLanguage('en').reverseGeocode(lat, lon);
    var res = (g && g.results) || [];
    if (!res.length) return { ok: true, place: null, status: g && g.status, version: BACKEND_VERSION };
    // Most specific result first; for each wanted level take the first component of that type across all results
    var pick = function (types) { for (var t = 0; t < types.length; t++) for (var i = 0; i < res.length; i++) { var c = res[i].address_components || []; for (var k = 0; k < c.length; k++) if (c[k].types.indexOf(types[t]) !== -1) return c[k].long_name; } return ''; };
    return { ok: true, version: BACKEND_VERSION, place: {
      village: pick(['locality', 'sublocality_level_1', 'sublocality', 'neighborhood', 'administrative_area_level_4', 'administrative_area_level_5']),
      block: pick(['administrative_area_level_3']),
      district: pick(['administrative_area_level_2']),
      state: pick(['administrative_area_level_1']),
      postcode: pick(['postal_code']),
      country: pick(['country']),
      full_address: res[0].formatted_address || '',
      source: 'google',
    } };
  } catch (e) { return { ok: false, error: String(e), version: BACKEND_VERSION }; }
}
/** Store photos / audio / transcript for an already-submitted record and write the links into its row. */
function attachFiles_(data) {
  var sh = getSheet_(); var rid = String(data.id || '');
  if (!rid || sh.getLastRow() < 2) return json_({ ok: false, error: 'Record not found' });
  var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues(); var row = -1;
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === rid) { row = i + 2; break; }
  if (row < 0) return json_({ ok: false, error: 'Record not found in the sheet — sync it first' });
  var out = {};
  if ((data.photos || []).length) out.photo_urls = savePhotos_(rid, data.photos, 'photo').join('\n');
  if ((data.audio || []).length) out.audio_urls = savePhotos_(rid, data.audio, 'audio').join('\n');
  if (data.interview_transcript && String(data.interview_transcript).trim()) {
    try { var tf = folder_().createFile(rid.slice(0, 8) + '_transcript.txt', String(data.interview_transcript), 'text/plain'); tf.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); out.transcript_url = 'https://drive.google.com/file/d/' + tf.getId() + '/view'; } catch (e2) { out.transcript_url = 'ERROR: ' + e2; }
  }
  var headers = headers_(sh), added = false;
  Object.keys(out).forEach(function (k) { if (headers.indexOf(k) === -1) { headers.push(k); added = true; } });
  if (added) sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  Object.keys(out).forEach(function (k) { sh.getRange(row, headers.indexOf(k) + 1).setValue(out[k]); });
  out.ok = true; out.folderUrl = folderUrlSafe_(); out.version = BACKEND_VERSION;
  return json_(out);
}
function adminAction_(data) {
  if (!isAdmin_(data.token)) return json_({ ok: false, error: 'Invalid admin token' });
  var sh = getSheet_();
  if (data.action === 'delete') {
    if (sh.getLastRow() < 2) return json_({ ok: false, error: 'Not found' });
    var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(data.id)) { sh.deleteRow(i + 2); return json_({ ok: true, deleted: data.id }); }
    }
    return json_({ ok: false, error: 'Not found' });
  }
  if (data.action === 'setSchema') {
    if (!data.schema || !data.schema.sections) return json_({ ok: false, error: 'No schema' });
    setConfig_('schema', JSON.stringify(data.schema));
    return json_({ ok: true, version: data.schema.version, projectUrl: saveProjectSafe_(data) });
  }
  if (data.action === 'saveProject') { // Drive backup of a questionnaire that was only applied locally
    if (!data.schema || !data.schema.sections) return json_({ ok: false, error: 'No schema' });
    return json_({ ok: true, projectUrl: saveProjectSafe_(data) });
  }
  return json_({ ok: false, error: 'Unknown action' });
}
