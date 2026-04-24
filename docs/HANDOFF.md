# HANDOFF (Validated)

Last validated: 2026-04-23
Validator: Incoming agent onboarding audit

## Canonical posture
- Trust code over docs.
- This file is the onboarding source of truth until replaced by a newer validated handoff.

## What this project is
JobHunt India is a local-first Next.js app that manages a job-search pipeline: onboarding/profile extraction, scraping and scoring jobs, generating application documents, coaching with RAG, CRM-style application tracking, and manual automation checks.

## Current reality
- Large portions of Phases B, C, D, F, and G are implemented in code.
- Automation (Phase H) exists and baseline runtime defects were patched, but it still needs deeper operational hardening.
- Phase I integration baseline is now in progress (calendar export, drafts, contacts, packet export, backup/import, settings hooks).
- Documentation is fragmented and partially stale; several canonical docs were missing before this onboarding pass.

## High-confidence implementation anchors
- App shell and routes: `src/app/layout.tsx`, `src/app/page.tsx`, `src/components/Sidebar.tsx`
- Onboarding: `src/app/onboarding/page.tsx`, `src/app/actions.ts`
- Scraping: `src/lib/services/scraping/*`, `src/app/discover/actions.ts`
- Scoring: `src/lib/services/scoring/*`
- Document generation: `src/app/discover/document-actions.ts`, `src/lib/services/documents/*`
- AI Coach (RAG): `src/lib/services/coach/*`, `src/app/coach/*`
- CRM/Pipeline: `src/lib/services/crm/*`, `src/app/pipeline/*`
- Automation/notifications: `src/lib/services/automation/*`, `src/app/today/page.tsx`, `src/app/notifications/page.tsx`
- Data model: `src/db/schema.ts`

## Known critical gaps
1. `npm install` currently fails in this workspace under Node 24 with `better-sqlite3` build issues (and path-with-space toolchain breakage).
2. Some docs still describe an older architecture (flat JSON + Node HTTP dashboard) from `Requirements/*` and no longer match this repo.
3. Runtime validation is blocked until dependencies can be installed and DB migrations run.

## Immediate recommendation
Stabilization patches and a Phase I baseline are now in place. Next priority is runtime hardening: complete dependency install/migrations on a compatible Node toolchain, then run end-to-end verification for calendar export, drafts, packet export, backup/restore, and automation checks.
