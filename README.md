# GeoSurvey

A free survey app for household / socio-economic field work. It runs in the phone's browser, fills the form for you from **photos and voice recordings** (AI), records the **exact location automatically**, saves everything to **your own Google Sheet and Google Drive**, and gives you **statistics and reports** on the collected data.

| | |
|---|---|
| 📱 **Open the app** | https://pulakeshpradhan.github.io/geosurvey/ |
| 🖼️ **Setup slides (click by click)** | https://pulakeshpradhan.github.io/geosurvey/guide/ |
| 📄 **Written guide** | this page (below) |
| 🔑 **Free AI key** | https://aistudio.google.com/app/apikey |
| 📊 **Backend code to paste into Google Sheets** | [backend/Code.gs](backend/Code.gs) |
| 🐞 **Report a problem / ask for a feature** | https://github.com/pulakeshpradhan/geosurvey/issues |

**What it does**

- **Fills the form for you** – take photos (house, kitchen, water source, ID card, filled paper form) or record the interview in any Indian language; the AI writes the transcript and fills the answers in English for you to check.
- **Knows where you are** – precise GPS location and address are captured automatically; every photo is stamped with time and place.
- **Your data, your Google account** – one row per household in a Google Sheet, photos and recordings in a Drive folder, offline-safe on the phone until synced.
- **Your questionnaire** – use the sample, design your own like Google Forms, or upload the paper questionnaire and let the AI convert it; publish it to every phone.
- **Results built in** – statistics with charts and a plain-language report (reliability, factor analysis, SEM, mediation/moderation); downloads as CSV, SPSS, KMZ and A4 PDF.

Nothing to install. On a phone, open the link in Chrome (Android) or Safari (iPhone) and choose *Add to Home Screen* to use it like an app. It works offline and syncs when internet is back.

---

## Setting up (one time, about 10 minutes)

You need two things: a **free AI key** and a **Google Sheet** to store the answers. Do this once on a computer.

### Step 1 – Get the free AI key (2 minutes)

1. Go to https://aistudio.google.com/app/apikey and sign in with your Google account.
2. Click **Create API key**, then **Copy** the key (it starts with `AIza`).
3. Keep it safe — you will paste it into the app in Step 3.

### Step 2 – Create the Google Sheet that stores the data (5 minutes)

1. Go to https://sheets.new to create a new Google Sheet. Give it a name, e.g. *Village Survey 2026*.
2. In the Sheet menu click **Extensions → Apps Script**. A code page opens.
3. Delete everything in that page. Open this file: [backend/Code.gs](backend/Code.gs), click the **copy icon** at the top right of the file, and paste it into the code page.
4. The line `var ADMIN_TOKEN = 'GeoSurvey';` is the **team key**: whoever has it can see everyone's records (*Sync all*), delete rows and publish the questionnaire. Keep `GeoSurvey` for a trial; for a real project replace it with a password of your choice (keep the quotes). Press **Ctrl+S** to save.
5. **Allow Drive access:** in the toolbar there is a dropdown that says `myFunction` or `doPost` — change it to **`authorizeDrive`** and click **▶ Run**.
   Google asks for permission: click **Review permissions → your account → Advanced → Go to (project name) → Allow**.
   This creates a folder **GeoSurvey Photos** in your Google Drive where photos, recordings and transcripts will be saved.
6. Click **Deploy → New deployment**. Click the gear icon next to *Select type* and choose **Web app**. Set
   *Execute as:* **Me**, *Who has access:* **Anyone**. Click **Deploy**, then **Copy** the *Web app URL* (it ends with `/exec`).

> Whenever you paste a newer `Code.gs` later, you must also click **Deploy → Manage deployments → ✎ (edit) → Version: New version → Deploy**. Otherwise the old code keeps running.

### Step 3 – Put the key and the URL into the app (1 minute)

1. Open https://pulakeshpradhan.github.io/geosurvey/ and tap the **⚙️ (Settings)** icon at the top right.
2. Paste the AI key into **Gemini API key** and press **Test connection** — it should say *OK*.
3. Paste the Web app URL into **Database endpoint** and press **Test database** — it should say *Backend OK … Drive folder "GeoSurvey Photos" ready* with a link to the folder.
4. Type your name under **Enumerator name**, choose the **Interview language**, and press **Save**.

Every enumerator does Step 3 on their own phone with the **same key and the same URL**. All phones then write into the same Sheet.

**Skip the pasting on the phones — two options (either one works, Settings always remains as the manual fallback):**

- **Team link:** in Settings press **Copy team link** (next to *Test database*) and send that link to the enumerators. Opening it once connects the phone to your database; the link is `…/geosurvey/?db=<Web app URL>`.
- **Built into the app:** if you host your own copy of the app, put the Web app URL into [config.js](config.js) (`endpoint: '…/exec'`). Every phone that opens the app is then connected, and Settings shows *Pre-set by your team*.

Together with the Gemma 4 option below, a phone then needs **nothing at all** in Settings.

### Optional – Gemma 4 for the whole team, no key on the phones

If you would rather not give the AI key to every enumerator, put it in the backend once and let Google's **Gemma 4** model do the photo analysis for everyone:

1. In the Apps Script code from Step 2, find `var AI_KEY = '';` and paste your key between the quotes (or add a Script Property named `AI_KEY` under *Project Settings*). Save.
2. **Deploy → Manage deployments → ✎ → Version: New version → Deploy.**
3. On each phone only the **Database endpoint** is needed (Step 3.3). Settings → **Test database** now says *Gemma 4 enabled for the team*, and *Analyze & fill* works with the provider on **Auto** (or choose *Gemma 4 via database backend* explicitly).

