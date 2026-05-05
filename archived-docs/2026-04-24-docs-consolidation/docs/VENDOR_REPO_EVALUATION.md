# Vendor Repo Evaluation

Evaluation date: 2026-04-24.

Scope: official-careers-page-first sourcing for Career Seek. This pass is limited to the requested repositories under `vendors/` and this document. No app source or data files were edited.

## Verification Summary

- All 10 requested repositories are present under `vendors/`.
- Each vendor checkout is a Git worktree with zero local changes at the time of inspection.
- Each local `HEAD` matched the remote `HEAD` returned by `git ls-remote` on 2026-04-24.
- No dependency installs were run. TypeScript builds were skipped because `node_modules` was absent and the obvious installs would pull Puppeteer/Wrangler/Selenium-adjacent stacks.
- Lightweight Python syntax checks were run with `PYTHONPYCACHEPREFIX=/tmp/codex-vendor-pycache` so bytecode was written outside the repo.

## Lightweight Validation

| Area | Command class | Result |
|---|---|---|
| Python vendor packages | `python3 -m compileall -q` with external pycache | Passed for `job-board-scraper`, `job-seek`, `job-scraper`, `Job_Scraper`, `JobSpy`, `jobsparser`, `py-linkedin-jobs-scraper`, and `linkedIn-scraper`. |
| `linkedIn-scraper` | Same compile check | Passed with one warning: `worker/crawlers/linkedin/utils.py` has a `return` inside a `finally` block. |
| Node/TypeScript package metadata | `node -e` JSON parse on package files | Passed for `jobber`, `linkedin-jobs-scraper`, and `py-linkedin-jobs-scraper`. |
| TypeScript build/test | Not run | Skipped because dependencies were not installed and installing browser automation dependencies is not lightweight. |

## Official-First Decision

Recommended direct integration concepts come from official ATS/careers-board sources:

- `plibither8/jobber` for compact official ATS endpoint patterns: Lever, Greenhouse, Ashby, BambooHR, Workable.
- `adgramigna/job-board-scraper` for official ATS extraction and normalization concepts: Lever, Greenhouse, Ashby, Rippling.
- `viktor-shcherb/job-seek` for generic official careers page fallback, JS-shell detection, pagination, and adapter registry concepts.

Portal/aggregator repos are fallback/reference only:

- `speedyapply/JobSpy`
- `spinlud/linkedin-jobs-scraper`
- `spinlud/py-linkedin-jobs-scraper`
- `FranciscoMoretti/jobsparser`
- `ManiMozaffar/linkedIn-scraper`

## Requested Repo Records

| Repo | Vendor path | Clone success | Local/remote HEAD | Maintenance freshness |
|---|---|---|---|---|
| `adgramigna/job-board-scraper` | `vendors/job-board-scraper` | Success, clean, origin verified | `c40daade3b9dc842d4d9e886eeeb7ffc5b4ebe37` | Last commit 2025-11-26, fresh/recent. |
| `plibither8/jobber` | `vendors/jobber` | Success, clean, origin verified | `4e079f745526a002463972d99fbbc9825ff0ce13` | Last commit 2022-10-09, stale but small/simple. |
| `viktor-shcherb/job-seek` | `vendors/job-seek` | Success, clean, origin verified | `4dc6202285abf68c54a5a4a17874872bc914b9c0` | Last commit 2026-03-12, fresh, but README says these scrapers are not maintained and points to a newer project. |
| `ghiarishi/job-scraper` | `vendors/job-scraper` | Success, clean, origin verified | `1efab20ff6aefa12463a8acf1525ecd88e1bd15e` | Last commit 2024-06-22, moderately stale. |
| `Himaanshuuuu04/Job_Scraper` | `vendors/Job_Scraper` | Success, clean, origin verified | `a606da0b4130a668c3043b926ffb4441aa58830e` | Last commit 2025-09-21, recent. |
| `speedyapply/JobSpy` | `vendors/JobSpy` | Success, clean, origin verified | `fda080a373e8226f3fd60635323f5da9af9892b1` | Last commit 2026-02-18, fresh. |
| `spinlud/linkedin-jobs-scraper` | `vendors/linkedin-jobs-scraper` | Success, clean, origin verified | `6f002b11a3f71744cd336736f18ff5f7b08b081b` | Last commit 2025-03-14, recent but LinkedIn-specific. |
| `spinlud/py-linkedin-jobs-scraper` | `vendors/py-linkedin-jobs-scraper` | Success, clean, origin verified | `08027757aee33bcd7d43adb929d3725658d027e7` | Last commit 2025-03-14, recent but LinkedIn-specific. |
| `FranciscoMoretti/jobsparser` | `vendors/jobsparser` | Success, clean, origin verified | `b6504235755ab1342a809dd0e7fc060d2013824c` | Last commit 2025-05-25, recent. |
| `ManiMozaffar/linkedIn-scraper` | `vendors/linkedIn-scraper` | Success, clean, origin verified | `5fd2633044675d715130fee1b567c0984e97a897` | Last commit 2024-04-05, stale/moderate and heavy-stack. |

