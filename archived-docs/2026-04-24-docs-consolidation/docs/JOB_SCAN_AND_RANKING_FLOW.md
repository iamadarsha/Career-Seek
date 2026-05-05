# Job Scan And Ranking Flow

## Search Preferences

`saveSearchProfile()` normalizes selected and custom roles with `src/lib/services/search-preferences.ts`.

Supported preference fields:

- selected role chips
- comma-separated custom roles
- experience band
- target salary
- locations
- remote/hybrid/onsite/any
- company types
- excluded cities, companies, titles, and industries

## Sources

The scanner now registers adapters for:

- LinkedIn
- Naukri
- Wellfound
- Foundit
- Indeed India
- Instahyre
- curated official company career pages

Official company pages are treated conservatively as employer-attributed leads when a career page contains role/location signals. They do not pretend to be full structured ATS results.

## Orchestration

`ScanOrchestrator` runs each source independently:

- creates a `scans` row
- creates one `scan_portal_runs` row per source
- performs source health checks
- records failures per source
- normalizes jobs
- deduplicates by URL, external ID, and title/company/location signature
- marks the scan `partial` when some sources fail but useful jobs exist

## Ranking

`scoreJob()` computes:

- title fit
- skill overlap
- experience fit
- work-mode fit
- keyword include/exclude fit
- positive factors
- negative factors
- warnings

The dashboard uses a better Today queue:

- Tier A jobs
- high-scoring Tier B jobs
- broader “apply in 3 days” queue for strong B/C candidates

Low-result situations generate search expansion suggestions such as widening locations, including remote roles, adjacent titles, or relaxing company-type filters.
