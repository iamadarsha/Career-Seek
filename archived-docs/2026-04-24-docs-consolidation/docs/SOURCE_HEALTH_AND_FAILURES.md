# Source Health And Failures

## Failure taxonomy

Source failures are normalized as:

- `selector_not_found`
- `blocked`
- `timeout`
- `auth_gate`
- `empty_results`
- `browser_error`
- `parse_error`
- `unknown`

Failures are serialized into `scan_portal_runs.error` as JSON with `code`, `message`, and optional `debugSnapshotPath`.

## Scanner behavior

- Portal adapters use selector fallback chains before declaring selector drift.
- Health checks run before deeper scraping.
- A failing source increments failed source count but does not crash the scan.
- If at least one source returns jobs, the scan is marked `partial`.
- If no sources return jobs, the scan is marked `failed`.
- Debug HTML snapshots are captured on safe scraper failures where page access exists.
- Official company career pages remain conservative and do not invent structured jobs from vague career landing pages.

## Validation evidence

`npm run proof:final` used:

- `validation_seed`: healthy source, returned 6 raw jobs.
- `validation_fail`: simulated selector drift.

Observed result:

- `scanResult.status`: `partial`
- `scanResult.failedPortals`: `1`
- `scan_portal_runs.validation_seed.status`: `complete`
- `scan_portal_runs.validation_fail.error`: `{"code":"selector_not_found", ...}`

The dashboard shows source health with the failed source and reason.

Additional scan-state proof in `.source-proof-data`:

- all healthy: `validation_seed` produced `complete`
- multiple failures: `validation_seed + validation_fail + missing_adapter` produced `partial`
- healthy jobs still persisted while failures were recorded per source
