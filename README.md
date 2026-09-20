# GeoSurvey

A free, installation-free survey app for household and socio-economic field work. It runs in the phone browser, fills the form from photos and voice recordings (AI), records the exact location automatically, and stores every submission in your own Google Sheet with photos in Google Drive. Statistics and reports are built in.

| | |
|---|---|
| 📱 **App** | https://pulakeshpradhan.github.io/geosurvey/ |
| 🖼️ **Setup slides** | https://pulakeshpradhan.github.io/geosurvey/guide/ |
| 📄 **Backend code** | [backend/Code.gs](backend/Code.gs) · [backend/appsscript.json](backend/appsscript.json) |
| 🔑 **Free AI key (optional)** | https://aistudio.google.com/app/apikey |
| 🐞 **Issues and requests** | https://github.com/pulakeshpradhan/geosurvey/issues |

**Features:** photo and voice auto-fill in any Indian language (answers written in English for review) · automatic GPS fix, address and time-stamped photos · questionnaire designer, paper-questionnaire conversion, team-wide publishing · offline queue with automatic sync · records streamed from the database · CSV / JSON / SPSS (.sav) / KMZ / PDF export · descriptive statistics, reliability, EFA, CFA/SEM, PLS-SEM, mediation and moderation with a written report.

---

## Setup (once, by the project admin — about 5 minutes)

### 1. Create the database (Google Sheet + Apps Script)

1. Open https://sheets.new and name the sheet.
2. **Extensions → Apps Script.**
3. Replace the contents of the code editor with [backend/Code.gs](backend/Code.gs).
4. **Project Settings** (gear) → enable **Show "appsscript.json" manifest file in editor**. Open `appsscript.json` and replace its contents with [backend/appsscript.json](backend/appsscript.json). Save (Ctrl+S).
5. Enable the **Google Apps Script API** for your account at https://script.google.com/home/usersettings. This allows the backend to update itself.
6. Select **`authorizeDrive`** in the function dropdown and **Run**. Grant the requested permissions (Review permissions → Advanced → Go to project → Allow).
7. **Deploy → New deployment → Web app**, *Execute as:* **Me**, *Who has access:* **Anyone** → **Deploy**. Copy the Web app URL (ends in `/exec`).

The backend now keeps itself current: whenever a newer `Code.gs` is released, the app asks the backend to download it, carry over your settings, and publish a new version. No further pasting or manual deployments.

### 2. Connect the app

1. Open the app, tap **⚙️ Settings**, paste the Web app URL into **Database endpoint**, press **Test database** (expect *Backend OK*), then **Save**.
2. Tap the **QR icon** in the top bar. Enumerators scan it with their phone camera and are connected immediately. Alternatively **Copy link** and share it — the link carries the endpoint.

### 3. AI photo fill (optional, free)

- **Team-wide:** create a key at https://aistudio.google.com/app/apikey, paste it into `var AI_KEY = '';` in the Apps Script code, save, then run **`updateBackend`**. Every connected phone gets *Analyze & fill* through Google's Gemma 4 without any key on the device.
- **Per phone:** Settings → **Gemini API key** → **Test connection** → Save. This option is required for voice recordings; it also takes priority when both are present.

---

## Field use

1. Open the app (add it to the home screen for app-like use). Wait for the location fix (e.g. *±8 m*).
2. **Capture photo** (dwelling, kitchen, water source, ID card, filled paper form…), **Record** the interview, or tap **✎** to type notes.
3. **Analyze & fill.** AI-filled answers are highlighted in yellow for review. Complete the rest manually.
4. **Submit.** Without internet the record is queued and sent automatically later.

**PDF** produces an A4 copy of the filled form. Photos are camera-only and stamped with time, coordinates and address.

---

## Data

- **Records tab:** **Sync** sends queued records and then lists this phone's records straight from the database; the phone keeps no copy afterwards. **Sync all** lists every record from every phone and requires the **team key**.
- **Google Sheet** (*Responses* tab): all submissions, one row each. **Google Drive** folder *GeoSurvey Photos*: photos, recordings and transcripts, linked from the sheet.
- **Analysis tab:** automatic statistics and a plain-language report on the synced data. Exports (CSV, JSON, SPSS, KMZ) are on the Records tab.

## Questionnaire

On first start choose **Use sample**, **Design your own** (Google-Forms-style editor), **Upload paper questionnaire** (PDF or photos, transcribed as printed; *Improve with AI* refines it) or **Open a project file**. Later, use **Edit** → **Apply** (this phone) or **Publish to team** (all phones). Editing the questionnaire requires the team key once a database is connected.

### Several questionnaires, one Google Sheet

The backend can hold any number of questionnaires. Each one gets its **own dedicated tab** in the same Google Sheet (`Responses – <title>`), so exports and the Analysis tab never mix columns from different forms.