### adgramigna/job-board-scraper

- Runtime/language: Python, Scrapy, dbt, Postgres, S3/AWS utilities, DuckDB/Polars.
- ATS/platforms supported: Greenhouse, Lever, Ashby, Rippling.
- Exact reusable files/modules:
  - `vendors/job-board-scraper/job_board_scraper/run_job_scraper.py`
  - `vendors/job-board-scraper/job_board_scraper/job_board_scraper/spiders/greenhouse_jobs_outline_spider.py`
  - `vendors/job-board-scraper/job_board_scraper/job_board_scraper/spiders/greenhouse_job_departments_spider.py`
  - `vendors/job-board-scraper/job_board_scraper/job_board_scraper/spiders/lever_jobs_outline_spider.py`
  - `vendors/job-board-scraper/job_board_scraper/get_ashby_jobs.py`
  - `vendors/job-board-scraper/job_board_scraper/queries/ashby_jobs_outline.graphql`
  - `vendors/job-board-scraper/job_board_scraper/get_rippling_jobs.py`
  - `vendors/job-board-scraper/job_board_scraper/utils/rippling/classes.py`
  - `vendors/job-board-scraper/job_board_scraper/utils/rippling/parsing_helper.py`
  - `vendors/job-board-scraper/levergreen_dbt/models/marts/active_job_postings.sql`
- Integration decision: Accept for direct integration concepts only; do not import runtime.
- Reason: Strong official ATS coverage and useful raw-to-normalized model, but direct vendoring would add Scrapy, dbt, Postgres, S3, and workflow assumptions that are too large for Career Seek.

### plibither8/jobber

- Runtime/language: TypeScript Cloudflare Worker using Hono and `node-html-parser`.
- ATS/platforms supported: Ashby, Greenhouse, Lever, BambooHR, Workable.
- Exact reusable files/modules:
  - `vendors/jobber/src/boards/ashby.ts`
  - `vendors/jobber/src/boards/greenhouse.ts`
  - `vendors/jobber/src/boards/lever.ts`
  - `vendors/jobber/src/boards/bamboohr.ts`
  - `vendors/jobber/src/boards/workable.ts`
  - `vendors/jobber/src/boards/index.ts`
  - `vendors/jobber/src/index.ts`
- Integration decision: Accept direct integration concepts for official ATS endpoints; do not vendor the Worker.
- Reason: The board modules are small and map cleanly to Career Seek's official-first model. Runtime is stale and Cloudflare/Bun/Hono-specific, so copy the endpoint ideas, not the package.

### viktor-shcherb/job-seek

