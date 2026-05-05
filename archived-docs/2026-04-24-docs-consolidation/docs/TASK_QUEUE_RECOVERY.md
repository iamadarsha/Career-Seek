# Task Queue Recovery

## Model

Background work is tracked in `platform_jobs` with:

- `jobType`
- `status`
- `queuedAt`
- `startedAt`
- `finishedAt`
- `attempts`
- `maxAttempts`
- `error`
- `result`
- `profileId`
- `userId`
- `progress`

Scan status remains visible in `scans` and source status in `scan_portal_runs`.

## Recovery behavior

On worker startup:

- running jobs are detected
- interrupted scan records are marked `failed`
- platform jobs are marked `retrying`
- retry execution is bounded by `maxAttempts`
- successful retry clears stale error text

The scan handler now tolerates missing `selectedPortals` by falling back to the saved search profile portals, then registered adapters.

## Validation evidence

Queue proof used isolated `.queue-proof-data`.

Phase 1 recovery:

- running scan job became `retrying`
- orphaned scan became `failed`
- interruption reason was saved

Phase 2 retry execution:

- recovered job became `succeeded`
- stale job error cleared to `null`
- replacement scan completed as `partial`
- healthy validation source produced jobs
- failing validation source persisted `selector_not_found`
