# Gap Analysis & Hardening Plan

This document identifies architectural weaknesses, domain inconsistencies, and operational risks in the current JobHunt India codebase and outlines the priority fixes for Phase I/K hardening.

## 1. High-Priority Gaps

### GAP-01: Dual Application Tracking Logic
- **Issue:** The codebase contains two parallel models for tracking applications: `job_applications` (legacy Phase E) and `applications` (CRM Phase G).
- **Risk:** Inconsistent state between the "Applied" toggle in the job board and the CRM pipeline. Data fragmentation.
- **Hardening Fix:**
    - Migrate all records from `job_applications` to `applications`.
    - Deprecate `job_applications` table.
    - Update all UI components and services to use the canonical `applications` table.

### GAP-02: Non-Durable Execution (Scans & Automation)
- **Issue:** Long-running tasks like job scans and automation rule processing are trigger-based and lack persistence. If the server restarts during a scan, the state is lost or left in "running" indefinitely.
- **Risk:** Operational fragility. Users see "stuck" scans. No automatic retries for failed AI calls.
- **Hardening Fix:**
    - Implement a simple persistent task queue in SQLite.
    - Add a `background_tasks` table to track task lifecycle, retries, and parent processes.
    - Enhance `orchestrator.ts` to resume/cleanup tasks on startup.

### GAP-03: Hardcoded Bootstrap Identity
- **Issue:** `src/lib/platform/identity.ts` hardcodes `userId: 1` and `profileId: 1`.
- **Risk:** System is multi-tenant in schema but single-tenant in execution. Difficult to test actual multi-account scenarios.
- **Hardening Fix:**
    - Implement a "Profile Switcher" in the settings or sidebar.
    - Allow `resolveContext()` to pull the active profile ID from a local preference or session cookie, even in bootstrap mode.
    - Verify that all 40+ tables correctly filter by the resolved `profileId`.

### GAP-04: Fragile Environment Dependencies
- **Issue:** The app relies on complex local toolchains (Playwright, system PDF parsers).
- **Risk:** High "First-Run" failure rate for new users.
- **Hardening Fix:**
    - Expand `scripts/doctor.mjs` to check for specific Playwright browser binaries and system dependencies.
    - Add "Safe Mode" fallbacks for scraping (e.g., manual URL import) if the browser manager fails.

## 2. Operational Hardening Roadmap

### Phase 1: Clean & Unify (Immediate)
1. **Unify Applications:** Consolidate `job_applications` into `applications`.
2. **Schema Health:** Clean up unused legacy tables/columns if any.
3. **Doctor Script:** Upgrade `scripts/doctor.mjs` to be a mandatory pre-flight check.

### Phase 2: Resilience (Short-term)
1. **Task Tracking:** Implement the `background_tasks` table and integration in `scans`.
2. **AI Failsafes:** Add structured retry logic (exponential backoff) for all Gemini API calls.
3. **Health Monitoring:** Create a simple internal `/api/health` endpoint that checks DB connectivity and AI API status.

### Phase 3: Identity Fluidity (Mid-term)
1. **Profile Switching:** Enable UI-driven profile selection.
2. **Data Export/Import:** Create a robust profile-scoped export tool (JSON/SQLite dump) for backup and migration.

## 3. Success Metrics for Hardening
- **0%** "Stuck" scans after process restart.
- **Single Source of Truth** for all application statuses.
- **Zero** hardcoded ID references outside of the `identity.ts` resolver.
- **Verified** environment readiness via `doctor.mjs` before startup.