- Runtime/language: Python, Streamlit, Playwright, httpx, BeautifulSoup, Pydantic.
- ATS/platforms supported: Generic company careers pages plus Lever, Greenhouse, Ashby, Workday, Join, Meta Careers, Microsoft Careers, Proton-specific Greenhouse.
- Exact reusable files/modules:
  - `vendors/job-seek/services/scrape/custom/__init__.py`
  - `vendors/job-seek/services/scrape/custom/lever.py`
  - `vendors/job-seek/services/scrape/custom/greenhouse.py`
  - `vendors/job-seek/services/scrape/custom/ashby.py`
  - `vendors/job-seek/services/scrape/custom/workday.py`
  - `vendors/job-seek/services/scrape/custom/join.py`
  - `vendors/job-seek/services/scrape/custom/meta.py`
  - `vendors/job-seek/services/scrape/custom/microsoft.py`
  - `vendors/job-seek/services/scrape/custom/proton.py`
  - `vendors/job-seek/services/scrape/extractors/anchor.py`
  - `vendors/job-seek/services/scrape/extractors/jsonld.py`
  - `vendors/job-seek/services/scrape/extractors/listitem.py`
  - `vendors/job-seek/services/scrape/extractors/repeated_blocks.py`
  - `vendors/job-seek/services/scrape/js_detect.py`
  - `vendors/job-seek/services/scrape/pagination.py`
  - `vendors/job-seek/services/scrape/normalization.py`
  - `vendors/job-seek/services/scrape/render_client.py`
  - `vendors/job-seek/services/worker/pages_worker.py`
- Integration decision: Reference plus selective direct concepts for generic official careers fallback.
- Reason: Good official-careers-page-first architecture: adapter registry, JS-render fallback, conservative dedupe, health tracking, and generic extractors. Direct runtime import is rejected because it is a Streamlit/Python app and the README explicitly warns the scrapers in this repo are not maintained.

### ghiarishi/job-scraper

- Runtime/language: Python, requests, BeautifulSoup, pandas, xlsxwriter.
- ATS/platforms supported: Google-discovered Lever and Greenhouse postings.
- Exact reusable files/modules:
  - `vendors/job-scraper/jobScraper.py`
  - Reusable functions inside that file: `doGoogleSearch`, `cleanURL`, `getJobInfo`, `inUSA`, `isRelevantRole`, `saveToExcel`, `scrapeJobsMain`.
- Integration decision: Reference-only.
- Reason: The Google query and URL-cleaning ideas can inform a fallback discovery layer, but direct integration is rejected because it is interactive, calls Google HTML search, writes Excel, is US-biased, and executes `scrapeJobsMain()` at import time.

### Himaanshuuuu04/Job_Scraper

- Runtime/language: Python, Playwright, playwright-stealth, BeautifulSoup, pandas.
- ATS/platforms supported: Lever, Greenhouse, Zoho Recruit, SmartRecruiters, Workday, plus discovery heuristics for BambooHR, Jobvite, iCIMS, SuccessFactors, TalentSoft, Cornerstone, generic careers pages, LinkedIn company pages.
- Exact reusable files/modules:
  - `vendors/Job_Scraper/src/scrapper.py`
  - `vendors/Job_Scraper/src/enricher.py`
  - `vendors/Job_Scraper/src/job_scraper.py`
  - `vendors/Job_Scraper/src/main_scraper.py`
  - `vendors/Job_Scraper/src/data_formatter.py`
- Integration decision: Reference-only.
- Reason: Useful official-domain/careers-link scoring and platform categorization, but direct integration is rejected because the implementation is browser-heavy, generic-selector based, assignment-style, and oriented around Excel enrichment rather than stable official ATS APIs.

### speedyapply/JobSpy

