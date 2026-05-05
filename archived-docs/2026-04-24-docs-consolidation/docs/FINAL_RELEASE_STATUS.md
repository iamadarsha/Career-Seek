## Solved

- Mandatory onboarding exists and incomplete onboarding routes users to `/onboarding`.
- The onboarding flow tracks these stages: `welcome`, `api_key`, `resume`, `analysis`, `clarification`, `review`, `preferences`, `scan`, `dashboard`.
- Gemini key validation distinguishes `missing`, `invalid`, `timeout`, `quota/rate limit`, `connectivity`, and `unknown` outcomes.
- Resume upload supports PDF and DOCX files.
- Resume parse metadata tracks scanned/image-based PDFs, low text density, weak date extraction, two-column or table-like order, and corrupted glyphs.
- Clarification answers are persisted.
- Current scan sources include LinkedIn, Naukri, Wellfound, Foundit, Indeed India, Instahyre, and curated official company career pages.
- `ScanOrchestrator` runs each configured source independently.
- Source failures are recorded per source.
- Jobs are deduplicated by URL, external ID, and title/company/location signature.
- Scans can be marked `partial` when some sources fail but useful jobs exist.
- Ranking includes title fit, skill overlap, experience fit, work-mode fit, include/exclude keywords, positive factors, negative factors, and warnings.
- `npm run build`, `npm run typecheck`, and `npm run doctor` passed in validation.
- Key production routes returned `200` in route validation: `/`, `/pipeline`, `/discover`, `/coach`, `/notifications`, `/analytics`, `/today`, `/settings`, `/settings/automation`, `/documents`, `/applied`, and `/saved`.

## Partially solved

- Source resilience is implemented through independent source runs, per-source failure records, partial scans, and dedupe, but live scraping still depends on site markup, anti-bot behavior, and network access.
- Curated official company career pages are supported as conservative employer-attributed leads, not guaranteed structured ATS feeds.
- Environment hardening improved with `doctor`, local folder checks, Playwright checks, and the required `better-sqlite3` rebuild after a Node ABI mismatch.
- OCR warning and recovery behavior exists for weak resume extraction, but OCR quality depends on local OCR capability.
- First-run route gating was validated, but the original validation did not prove a full fresh live onboarding-to-populated-dashboard run from a clean state.
- Google Jobs discovery is wired as discovery support, but live testing hit an `auth_gate`; it should remain fallback-only.

## Remaining gaps

- A full real Gemini path still requires a valid user Gemini API key.
- Live portal scraping is not guaranteed because public sites can change markup, block automation, rate limit requests, or require authentication.
- Google Jobs discovery hit an `auth_gate` in live testing and should be treated as fallback-only.
- Workday, BambooHR, Rippling, iCIMS, and SuccessFactors may be classified and browser-fallback supported, but not all have structured public extractors.
- Old proof files and local data may still exist; they were not deleted because deletion needs explicit approval.
- ATS score is advisory, local, and Gemini-assisted; it is not employer-certified and not an employer ATS guarantee.
- OCR quality still depends on installed local tools and source document quality.
- `npm audit` still reports 9 non-critical vulnerabilities that require a dedicated major-version upgrade pass.

## Local run

- One validated launch served at `http://localhost:3002` because ports `3000` and `3001` were occupied.
- A separate local production-style validation served at `http://localhost:3000`.
- The actual local port depends on port availability when the app starts.
- `npm run typecheck` should run after `npm run build` because build regenerates `.next/types`.
- `better-sqlite3` required rebuild after a Node ABI mismatch before validation could pass.
- The app persists local data under `JOBHUNT_DATA_DIR` when set, otherwise under `~/.jobhunt-india`.
- Local persisted data includes config, SQLite DB, uploads, generated outputs, logs, and related artifacts.

## Next hardening targets

- Add persistent background task recovery so interrupted scans and document jobs can resume or fail visibly after restart.
- Make `doctor.mjs` drive stricter capability-based safe modes for browser scraping, OCR, Gemini, and local storage.
- Run a fresh-state manual proof with a real Gemini key, current resume upload, clarification, scan, and populated dashboard validation.
- Add structured extractors for Workday, BambooHR, Rippling, iCIMS, and SuccessFactors where stable public endpoints exist.
- Keep portal adapters conservative with source-specific host/path checks and explicit failure taxonomy.
- Plan the major-version dependency upgrade needed to clear the remaining `npm audit` findings.
