# RUNBOOK

Last validated: 2026-04-23

## Prerequisites
- Node.js 20.x LTS is recommended.
- npm 10+.
- macOS or Windows.

## Known setup caveats
1. In this workspace, `npm install` failed under Node `v24.14.0` when building `better-sqlite3`.
2. Workspace path contains a space (`/Users/iamadarsha/Documents/Career Seek`), which surfaced build tool path issues during native module compilation.

## Bootstrap commands

```bash
npm run db:init
```
Creates:
- `~/.jobhunt-india/config`
- `~/.jobhunt-india/db`
- `~/.jobhunt-india/cache`
- `~/.jobhunt-india/logs`
- `~/.jobhunt-india/output/resumes`
- `~/.jobhunt-india/output/cover-letters`
- `~/.jobhunt-india/uploads`

```bash
npm run doctor
```
Checks base directory and DB file existence.

## Full local setup (expected path)

```bash
npm install
npm run db:init
npm run db:generate
npm run db:push
npm run dev
```

Notes:
- `db:generate` and `db:push` require dependencies installed.
- There is no committed migration set under `src/db/migrations`; schema push is expected for local initialization.

## Primary app workflows
- Onboarding: `/onboarding`
- Discover + scan + score: `/discover`
- Pipeline CRM: `/pipeline`
- AI Coach: `/coach`
- Today/notifications: `/today`, `/notifications`

## Quick verification commands

```bash
rg --files src/app src/lib/services src/db
rg -n "^export async function" src/app/**/*.ts src/app/**/*.tsx
rg -n "sqliteTable\(" src/db/schema.ts
```

## High-risk zones before feature work
1. `src/lib/services/automation/*` (baseline defects patched; requires end-to-end runtime verification)
2. `src/app/discover/document-actions.ts` + `src/lib/services/documents/*` runtime chain
3. Dual tracking models (`job_applications` vs `applications`) can diverge
4. New Phase I import/restore flows need conflict-policy hardening for production reliability

## Recovery posture
- Local-first data is under `~/.jobhunt-india`.
- CRM export is available via settings/pipeline export service (`exports/crm-export-YYYY-MM-DD.json`).
- Workspace backup export/restore is available via Integration settings (`exports/backups/workspace-backup-*/` with JSON + manifest + optional zip).
