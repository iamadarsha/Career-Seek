# History And Decisions

## Current Documentation Set

The live `docs/` folder was consolidated to 10 Markdown files, then `CURRENT_STATE_AND_GAPS.md` was added as the reviewer-facing state audit requested after consolidation. The current live set is 11 Markdown files:

- `CURRENT_STATE_AND_GAPS.md`
- `FINAL_RELEASE_STATUS.md`
- `PRODUCT_FLOW.md`
- `ONBOARDING_AND_PROFILE.md`
- `JOB_DISCOVERY_AND_RANKING.md`
- `APPLICATIONS_AND_DOCUMENTS.md`
- `AI_COACH_AND_RAG.md`
- `ANALYTICS_AUTOMATION_AND_INTEGRATIONS.md`
- `ARCHITECTURE_AND_DATA.md`
- `LOCAL_RUNBOOK.md`
- `HISTORY_AND_DECISIONS.md`

Older Markdown files were moved to `archived-docs/2026-04-24-docs-consolidation/` to preserve history without leaving stale duplicates in `docs/`.

## Source Of Truth

- Detailed current status and gaps: `CURRENT_STATE_AND_GAPS.md`.
- Short current status: `FINAL_RELEASE_STATUS.md`.
- Current flow: `PRODUCT_FLOW.md`.
- Current run instructions: `LOCAL_RUNBOOK.md`.
- Current architecture and data model summary: `ARCHITECTURE_AND_DATA.md`.

Older phase notes, proof logs, and audit reports are historical context only.

## Key Decisions

- Treat current code and verified validation as the source of truth over older phase notes.
- Keep the product local-first.
- Do not replace Career Seek with a third-party scraper or job-search app.
- Prefer official company career pages before hostile public portals.
- Treat portal scraping as best-effort and failure-tolerant.
- Treat ATS score as advisory, not employer-certified.
- Preserve local proof and generated data unless the user explicitly approves deletion.

## Validation History Summary

- `npm run build` passed.
- `npm run typecheck` passed when run after build.
- `npm run doctor` passed after environment repair.
- `better-sqlite3` needed rebuild after a Node ABI mismatch.
- One validated launch used `localhost:3002` because `3000` and `3001` were occupied.
- One production-style route validation used `localhost:3000`.
- Key routes returned `200` during production route validation.
- First-run route gating was validated.
- A full fresh real-key onboarding-to-populated-dashboard run remains a hardening target.

## Archived Content

The archive contains the prior detailed phase notes, plans, specs, final proof reports, vendor evaluations, RAG notes, CRM notes, analytics notes, and scraping hardening notes.

Use archived files only when historical detail is needed. Do not use them to override the current status docs.
