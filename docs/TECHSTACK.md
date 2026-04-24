# TECHSTACK

Last validated: 2026-04-23
Source: `package.json` + repo config files.

## Application stack
- Framework: Next.js `14.2.3` (App Router)
- Language: TypeScript
- UI: React 18 + Tailwind CSS
- Icons: `lucide-react`

## Data and persistence
- Local DB: SQLite (`better-sqlite3`)
- ORM: Drizzle ORM (`drizzle-orm`)
- Schema tooling: `drizzle-kit`
- Local file storage root: `~/.jobhunt-india`

## AI and parsing
- AI SDK: `@google/generative-ai`
- Models referenced in code:
  - `gemini-2.5-flash`
  - `gemini-2.5-flash-lite`
  - `text-embedding-004`
- Document parsing:
  - `pdf-parse`
  - `mammoth`
- Schema validation: `zod`

## Document generation
- DOCX generation: `docx`
- Calendar export: local `.ics` generation (no external dependency)
- Archive export: best-effort shell `zip` command when available

## Tooling
- Lint: ESLint (Next config)
- Typecheck: `tsc --noEmit`
- Installer scripts:
  - `installer/install-macos.sh`
  - `installer/install-windows.ps1`
- Utility scripts:
  - `scripts/db-init.mjs`
  - `scripts/doctor.mjs`
  - `scripts/launch.mjs`

## Phase I integration modules
- `src/lib/services/integrations/calendar-export-service.ts`
- `src/lib/services/integrations/email-draft-service.ts`
- `src/lib/services/integrations/contacts-service.ts`
- `src/lib/services/integrations/application-export-service.ts`
- `src/lib/services/integrations/backup-service.ts`
- `src/lib/services/integrations/import-service.ts`
- `src/lib/services/integrations/settings-service.ts`

## Current environment compatibility notes
- Node in this environment: `v24.14.0`
- `npm install` failed here due native build issues in `better-sqlite3`; Node 20 LTS is the safer baseline for this repo.
