# India Job Source Universe

Career Seek now tracks an India-first source universe in `src/lib/services/scraping/source-universe.ts`. The scan flow remains onboarding -> preferences -> scan -> dashboard, but the default scan order is now a ladder that favors employer-owned sources before fragile public portals.

## Default Source Ladder

1. `company_ats` - ATS-backed company career pages.
2. `google_jobs` - Google for Jobs/search discovery where Google allows automated public access.
3. `jobspy` - JobSpy-style multi-board fallback implemented in TypeScript without executing vendored Python code.
4. `linkedin` - LinkedIn-specific public guest fallback.
5. `naukri` - Naukri India API/page hybrid adapter.
6. `foundit` - Foundit / Monster India adapter.
7. `shine` - broad India portal.
8. `cutshort` - startup/tech/product portal.
9. `instahyre` - startup/tech portal.
10. `hirist` - tech/product portal.
11. `iimjobs` - management, product, strategy, finance.
12. `wellfound` - startup fallback, later in the ladder because public pages often gate.
13. `indeed` - broad fallback, later because blocking is common.
14. `timesjobs` - broad India portal.
15. `glassdoor` - broad fallback, expected to fail gracefully when gated.
16. `placementindia` - broad India portal.
17. `official` - manual/company-page recovery mode.

## Source Categories

| Category | Sources tracked | Default scan behavior |
|---|---|---|
| Broad India portals | Naukri, LinkedIn Jobs, Foundit/Monster India, Indeed India, Shine, TimesJobs, Glassdoor, PlacementIndia | Enabled by default except portals with known blocking are lower priority. |
| Startup / tech / PM / product / design | Wellfound, Cutshort, Instahyre, Hirist, iimjobs, Hirect, Google discovery | Enabled by default for stable sources; Hirect tracked but disabled until stable. |
| Freshers / internships | Internshala, Freshersworld | Tracked and available; default-off unless role pack or user selection targets freshers/internships. |
| Blue/grey collar | Apna, WorkIndia | Tracked and available; default-off unless role pack or user selection targets operations/field roles. |
| Government / public recruitment | Sarkari Result, FreeJobAlert, official `.gov.in` recruitment discovery | Tracked and available; default-off unless government search is selected. |
| Company career pages | Greenhouse, Lever, Ashby, BambooHR, Rippling, Workday, custom career pages | `company_ats` enabled first; `official` recovery remains last. |

## Aliases

Aliases are normalized before adapter lookup:

| Alias | Canonical source |
|---|---|
| `monster`, `monster_india` | `foundit` |
| `company`, `careers`, `ats`, `company_careers` | `company_ats` |
| `google`, `google_for_jobs` | `google_jobs` |
| `sarkari`, `freejobalert`, `govt` | `government` |
| `official_companies`, `manual_url` | `official` |

## Health And Failure Handling

Each adapter still receives a source-level health check before scraping. A failed health check is visible in progress logs but does not stop the scan; the adapter still attempts its search URL so temporary health-check failures do not suppress usable results.

Failure taxonomy now includes: `selector_not_found`, `blocked`, `rate_limited`, `timeout`, `auth_gate`, `empty_results`, `dependency_missing`, `partial_source_failures`, `source_drift`, `browser_error`, `parse_error`, and `unknown`.
