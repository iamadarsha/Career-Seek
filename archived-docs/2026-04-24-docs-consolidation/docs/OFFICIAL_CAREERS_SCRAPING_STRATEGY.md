# Official Careers Scraping Strategy

Career Seek should find jobs in this order: employer-owned sources first, discovery and portals later. The data contracts for that strategy are:

- `data/ats_provider_mapping.json`
- `data/source_registry.json`
- `data/role_family_packs.json`

This worker added data and docs only. Runtime adapters still need follow-up wiring before every catalog entry affects live scans.

## Source Priority

`data/source_registry.json` encodes the priority ladder:

| Priority | Source | Trust posture |
|---|---|---|
| 1 | Official ATS company pages | Highest trust. Greenhouse, Lever, Ashby, Workday, Rippling, BambooHR, iCIMS, SuccessFactors when reached from employer-owned pages or configured sources. |
| 2 | Official custom company pages | High trust but variable extraction. Use employer domain, schema.org JobPosting, sitemap, and visible job cards. |
| 3 | Google for Jobs discovery | Discovery only. Canonicalize back to official employer or ATS URLs before treating as trusted. |
| 4 | JobSpy multi-board fallback | Recall fallback. Useful when official sources underfill, but needs dedupe and source warnings. |
| 5 | Portal-specific fallback scrapers | Naukri, LinkedIn, Foundit, Shine, Cutshort, Instahyre, Hirist, iimjobs, Wellfound, Indeed, Internshala, Freshersworld, Apna, WorkIndia, government portals, and similar adapters. |
| 6 | Manual URL or company import | Recovery path for user-supplied companies or URLs. Requires domain trust and manual validation state. |

## ATS Provider Strategy

The mapping is intentionally explicit about support level:

| Provider | Best path | Important caveat |
|---|---|---|
| Greenhouse | Public Job Board API: `boards-api.greenhouse.io/v1/boards/{board_token}/jobs` | General application/prospect posts need filtering. |
| Lever | Public Postings API: `api.lever.co/v0/postings/{site}` and EU equivalent | No full-text search, only published postings. |
| Ashby | Public Job Postings API: `api.ashbyhq.com/posting-api/job-board/{job_board_name}` | Board names can differ from company names; unlisted jobs need care. |
| Workday | Employer official Workday candidate site | No single documented unauthenticated public jobs API works for every tenant. |
| Rippling | Public `ats.rippling.com` job detail pages and official employer pages | Public listing discovery is not a stable documented API. |
| BambooHR | Authenticated official applicant tracking API plus public employer pages | Official API requires API key and ATS permissions. |
| iCIMS | Authenticated Job Portal API plus public career portal pages | Official API requires customer/portal ids and credentials. |
| SuccessFactors | Authenticated OData plus public external career sites | OData fields and visibility depend on tenant templates and permissions. |
| Custom/unknown | Official employer careers/jobs pages, sitemap, JobPosting schema | Requires conservative parsing and manual confidence. |

## India-Specific Use Cases

Official-first does not mean software-only. The role packs intentionally cover India-market clusters beyond tech:

- Freshers and internships: Prefer official early-career, campus, apprentice, and PSU trainee pages. Enable Internshala and Freshersworld only when the user asks for fresher/intern/trainee roles.
- Government, PSU, research: Prefer official recruitment notifications, `.gov.in`, PSU, university, and institute pages. Portal copies should point back to canonical notices.
- Healthcare: Prefer hospital, diagnostics, pharma, and healthtech career pages. Preserve specialty, license, and onsite location terms.
- Education: Include school, coaching, edtech, faculty, curriculum, and instructional design variants. Preserve subject and board/exam keywords.
- Field sales, operations, admin, logistics: Allow Apna and WorkIndia fallback only when user intent fits field, delivery, warehouse, retail, support, or admin roles.
- BFSI, finance, legal, compliance, risk: Prefer official bank, fintech, consulting, and corporate career pages before broad portals.
- Specialized sectors: Treat cybersecurity, semiconductor, EV, manufacturing, energy, climate, gaming, hospitality, real estate, aviation, agriculture, and pharma as overlays on top of a function.

## Validation Expectations

Validation should be candid and layered:

1. Data validation: `jq` parses all JSON files, required keys exist, provider ids and failure codes are unique, and priority values are 1 through 6.
2. Provider validation: For public APIs, run a known-safe board fixture and assert normalized title, company, location, URL, apply URL, and provider id. For authenticated APIs, validate schema and mark health as `not_configured` when credentials are absent.
3. Source health validation: Every adapter should emit a `health_status`, `failure_code`, `official_confidence`, `extraction_confidence`, timestamps, and a short user-safe note.
4. Ranking validation: Official ATS and custom employer results should outrank portal copies of the same job after dedupe.
5. India coverage validation: Exercise one search per major cluster, including fresher, government, healthcare, education, sales/field, finance/risk, and specialized-sector examples.

## Failure Handling

`data/source_registry.json` includes a shared taxonomy for failures such as `blocked`, `captcha`, `rate_limited`, `auth_gate`, `empty_results`, `source_drift`, `parse_error`, `robots_restricted`, and `manual_review_required`.

The product should show failures without making them feel catastrophic:

- `empty_results` means the source was reachable but did not match the query.
- `not_configured` means credentials or dependencies are missing, not that the source is broken.
- `degraded` means the source returned something useful through fallback extraction.
- `manual_review_required` should be used for low-confidence custom pages and user-provided URLs.

## Notes For Future Wiring

1. Prefer provider APIs where they are official and public: Greenhouse, Lever, Ashby.
2. Use authenticated APIs only when credentials and permissions are explicitly configured: BambooHR, iCIMS, SuccessFactors.
3. Treat Workday and Rippling as official-page patterns, not universal public APIs.
4. Preserve the original source URL and canonical apply URL for every result.
5. Never automate candidate account creation or application submission. Career Seek should deep-link and help the user prepare, not submit on their behalf without a separate explicit workflow.
