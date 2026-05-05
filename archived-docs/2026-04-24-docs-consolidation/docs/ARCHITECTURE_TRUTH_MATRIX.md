# Architecture Truth Matrix

This document provides a code-verified mapping of domain entities to their implementation details. It serves as the definitive source of truth for the system's architecture as of Phase K-8.

## Domain Model & Data Mapping

| Domain Entity | Primary Table(s) | Key Service(s) | Phase | Status | Isolation (K-Series) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Identity & Access** | `users`, `userProfiles` | `src/lib/platform/identity.ts` | K | **Verified** | Centralized via `resolveContext` |
| **Profile & Resume** | `uploaded_resumes`, `master_profiles` | `src/lib/services/resume-parser.ts` | B | **Verified** | `profile_id` scoped |
| **Job Acquisition** | `scans`, `normalized_jobs`, `job_duplicates` | `src/lib/services/scraping/orchestrator.ts` | C | **Verified** | `profile_id` scoped |
| **Scoring & Fit** | `scored_jobs`, `job_enrichments`, `jd_analyses` | `src/lib/services/scoring/engine.ts` | D | **Verified** | `profile_id` scoped |
| **Document Factory** | `document_assets`, `generated_documents` | `src/lib/services/documents/` | E | **Verified** | `profile_id` scoped |
| **AI Coach (RAG)** | `document_chunks`, `coach_threads`, `coach_messages` | `src/lib/services/coach/` | F | **Verified** | `profile_id` scoped |
| **Career CRM** | `applications`, `application_timeline`, `application_notes` | `src/lib/services/crm/dashboard-crm.ts` | G | **Verified** | `profile_id` scoped |
| **Automation** | `automation_rules`, `notifications` | `src/lib/services/automation/rules-engine.ts` | H | **Partial** | User/Profile scoped |
| **Integrations** | `contacts`, `email_drafts` | `src/lib/services/integrations/` | I | **Verified** | User scoped |
| **Analytics** | `analytics` (virtual), `insight_runs` | `src/lib/services/analytics/insight-engine.ts` | J | **Partial** | Profile scoped |

## Service Orchestration

| Service Layer | Responsibilities | Implementation Note |
| :--- | :--- | :--- |
| **Platform Context** | Identity resolution, profile switching, context injection. | Currently in "Bootstrap Mode" (ID 1). |
| **Scraping Engine** | Multi-portal search, browser management, normalization. | Relies on Playwright. Fragile in CI/CD. |
| **AI Scoring** | JD parsing, fit calculation, tiering, interview strategy. | Uses Gemini 2.0 Flash for low latency. |
| **RAG Core** | Chunking, embedding (Gemini), retrieval, grounded Q&A. | Persistent vector-like storage in SQLite. |
| **CRM Logic** | Pipeline state machine, timeline events, document linking. | Uses `applications` table as central hub. |
| **Automation** | Rule evaluation, notification dispatch, scheduled tasks. | Currently manual trigger or interval-based. |

## Technical Stack & Infrastructure

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript 5.x
- **Database:** SQLite (better-sqlite3) with Drizzle ORM
- **Styling:** Vanilla CSS (Apple HIG Design System)
- **AI Models:** Google Generative AI (Gemini 1.5/2.0 Flash)
- **Local Runtime:** Node.js (tested on 22+), Bun (experimental support)
- **Migrations:** Manual execution via `scripts/db-schema-push.mjs`

## Known Divergences

1. **Application Tracking:** The `job_applications` table is a legacy remnant from Phase E. The `applications` table from Phase G is the canonical CRM entity.
2. **Identity Readiness:** Schema is fully isolated (`profile_id`), but UI lacks a profile switcher; logic is currently hardcoded to `profileId: 1`.
3. **Background Jobs:** No durable job queue (e.g., BullMQ); long-running tasks like scans can be interrupted by process restarts.
