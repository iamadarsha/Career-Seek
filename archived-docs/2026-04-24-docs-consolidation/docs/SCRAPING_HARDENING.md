# Scraping Hardening

## Source Order

Default source order is now:

1. Official company career pages
2. LinkedIn public listings
3. Naukri
4. Wellfound
5. Foundit
6. Indeed India
7. Instahyre

This is configured in `ScanOrchestrator`, onboarding search profile defaults, and Discover defaults.

## What Changed

- Naukri is API-first, using the public `/jobapi/v3/search` pattern with DOM fallback.
- LinkedIn tries public guest job fragments first, then current DOM fallback.
- Official company pages no longer emit generic placeholder jobs unless a matching public role link is found.
- Foundit, Indeed, Instahyre, and Official now classify zero usable cards as failure/empty results instead of success.
- The orchestrator persists fields already in the DB schema: `applyUrl`, `postedDateRaw`, `postedDate`, `employmentType`, `isRemote`, `isHybrid`, and raw payload snapshots.
- Browser-safe mode now creates per-source failure records instead of leaving an opaque failed scan.
- Failed scans with zero jobs fail the background platform job instead of appearing green.

## Failure Taxonomy

Supported codes:

- `selector_not_found`
- `timeout`
- `blocked`
- `auth_gate`
- `empty_results`
- `browser_error`
- `parse_error`
- `unknown`

Source health UI now converts JSON failure details into readable labels.

## Limits

Live portals can still block public scraping, require sign-in, change APIs, or return location-specific gaps. Career Seek now records those outcomes honestly and keeps partial scans useful.
