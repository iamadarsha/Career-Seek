# PROJECT_STATUS

Current release-status authority: `docs/FINAL_RELEASE_STATUS.md`.

This matrix is older implementation context and should not override the current solved/partial/gap summary.

Last validated: 2026-04-23
Validation basis: source audit of `src/`, scripts, and existing docs.

Status labels:
- `verified`: implemented and consistent with docs/intent at a basic functional level.
- `partially_verified`: implemented, but with notable gaps, fragility, or incomplete UX flow.
- `mismatch`: docs claim behavior that is absent or contradicted by code.
- `unclear`: insufficient evidence in current repo.

## System area validation matrix

| Area | Status | Evidence |
|---|---|---|
| app entry points | `verified` | `src/app/layout.tsx`, `src/app/page.tsx`, `src/components/Sidebar.tsx` |
| dashboard/UI | `partially_verified` | Core pages exist (`today`, `discover`, `pipeline`, `coach`, `notifications`, `settings`), but some routes are placeholders (`saved`, `applied`, `analytics`, `documents`) |
| server/API routes | `partially_verified` | Only one route handler exists: `src/app/api/download/route.ts`; most backend logic is server actions, not REST routes |
| scraping layer | `verified` | `src/lib/services/scraping/orchestrator.ts`, adapters for LinkedIn/Naukri/Wellfound |
| scoring layer | `verified` | `src/lib/services/scoring/engine.ts`, enrichment and AI search services |
| document factory | `partially_verified` | Resume/cover/outreach pipeline exists and path bug was patched; full runtime validation is still pending |
| ATS verification | `verified` | `src/lib/services/documents/ats.ts`, persisted in `document_assets` |
| outreach generation | `verified` | `src/lib/services/documents/outreach.ts`, triggered via discover document actions |
| applied tracking | `verified` | Unified tracking via CRM `applications` table; legacy `job_applications` table removed |
| RAG / AI coach | `verified` | Chunking/embedding/retrieval/answer/persistence implemented across `src/lib/services/coach/*` and `src/app/coach/*` |
| CRM / pipeline tracking | `verified` | `applications`, timeline, notes, reminders, document linkage + UI in `src/app/pipeline/*` |
| automation / scheduler / notifications | `partially_verified` | Baseline DB/runtime defects were patched; scheduler still runs on manual trigger and needs operational hardening |
| storage and data model | `verified` | SQLite + Drizzle schema in `src/db/schema.ts` (40 tables) |
| environment setup | `partially_verified` | Bootstrap scripts exist and run, but full install fails in current environment (`better-sqlite3` build) |
| output folders and generated assets | `partially_verified` | Upload/export paths work; resume output path bug was patched, but end-to-end export validation is pending |
| integration hooks (Phase I) | `partially_verified` | Calendar export, drafts, contacts, packet export, backup/import, and settings hooks implemented; runtime validation pending |

## Documentation consistency snapshot

| Doc | Status | Notes |
|---|---|---|
| `README.md` | `partially_verified` | Broad architecture matches, but completion claims are optimistic for automation/runtime reliability |
| `docs/PHASE1_NOTES.md` | `mismatch` | Says RAG and advanced features deferred; codebase now includes F/G/H era modules |
| `docs/GEMINI_SETUP.md` | `verified` | Model references and usage notes now align with current code paths |
| `Requirements/project-architecture.md` | `mismatch` | Describes older flat-JSON/Node-http architecture not present in this repo |
| `Requirements/tech-stack.md` | `mismatch` | Describes old runtime/dependency model; not aligned with Next.js + Drizzle stack |

## Practical readiness
- UI exploration readiness: moderate.
- Local setup reliability: low-to-moderate (depends on Node/toolchain compatibility).
- Safe base for Phase I integrations: baseline is now implemented; runtime hardening and end-to-end verification are still required.