- Runtime/language: Python package with requests, BeautifulSoup, pandas, Pydantic, tls-client, markdownify.
- ATS/platforms supported: Not official ATS first. Supports job portals/aggregators: LinkedIn, Indeed, Glassdoor, Google Jobs, ZipRecruiter, Bayt, Naukri, BDJobs.
- Exact reusable files/modules:
  - `vendors/JobSpy/jobspy/__init__.py`
  - `vendors/JobSpy/jobspy/model.py`
  - `vendors/JobSpy/jobspy/util.py`
  - `vendors/JobSpy/jobspy/naukri/__init__.py`
  - `vendors/JobSpy/jobspy/naukri/constant.py`
  - `vendors/JobSpy/jobspy/naukri/util.py`
  - `vendors/JobSpy/jobspy/linkedin/__init__.py`
  - `vendors/JobSpy/jobspy/indeed/__init__.py`
  - `vendors/JobSpy/jobspy/google/__init__.py`
  - `vendors/JobSpy/jobspy/glassdoor/__init__.py`
  - `vendors/JobSpy/jobspy/ziprecruiter/__init__.py`
  - `vendors/JobSpy/jobspy/bayt/__init__.py`
  - `vendors/JobSpy/jobspy/bdjobs/__init__.py`
- Integration decision: Fallback/reference only.
- Reason: Fresh and useful for Naukri/India fallback, normalization fields, salary parsing, and multi-board result shape. Direct integration is rejected for official-first sourcing because it prioritizes portals, carries rate-limit/proxy concerns, and adds a Python runtime bridge.

### spinlud/linkedin-jobs-scraper

- Runtime/language: TypeScript, Puppeteer, EventEmitter-style scraper.
- ATS/platforms supported: LinkedIn only.
- Exact reusable files/modules:
  - `vendors/linkedin-jobs-scraper/src/scraper/query.ts`
  - `vendors/linkedin-jobs-scraper/src/scraper/filters.ts`
  - `vendors/linkedin-jobs-scraper/src/scraper/LinkedinScraper.ts`
  - `vendors/linkedin-jobs-scraper/src/scraper/strategies/AnonymousStrategy.ts`
  - `vendors/linkedin-jobs-scraper/src/scraper/strategies/AuthenticatedStrategy.ts`
  - `vendors/linkedin-jobs-scraper/src/scraper/events.ts`
  - `vendors/linkedin-jobs-scraper/src/scraper/defaults.ts`
  - `vendors/linkedin-jobs-scraper/src/utils/url.ts`
- Integration decision: Reference-only; reject direct integration.
- Reason: Useful for LinkedIn filter codes and fallback query construction, but LinkedIn is a portal rather than an official careers source. Direct use would add Puppeteer, possible auth cookie handling, and rate-limit fragility.

### spinlud/py-linkedin-jobs-scraper

- Runtime/language: Python package using Selenium.
- ATS/platforms supported: LinkedIn only.
- Exact reusable files/modules:
  - `vendors/py-linkedin-jobs-scraper/linkedin_jobs_scraper/linkedin_scraper.py`
  - `vendors/py-linkedin-jobs-scraper/linkedin_jobs_scraper/query/query.py`
  - `vendors/py-linkedin-jobs-scraper/linkedin_jobs_scraper/filters/filters.py`
  - `vendors/py-linkedin-jobs-scraper/linkedin_jobs_scraper/strategies/anonymous_strategy.py`
  - `vendors/py-linkedin-jobs-scraper/linkedin_jobs_scraper/strategies/authenticated_strategy.py`
  - `vendors/py-linkedin-jobs-scraper/linkedin_jobs_scraper/events/events.py`
  - `vendors/py-linkedin-jobs-scraper/linkedin_jobs_scraper/utils/url.py`
  - `vendors/py-linkedin-jobs-scraper/linkedin_jobs_scraper/utils/chrome_driver.py`
- Integration decision: Reference-only; reject direct integration.
- Reason: Parity reference for the TypeScript LinkedIn scraper, but Selenium/ChromeDriver and LinkedIn portal scraping do not fit official-careers-page-first sourcing.

### FranciscoMoretti/jobsparser

