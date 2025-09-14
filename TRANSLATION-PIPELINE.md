## Levante Surveys – Translation & Deployment Pipeline

This README documents the current XLIFF-based workflow for importing multilingual survey translations and deploying survey JSONs to Google Cloud Storage (GCS).

### Overview
- Source of truth for translations: Crowdin exports in the `l10n_pending` branch of `levante_translations`.
- Formats used:
  - Combined survey XLIFF per locale: `<locale>-surveys.xliff` (e.g., `es-CO-surveys.xliff`).
  - Item bank XLIFF per locale: `item-bank-translations-<locale>.xliff` (underscore variants supported).
- Importer behavior:
  - Maps XLIFF trans-units to the appropriate JSON nodes across all surveys.
  - Applies survey XLIFF first, then item bank XLIFF last, so item bank overrides win.
  - Strips all HTML tags from imported targets; preserves plain text verbatim from Crowdin.
  - Keeps `default` synchronized with `en-US` when importing `en-US`.
  - Includes a special-case mapping for `ChildSurveyIntro` to ensure it maps to the correct HTML element.

### Prerequisites
- Node 20+ installed (see `package.json` engines).
- Access to `levante_translations` via GitHub (public raw endpoints).
- GCP credentials configured for deploying to the target buckets (Application Default Credentials or equivalent).

### Key NPM Scripts
- Download all XLIFFs:
```bash
npm run xliff:download:all            # downloads only changed files (by remote SHA)
npm run xliff:download:all -- --force # overwrite and re-download everything
```

- Import all XLIFFs into surveys (writes `*_updated.json` by default):
```bash
npm run xliff:import:all              # survey XLIFF first, then item bank overrides
```

- One-shot update (download then import):
```bash
npm run xliff:update:all              # equivalent to download:all then import:all
```

- Import a single XLIFF file (advanced):
```bash
npm run xliff:import:combined -- translations/xliff/es-CO-surveys.xliff
npm run xliff:import:combined -- translations/xliff/item-bank-translations-es-CO.xliff
```
Add `-- --inplace` at the end to overwrite the base JSONs instead of writing `*_updated.json`.

### Importer Guarantees (HTML & Defaults)
- HTML is not injected. Any legacy HTML in the base files is stripped during import for all language keys.
- `default` is auto-synced to `en-US` on `en-US` imports.
- Item bank translations are applied last to override survey entries where they overlap.

### Verification Tips
Use `jq` to spot-check important nodes. Example for `ChildSurveyIntro`:
```bash
jq -r '.pages[0].elements[] | select(.name=="ChildSurveyIntro").html["es-CO"]' surveys/child_survey_updated.json
jq -r '.pages[0].elements[] | select(.name=="ChildSurveyIntro").html["en-US"]' surveys/child_survey_updated.json
jq -r '.pages[0].elements[] | select(.name=="ChildSurveyIntro").html["default"]' surveys/child_survey_updated.json
```
Expect no HTML tags and the correct text from Crowdin.

### Deployment
The deployment pipeline uploads the updated surveys to GCS and performs basic validation.

- Deploy to Dev:
```bash
npm run deploy-surveys:dev                # downloads XLIFF, imports, validates, uploads
# Useful flags
npm run deploy-surveys:dev -- --skip-download   # use local XLIFFs
npm run deploy-surveys:dev -- --skip-validation # skip local validation
npm run deploy-surveys:dev -- --force           # continue even if validation reports issues
```

Current dev targets:
- Primary bucket: `gs://levante-assets-dev` (uploads as top-level survey JSONs)
- Mirror: `gs://levante-assets-dev/surveys/<file>.json`

- Deploy to Prod:
```bash
npm run deploy-surveys:prod
```
Current prod target in code: `gs://road-dashboard` (legacy). If deploying to `levante-assets-prod/surveys`, use the dedicated uploader or manual copy as needed.

### Survey Preview & Manager Notes
- Survey Preview supports environment selection including "Current Production" (`levante-assets-prod/surveys`) and dynamically shows only languages present in each survey.
- Survey Manager default source is `https://storage.googleapis.com/levante-assets-dev/surveys` and supports switching between Local, Dev, and Prod. Lists are alphabetized and descriptions are cleaned of "updated".
- Cache-busting is applied to GCS fetches using `_t=Date.now()`.

### Force-refresh Patterns
- Re-download all XLIFFs:
```bash
npm run xliff:download:all -- --force
```
- Re-apply a specific locale’s item bank last:
```bash
npm run xliff:import:combined -- translations/xliff/item-bank-translations-es-CO.xliff
```

### Troubleshooting
- CORS errors when loading from GCS: ensure the bucket has an appropriate CORS policy and avoid request headers that trigger preflight (e.g., don’t add `Cache-Control` headers in client requests).
- Stale content in the Manager/Preview: switch sources to clear the in-app cache, and cache-busting is already appended to URLs.
- XLIFF looks correct but JSON shows HTML: ensure you re-import after pulling latest (`xliff:download:all`), and confirm imports are not in `--inplace` mode if you expect to deploy `*_updated.json`.

### File Map
- `translations/xliff/` – downloaded XLIFF files from `l10n_pending`.
- `scripts/import-xliff-combined.js` – XLIFF importer; strips HTML, syncs defaults.
- `scripts/import-xliff-all.js` – runs the importer across all XLIFFs (surveys first, then item bank).
- `scripts/download-crowdin-xliff.js` – downloader with SHA-based change detection; `--force` to overwrite.
- `scripts/deploy-surveys.js` – deployment pipeline (Dev/Prod).

### Common Workflows
- Update all translations and preview locally:
```bash
npm run xliff:update:all
# open the Survey Manager (Local source) to review *_updated.json
```

- Deploy latest to Dev end-to-end:
```bash
npm run deploy-surveys:dev
```

- Targeted override to ensure item bank wins for a locale:
```bash
npm run xliff:download:all -- --force
npm run xliff:import:all
npm run xliff:import:combined -- translations/xliff/item-bank-translations-es-CO.xliff
```


