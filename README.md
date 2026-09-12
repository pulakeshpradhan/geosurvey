# GeoSurvey — AI-assisted socio-economic survey

A free, browser-based household survey form (like Google Forms / KoboToolbox) with three superpowers:

| Feature | How it works | Cost |
|---|---|---|
| ✨ **Photo → auto-fill** | Capture/upload a photo of the dwelling, assets, a filled paper form or an ID card. The image is compressed in-browser (≤1024 px JPEG) and sent to **Gemini** with a strict JSON schema; matching fields are filled instantly and highlighted for review. | Free tier of Google AI Studio |
| 📍 **One-click location** | Browser GPS + **OpenStreetMap Nominatim** reverse geocoding → village, PIN/postal code, block, district, state, country, full address. | Free / open source |
| ☁️ **Database** | Submissions go to a **Google Sheet** through a tiny Apps Script web app. Works offline: records queue on the device and sync when back online. CSV/JSON export built in. | Free |

Runs entirely as a static site — no server, no build step, no frameworks. Installable as a PWA and opens offline.

**Live:** https://pulakeshpradhan.github.io/geosurvey/

---

## Quick start (enumerator)

1. Open the live link on a phone or laptop.
2. ⚙️ **Settings** → paste your **Gemini API key** (free at [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)) and the **database endpoint** (below). Keys stay in your browser's localStorage only.
3. Tap **📍 Detect location** → allow location access.
4. **📷 Capture** or **🖼️ Upload** photo(s) → **✨ Analyze & Fill** → review the yellow (AI-filled) fields, correct anything, fill the rest.
5. **Submit**. The record is saved on-device and synced to the sheet.

## Database (Google Sheets)

1. Create a new Google Sheet → **Extensions → Apps Script**.
2. Replace the code with [`backend/Code.gs`](backend/Code.gs) and save.
3. **Deploy → New deployment → Web app**, *Execute as: Me*, *Who has access: Anyone* → Deploy → authorize → copy the `/exec` URL.
4. Paste it in GeoSurvey → ⚙️ Settings → *Database endpoint*.

Each submission becomes one row; new fields become new columns automatically. The **Responses** tab in the app shows both device-local records and the latest rows from the sheet.

> Prefer another backend? `sendRecord()` in `app.js` is a single `fetch` POST of a flat JSON object — point it at Supabase, Firebase, Airtable, or any webhook.

## Customising the questionnaire

Edit the `LOCATION_FIELDS`, `SECTIONS` and `REMARKS_FIELDS` arrays at the top of [`app.js`](app.js). Supported types: `text`, `number`, `date`, `tel`, `select`, `multi` (checkboxes), `textarea`. Add `ai: true` to any field you want Gemini to try to fill; `required: true` to enforce it.

## Speed & accuracy notes

- Images are resized on-device to 768–1536 px (setting) and JPEG-compressed before upload — typically 3–5 MB → ~150 KB, so uploads take under a second on mobile data.
- `gemini-2.5-flash` is used with `thinkingBudget: 0` and a `responseSchema`, so the model returns only valid enum values and no free text — typical round trip 2–5 s.
- Select values are matched case-insensitively; anything the model can't map is dropped rather than guessed.
- Personal fields (name, age, income…) are only filled when a document/form is visible in the photo — never inferred from appearance.

## Privacy

- Gemini key, endpoint and drafts live only in the browser's localStorage.
- Photos are sent to Google's Gemini API for analysis and are **not** stored in the sheet — only an optional 320 px thumbnail (toggle in Settings).
- Nominatim is queried with coordinates only; please respect its [usage policy](https://operations.osmfoundation.org/policies/nominatim/) (≤1 request/sec).

## Development

Just open `index.html` — or serve the folder (`npx serve .`) so geolocation/camera work (they require `https://` or `localhost`).

## Deploy

Hosted on GitHub Pages from the `main` branch root. Push to `main` and it's live.
