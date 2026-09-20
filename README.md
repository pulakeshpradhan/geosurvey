# GeoSurvey

A free survey app for household field work. Runs in the phone browser. Photos and voice fill the form (AI), the location is recorded automatically, and every answer lands in **your own Google Sheet**.

| | |
|---|---|
| 📱 **Open the app** | https://pulakeshpradhan.github.io/geosurvey/ |
| 🖼️ **Setup slides** | https://pulakeshpradhan.github.io/geosurvey/guide/ |
| 📄 **Code to paste into Google Sheets** | [backend/Code.gs](backend/Code.gs) and [backend/appsscript.json](backend/appsscript.json) |
| 🔑 **Free AI key (optional)** | https://aistudio.google.com/app/apikey |
| 🐞 **Problems / ideas** | https://github.com/pulakeshpradhan/geosurvey/issues |

---

## 1. Set up once — the person in charge, on a computer (about 5 minutes)

### A. Make the database (a Google Sheet)

1. Open https://sheets.new — a new Google Sheet appears. Give it a name.
2. Menu **Extensions → Apps Script**. A code page opens.
3. Delete everything in the code box. Open [backend/Code.gs](backend/Code.gs), copy all of it, paste it there.
4. Click the **gear** on the left (*Project Settings*). Tick **Show "appsscript.json" manifest file in editor**. Go back to the editor (`< >` icon), click **appsscript.json**, delete its text, paste [backend/appsscript.json](backend/appsscript.json). Press **Ctrl+S**.
5. Open https://script.google.com/home/usersettings and switch **Google Apps Script API** to **On**. (This lets the code update itself later.)
6. Back in the editor: in the dropdown next to **▶ Run** choose **`authorizeDrive`**, click **▶ Run**. Click **Review permissions → your account → Advanced → Go to (project name) → Allow**.
7. **Deploy → New deployment** → gear next to *Select type* → **Web app** → *Execute as:* **Me**, *Who has access:* **Anyone** → **Deploy** → **Copy** the *Web app URL* (ends with `/exec`).

Done. **You never touch this code again** — it updates itself when a new version is released.

### B. Connect the app

1. Open https://pulakeshpradhan.github.io/geosurvey/ and tap **⚙️** (top right).
2. Paste the Web app URL into **Database endpoint** → **Test database** (should say *Backend OK*) → **Save**.
3. Tap the **QR icon** in the top bar. Each enumerator points their phone camera at it — their phone is connected, nothing to type. (Or **Copy link** and send it on WhatsApp.)

### C. AI photo fill — optional, free

**For the whole team at once (recommended):** get a key at https://aistudio.google.com/app/apikey → in the Apps Script code find `var AI_KEY = '';` and paste the key between the quotes → **Ctrl+S** → in the dropdown choose **`updateBackend`** → **▶ Run**. Every connected phone now has *Analyze & fill*.

**Or on one phone only:** ⚙️ → paste the key into **Gemini API key** → **Test connection** → **Save**. (Voice recordings need this option.)

---

## 2. Every day — enumerators

1. Open the app (tip: *Add to Home Screen* in the browser menu). Wait until the location shows, e.g. *±8 m*.
2. **Capture photo** (house, kitchen, water source, ID card, filled paper form…), **Record** the interview in any language, or tap **✎** to type notes.
3. **Analyze & fill** — answers appear in **yellow**. Check and correct them. Fill the rest by hand.
4. **Submit**. No internet? It is sent automatically later.

**PDF** (top bar) prints the filled form. Photos come only from the camera and are stamped with time and place.

---

## 3. Where the answers are

- **Records** tab → **Sync**: sends anything waiting and shows *your* records straight from the database (the phone keeps no copy).
  **Sync all** shows *everyone's* records — it asks once for the **team key** (`GeoSurvey` unless you changed it).
- **Google Sheet** (tab *Responses*): every answer from every phone. **Google Drive** folder *GeoSurvey Photos*: photos, recordings, transcripts.
- **Analysis** tab: charts, statistics and a plain-language report on the synced data. **Export** CSV / JSON / SPSS / KMZ from the Records tab.

---

## 4. The questionnaire

- First start: **Use sample**, **Design your own** (like Google Forms), or **Upload paper questionnaire** (PDF or photos — converted as printed; *Improve with AI* tidies it).
- Change it any time with **Edit** → **Apply** (this phone) or **Publish to team** (all phones; needs the team key).

## 5. The team key

`GeoSurvey` by default. It is needed for **Sync all**, deleting a record (Edit → *Collected data*) and **Publish to team**.
To change it: in the Apps Script code edit the line `var ADMIN_TOKEN = 'GeoSurvey';` → **Ctrl+S** → run **`updateBackend`**.

---

## If something does not work

| Problem | What to do |
|---|---|
| *Test database* fails | Check the URL ends with `/exec` and the deployment says *Who has access: Anyone*. |
| App says the backend is older than the app | ⚙️ → **Test database** updates it. If it says the *Apps Script API is off* → step A5. If *not authorised* → steps A4 and A6. A very old backend needs steps A3–A7 once more. |
| *Analyze & fill* error | ⚙️ → **Test connection**. *Backend has no AI key* → step C. Make a new key if yours stopped working. |
| *Permission to call DriveApp* | Step A6 was skipped: run **`authorizeDrive`**. Then Records → **Upload files**. |
| Location stays on *Locating…* | Allow location for the site; go outside or near a window; tap **⟳ Refresh**. |
| Camera or microphone will not open | Allow camera and microphone for the site in the phone's browser settings. |
| The app looks old | Close it completely and open it again. |

---

## Technical notes (developers)

Static site (HTML/JS, no build) on GitHub Pages; backend is a Google Apps Script bound to a Sheet (rows) with Drive for media and a *Config* tab for the published questionnaire. The script updates itself from `backend/Code.gs` on GitHub through the Apps Script API (`selfUpdate_`: fetch → carry over config constants → `projects.updateContent` → new version → re-point web-app deployments; daily trigger + app-triggered `action=selfUpdate`). Records carry a per-device random `device_id`; `list?device=` returns a phone's own rows without the admin token, `list?token=` returns all. Local records are a send queue only — pruned once the row and its Drive files exist. AI: Gemini (`gemini-3.5-flash-lite` default) with strict JSON schemas, or Gemma 4 (`gemma-4-26b-a4b-it` / `gemma-4-31b-it`) through the `action=ai` proxy with a server-held key (schema → JSON → free-text fallback), OpenRouter, Chrome built-in. Team link: `?db=<endpoint>` (QR from the in-repo encoder `qr.js`, byte mode, level M, v1–20) or `config.js` default. Location: Geolocation API with a refining watch + Nominatim reverse geocoding. Exports: CSV/JSON, native SPSS `.sav` writer, KMZ, jsPDF. Analysis in a Web Worker (`stats-worker.js`): descriptives, t-test/ANOVA/chi-square/regression, Cronbach's α, EFA, CB-SEM, PLS-SEM with bootstrap, mediation, moderation. Files: `index.html`, `styles.css`, `config.js`, `qr.js`, `app.js`, `designer.js`, `analysis.js`, `stats-worker.js`, `exports.js`, `sav.js`, `pdf.js`, `sw.js`, `backend/Code.gs`, `backend/appsscript.json`. Deploy by pushing to `main`.