Gemma 4 is served by Google free of charge with rate limits (a few requests per minute per key). It analyses photos and typed transcripts; **voice recordings still need a Gemini key on the phone**. The existing Gemini and OpenRouter options are unchanged and take priority when a key is present.

### Step 4 – Choose your questionnaire (1 minute)

When you open the app the first time it asks how to start:

- **Use sample questionnaire** – a complete household survey (housing, income, water, assets, health, perceptions). Good to start immediately.
- **Design your own** – build questions like Google Forms.
- **Upload paper questionnaire** – upload a PDF or photos of your printed questionnaire; the app converts it to a digital form exactly as printed. Then you can press **Improve with AI** to tidy it up.

You can change the questionnaire any time with the **Edit** button (top right). After editing press **Apply** (this phone) or **Publish to team** (all phones get the new questionnaire; needs the team key from Step 2).

---

## Using it in the field

1. **Location** is detected by itself when the form opens (wait for the accuracy to show, e.g. *±8 m*). Nothing to press.
2. Type the **household head name** and other basics — or let the AI do it:
   - **Capture photo** (house, kitchen, water source, ID card, filled paper form…) and/or **Record** the interview in any language.
   - Press **Analyze & fill**. The AI looks at the photos, listens to the recording, writes the transcript and fills the answers in English. Filled answers are shown in **yellow** — check and correct them.
   - Each section also has its own 📷 (photo), ✨ (fill) and 🎙 (record) buttons. Recording with the section mic fills that section as soon as you stop.
3. Press **Submit**. The record is saved on the phone and sent to the Sheet (photos, recordings and transcript go to the Drive folder). If there is no internet, it is sent later automatically.
4. **PDF** (top right) makes a printable A4 copy of the filled form with photos, for signatures or files.

Photos come only from the camera (no gallery uploads) and are stamped with time, place and coordinates, so they are proof of the visit.

---

## Where the data goes

- **Answers:** one row per household in your Google Sheet (tab *Responses*).
- **Photos, recordings, transcripts:** the Drive folder **GeoSurvey Photos**, with links in the Sheet (columns `photo_urls`, `audio_urls`, `transcript_url`).
- **On the phone:** the *Records* tab keeps a copy of everything until you remove it. The **Files in Drive** column shows whether the files reached Drive; **Upload files** re-sends any that did not.

## Seeing the results

- **Records** tab – **Sync** sends this phone's pending records. **Sync all** additionally pulls **every record submitted by the whole team** — it asks once for the team key (`ADMIN_TOKEN`, default `GeoSurvey`; also in Settings → *Team key*). Rows marked *database* come from other phones and stay visible offline. Without the key a phone only ever sends its own records. Download everything shown as **CSV, JSON, SPSS (.sav)** or **KMZ** (map file for Google Earth).
- **Analysis** tab – automatic statistics on the team data once synced (tables, charts, reliability, factor analysis, SEM…) with a plain-language report. Press **Download report** for a file you can share.
- **Edit → Collected data** – the same team key lets you delete a wrong entry or publish the questionnaire to all phones.

---

## If something does not work

| Problem | What to do |
|---|---|
| *Analyze & fill* shows an error | Settings → **Test connection**. If it fails, create a new key at https://aistudio.google.com/app/apikey and paste it again. Using Gemma 4 via backend: the message *backend has no AI key* means `AI_KEY` is still empty in Code.gs, or the new version was not deployed. |
| *Test database* says "old Code.gs" | Paste the latest [backend/Code.gs](backend/Code.gs) again, then **Deploy → Manage deployments → ✎ → New version → Deploy**. |
| Message about *permission to call DriveApp* | Step 2.5 was skipped: run **authorizeDrive** in Apps Script, allow access, then deploy a new version. Then Records → **Upload files**. |
| Location stays on "Locating…" | Allow location for the site when the phone asks; go outside / near a window. Tap **⟳ Refresh**. |
| Microphone / camera does not open | Allow microphone and camera for the site in the phone's browser settings. |
| The app looks old after an update | Close it fully and open it again (or pull down to refresh). |
| I cannot find the Drive folder | Settings → **Test database** shows a direct link. It is in *My Drive* of the Google account used in Step 2. |

---

## Technical notes (for developers)

Static site (HTML/JS, no build step) hosted on GitHub Pages; backend is a Google Apps Script bound to a Sheet (rows) with Drive for media and a *Config* tab for the published questionnaire. AI: Gemini (`gemini-3.5-flash-lite` by default) with strict JSON schemas; audio and images are sent in one request. Alternatively Gemma 4 (`gemma-4-26b-a4b-it` / `gemma-4-31b-it`) through the Apps Script `action=ai` proxy, which holds the key server-side and only forwards `gemma-*` models; the client degrades schema → JSON mode → free text. Location: Geolocation API with a refining watch + OpenStreetMap Nominatim reverse geocoding. Exports: CSV/JSON, a native SPSS `.sav` writer (`sav.js`), KMZ with an in-browser ZIP writer, jsPDF for the A4 form. Analysis runs in a Web Worker (`stats-worker.js`): descriptives, t-test/ANOVA/chi-square/regression, Cronbach's α, EFA, CB-SEM (ML), PLS-SEM with bootstrap, mediation, moderation, higher-order constructs. Questionnaire schema is dynamic (`applySchema`); constructs derive from Likert construct codes. Files: `index.html`, `styles.css`, `config.js` (team defaults), `app.js`, `designer.js`, `analysis.js`, `stats-worker.js`, `exports.js`, `sav.js`, `pdf.js`, `sw.js`, `backend/Code.gs`, `backend/appsscript.json`. Deploy by pushing to `main`.
