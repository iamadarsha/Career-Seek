# Final Sourcing Expansion Report

Current authority: `docs/FINAL_RELEASE_STATUS.md`.

This file preserves the sourcing expansion implementation summary. Use the release-status document for the current validation limits and gap wording.

Date: 2026-04-24

## Mission Outcome

Career Seek is now structured as an India-first, official-careers-page-first discovery system. The current product shell and onboarding to dashboard flow remain intact. Portal scraping stays available as fallback coverage, but the default source ladder now starts with company-owned sources.

## Sources Added

- `company_ats`: primary ATS-backed employer source for Greenhouse, Lever, Ashby, Workday, Rippling, BambooHR, iCIMS, SuccessFactors, custom, and unknown/custom pages.
- `official`: second official company careers pass for employer pages outside structured ATS coverage.
- `google_jobs`: discovery support after official sources.
- `jobspy`: multi-board fallback.
- Portal fallbacks: LinkedIn, Naukri, Foundit/Monster India, Shine, Cutshort, Instahyre, Hirist, iimjobs, Wellfound, Indeed India, TimesJobs, Glassdoor, PlacementIndia.
- Optional intent-specific fallbacks remain tracked for freshers, field roles, and public recruitment.

## Database Seed

Created and seeded local source data into the active project SQLite database at `data/db/jobhunt.db`:

| Table | Rows |
|---|---:|
| `company_career_sources` | 285 |
| `role_family_pack_registry` | 13 |
| `ats_provider_mappings` | 9 |
| `source_registry` | 6 |

Source files:

- `data/company_careers_seed.csv`
- `data/role_family_packs.json`
- `data/ats_provider_mapping.json`
- `data/source_registry.json`

## Company Careers Source Map

The CSV has 285 official careers-page-first employer targets across 14 India-relevant sectors. It covers all companies requested in the mission plus additional India employers, and covers all 154 companies currently represented in the runtime TypeScript source map.

Runtime map summary:

- 154 company career sources.
- 86 sector tags.
- 24 runtime role families.
- ATS mix: 1 Greenhouse, 1 Workday, 1 Rippling, 2 iCIMS, 2 SuccessFactors, 51 unknown/custom, 96 custom.

Most ATS types are deliberately conservative because many India employers use custom pages, Workday-like portals, PDF notices, or tenant-specific career systems that should not be overclaimed as stable APIs.

## Role-Family Search Packs

Created 13 rich JSON packs covering:

- Engineering
- Product / Program / Strategy
- Design / Creative
- Data / AI / Analytics
- Sales / Growth / Marketing / Customer
- HR / Talent / People
- Finance / Legal / Compliance / Risk
- Operations / Supply / Logistics / Admin
- Education
- Healthcare
- Government / Public / Research
- Freshers / Trainees / Internships
- Specialized sectors

Runtime role expansion now supports 24 broad role families, including teachers, doctors, field roles, operations, finance, marketing, HR, pharma, public sector, manufacturing, travel, retail, and freshers.

## Vendor Repo Evaluation

All 10 requested repos are present under `vendors/` and evaluated in `docs/VENDOR_REPO_EVALUATION.md`.

Direct integration concepts accepted from:

- `adgramigna/job-board-scraper`
- `plibither8/jobber`
- `viktor-shcherb/job-seek`

Fallback/reference only:

- `speedyapply/JobSpy`
- `spinlud/linkedin-jobs-scraper`
- `spinlud/py-linkedin-jobs-scraper`
- `FranciscoMoretti/jobsparser`
- `ghiarishi/job-scraper`
- `Himaanshuuuu04/Job_Scraper`
- `ManiMozaffar/linkedIn-scraper`

Heavy dependency installs were intentionally skipped; lightweight Python syntax and Node package metadata checks passed.

## Scraping Resilience

- Default scan order is now company-owned first: `company_ats`, `official`, Google, JobSpy, then portals.
- `CompanyAtsAdapter` classifies all requested ATS families.
- Structured extraction remains implemented for Greenhouse, Lever, and Ashby.
- Workday, BambooHR, Rippling, iCIMS, SuccessFactors, custom, and unknown/custom sources are classified and handled through browser/link fallback.
- Per-company failures are collected and do not abort the whole scan.
- Source registry defines the priority ladder, health statuses, and failure taxonomy for UI/log surfacing.
- Career-page extraction rejects navigation/filter links such as reset/search controls so source pages do not pollute results with non-job CTAs.

## Document And CTA Hardening

- Gemini validation simulation no longer returns the hardcoded sample persona for JD analysis, resume, cover letter, outreach, or ATS checks.
- Resume and cover-letter generation now has deterministic local fallback based on the selected master profile and selected job.
- Grounding checks reject obvious foreign/sample markers, placeholder employers, unsupported skills/tools, and invented metrics.
- Download route requires an owned document asset, allowed extension, and a path inside the local Career Seek app data directory.
- CTA/a11y pass added labels, pressed/expanded states, clearer generation labels, visible async errors, and stable asset download links.

## Validation Results

Commands passed:

- `npm run typecheck`
- `node scripts/seed-source-universe.mjs`
- `git diff --check` on touched source/data/docs
- Runtime `tsx` validation of company map summary, default source order, PM expansion, teacher/doctor/operations inference, and manufacturing source selection.
- Worker browser audit covered `/onboarding`, `/discover`, `/pipeline`, and `/documents`.
- Worker download check returned `200 OK` with attachment headers for a generated DOCX.
- Local browser smoke test loaded `/discover`, `/pipeline`, `/documents`, and `/onboarding`; the Discover brief CTA opened successfully; Documents download completed successfully.
- Latest generated DOCX download returned `200 OK`, correct Word content type, attachment headers, and extracted text for the active profile rather than the older proof profile.
- Live official-company ATS smoke test returned 8 company-careers jobs while reporting partial Google/Stripe gates without aborting the run.
- Google discovery is wired into the ladder, but the live smoke test saw an `auth_gate`; this is expected to be non-fatal and should remain fallback/discovery only.

Seed verification:

```text
company_career_sources|285
role_family_pack_registry|13
ats_provider_mappings|9
source_registry|6
```

## Remaining Gaps

- Structured public API extraction is not yet implemented for every ATS family. Workday, BambooHR, Rippling, iCIMS, and SuccessFactors still rely on official-page fallback unless credentials or tenant-specific patterns are added.
- Government, PSU, hospital, university, and NGO sources often need PDF/notice parsing or department-specific pages.
- Existing previously generated document assets may still contain older generic output and should be regenerated.
- ATS score remains a local/Gemini-assisted keyword coverage estimate, not an employer ATS guarantee.
- During a dev-server Fast Refresh pass, `/api/jobs/active` briefly returned 404 before recompiling to 200; this was not reproducible as a stable failure but should be watched in future smoke tests.
