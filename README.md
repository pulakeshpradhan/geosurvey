# GeoSurvey — AI-assisted socio-economic survey with built-in statistics

A free, browser-based household survey platform (in the spirit of Google Forms / KoboToolbox) that runs as a static site on GitHub Pages — no server, no build step — and adds:

| | Feature | How it works |
|---|---|---|
| ✨ | **Photo → auto-fill** (whole form or per section) | Compress photos on-device (≤ 1024 px JPEG), send to **Gemini** (default `gemini-3.5-flash-lite`) or any vision model on **OpenRouter** (incl. free ones) with a strict JSON schema; matching fields fill instantly and are highlighted for review. Each section has its own *capture / upload / AI* boxes so you can photograph e.g. the house, the water source or a ration card and fill just that section. Chrome's built-in Gemini Nano is used automatically when the browser exposes it (desktop Chrome only). |
| 🎙 | **Record → transcribe → auto-fill** | Tap Record: the interview is transcribed live with the browser's built-in speech engine (free; 14 Indian/English languages) into an editable transcript; **Analyze & fill** extracts the answers (with any photos). Browsers without a speech engine record audio and Gemini transcribes it. Every recording is kept as evidence — stored on-device, uploaded to Drive on sync (`audio_urls`), playable from Records. |
| 📍 | **One-click location** | Browser GPS + OpenStreetMap **Nominatim** reverse geocoding → village, PIN code, block, district, state, country, full address. |
| 🖼️ | **Geo/time-stamped photos** | Every photo is stamped (date-time, lat/lon ± accuracy, address, enumerator, section) before storage; up to 12 per household. |
| ☁️ | **Database** | Submissions → **Google Sheet**; stamped photos → **Google Drive** folder with links in the sheet (tiny Apps Script). Works offline: records queue on the device (IndexedDB for photos) and sync when back online. |
| ✏️ | **Edit (questionnaire designer)** | Starts empty: design your own, load the sample questionnaire, or upload the paper questionnaire (PDF/photos) — **Convert** transcribes it as printed, **Improve with AI** refines it on request. Google-Forms-style builder: click-to-edit cards with live preview, types (short answer, paragraph, multiple choice, checkboxes, linear scale 3–10 with custom end labels, number, date, phone), options, required / AI-fill switches, help text, drag-and-drop ordering, sections. **Apply** (device) or **Publish to team** (backend; every device adopts it). Constructs and the SEM model derive from the design. Also hosts the token-protected **Collected data** panel. |
| 📊 | **Analysis tab** | Automatic, in-browser statistics on the collected data (see below) with charts and an auto-written interpretation report. Re-runs whenever data changes. |
| ⬇️ | **Exports** | CSV, JSON, **SPSS `.sav`** (native system file with variable labels, value labels, measurement levels, DATETIME — opens directly in SPSS/PSPP/R `haven`), **KMZ** (Google Earth / QGIS placemarks with all fields and thumbnails), **A4 PDF** of the current form. |
| 📱 | **Mobile-first PWA** | Installable, opens offline, designed for phone data collection. |

**Live:** https://pulakeshpradhan.github.io/geosurvey/

---

## Quick start (enumerator)

