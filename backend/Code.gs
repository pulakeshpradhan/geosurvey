/**
 * GeoSurvey — Google Apps Script backend (free "database" on Google Sheets)
 *
 * SETUP (≈2 minutes)
 *  1. Create a new Google Sheet (sheets.new).
 *  2. Extensions → Apps Script. Delete the default code, paste this file, save.
 *  3. Deploy → New deployment → Type: "Web app"
 *       Execute as: Me
 *       Who has access: Anyone
 *     → Deploy → Authorize → copy the Web app URL (ends with /exec).
 *  4. Paste that URL into GeoSurvey → ⚙️ Settings → "Database endpoint".
 *
 * Each submission becomes one row in the "Responses" sheet. New fields become new columns
 * automatically. Duplicate submission ids (offline re-sync) are ignored.
 */

var SHEET_NAME = 'Responses';
var SHEET_ID = ''; // Optional: set a spreadsheet ID if this script is NOT bound to the sheet.

function getSheet_() {
  var ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
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

/** POST: append one submission (JSON body). */
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var data = JSON.parse(e.postData.contents);
    var sh = getSheet_();
    var lastCol = Math.max(sh.getLastColumn(), 1);
    var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].filter(String);

    // Skip duplicates (client may retry after a lost response)
    if (data.id && sh.getLastRow() > 1) {
      var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]); });
      if (ids.indexOf(String(data.id)) !== -1) return json_({ ok: true, id: data.id, duplicate: true });
    }

    data.received_at = new Date().toISOString();

    // Add any new columns to the header row
    var added = false;
    Object.keys(data).forEach(function (k) {
      if (headers.indexOf(k) === -1) { headers.push(k); added = true; }
    });
    if (added) sh.getRange(1, 1, 1, headers.length).setValues([headers]);

    var row = headers.map(function (h) {
      var v = data[h];
      if (v === undefined || v === null) return '';
      if (typeof v === 'object') return JSON.stringify(v);
      return v;
    });
    sh.appendRow(row);
    return json_({ ok: true, id: data.id, row: sh.getLastRow() });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/** GET: return latest rows as JSON (for the Responses tab). ?limit=200 */
function doGet(e) {
  try {
    var sh = getSheet_();
    var limit = Math.min(parseInt((e && e.parameter && e.parameter.limit) || 100, 10), 1000);
    var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
    if (lastRow < 2) return json_({ ok: true, total: 0, rows: [] });
    var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
    var n = Math.min(limit, lastRow - 1);
    var values = sh.getRange(lastRow - n + 1, 1, n, lastCol).getValues();
    var thumbIdx = headers.indexOf('photo_thumb');
    var rows = values.reverse().map(function (r) {
      var o = {};
      headers.forEach(function (h, i) { if (i !== thumbIdx && h) o[h] = r[i]; }); // omit thumbnails to keep payload small
      return o;
    });
    return json_({ ok: true, total: lastRow - 1, rows: rows });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}