- **Edit → questionnaire bar:** pick which questionnaire to edit; **New** creates another one (you name it, its tab is created on first publish); **Make default** chooses the one every phone follows; **Delete** removes a questionnaire — a tab that holds records is always kept, only an empty tab is removed. Tabs are never renamed, because the link between a questionnaire and its data must stay intact.
- **Publishing an update** to a questionnaire that already has records asks where new responses go: *continue in the current sheet* (wording tweaks, a few added questions) or *start a new sheet for this version* (questions, options or scales changed). Earlier sheets keep their data.
- **Phones** follow the default questionnaire. A phone can be pointed to another one with its project file or by applying it in Edit; it then stays on it until the admin changes the default or deletes it. Records queued on a phone always land in the tab of the questionnaire they were collected with.
- **Edit → Collected data** has a tab selector to view, export or delete rows from any response sheet.

### Project file (`.geosurvey`)

The questionnaire and the team connection travel together in one file, `<title>.geosurvey`:

- **Automatic backup.** Every *Publish to team* (and every *Apply* on a connected admin phone) writes `<title>.geosurvey` into the Drive folder *GeoSurvey Photos*, plus a dated copy under *Questionnaire history*. The questionnaire is never only on one phone.
- **Save a copy.** Settings → **Download project file** (to this device) or **Save project to Drive** (needs the team key). Edit → **Save project file** does both.
- **Open it anywhere.** On a fresh phone choose **Open a project file** on the start page (or Edit → **Open file**): the questionnaire is installed and the phone is connected to the database in one step, no typing, no key. The file does not contain the admin key.

## Admin (team) key

The admin key is required for **Sync all**, **Edit** (questionnaire and *Collected data*), deleting records and **Publish to team**. The app asks for it once and stores it on that phone (Settings → *Team key*). Enumerators who only collect data never need it.

### Setting the admin key in Apps Script

1. Open your Google Sheet → **Extensions → Apps Script**.
2. Near the top of `Code.gs` find the line

   ```js
   var ADMIN_TOKEN = 'GeoSurvey';
   ```

3. Replace `GeoSurvey` with your own key, keeping the quotes — for example `var ADMIN_TOKEN = 'Bankura-2026-x7Q';`. Use letters and digits; avoid quotes and spaces.
4. Press **Ctrl+S** to save.
5. In the function dropdown next to **▶ Run** choose **`updateBackend`** and click **▶ Run**. This publishes the change to the live web app. (Without this step the old key stays active.)
6. On phones that had the old key stored: Settings → **Team key** → enter the new key → Save.

*Alternative that survives self-updates without touching the code:* Apps Script → **Project Settings** (gear) → **Script Properties** → **Add script property** with name `ADMIN_TOKEN` and your key as the value. A script property takes precedence over the line in the code.

---

## Caution

- **Change the default team key** before collecting real data. `GeoSurvey` is public knowledge; anyone who knows it and the endpoint can read every record and delete rows.
- **The endpoint URL is a credential.** *Who has access: Anyone* means anyone holding the URL can submit records. Share the QR code or team link only with your enumerators.
- **Personal data.** Household surveys contain names, phone numbers, ID documents and precise coordinates. Obtain respondent consent, keep the Google account secure, and do not share the sheet or Drive folder publicly.
- **AI processing.** With *Analyze & fill*, photos, recordings and transcripts are sent to Google (Gemini / Gemma) or OpenRouter for analysis. Do not use it for material that may not leave your organisation. Free tiers are rate-limited; heavy use may need a paid key.
- **Verify AI answers.** Yellow fields are suggestions inferred from images and speech. Always check them before submitting.
- **The Sheet is the only copy.** After a successful sync the phone deletes its local copy. Do not delete the Sheet or the Drive folder; export backups regularly (Records → Export, or download the Sheet).
- **Self-update.** The backend replaces its own code with the current `backend/Code.gs` from this repository. If you fork the project, point `SOURCE_URL` in Code.gs at your fork.
- **Google quotas.** Apps Script limits daily external requests and execution time; very large teams or very large photos may hit them. Keep the *Image size sent to AI* setting at 1024 px unless detail is essential.
- **Location accuracy** depends on the phone's GPS; wait for a reading of ±15 m or better before submitting.

## Do's and Don'ts

### Admin — Do

1. Share the QR code / team link only with your own enumerators.
2. Switch on the Apps Script API (`script.google.com/home/usersettings`) — it exposes nothing; it only lets your own script update itself.
3. Keep the AI key and admin key in Code.gs or Script Properties — they never leave Google's servers.
4. Let the backend self-update from this repository (HTTPS to GitHub, official file only).
5. Change the admin key before real data collection (edit `ADMIN_TOKEN`, run `updateBackend`).
6. Create a **new deployment** if the URL leaks (new URL, old one dead) and re-share the QR.
7. Export regularly (CSV / SPSS) as a backup.
8. Protect the GitHub account behind `SOURCE_URL` with 2FA; if you fork the project, change `SOURCE_URL`.