- Runtime/language: Python CLI plus local `jobspy2` package.
- ATS/platforms supported: Not official ATS first. Supports LinkedIn, Indeed, Glassdoor, ZipRecruiter, Google through `jobspy2`.
- Exact reusable files/modules:
  - `vendors/jobsparser/jobsparser/src/jobsparser/cli.py`
  - `vendors/jobsparser/jobspy2/src/jobspy2/__init__.py`
  - `vendors/jobsparser/jobspy2/src/jobspy2/jobs/__init__.py`
  - `vendors/jobsparser/jobspy2/src/jobspy2/scrapers/linkedin/__init__.py`
  - `vendors/jobsparser/jobspy2/src/jobspy2/scrapers/indeed/__init__.py`
  - `vendors/jobsparser/jobspy2/src/jobspy2/scrapers/google/__init__.py`
  - `vendors/jobsparser/jobspy2/src/jobspy2/scrapers/glassdoor/__init__.py`
  - `vendors/jobsparser/jobspy2/src/jobspy2/scrapers/ziprecruiter/__init__.py`
  - `vendors/jobsparser/jobspy2/src/jobspy2/scrapers/utils.py`
- Integration decision: Fallback/reference only.
- Reason: Useful CLI batching/retry/backoff pattern and normalized portal output model, but it overlaps with JobSpy and remains portal-first CSV tooling rather than official ATS/careers sourcing.

### ManiMozaffar/linkedIn-scraper

- Runtime/language: Python, FastAPI, Playwright, Celery, Redis, Postgres/SQLAlchemy, Telegram bot, PyAutoGUI, external ChatGPT-like browser workflow.
- ATS/platforms supported: LinkedIn only.
- Exact reusable files/modules:
  - `vendors/linkedIn-scraper/worker/crawlers/linkedin/controller.py`
  - `vendors/linkedIn-scraper/worker/crawlers/linkedin/gateway.py`
  - `vendors/linkedIn-scraper/worker/crawlers/linkedin/xpaths.py`
  - `vendors/linkedIn-scraper/worker/core/browser.py`
  - `vendors/linkedIn-scraper/src/services/jobs/models.py`
  - `vendors/linkedIn-scraper/src/services/jobs/schemas.py`
  - `vendors/linkedIn-scraper/isolated/main.py`
- Integration decision: Reject direct integration; architecture reference only.
- Reason: Heavy and invasive for Career Seek, requires proxies/database/worker/bot infrastructure, is LinkedIn portal-first, and includes credential/rate-limit/TOS-sensitive automation. The isolated boolean filter evaluator is interesting but unrelated to official careers sourcing.

## Net Recommendation

1. Use official ATS/careers page logic first:
   - Lever: `jobber/src/boards/lever.ts`, `job-seek/services/scrape/custom/lever.py`, and `job-board-scraper/.../lever_jobs_outline_spider.py`.
   - Greenhouse: `jobber/src/boards/greenhouse.ts`, `job-seek/services/scrape/custom/greenhouse.py`, and `job-board-scraper/.../greenhouse_jobs_outline_spider.py`.
   - Ashby: `jobber/src/boards/ashby.ts`, `job-board-scraper/get_ashby_jobs.py`, and `job-seek/services/scrape/custom/ashby.py`.
   - Workday/generic official pages: `job-seek/services/scrape/custom/workday.py`, `job-seek/services/scrape/extractors/*`, `pagination.py`, and `js_detect.py`.
2. Use portal/aggregator repos only after official sources fail:
   - Naukri/India fallback: `JobSpy/jobspy/naukri/*`.
   - LinkedIn fallback filters: `linkedin-jobs-scraper/src/scraper/filters.ts` or `py-linkedin-jobs-scraper/linkedin_jobs_scraper/filters/filters.py`.
   - Generic portal batching and retries: `jobsparser/jobsparser/src/jobsparser/cli.py`.
3. Do not vendor-run any of these projects directly in Career Seek without a separate dependency and security review.
