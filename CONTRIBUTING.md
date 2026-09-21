# Contributing to GeoSurvey

Thank you for your interest. GeoSurvey is a small, dependency-free web application; contributions of every size are welcome.

## Getting help

- **Questions and support:** open a [GitHub issue](https://github.com/pulakeshpradhan/geosurvey/issues) with the label `question`. Please say which phone/browser you use and whether the app is connected to a database.
- **Setup:** the [README](README.md) and the [setup slides](https://pulakeshpradhan.github.io/geosurvey/guide/) cover installation of the backend and connection of phones.

## Reporting a bug

Open an issue with:

1. what you did (steps), what you expected and what happened;
2. the app version (Settings → bottom of the dialog, e.g. `v1.18.3 · backend v1.18.3`);
3. phone model, browser and whether you were offline;
4. a screenshot if the problem is visual.

Never paste your admin key, your AI key or a team link into a public issue — these give access to your data.

## Security

If you find a vulnerability (for example a way to read or change records without the admin key), please e-mail the maintainer at geographyspatial@gmail.com instead of opening a public issue.

## Proposing a change

1. Fork the repository and create a branch from `main`.
2. Make your change. The app is plain HTML/CSS/JavaScript with no build step: open `index.html` through any static file server (for example `npx serve .`) to run it. The backend is `backend/Code.gs` (Google Apps Script).
3. Run the test suites (`cd tests && npm install && npm test`; Google Chrome is required) and add or adjust a check when you change behaviour.
4. Bump the cache-busting version if you change a served file (`?v=` in `index.html`, `VERSION` in `sw.js`, `APP_VERSION` in `app.js`, `BACKEND_VERSION` in `backend/Code.gs`) so phones pick the change up.
5. Open a pull request that explains *why* the change is needed. Keep the style of the surrounding code (short functions, comments only where the intent is not obvious).

## Scope

Good candidates: bug fixes, accessibility, translations of the interface, new export formats, additional statistical procedures with a reference implementation to compare against, and documentation. Please open an issue first for larger features so the design can be discussed.

## Code of conduct

Be respectful and constructive. Harassment or discriminatory behaviour of any kind is not tolerated in issues, pull requests or any other project space.
