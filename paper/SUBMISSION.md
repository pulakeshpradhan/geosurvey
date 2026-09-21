# JOSS submission — answers for https://joss.theoj.org/papers/new

Copy these into the form. Everything else the form asks for is already in the repository.

| Field | Answer |
|---|---|
| **Title** | GeoSurvey: an installation-free, AI-assisted field survey application with a Google Sheets backend and built-in statistical analysis |
| **Software's Git repository URL** | https://github.com/pulakeshpradhan/geosurvey |
| **Name of git branch containing the paper** | *(leave blank — `paper/paper.md` is on `main`)* |
| **Software version** | v1.18.3 |
| **Type of submission** | New submission |
| **Main subject of the paper** | Social, Behavioral, and Economic Sciences |

**Message to editors** (paste as is, edit if you wish):

> No portion of this work — code, documentation or paper — has been published, submitted or is planned for submission to any other peer-reviewed venue.
>
> GeoSurvey is an open-source (MIT) progressive web app for household and socio-economic field surveys: it runs in the phone browser with nothing to install, stores submissions in the team's own Google Sheet/Drive through a single Apps Script backend, pre-fills answers from photographs and recorded interviews with multimodal models, and includes a dependency-free in-browser statistics engine (reliability, EFA, CB-SEM, PLS-SEM, mediation/moderation) with SPSS/KMZ/PDF export. Repository: https://github.com/pulakeshpradhan/geosurvey · live app: https://pulakeshpradhan.github.io/geosurvey/ · tests: `tests/` (13 Playwright suites, 165 checks).
>
> I am the sole author and maintainer. I have no financial or other conflicts of interest to disclose. The software uses free tiers of Google Apps Script, Drive and AI Studio, and optionally the user's own Gemini or OpenRouter key; I have no affiliation with Google or any AI-model provider.

**Checklist**

- [x] I certify that I am submitting software for which I am a primary author.
- [x] I have verified that my paper compiles — the workflow `.github/workflows/draft-pdf.yml` (the official `openjournals/openjournals-draft-action`) runs on every push that touches `paper/`; the PDF is attached to the run as the artifact **paper**. A local preview (`paper/build.sh` → `paper/paper.pdf`) is committed as well.
- [x] I confirm that I read and will adhere to the JOSS code of conduct.

## Before you press Submit

1. **Push and check the Action once.** After the push, open *Actions → Draft PDF* on GitHub, wait for the green tick and download the `paper` artifact — that is the PDF JOSS will produce. (The local `paper.pdf` uses the same text and references but a slightly different layout.)
2. **Release tag.** `v1.18.3` is tagged in git. JOSS asks for the version at submission and, at acceptance, for a Zenodo/figshare archive of that release with a DOI — create it when the editor asks (GitHub → Releases → Zenodo integration), not now.
3. **Affiliation / ORCID** in `paper/paper.md` and `CITATION.cff` were taken from your public ORCID record (Department of Geography, Ravenshaw University). Edit if you prefer a different form.
4. **Repository checklist reviewers use** (all in place): OSI licence (`LICENSE`, MIT) · README with installation, usage and example · `CONTRIBUTING.md` (how to contribute, report issues, get support) · automated tests (`tests/`, `npm test`) · `CITATION.cff` · `paper/paper.md` + `paper/paper.bib` with DOIs on every reference that has one (all verified against Crossref/arXiv on 21 Sep 2026).

## One honest caveat

JOSS editors look at the age and commit history of a project when judging "substantial scholarly effort". GeoSurvey has ~5,000 lines of original code, 60+ commits and a full test suite, but its public history starts on 12 September 2026. If the editor raises this, the usual remedies are evidence of use (a survey run with it, a citation, external users or issues) — worth collecting as they come. Submitting now is reasonable; a rejection on that ground is not final and resubmission is allowed.
