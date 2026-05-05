# Architecture And Data

## Stack

- Next.js App Router.
- React.
- TypeScript.
- Tailwind CSS.
- SQLite through `better-sqlite3`.
- Drizzle ORM.
- Gemini SDK for AI generation and embeddings.
- Playwright for browser-backed scraping and validation.

## App Layers

- `src/app`: pages, route handlers, and server actions.
- `src/components`: reusable UI components.
- `src/lib/services`: domain services for scraping, scoring, documents, coach, CRM, analytics, and automation.
- `src/db`: SQLite schema and Drizzle setup.
- `scripts`: bootstrap, doctor, schema push, worker, proof, and seed scripts.
- `data`: checked-in seed data plus local runtime data when `JOBHUNT_DATA_DIR=./data`.

## Local Data

The app persists local data under `JOBHUNT_DATA_DIR` when set, otherwise under `~/.jobhunt-india`.

Local data includes:

- config
- SQLite DB
- uploads
- generated resumes and cover letters
- logs
- proof artifacts
- exports
- cache and related runtime artifacts

## Schema Groups

Major table groups include:

- user and profile settings
- uploaded resumes and master profiles
- search profiles
- scans and source runs
- normalized and scored jobs
- JD analyses and document assets
- AI coach chunks, threads, messages, and sources
- applications, timeline, notes, reminders, documents, and contacts
- notifications and automation jobs
- analytics events, snapshots, insights, experiments, and reviews
- source universe seed tables

## API Surface

The codebase primarily uses Next.js server actions. Route handlers are limited and targeted. The download route serves generated document assets by asset ID and validates ownership/path constraints.

## Source Universe Data

Source universe files live in `data/`:

- `company_careers_seed.csv`
- `role_family_packs.json`
- `ats_provider_mapping.json`
- `source_registry.json`

`npm run source:seed` seeds this data into the active local SQLite database.

## Security Boundaries

- Gemini content is sent to Google only when the user configures a key and triggers AI features.
- Local files should not be exposed through raw path parameters.
- Generated documents are local assets until the user manually shares them.
- Browser scraping should degrade to safe mode when browser dependencies are unavailable.

## Compatibility Notes

- Node 20 LTS is preferred.
- Node versions outside the supported ABI range can require native dependency rebuilds.
- `better-sqlite3` may need `npm rebuild better-sqlite3` after Node changes.
