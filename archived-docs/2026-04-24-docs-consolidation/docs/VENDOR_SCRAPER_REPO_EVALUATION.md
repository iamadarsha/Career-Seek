# Vendor Scraper Repo Evaluation

Vendor repositories were cloned into `vendors/` for static inspection. I did not run third-party build/test scripts from these newly cloned repositories; doing so would execute fresh external code. Build/test status is therefore recorded as "not executed" unless the repo had already been exercised outside this evaluation.

## Requested Repositories

| Repo | Clone status | Build/test status | Last commit inspected | Runtime | Source coverage | Direct reusable modules | Integration decision |
|---|---|---|---|---|---|---|---|
| `speedyapply/JobSpy` | Present in `vendors/JobSpy` | Not executed | 2026-02-18 | Python | LinkedIn, Indeed, Glassdoor, Google, ZipRecruiter, Bayt, Naukri-style multi-board ideas | Source taxonomy, result normalization patterns, fallback board concepts | Reference plus `jobspy` TypeScript fallback adapter. Direct Python execution deferred. |
| `spinlud/linkedin-jobs-scraper` | Present in `vendors/linkedin-jobs-scraper` | Not executed | 2025-03-14 | TypeScript / Puppeteer | LinkedIn public/authenticated scraping | Query construction and event model | Reference-only; current app keeps Playwright-based LinkedIn adapter. |
| `spinlud/py-linkedin-jobs-scraper` | Present in `vendors/py-linkedin-jobs-scraper` | Not executed | 2025-03-14 | Python / Selenium | LinkedIn public/authenticated scraping | Field mapping and fallback ideas | Reference-only; Selenium runtime is not added to app. |
| `FranciscoMoretti/jobsparser` | Cloned to `vendors/jobsparser` | Not executed | 2025-05-25 | Python | LinkedIn, Indeed, Google; includes JobSpy-related package | CLI workflow and search expansion references | Reference-only; overlaps with JobSpy and app-level orchestration. |
| `adgramigna/job-board-scraper` | Cloned to `vendors/job-board-scraper` | Not executed | 2025-11-26 | Python / Scrapy / dbt | Lever, Greenhouse, Ashby, Rippling style ATS boards | ATS structured API patterns, especially Ashby/Rippling | Integrated concepts into `company_ats`; no direct runtime dependency. |
| `plibither8/jobber` | Cloned to `vendors/jobber` | Not executed | 2022-10-09 | TypeScript | Ashby, Greenhouse, Lever, BambooHR, Workable | Small board endpoint implementations | Integrated Greenhouse, Lever, and Ashby endpoint patterns into `company_ats`. |
| `viktor-shcherb/job-seek` | Cloned to `vendors/job-seek` | Not executed | 2026-03-12 | Python / Streamlit / Playwright | Company job boards and aggregator ideas | Company-following/product direction | Reference-only; README notes old scrapers are not maintained. |
| `ghiarishi/job-scraper` | Cloned to `vendors/job-scraper` | Not executed | 2024-06-22 | Python | Google search discovery for Lever/Greenhouse jobs | Google-to-ATS discovery idea | Reference-only; app now has `google_jobs` discovery and company ATS adapter. |
| `Himaanshuuuu04/Job_Scraper` | Cloned to `vendors/Job_Scraper` | Not executed | 2025-09-21 | Python / Playwright | Company enrichment plus job scraping | Company URL enrichment methodology | Reference-only; app uses curated source map instead of importing this assignment-style project. |
| `ManiMozaffar/linkedIn-scraper` | Cloned to `vendors/linkedIn-scraper` | Not executed | 2024-04-05 | Python / Playwright / Celery / PyAutoGUI | LinkedIn scraping with heavier automation stack | Anti-blocking and queue architecture ideas | Rejected for direct integration because it is heavy, credential-oriented, and too invasive for local app flow. |

## Naukri-Specific Repos Inspected

| Repo/path | Clone status | Last commit inspected | Runtime | Value | Decision |
|---|---|---|---|---|---|
| `vendors/naukri-scraper` | Present | 2020-10-15 | Python / requests / BeautifulSoup | Historical Naukri extraction patterns and category spreadsheet corpus | Reference-only; stale and not maintainable enough for direct use. |
| `vendors/naukriscraper` | Present | 2019-10-18 | Python / Scrapy | Old Naukri Scrapy structure | Reference-only; too stale. |
| `vendors/WebScraping` | Present | 2023-11-16 | Python / requests | Public Naukri API field reference | Reference-only; app already has a safer Naukri API/page hybrid adapter. |

## Integrated Learnings

- JobSpy and jobsparser informed the source ladder: broad boards are useful as fallback, but direct vendor execution should be opt-in.
- jobber directly informed the Greenhouse, Lever, and Ashby structured endpoint support in `src/lib/services/scraping/adapters/company-ats.ts`.
- job-board-scraper reinforced keeping ATS board output normalized early and preserving raw payload/extraction metadata.
- Naukri-specific repos are too stale to vendor directly; the current Naukri adapter keeps its API fallback and page fallback inside the app codebase.

## Reject Reasons For Direct Vendoring

- Different runtimes would increase bootstrap fragility: Python, Selenium, Scrapy, Celery, PyAutoGUI, dbt, and external databases.
- Some repos assume authenticated scraping or credentialed browser sessions.
- Running third-party code would create security and maintenance risk in a local-first personal job-search app.
- The app already has source-level orchestration, dedupe, scan logs, scoring, and document generation; importing whole projects would duplicate the shell instead of strengthening it.
