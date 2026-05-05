# Scraping Hardening Report

## What Changed

- Added a source universe and explicit source ladder in `src/lib/services/scraping/source-universe.ts`.
- Added role-family expansion packs in `src/lib/services/scraping/role-family-packs.ts`.
- Added a 99-company India career source map in `src/lib/services/scraping/company-careers-map.ts`.
- Added `company_ats`, `google_jobs`, and `jobspy` adapters.
- Added generic configured adapters for Shine, TimesJobs, Glassdoor, PlacementIndia, Cutshort, Hirist, iimjobs, Hirect, Internshala, Freshersworld, Apna, WorkIndia, and government/public recruitment discovery.
- Kept existing LinkedIn, Naukri, Wellfound, Foundit, Indeed, Instahyre, and official-company adapters in place.
- Updated onboarding scan copy and default saved preferred portals to use the new source ladder.

## Resilience Improvements

| Area | Improvement |
|---|---|
| Provider order | ATS/company pages are tried before brittle public portals. Google discovery and JobSpy-style fallback run before single-board custom adapters. |
| Partial scans | Existing portal-run isolation remains; one source failure records a source failure and the rest continue. |
| Source aliases | `monster` maps to `foundit`; `company`, `careers`, and `ats` map to `company_ats`; `google` maps to `google_jobs`. |
| Health checks | Every adapter has a health check. Inconclusive checks no longer suppress scrape attempts. |
| Selector fallback | Generic India adapters use URL pattern extraction and title/location/salary heuristics from `BasePortalAdapter`. |
| ATS fallback | `company_ats` uses structured Greenhouse, Lever, and Ashby endpoints where possible, then falls back to public career-page anchor extraction. |
| Failure taxonomy | Added `rate_limited`, `dependency_missing`, `partial_source_failures`, and `source_drift` alongside existing failure codes. |
| Safe mode | If Playwright/Chrome is unavailable, source runs are still recorded as failed with a browser-safe message instead of crashing the app. |
| Dedupe | Existing URL/external-id/signature dedupe remains active across all portals, company career pages, and discovery sources. |

## Validation Results

Commands run:

```bash
npm run typecheck
```

Result: passed.

Static validation:

```text
sourceCount: 23
defaultSources: company_ats, google_jobs, jobspy, linkedin, naukri, foundit, shine, cutshort,
  instahyre, hirist, iimjobs, wellfound, indeed, timesjobs, glassdoor, placementindia, official
companyMap.companyCount: 99
companyMap.atsTypes: custom=96, greenhouse=1, workday=1, rippling=1
Product Manager query titleVariantCount: 13
Salary parsing: "INR 17 LPA to INR 25 LPA" -> 1700000
```

Live smoke validation:

| Test | Result |
|---|---|
| Company career pages, software-engineering query, first 8 companies | Returned 4 real jobs from Salesforce and SAP. Status `partial` because Google careers gated. |
| Company career pages, product-management query, first 30 companies | Returned 0 in the limited smoke after stricter filtering; source failed gracefully and did not produce fake jobs. Full default scan uses 42 companies plus portals. |
| Google discovery | Current network/browser was blocked by Google unusual-traffic gate. Adapter returned source failure `blocked`; scan can continue. |
| Dedupe static proof | In-batch duplicate signatures are removed from the unique set even when they come from different portals. |

## Remaining Risks

- Google for Jobs cannot be guaranteed in all networks because Google often blocks automated access. The adapter is useful where supported and safe when blocked.
- Many large employers use custom JavaScript career pages; the app intentionally avoids inventing jobs from generic career pages when public links do not expose actual job titles.
- Direct JobSpy Python integration is not enabled by default because executing third-party vendor code would add runtime and security risk.
- Hirect, Internshala, Freshersworld, Apna, WorkIndia, and government sources are tracked but default-off until role-specific flows opt into them.
