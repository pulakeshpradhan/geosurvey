---
title: 'GeoSurvey: an installation-free, AI-assisted field survey application with a Google Sheets backend and built-in statistical analysis'
tags:
  - JavaScript
  - field survey
  - household survey
  - data collection
  - progressive web app
  - Google Apps Script
  - geospatial
  - structural equation modelling
  - multimodal AI
authors:
  - name: Pulakesh Pradhan
    orcid: 0000-0003-3103-3617
    affiliation: 1
    corresponding: true
affiliations:
  - name: Department of Geography, Ravenshaw University, Cuttack, Odisha, India
    index: 1
date: 21 September 2026
bibliography: paper.bib
---

# Summary

GeoSurvey is a free, open-source application for household and socio-economic field surveys. It runs in the web browser of any phone, tablet or laptop without installation, and stores every submission in a Google Sheet owned by the survey team, with photographs, audio recordings and transcripts in the team's Google Drive. A questionnaire is designed in a visual editor, converted from a scanned paper form, or generated from a one-line brief by a large language model; it is then *published* so that every connected phone adopts it. In the field the app records a GPS fix and a reverse-geocoded address automatically, stamps photographs with time and location, queues submissions while offline, and can pre-fill answers from photographs or a recorded interview using a multimodal model. Collected records are streamed back from the database and can be exported as CSV, JSON, SPSS (`.sav`), KMZ and per-record PDF. A statistics engine that runs inside the browser produces descriptive statistics, reliability, exploratory factor analysis, covariance- and variance-based structural equation models, mediation and moderation tests, and a written report that updates whenever data change.

# Statement of need

Small research teams — postgraduate students, local NGOs, municipal or panchayat offices — routinely collect household data with paper forms and re-enter them in a spreadsheet, or with general-purpose form builders such as Google Forms [@googleforms] that lack location capture, offline operation, media handling and statistical export. Specialised platforms such as Open Data Kit [@hartung2010], KoboToolbox [@kobotoolbox] and Epicollect [@aanensen2009] solve the data-collection problem well, but require either a hosted server or an account on a third-party service, an app installation on every device, and form authoring in a spreadsheet dialect such as XLSForm; the analysis of the collected data happens elsewhere, typically in SPSS, R or SmartPLS, after several manual export steps.

GeoSurvey targets the gap between these two families. It has **no server to run and nothing to install**: the client is a static progressive web app served from GitHub Pages, and the backend is a single Google Apps Script bound to a Google Sheet in the team's own account, so the data never leave infrastructure the team already controls. Phones are connected by scanning a QR code or opening a team link; no typing of URLs or keys is needed. Because the analysis pipeline is part of the same application, a team can inspect reliability and factor structure of a scale after the first day of fieldwork and adjust the instrument, rather than discovering problems weeks later. The application was written for socio-economic surveys in rural India — its transcription and auto-fill prompts handle Indian languages and code-switched speech, and its geocoding returns village, block and district — but nothing in it is specific to that setting.

# Functionality

**Questionnaire design and management.** Sections, fields (text, number, date, telephone, single and multiple choice, Likert items, free text), the grouping of Likert items into *constructs* for the analysis engine, and AI hints are edited visually. *Design with AI* turns a brief or pasted text into a full instrument; a photographed paper questionnaire can be converted the same way. Several questionnaires can coexist in one spreadsheet, each with a dedicated response tab; an updated questionnaire can continue in its current tab or start a new one so that exports remain column-consistent. A `.geosurvey` project file (schema, team link, interview language) is saved to Drive on every publication and can be opened on any device to reconnect it instantly.

**Field data collection.** Automatic GPS fix with accuracy and altitude, reverse geocoding through the Google geocoder with an OpenStreetMap Nominatim fallback [@osm], time- and location-stamped photographs, audio recording of the interview, an offline submission queue with background synchronisation, and a form PDF for respondents. *Analyze & fill* sends the photographs, recordings and any typed transcript to a multimodal model and maps the answers to the questionnaire, returning English values for review together with a verbatim transcript. Three engines are supported: Gemini [@gemini2023] with the user's own key, an open-weight Gemma model [@gemma3] proxied by the backend so that enumerators need no key at all, and Chrome's built-in on-device model (desktop Chrome, photographs and text).

**Team and access model.** Submissions carry a random device identifier; a phone can list, re-upload files for and delete only its own records. Every administrative action — publishing or deleting a questionnaire, listing all records, exporting the team data set, updating the backend — is checked server-side against an admin token stored as an Apps Script property. The token is held only in session storage on the admin's device, and one central routine forgets it the moment the backend rejects it. The backend updates itself from the repository through the Apps Script API on a daily trigger, carrying its configuration over, so a deployed survey keeps receiving fixes without any manual redeployment.

**Exports and analysis.** CSV, JSON, KMZ (placemarks with attributes for QGIS or Google Earth), SPSS `.sav` with variable labels, value labels and measurement levels (a self-contained writer, no dependency), and per-record PDF with photographs and Drive links. The analysis engine is a dependency-free Web Worker (`stats-worker.js`) implementing descriptive statistics, Welch's *t*-test, one-way ANOVA, $\chi^2$ tests, ordinary least squares, Cronbach's $\alpha$ [@cronbach1951], Kaiser–Meyer–Olkin and Bartlett tests [@kaiser1974], exploratory factor analysis by principal components with varimax rotation, covariance-based confirmatory factor analysis and structural models by maximum likelihood with CFI, TLI, RMSEA and SRMR [@hu1999], composite reliability and average variance extracted [@fornell1981], PLS-SEM with bootstrap confidence intervals, HTMT discriminant validity [@henseler2015], mediation, two-stage moderation and higher-order constructs [@hair2019]. Results are rendered as tables, path diagrams and a narrative report that can be downloaded.

# Design

The client is about 5,000 lines of plain HTML, CSS and JavaScript with no framework and no build step, which keeps it auditable by the researchers who deploy it and lets it run from any static host. State lives in `localStorage` and IndexedDB; a service worker caches the shell for offline use. The backend, `backend/Code.gs`, exposes a small JSON API (`schema`, `ping`, `geocode`, `list`, submit, `attach`, `ai`, `selfUpdate` and the admin actions) and keeps a questionnaire registry in a *Config* tab. Every served file carries a version string and the client, service worker and backend versions are kept aligned, so an updated site invalidates stale caches on phones automatically.

# Quality control

Thirteen browser test suites (`tests/`, 165 checks) exercise the application end to end with Playwright [@playwright] against an in-memory mock of the Apps Script backend: form rendering and validation, the offline queue and synchronisation, admin gating and key rejection, multi-questionnaire publication and sheet selection, project files, AI design flows with and without an engine, geocoding fallback, PDF generation, the QR team link (decoded back with jsQR), and layout from 320 px to desktop widths.

# Acknowledgements

The author thanks the OpenStreetMap contributors whose data provide the geocoding fallback, and Google for the free tiers of Apps Script, Drive and AI Studio on which the no-cost deployment relies.

# References
