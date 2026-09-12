/**
 * GeoSurvey — Google Apps Script backend (free database on Google Sheets + photos on Google Drive)
 *
 * SETUP (≈2 minutes)
 *  1. Create a new Google Sheet (sheets.new).
 *  2. Extensions → Apps Script. Delete the default code, paste this file.
 *  3. Set ADMIN_TOKEN below to a long secret of your choice. Save.
 *  4. Deploy → New deployment → Type: "Web app"
 *       Execute as: Me            Who has access: Anyone
 *     → Deploy → Authorize (Sheets + Drive) → copy the Web app URL (ends with /exec).
 *  5. Paste that URL into GeoSurvey → Settings → "Database endpoint".
 *     Use ADMIN_TOKEN in the app's Admin tab to view / delete / export all data.
 *
 * Each submission = one row in "Responses" (new fields become new columns automatically).
 * Stamped photos are saved to the Drive folder PHOTO_FOLDER and their links written to "photo_urls".
 * Duplicate submission ids (offline re-sync) are ignored. Re-deploy after editing this file
 * (Deploy → Manage deployments → Edit → Version: New).
 */

var ADMIN_TOKEN = 'change-me-to-a-long-secret';   // <-- REQUIRED for the Admin tab
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
function isAdmin_(token) { return ADMIN_TOKEN && ADMIN_TOKEN !== 'change-me-to-a-long-secret' && token === ADMIN_TOKEN; }
function headers_(sh) {
  var lastCol = Math.max(sh.getLastColumn(), 1);
  return sh.getRange(1, 1, 1, lastCol).getValues()[0].filter(String);
}
function folder_() {
  var it = DriveApp.getFoldersByName(PHOTO_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(PHOTO_FOLDER);
}
function savePhotos_(id, photos) {
  var folder = folder_(), urls = [];
  photos.forEach(function (p, i) {
    try {
      var b64 = String(p.dataUrl || '').split(',')[1];
      if (!b64) return;
      var blob = Utilities.newBlob(Utilities.base64Decode(b64), 'image/jpeg', (id.slice(0, 8) + '_' + (p.name || ('photo_' + (i + 1) + '.jpg'))));
      var file = folder.createFile(blob);
      file.setDescription(JSON.stringify({ record: id, taken_at: p.taken_at, lat: p.lat, lon: p.lon, acc: p.acc, section: p.section || '' }));
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      urls.push('https://drive.google.com/file/d/' + file.getId() + '/view');
    } catch (e) { urls.push('ERROR: ' + e); }
  });
  return urls;
}

/** POST: new submission (JSON body), or admin action {action:'delete', id, token}. */
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var data = JSON.parse(e.postData.contents);
    if (data.action) return adminAction_(data);

    var sh = getSheet_();
    var headers = headers_(sh);
    if (data.id && sh.getLastRow() > 1) {
      var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]); });
      if (ids.indexOf(String(data.id)) !== -1) return json_({ ok: true, id: data.id, duplicate: true });
    }
    var photos = data.photos || []; delete data.photos;
    if (photos.length) data.photo_urls = savePhotos_(String(data.id || Utilities.getUuid()), photos).join('\n');
    data.received_at = new Date().toISOString();

    var added = false;
    Object.keys(data).forEach(function (k) { if (headers.indexOf(k) === -1) { headers.push(k); added = true; } });
    if (added) sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.appendRow(headers.map(function (h) {
      var v = data[h];
      if (v === undefined || v === null) return '';
      return typeof v === 'object' ? JSON.stringify(v) : v;
    }));
    return json_({ ok: true, id: data.id, row: sh.getLastRow(), photo_urls: data.photo_urls || '' });
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
    if (p.action === 'schema') { var js = getConfig_('schema'); return json_({ ok: true, schema: js ? JSON.parse(js) : null }); }
    var sh = getSheet_();
    var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
    if (p.action === 'list') {
      if (!isAdmin_(p.token)) return json_({ ok: false, error: 'Invalid admin token' });
      if (lastRow < 2) return json_({ ok: true, total: 0, rows: [], sheetUrl: ss_().getUrl() });
      var limit = Math.min(parseInt(p.limit || 500, 10), 5000);
      var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
      var n = Math.min(limit, lastRow - 1);
      var values = sh.getRange(lastRow - n + 1, 1, n, lastCol).getValues();
      var skip = headers.indexOf('photo_thumb');
      var rows = values.reverse().map(function (r) {
        var o = {};
        headers.forEach(function (h, i) { if (h && i !== skip) o[h] = r[i] instanceof Date ? r[i].toISOString() : r[i]; });
        return o;
      });
      return json_({ ok: true, total: lastRow - 1, rows: rows, sheetUrl: ss_().getUrl() });
    }
    return json_({ ok: true, total: Math.max(0, lastRow - 1) });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
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
    return json_({ ok: true, version: data.schema.version });
  }
  return json_({ ok: false, error: 'Unknown action' });
}
