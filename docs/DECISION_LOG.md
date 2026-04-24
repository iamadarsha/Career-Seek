# DECISION_LOG

## 2026-04-23

| Date | Decision | Rationale | Affected files | Confidence |
|---|---|---|---|---|
| 2026-04-23 | Treat code as canonical over legacy/requirements docs. | `Requirements/*` describes a different flat-JSON architecture than this Next.js + Drizzle repo. | `Requirements/project-architecture.md`, `Requirements/tech-stack.md`, `src/app/*`, `src/db/*` | High |
| 2026-04-23 | Classify automation layer as `mismatch` rather than complete. | Automation modules reference non-exported `db` symbol and include placeholder/stale behavior paths. | `src/lib/services/automation/*`, `src/db/index.ts` | High |
| 2026-04-23 | Mark document factory as `partially_verified` (not fully verified). | Document pipeline exists, but resume DOCX output path currently references undefined config field. | `src/lib/services/documents/docx-builder.ts`, `src/lib/config.ts` | High |
| 2026-04-23 | Introduce missing canonical onboarding docs before any feature implementation. | Required handoff/status/runbook/API/data-model docs were absent; onboarding needed a reliable baseline. | `docs/HANDOFF.md`, `docs/PROJECT_STATUS.md`, `docs/PHASE_ROADMAP.md`, `docs/RUNBOOK.md`, `docs/API_SURFACE.md`, `docs/DATA_MODEL.md`, `docs/TECHSTACK.md` | High |
| 2026-04-23 | Recommend stabilization-first sequence before Phase I integrations. | Runtime/install and core service defects would create compounding risk if integrations are built immediately. | `docs/INCOMING_AGENT_REPORT.md`, `docs/PROJECT_STATUS.md`, `docs/RUNBOOK.md` | High |
| 2026-04-23 | Treat `/saved`, `/applied`, `/documents`, `/analytics` as non-canonical for feature completeness. | These routes are currently placeholders and should not be used to claim full workflow completion. | `src/app/saved/page.tsx`, `src/app/applied/page.tsx`, `src/app/documents/page.tsx`, `src/app/analytics/page.tsx` | High |
| 2026-04-23 | Keep backward-compatible `db` export while preserving `getDb()` as the primary API. | Automation modules expected `db`; adding a singleton export unblocked runtime without broad refactors. | `src/db/index.ts`, `src/lib/services/automation/*` | Medium |
| 2026-04-23 | Fix DOCX output path by using local-paths helper, not config state. | `getAppConfig()` has no `appDataDir`; using `getAppSubDir('output/resumes')` aligns with local-first storage conventions. | `src/lib/services/documents/docx-builder.ts`, `src/lib/local-paths.ts` | High |
| 2026-04-23 | Implement Phase I integrations as modular services with explicit boundaries. | Isolating calendar/drafts/contacts/export/backup/import/settings improves safety and future extensibility. | `src/lib/services/integrations/*`, `src/app/pipeline/pipeline-actions.ts` | High |
| 2026-04-23 | Use `app_settings` JSON payload for integration preferences. | Reuses existing settings table, avoids additional migration complexity for baseline delivery. | `src/lib/services/integrations/settings-service.ts`, `src/db/schema.ts` | Medium |
| 2026-04-23 | Reclassify docs to reflect current post-start state (Phase I baseline implemented, Phase H still partially verified). | Prevents future agents from assuming either "not started" or "fully production-ready" when reality is between those states. | `README.md`, `docs/PROJECT_STATUS.md`, `docs/RUNBOOK.md` | High |