1. Open the live link on a phone. ⚙️ **Settings** → paste a **Gemini API key** ([free at Google AI Studio](https://aistudio.google.com/app/apikey)) *or* an **OpenRouter key** ([openrouter.ai/keys](https://openrouter.ai/keys)) and the **database endpoint** (below). Keys stay in the browser's localStorage only.
2. **Detect location** → allow location access.
3. Add photos at the top (**Capture / Upload → Analyze & fill**) or inside a section (📷 / 🖼️ boxes, then the ✨ icon).
4. Review the yellow (AI-filled) fields, complete the rest — including the 18 perception statements (1–5) — and **Submit**.

## Database (Google Sheets + Drive) — 2 minutes

1. New Google Sheet → **Extensions → Apps Script** → replace the code with [`backend/Code.gs`](backend/Code.gs).
2. Set `ADMIN_TOKEN` to a long secret (this unlocks the Admin tab). Save.
3. **Deploy → New deployment → Web app**, *Execute as: Me*, *Who has access: Anyone* → Deploy → authorize (Sheets + Drive) → copy the `/exec` URL.
4. Paste it in GeoSurvey → ⚙️ Settings → *Database endpoint*.

Each submission becomes one row (new fields become new columns automatically); photos are saved to a Drive folder *GeoSurvey Photos* and linked in `photo_urls`. Without a token the endpoint only reveals the row count.

## Analysis tab

Everything runs client-side in a Web Worker (`stats-worker.js`, pure JS, no libraries) on device records or — when connected as admin — the whole cloud dataset:

- **Sample size**: margin of error, Cochran target, SEM 10-times rule.
- **Descriptives**: n, mean, SD, median, min, max, skewness, kurtosis; frequency bar charts; histograms.
- **Inferential**: Welch t-test, one-way ANOVA (η²), chi-square with Cramér's V, Pearson correlation heat-map, multiple regression (B, SE, β, t, p, R²).
- **Reliability**: Cronbach's α with item–total correlations.
- **EFA**: KMO, Bartlett's test, PCA eigenvalues + scree plot, varimax-rotated loadings, communalities, variance explained.
- **CFA (CB-SEM, maximum likelihood, BFGS)**: χ², df, CFI, TLI, RMSEA, SRMR; standardized loadings with SE/z/p (numerical Hessian); CR, AVE, Fornell–Larcker, HTMT.
- **Structural model (CB-SEM)**: fit indices, standardized paths, R², SVG path diagram.
- **PLS-SEM** (path weighting, mode A) with **bootstrapping**: path coefficients, t, p, 95% CI, f², R²; **mediation** (indirect effects, VAF, classification); **moderation** (two-stage interaction, simple slopes); **higher-order construct** (two-stage; *Livelihood Capacity* = Economic Security + Access to Services + Social Capital → Well-being).
- **Interpretation report** auto-written from thresholds; **Download report** saves a standalone HTML.

Use **Generate sample data** to create synthetic households with a known causal structure (kept separate from real records; remove with one click) to see the pipeline work before fieldwork.

Constructs are derived from Likert questions sharing a construct code; the default model (`STRUCTURAL_MODEL` in [`app.js`](app.js)) is used when the default constructs exist, otherwise an “all predictors → outcome” model is generated. Use Settings → “Show sample-data tools” to reveal the synthetic-data generator.

## Customising the questionnaire

Use the **Edit** tab (no code needed), or change the defaults in `SECTIONS` / `REMARKS_FIELDS` in [`app.js`](app.js). Field types: `text`, `number`, `date`, `tel`, `select`, `multi`, `likert`, `textarea`. `ai: true` exposes a field to the AI; `required: true` enforces it; a section's `photoHint` enables its photo tools.

## Files

| File | Purpose |
|---|---|
| `index.html`, `styles.css` | UI (Survey / Records / Analysis / Admin) |
| `app.js` | Questionnaire schema, AI providers, location, photo stamping, offline queue, admin |
| `exports.js`, `sav.js` | CSV, JSON, SPSS .sav writer, KMZ (own ZIP writer) |
| `designer.js`, `pdf.js` | Questionnaire designer; A4 PDF of the current form |
| `analysis.js`, `stats-worker.js` | Analysis UI + statistics engine |
| `backend/Code.gs` | Google Apps Script backend |
| `sw.js`, `manifest.json` | Offline PWA |

## Privacy & notes

- Photos go to the chosen AI provider for analysis and to your own Drive; nothing is sent anywhere else.
- Nominatim is queried with coordinates only — respect its [usage policy](https://operations.osmfoundation.org/policies/nominatim/).
- Statistical output is for exploratory use; verify key results in SPSS/AMOS/SmartPLS/R before publication.

## Deploy

GitHub Pages from `main` (root). Push to `main` and it is live within a minute. Bump `CACHE` in `sw.js` when shipping changes so installed apps refresh.
