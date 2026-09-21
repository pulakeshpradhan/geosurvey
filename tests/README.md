# Tests

Browser regression suites for GeoSurvey. Each suite starts a tiny static server for the
repository root, intercepts every call to `script.google.com` with an in-memory mock of the
Apps Script backend, and drives Google Chrome with Playwright.

```bash
cd tests
npm install          # playwright-core + jsqr
npm test             # runs all suites; exit code 1 on any failure
node settest.js      # or a single suite
```

Google Chrome must be installed (`CHROME=/path/to/chrome` overrides the binary).
Screenshots land in `tests/out/`.

| Suite | Covers |
|---|---|
| `uitest` | form rendering, photo card, validation, submit, offline queue |
| `settest` | Settings dialog: endpoint, radios, status tiles, Enter-key handling, project tiles |
| `streamtest` | Sync / Sync all with the admin key, local cache pruning, streaming DB rows, QR team link (decoded with jsQR) |
| `edittest` | admin gating of Edit and the Data panel, invalid-key handling |
| `projtest` | `.geosurvey` project file: save, download, open, Drive backup |
| `multiq` | several questionnaires, dedicated response tabs, default / new / delete, sheet choice on update |
| `aidesign` / `noai` | Design with AI (auto / design / format) and the no-AI notice |
| `welcome2` | first-load welcome popup |
| `sizes` / `header` | layout at 320–1024 px: no overlap or horizontal overflow in the header and dialogs |
| `geotest` | reverse geocoding (backend → OSM fallback), editable address, locked GPS |
| `pdftest` | per-record PDF and form PDF |