### Admin — Don't

1. Don't post the team link or the `/exec` URL publicly — anyone holding it can submit junk records and use your AI quota.
2. Don't leave the admin key at the default `GeoSurvey` — with it, anyone who has the link can read and delete every record.
3. Don't type the admin key on a phone that is not yours, and don't send it in the same message as the link.
4. Don't share the Google Sheet or the Drive folder with "Anyone with the link" — the app never needs that.
5. Don't delete the Sheet or the Drive folder — after sync it is the only copy of the data.
6. Don't run the survey without respondent consent for photos, recordings and location.

### Enumerators — Do

1. Scan the team QR or open the team link once — it only stores the database address on your phone.
2. Use the app without any key — Sync shows only your own records.
3. Work offline when needed — records queue on the phone and are sent later.
4. Check and correct yellow (AI-filled) answers before Submit.
5. Photograph dwellings, assets and only the documents the respondent has agreed to show.
6. Add the app to the home screen.

### Enumerators — Don't

1. Don't forward the team link to people outside the project.
2. Don't enter an admin key someone gave you "to try" — it unlocks everyone's records on that phone.
3. Don't clear the browser's site data before Sync — queued records not yet sent are lost.
4. Don't submit AI-filled answers unread — they are inferences, not facts.
5. Don't photograph IDs, bank books or people without the respondent's consent.
6. Don't use a shared or public phone for collection — records and the device id stay in that browser.

---

## Troubleshooting

| Symptom | Action |
|---|---|
| *Test database* fails | Confirm the URL ends in `/exec` and the deployment is set to *Who has access: Anyone*. |
| "Backend is older than the app" | Settings → **Test database** triggers the update. *Apps Script API is off* → step 1.5. *Not authorised* → steps 1.4 and 1.6. Backends older than v1.15.4 need steps 1.3–1.7 once more. |
| *Analyze & fill* error | Settings → **Test connection**. *Backend has no AI key* → step 3. Replace the key if it has been revoked. |
| *Permission to call DriveApp* | Run **`authorizeDrive`** (step 1.6), then Records → **Upload files**. |
| Team key not accepted | The key must match `ADMIN_TOKEN` in Code.gs exactly (case-sensitive). |
| Location stays on *Locating…* | Allow location for the site, move outdoors, tap **⟳ Refresh**. |
| Camera or microphone blocked | Allow both for the site in the browser's site settings. |
| App appears outdated | Close it fully and reopen; the service worker reloads once when a new version is installed. |

---

## Technical notes

Static site (HTML/JS, no build step) on GitHub Pages. Backend: Google Apps Script bound to a Sheet (rows), Drive for media, a *Config* tab for the published questionnaire. Self-update via the Apps Script API (`selfUpdate_`: fetch `backend/Code.gs` → carry over config constants → `projects.updateContent` → new version → re-point web-app deployments; daily trigger plus app-triggered `action=selfUpdate`). Questionnaires are a registry in the *Config* tab (`questionnaires`, `active_questionnaire`, `schema:<id>`), each with its own response tab; `setSchema` creates (no `qid`) or updates (`qid`, optional `sheetMode: new`), `setActive` / `deleteQuestionnaire` manage them; submissions and `list` route by `qid` / `q`. Records carry a random per-device `device_id`; `list?device=` returns that phone's rows without a token, `list?token=` returns all. Local records are a send queue only, pruned once the row and its Drive files exist. AI: Gemini (`gemini-3.5-flash-lite` default) with strict JSON schemas, Gemma 4 (`gemma-4-26b-a4b-it` / `gemma-4-31b-it`) through the `action=ai` proxy with a server-held key (schema → JSON → free-text fallback), OpenRouter, Chrome built-in. Team link `?db=<endpoint>` (QR from `qr.js`, byte mode, EC level M, versions 1–20) or a `config.js` default. Location: Geolocation API with a refining watch + Nominatim reverse geocoding. Exports: CSV/JSON, native SPSS `.sav` writer, KMZ, jsPDF. Analysis in a Web Worker (`stats-worker.js`): descriptives, t-test/ANOVA/chi-square/regression, Cronbach's α, EFA, CB-SEM, PLS-SEM with bootstrap, mediation, moderation. Project file: `.geosurvey` JSON (`format: geosurvey-project`, endpoint, teamLink, schema); the backend writes it to Drive on `setSchema` / `saveProject`. Files: `index.html`, `styles.css`, `config.js`, `qr.js`, `app.js`, `designer.js`, `analysis.js`, `stats-worker.js`, `exports.js`, `sav.js`, `pdf.js`, `sw.js`, `backend/Code.gs`, `backend/appsscript.json`. Deploy by pushing to `main`.
