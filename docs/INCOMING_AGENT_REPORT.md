# INCOMING_AGENT_REPORT

Date: 2026-04-23
Auditor: Incoming agent
Scope: repo audit + documentation validation before Phase I implementation

## 1) Project summary (in my own words)
JobHunt India is a local-first career operations app built with Next.js + SQLite/Drizzle. It supports onboarding (resume + profile extraction), job discovery (portal scraping + scoring), document generation (resume/cover/outreach + ATS analysis), AI coaching using local RAG indexing, and CRM-style application tracking. Automation and notifications are present but currently fragile.

## 2) What is definitely implemented
- App shell, route structure, and Apple-HIG-inspired UI baseline.
- Onboarding flow with Gemini API key validation, resume parsing, profile extraction, and search profile persistence.
- Scraping orchestrator with adapters for LinkedIn, Naukri, and Wellfound.
- Rule-based scoring + AI enrichment + AI search query support.
- JD analysis, tailored resume generation pipeline, ATS verification, cover letter generation, outreach note generation.
- AI Coach: chunking, embeddings, retrieval, grounded answer generation, thread/message persistence, source evidence cards.
- CRM: application lifecycle tracking, timeline, notes, reminders, linked document history, dashboard summaries, CRM JSON export.
- Notifications and Today surfaces in UI.

## 3) What is partial or fragile
- Document resume export path is broken in code (`docx-builder.ts` uses undefined `config.appDataDir`).
- Automation services currently import `db` symbol that is not exported by `src/db/index.ts`; reliability is not production-ready.
- Scheduler execution is manual ("Run Checks Now"), not an autonomous loop.
- Placeholder pages still exist (`/saved`, `/applied`, `/documents`, `/analytics`).
- Applied tracking is split across two models (`job_applications` and CRM `applications.status`).
- Installation in this environment failed on `better-sqlite3` under Node 24.

## 4) What is documented but absent (or stale)
- Requested canonical onboarding docs were missing before this audit:
  - `docs/HANDOFF.md`
  - `docs/PROJECT_STATUS.md`
  - `docs/PHASE_ROADMAP.md`
  - `docs/RUNBOOK.md`
  - `docs/API_SURFACE.md`
  - `docs/DATA_MODEL.md`
  - `docs/TECHSTACK.md`
- `Requirements/*` docs describe an older architecture (flat JSON + standalone Node HTTP dashboard), which does not match this repo.
- `docs/PHASE1_NOTES.md` is a historical snapshot and should not be used for current feature status.

## 5) Key architecture decisions observed
- Local-first persistence in `~/.jobhunt-india` for config, DB, uploads, and exports.
- Domain services under `src/lib/services/*` with route-level orchestration through Next.js server actions.
- Single SQLite schema (`src/db/schema.ts`) spanning discovery, docs, coach, CRM, and automation domains.
- RAG pipeline uses SQLite-stored embeddings (no external vector DB).
- Most operations are synchronous local DB calls via `better-sqlite3` + Drizzle.

## 6) Key dependencies and tools
- Next.js 14, React 18, TypeScript, Tailwind
- `better-sqlite3`, `drizzle-orm`, `drizzle-kit`
- `@google/generative-ai`, `zod`
- `pdf-parse`, `mammoth`, `docx`
- Installer and bootstrap scripts under `installer/` and `scripts/`

## 7) How data flows through the system
1. Onboarding writes profile/search state to SQLite and local config.
2. Discover scan orchestrator scrapes portals, normalizes, deduplicates, stores jobs.
3. Scoring layer computes score/tier and optional enrichment.
4. Document actions generate JD analysis + assets, store outputs as `document_assets`.
5. Pipeline CRM tracks applications, timeline, notes, reminders, and linked documents.
6. Coach indexes profile/job/doc assets into chunks + embeddings and answers grounded Q&A.
7. Automation/notifications read CRM state to create alerts and priority lists.

## 8) Local run instructions I verified
Verified directly:
- `npm run db:init` (success; created local folder tree)
- `npm run doctor` (runs; reported DB file missing prior to schema push)

Attempted and failed in this environment:
- `npm install` failed while building `better-sqlite3` (Node `v24.14.0`, workspace path with space, native build/toolchain mismatch)

Expected full run path after environment/toolchain alignment:
- `npm install`
- `npm run db:init`
- `npm run db:generate`
- `npm run db:push`
- `npm run dev`

## 9) Risks before Phase I
1. Baseline runtime reliability is not guaranteed until dependency/toolchain issues are resolved.
2. Automation code defects can mislead future agents if docs continue to mark Phase H as complete.
3. Resume DOCX generation path bug blocks critical document workflow.
4. Dual applied-tracking models risk inconsistent state.
5. Stale docs can cause incorrect implementation assumptions during Phase I.

## 10) Recommended next action (safest)
Stabilization patch before new integrations:
1. Fix `db` import/export mismatch in automation services.
2. Fix resume output path in `docx-builder.ts` to use `getAppSubDir('output/resumes')`.
3. Resolve local build/runtime prerequisites (pin Node LTS, validate install path/toolchain).
4. Add one "preflight" command that verifies install + DB + key runtime surfaces.

Only then begin Phase I integration work.

---

## Handoff validation matrix (required system areas)

| Area | Status |
|---|---|
| app entry points | `verified` |
| dashboard/UI | `partially_verified` |
| server/API routes | `partially_verified` |
| scraping layer | `verified` |
| scoring layer | `verified` |
| document factory | `partially_verified` |
| ATS verification | `verified` |
| outreach generation | `verified` |
| applied tracking | `partially_verified` |
| RAG / AI coach | `verified` |
| CRM / pipeline tracking | `verified` |
| automation / scheduler / notifications | `mismatch` |
| storage and data model | `verified` |
| environment setup | `partially_verified` |
| output folders and generated assets | `partially_verified` |

## Mental model

### Product layers
- Acquisition: onboarding + discovery
- Intelligence: scoring + enrichment + ATS
- Execution: documents + outreach
- Operations: CRM + reminders + notifications
- Advisory: AI Coach (RAG)

### Code layers
- Presentation: `src/app`, `src/components`
- Domain services: `src/lib/services/*`
- Persistence: `src/db/*`
- Environment/utilities: `scripts/*`, `installer/*`, `src/lib/config.ts`, `src/lib/local-paths.ts`

### Data/storage layers
- SQLite core state (`jobhunt.db`)
- Local filesystem artifacts under `~/.jobhunt-india`
- Generated exports under `~/.jobhunt-india/exports`

### Operational workflows
- User-triggered scan, score, generate docs, track in pipeline, run coach, run manual automation checks.

### Extension points
- New service modules under `src/lib/services`
- Additional server actions under relevant route folders
- Schema expansion in `src/db/schema.ts`

### Technical debt hotspots
- Automation service import/runtime defects
- Resume file output path mismatch
- Stale docs still coexisting with newer architecture
- Duplicate applied-tracking models

---

## Post-Onboarding Addendum (2026-04-23)

After this onboarding report, a stabilization + Phase I baseline pass was started:

- Stabilization patches applied:
  - automation services now use valid DB access patterns
  - resume DOCX output path now uses local `output/resumes`
- Phase I baseline implemented:
  - calendar export service and UI hooks
  - email drafts service (versioned local drafts)
  - contacts model + linking
  - application packet export
  - workspace backup/export and bounded import
  - integration settings and toggles

See `docs/PHASE_I_NOTES.md` and `docs/INTEGRATIONS.md` for current implementation notes.
