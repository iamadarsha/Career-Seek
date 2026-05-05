# Job Discovery And Ranking

## Current Sources

Current source coverage includes:

- LinkedIn
- Naukri
- Wellfound
- Foundit
- Indeed India
- Instahyre
- curated official company career pages

Additional data files support an expanded India-first source universe, but live scraping remains dependent on each source's public behavior.

## Source Priority

The intended ladder is:

1. Official company career pages and ATS-backed pages.
2. Official custom company career pages.
3. Google Jobs discovery where available.
4. Multi-board fallback.
5. Portal-specific fallback scrapers.
6. Manual URL or company import recovery.

Google Jobs discovery hit an `auth_gate` in live testing and should be treated as fallback-only.

## Official Company Career Pages

Official company career pages are conservative employer-attributed leads. They are not guaranteed structured ATS feeds.

The employer seed data lives in:

- `data/company_careers_seed.csv`
- `data/ats_provider_mapping.json`
- `data/source_registry.json`

The seed includes broad India employer coverage across technology, SaaS, BFSI, education, healthcare, manufacturing, pharma, media, government, logistics, travel, and social-impact sectors.

## ATS Coverage

The app can classify or route pages for:

- Greenhouse
- Lever
- Workday
- Ashby
- Rippling
- BambooHR
- iCIMS
- SuccessFactors
- custom or unknown career pages

Structured public extraction is not complete for every ATS family. Workday, BambooHR, Rippling, iCIMS, and SuccessFactors still need deeper extractor work where stable public endpoints exist.

## Orchestration

`ScanOrchestrator` runs each source independently. A failing source should not crash the whole scan.

Per-source failure details are recorded. A scan can be marked `partial` when at least one source fails but useful jobs are still found.

## Local Search Index

Phase 4 adds an optional Meilisearch-compatible local search layer:

- scored jobs are indexed after local scoring
- `MEILI_HOST` or `MEILISEARCH_URL` points to the local Meilisearch container
- if Meilisearch is missing, stopped, or slow, search falls back to in-process filtering over saved jobs
- no external search service is required

The app keeps SQLite as the source of truth. Meilisearch is a speed layer, not a cloud dependency.

## Dream Match

Discover now supports a `Dream match` mode. The user can describe the kind of job they want, and Career Seek ranks saved/scored jobs with local embeddings.

Behavior:

- uses deterministic local keyword-hash embeddings as the guaranteed floor
- can use the local resume embedding provider when available
- can query local Qdrant when configured
- falls back to in-memory cosine ranking over saved jobs

This is intentionally advisory. It helps surface nearby jobs from the local cache; it does not replace the local ATS/job score.

## Failure Taxonomy

Common failure codes include:

- `selector_not_found`
- `timeout`
- `blocked`
- `auth_gate`
- `empty_results`
- `browser_error`
- `parse_error`
- `rate_limited`
- `network_error`
- `robots_restricted`
- `result_quality_low`
- `unknown`

LinkedIn, Indeed, and Instahyre are treated honestly:

- LinkedIn live public scanning can auth-gate, so guest/public fallbacks are labeled.
- Indeed can block browser and RSS paths, so blocked/gated status is recorded instead of hidden.
- Instahyre search results can be discoverable while direct URLs return 403, so search-page evidence is retained.

## Deduplication

Jobs are deduplicated by:

- URL
- external ID
- title/company/location signature

## Ranking

Ranking uses:

- title fit
- skill overlap
- experience fit
- work-mode fit
- include keywords
- exclude keywords
- positive factors
- negative factors
- warnings

For Product Manager searches, Phase 4 adds role-family weighting so explicit product roles are lifted and Strategy/Ops-adjacent roles are capped/downranked when they lack a product title signal.

## Role Packs

Role-family packs are stored in `data/role_family_packs.json`. They cover engineering, product, design, data/AI, sales, HR, finance, operations, education, healthcare, government, freshers, and specialized sectors.

Role packs improve query expansion, but pack coverage should not be read as proof that every role/source combination has been live-tested.

## Vendor Repos

Vendor scraper repos were evaluated as references or limited integration sources. The app should not be replaced by a third-party scraper project. Portal-oriented repos remain fallback/reference material because public portals can drift or block.
