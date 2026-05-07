# AGENTS.md — Career Seek: Complete Project Intelligence & Agentic Handbook

> This file is the single source of truth for any AI agent, human engineer, or
> automated system that works with this repository. Read it fully before making
> any change, running any script, or touching any service.

---

## Table of Contents

1. [Origin Story](#1-origin-story)
2. [Core Idea & Philosophy](#2-core-idea--philosophy)
3. [Tech Stack](#3-tech-stack)
4. [Architecture Overview](#4-architecture-overview)
5. [User Flow](#5-user-flow)
6. [Project Flow (Code Path)](#6-project-flow-code-path)
7. [Key Files & What They Own](#7-key-files--what-they-own)
8. [Environment & Configuration](#8-environment--configuration)
9. [Database](#9-database)
10. [Background Jobs (BullMQ + Redis)](#10-background-jobs-bullmq--redis)
11. [Scraping Layer](#11-scraping-layer)
12. [AI & LLM Layer](#12-ai--llm-layer)
13. [ATS Scoring & Document Generation](#13-ats-scoring--document-generation)
14. [Agentic AI Operating Rules](#14-agentic-ai-operating-rules)
15. [Git & Branch Strategy](#15-git--branch-strategy)
16. [Common Scripts & Commands](#16-common-scripts--commands)
17. [Known Constraints & Gotchas](#17-known-constraints--gotchas)
18. [Changelog Summary](#18-changelog-summary)

---

## 1. Origin Story

Career Seek was built in May 2026 as a **local-first AI-powered job search OS**
for the Indian job market. The project was entirely designed, architected, and
implemented through an **agentic AI session** (Claude Code + Claude Sonnet)
in collaboration with the user, with zero boilerplate scaffolding tools.

### Why it exists

The problem: job hunting in India across Naukri, LinkedIn, Foundit, Indeed,
iimjobs, Cutshort, Glassdoor, Shine, and 15+ other portals is a full-time job
in itself. Candidates copy-paste resumes, get no feedback on fit, and never
know why they got ghosted.

The vision: one local app that:
- Scrapes every relevant portal automatically, in the background
- Scores every job against your actual resume (ATS simulation)
- Generates tailored resumes, cover letters, and cold DMs per application
- Coaches you through interview prep using your own resume as context
- Tracks your entire pipeline without any cloud subscription

### How it was built

The entire codebase was produced iteratively through Claude Code sessions:

- Session 1 — Core scaffold: Next.js 14 app, SQLite schema, BullMQ worker,
  Playwright browser manager, first 6 portal adapters
- Session 2 — Scraping hardening: LinkedIn guest API, Naukri API, Foundit
  middleware, Python-JobSpy integration, ATS scorer v1
- Session 3 — Reliability layer: cross-platform install scripts, Redis
  auto-start, port conflict resolution, `.env.local` auto-generation
- Session 4 — Search broadening: salary ±20% range expansion, city alias
  groups, role synonym expansion, adaptive query re-expansion (5 levels),
  raised title variant and location limits across all 7 adapters
- Session 5 — Production hardening: `package.json` metadata, `.env.example`
  full documentation, README overhaul, TypeScript clean pass

---

## 2. Core Idea & Philosophy

### Design principles

| Principle | What it means in practice |
|-----------|--------------------------|
| **Local-first** | SQLite database, no cloud sign-up, everything on your machine |
| **Privacy by default** | Credentials never leave `.env.local`, which is `.gitignored` |
| **Graceful degradation** | Every adapter has a fallback chain; failure of one portal never breaks the scan |
| **Adaptive search** | If a query returns < 10 jobs, the orchestrator automatically widens it up to 5 levels |
| **No vendor lock-in** | Bring your own AI key: Gemini, OpenAI, Anthropic, Groq, DeepSeek, Ollama |
| **Zero manual setup** | `npm run setup` installs everything including Redis, Python venv, Playwright |

### What "job search OS" means

- **Discover** — background scans across 21 portals, deduplicated, scored
- **Pipeline** — Kanban board (Saved → Applied → Interview → Offer → Rejected)
- **Documents** — ATS-optimised resume, cover letter, and cold DM per job
- **Coach** — RAG-powered interview Q&A grounded on your resume
- **Analytics** — response rate, portal effectiveness, salary distribution

---

## 3. Tech Stack

### Frontend

| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | Next.js 14 (App Router) | `src/app/` — all pages use RSC + client islands |
| UI components | shadcn/ui + Tailwind CSS v3 | Custom dark theme |
| Animation | Framer Motion 12 | Used for pipeline drag and notifications |
| Icons | Lucide React | |
| State | React 18 hooks + server actions | No Zustand/Redux |

### Backend / API

| Layer | Choice | Notes |
|-------|--------|-------|
| API routes | Next.js Route Handlers (`src/app/api/`) | REST-style, no tRPC |
| Server actions | `src/app/actions.ts` + `automation-actions.ts` | Mutation layer |
| Background jobs | BullMQ 5 + IORedis + Redis | All scrape jobs are queued here |
| Bull Board | `@bull-board/express` | Optional queue UI on port 3002 |
| Logging | Pino + pino-pretty | Structured JSON in prod, pretty in dev |

### Scraping

| Layer | Choice | Notes |
|-------|--------|-------|
| Browser automation | Playwright (Chromium) | Managed by `BrowserManager` singleton |
| Python fallback | python-jobspy (via child_process spawn) | Indeed + Naukri fallback |
| ATS extraction | Custom DOM parser + `extractJobLinksFromPage` | Per-adapter base class |

### AI / LLM

| Layer | Choice | Notes |
|-------|--------|-------|
| SDK | Vercel AI SDK v6 (`ai` package) | Streaming, tool calls, fallback |
| Providers | `@ai-sdk/google`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/openai-compatible` | |
| Local inference | Ollama (llama3.2:3b default) | Requires no API key |
| Embedding | `@xenova/transformers` (ONNX in-process) | No external embedding API needed |
| Vector search | Qdrant (local HTTP) | RAG retrieval for coach |
| Full-text search | Meilisearch (local HTTP) | Job search across stored results |

### Storage

| Layer | Choice | Notes |
|-------|--------|-------|
| Primary DB | SQLite via `better-sqlite3` | `~/.jobhunt-india/career-seek.db` |
| ORM | Drizzle ORM | Schema at `src/db/schema.ts` |
| File storage | Local filesystem | `~/.jobhunt-india/resumes/`, `/documents/` |
| Documents | `docx` + `pdf-parse` + `mammoth` | Read/write Word + PDF |

### Infrastructure

| Tool | Purpose |
|------|---------|
| Redis (local) | BullMQ broker — auto-started by `ensure-redis.mjs` |
| Meilisearch (local) | Full-text job search — auto-started by bootstrap |
| Qdrant (local) | Vector DB for coach RAG — auto-started by bootstrap |
| Python venv | `scripts/python/` — `python-jobspy` fallback scraper |

---

## 4. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (localhost:3000)                   │
│  Next.js 14 App Router — RSC pages + client islands              │
└─────────────────────┬───────────────────────────────────────────┘
                       │ fetch / server actions
┌─────────────────────▼───────────────────────────────────────────┐
│                   Next.js Route Handlers                          │
│  /api/jobs  /api/scraping  /api/queue  /api/health  /api/search │
└──────┬──────────────┬──────────────────┬────────────────────────┘
       │              │                  │
┌──────▼──────┐ ┌─────▼──────┐  ┌───────▼──────────────────────┐
│  SQLite DB  │ │  BullMQ    │  │   Scraping Orchestrator       │
│  (Drizzle)  │ │  Job Queue │  │   src/lib/services/scraping/  │
└──────┬──────┘ └─────┬──────┘  └───────┬──────────────────────┘
       │              │                  │
       │        ┌─────▼──────┐  ┌───────▼──────────────────────┐
       │        │ BullMQ     │  │   21 Portal Adapters          │
       │        │ Worker     │  │   (Naukri, LinkedIn, Foundit, │
       │        │ (Redis)    │  │    Indeed, Glassdoor, +17)    │
       │        └────────────┘  └───────┬──────────────────────┘
       │                                │
       │                       ┌────────▼─────────────────────┐
       │                       │  Playwright BrowserManager   │
       │                       │  + Python-JobSpy fallback    │
       │                       └──────────────────────────────┘
       │
┌──────▼──────────────────────────────────────────────────────────┐
│              AI Service Layer  (src/lib/services/)               │
│  scoring/   documents/   coach/   resume/   analytics/           │
│  ↕ Vercel AI SDK → Gemini / OpenAI / Anthropic / Ollama         │
│  ↕ @xenova/transformers (embeddings, in-process)                 │
│  ↕ Meilisearch (full-text)   ↕ Qdrant (vector)                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. User Flow

### First run
```
npm run setup
  └─ installs Node deps, Playwright Chromium, Python venv, starts Redis
npm run launch
  └─ builds Next.js, starts worker, opens localhost:3000
```

### Onboarding (in-app)
1. Upload resume (PDF or DOCX) → parsed, embedded, stored
2. Set job title / role (e.g. "Product Manager") — mapped to role family pack
3. Set target locations, salary expectation, experience level
4. Configure AI provider (Gemini Free is default — needs no paid key)
5. Optionally: add LinkedIn / Naukri credentials for authenticated scraping

### Daily usage cycle
```
Today tab → "Scan for new jobs"
  └─ Queues BullMQ job
  └─ Orchestrator runs 21 portal adapters in priority order
  └─ Jobs deduplicated by title|company|city signature
  └─ Each job scored (0-100) against resume via ATS engine
  └─ Results appear in Discover feed, sorted by score

Discover tab → Browse scored jobs
  └─ Filter by portal, score, salary, location, date
  └─ Save → moves to Pipeline (Saved column)
  └─ "Generate Documents" → resume + cover letter + cold DM tailored per job
  └─ "Apply" → marks applied, stores date

Pipeline tab → Kanban: Saved → Applied → Interview → Offer → Rejected
  └─ Drag cards between columns
  └─ Each card shows score, portal, company, role, date

Coach tab → Interview prep
  └─ RAG over your resume + stored JD
  └─ Star method practice, salary negotiation, SWOT

Analytics tab → Response rate by portal, salary range map, weekly activity
```

---

## 6. Project Flow (Code Path)

### Scan job lifecycle

```
User clicks "Scan" (UI)
  → POST /api/queue  (src/app/api/queue/route.ts)
  → BullMQ enqueues job { query: JobQuery }
  → Bull worker picks up job (scripts/bull-worker.ts)
  → calls ScraperManager.scrape(query)
      → src/lib/services/scraping/scraper-manager.ts
  → ScraperManager calls ScrapingOrchestrator
      → src/lib/services/scraping/orchestrator.ts
  → Orchestrator builds JobQuery via QueryBuilder
      → src/lib/services/scraping/query-builder.ts
      → applies SearchBroadener (salary ±20%, city aliases, role synonyms)
      → src/lib/services/scraping/search-broadener.ts
  → Orchestrator runs 21 portal adapters in SOURCE_LADDER priority order
      → src/lib/services/scraping/source-universe.ts (INDIA_JOB_SOURCES)
      → each adapter: src/lib/services/scraping/adapters/*.ts
  → Each adapter: navigate → detect gate → extract cards → deduplicate
  → If results < 10 AND expansionLevel < 5 → widen query, retry
  → All jobs deduplicated globally
      → src/lib/services/scraping/deduplicator.ts
  → Each job scored against resume
      → src/lib/services/scoring/engine.ts
  → Results written to SQLite via Drizzle
  → UI polls /api/jobs for new results
```

### Document generation lifecycle

```
User clicks "Generate Resume" on a job card
  → POST /api/documents  (src/app/api/... or server action)
  → Reads: user resume, job description, user profile
  → ATS scorer identifies gap keywords
      → src/lib/services/scoring/keyword-coverage.ts
  → LLM generates tailored resume sections
      → src/lib/services/documents/resume-tailor.ts
  → DOCX builder assembles final file
      → src/lib/services/documents/docx-builder.ts
  → Saved to ~/.jobhunt-india/documents/
  → Cover letter and cold DM generated in parallel
      → src/lib/services/documents/cover-letter.ts
      → src/lib/services/documents/outreach.ts
```

---

## 7. Key Files & What They Own

| File | Owns |
|------|------|
| `src/lib/services/scraping/orchestrator.ts` | Expansion loop, adapter dispatch, deduplication pipeline |
| `src/lib/services/scraping/query-builder.ts` | `JobQuery` construction, 5-level expansion logic |
| `src/lib/services/scraping/search-broadener.ts` | Salary range ±20%, city alias groups, experience buffers |
| `src/lib/services/scraping/source-universe.ts` | `INDIA_JOB_SOURCES` — 21 portals, priority ladder, capabilities |
| `src/lib/services/scraping/types.ts` | `JobQuery`, `RawScrapedJob`, `PortalScanResult` interfaces |
| `src/lib/services/scraping/role-family-packs.ts` | 24 role families, title variants, keyword hints |
| `src/lib/services/search-preferences.ts` | `ROLE_SYNONYMS` lookup — maps user input → title variants |
| `src/lib/services/scraping/adapters/naukri.ts` | Naukri API + browser scraper |
| `src/lib/services/scraping/adapters/linkedin.ts` | LinkedIn guest API + browser fallback |
| `src/lib/services/scraping/adapters/foundit.ts` | Foundit middleware + browser fallback |
| `src/lib/services/scraping/adapters/indeed.ts` | Indeed India RSS + browser fallback |
| `src/lib/services/scraping/adapters/configured-sources.ts` | 10 portals via URL pattern (Shine, Hirist, iimjobs, etc.) |
| `src/lib/services/scraping/providers/python-jobspy.ts` | Python-JobSpy child process bridge |
| `src/lib/services/scoring/engine.ts` | Composite ATS scorer (keyword, section, semantic, grounding) |
| `src/lib/services/documents/docx-builder.ts` | Word document assembler |
| `src/lib/services/coach/rag-engine.ts` | RAG retrieval for interview coaching |
| `src/db/schema.ts` | Drizzle schema — all SQLite tables |
| `scripts/bootstrap.mjs` | One-command install: deps, browser, Python, Redis |
| `scripts/launch.mjs` | Production launcher with port probe + browser open |
| `scripts/ensure-redis.mjs` | Auto-start Redis if not running (predev / prestart hook) |
| `.env.example` | Canonical reference for all environment variables |

---

## 8. Environment & Configuration

All configuration lives in `.env.local` (gitignored — never commit this file).

Copy `.env.example` → `.env.local` and fill in only the keys you need.
The app onboarding UI can also set AI keys after first launch.

### Minimum viable config (free tier)

```env
# Gemini free tier — 1M tokens/day, no credit card
GEMINI_API_KEY=your_key_here
CAREER_SEEK_AI_PROVIDER=gemini
```

### Power user config additions

```env
LINKEDIN_EMAIL=your@email.com
LINKEDIN_PASSWORD=yourpassword
NAUKRI_EMAIL=your@email.com
NAUKRI_PASSWORD=yourpassword
SERPAPI_API_KEY=your_key   # Unlocks Google Jobs discovery
```

### Key env vars an agent must know

| Variable | Effect |
|----------|--------|
| `CAREER_SEEK_SKIP_PYTHON_SETUP=1` | Disables python-jobspy (safe if Python missing) |
| `CAREER_SEEK_SKIP_NATIVE_SERVICES=1` | Disables auto-start of Redis/Meilisearch/Qdrant |
| `CAREER_SEEK_SKIP_BUILD=1` | Skips Next.js build (use when already built) |
| `JOBHUNT_DATA_DIR=/custom/path` | Override the data directory |
| `JOBHUNT_FOUNDIT_LIMIT=35` | Max Foundit results per scan (cap: 60) |
| `JOBHUNT_NAUKRI_LIMIT=40` | Max Naukri results per scan (cap: 60) |
| `JOBHUNT_SOURCE_LIMIT=30` | Default per-source result limit |

---

## 9. Database

- **Engine**: SQLite via `better-sqlite3`
- **ORM**: Drizzle ORM
- **Location**: `~/.jobhunt-india/career-seek.db` (outside the repo)
- **Schema**: `src/db/schema.ts`
- **Migrations**: `npm run db:push` (Drizzle push — no migration files)

### Core tables (abbreviated)

| Table | Purpose |
|-------|---------|
| `jobs` | All scraped + deduplicated job listings |
| `applications` | User's pipeline entries (one per job saved) |
| `resumes` | Uploaded resume versions (parsed text + file path) |
| `generated_documents` | Resume/cover letter/DM generated per application |
| `scan_runs` | History of scan sessions with result counts |
| `user_profile` | Singleton: target role, salary, locations, preferences |
| `coach_sessions` | Coach Q&A history |
| `job_feedback` | User signals: red flag, snooze, thumbs up/down |

### When an agent touches the DB

- **Never** modify the SQLite file directly
- **Never** run raw SQL against production DB
- Use `npm run db:push` after schema changes to apply them
- For new columns: add to `src/db/schema.ts`, run `db:push`, update any
  Drizzle query that selects `*` if columns are added to existing tables

---

## 10. Background Jobs (BullMQ + Redis)

Redis must be running before the app starts. `scripts/ensure-redis.mjs`
handles this automatically (called by `predev` and `prestart` npm hooks).

### Queue names

| Queue | Purpose |
|-------|---------|
| `scrape-jobs` | Portal scan jobs |
| `score-jobs` | ATS scoring jobs (run after scrape) |
| `generate-docs` | Document generation jobs |

### Worker

`scripts/bull-worker.ts` — the single BullMQ worker process. It is started
automatically by `npm run launch`. In dev: `npm run worker`.

### Job payload shape

```typescript
interface ScrapeJobPayload {
  query: JobQuery;
  scanRunId: string;
  userId?: string;
}
```

### Debugging queues

If Bull Board is enabled (`CAREER_SEEK_ENABLE_BULL_BOARD=1`), visit
`http://localhost:3002` to inspect queues, retry failed jobs, and clear
completed jobs.

---

## 11. Scraping Layer

### Portal ladder (priority order)

The orchestrator tries portals in this order — higher priority sources run
first and can satisfy the job count threshold earlier:

1. `company_ats` — Greenhouse, Lever, Ashby, Workday career pages
2. `naukri` — Naukri.com (API first, browser fallback)
3. `linkedin` — LinkedIn guest API first, browser fallback
4. `foundit` — Foundit middleware API first, browser fallback
5. `indeed` — Indeed India (RSS + browser)
6. `google_jobs` — SerpAPI Google Jobs (requires `SERPAPI_API_KEY`)
7. `configured_sources` — Shine, TimesJobs, Glassdoor, iimjobs, Hirist,
   Cutshort, Hirect, Internshala, Apna, WorkIndia, PlacementIndia
8. `python_jobspy` — Python-JobSpy (Indeed + Naukri via Python)
9. `wellfound` / `peerlist` / `growthroles` — startup-focused portals
10. `official_companies` — curated company career pages

### Search broadening (5-level adaptive expansion)

When scan results < 10 jobs, the orchestrator automatically widens:

| Level | What changes |
|-------|-------------|
| 1 | Base query (salary ±20%, city aliases already applied by `search-broadener`) |
| 2 | Add adjacent role titles from role family pack |
| 3 | Drop salary filters entirely |
| 4 | Add "Remote" to locations |
| 5 | Set location to "India" (national scope), drop all salary filters |

### Per-adapter limits

Each adapter can search up to **5 title variants** and **5 locations** per
scan run (raised from 3 and 2 in v1.2.0). These limits are set via the
`uniqueVariants()` and `searchLocations()` helper functions inside each
adapter file.

### Deduplication

Signature: `title_normalized|company_normalized|city_normalized`

Normalisation: lowercase, remove punctuation, collapse whitespace, remove
common suffixes (India, Pvt Ltd, Inc, etc.).

---

## 12. AI & LLM Layer

### Provider priority

Configured via `CAREER_SEEK_AI_PROVIDER`. Fallback chain is:
Gemini → OpenAI → Anthropic → Groq → DeepSeek → Ollama (local)

The AI SDK's `ai-fallback` wrapper handles automatic provider failover.

### Role synonym expansion

`src/lib/services/search-preferences.ts` — `ROLE_SYNONYMS` map.

When a user types "SDE-2" or "Full Stack Dev", the role synonym engine maps
it to a canonical list of title variants fed into `JobQuery.titleVariants`.
This covers 50+ common Indian tech and non-tech roles.

### Embedding (local, no API key required)

`@xenova/transformers` runs ONNX embedding models in-process. Default model:
`Xenova/all-MiniLM-L6-v2`. Used by:
- Semantic ATS scoring
- Qdrant vector indexing for coach RAG
- Job-to-resume semantic similarity

---

## 13. ATS Scoring & Document Generation

### Scoring components (engine.ts)

| Component | Weight | What it measures |
|-----------|--------|-----------------|
| Keyword coverage | 35% | Overlap of JD keywords in resume |
| Section placement | 20% | Keywords in headline vs body vs missing |
| Semantic similarity | 30% | Cosine similarity of embedded vectors |
| Grounding | 15% | Whether resume claims match JD requirements |

### Document generation rules

`src/lib/services/documents/generation-rules.ts` — master rules file.
Contains formatting, length, tone, and content rules for each document type.
**Always check this file before changing how documents are generated.**

### Document types

| Type | Service | Output |
|------|---------|--------|
| Tailored resume | `resume-tailor.ts` | `.docx` + text |
| Cover letter | `cover-letter.ts` | `.docx` + text |
| Cold DM | `outreach.ts` | Text (3 variants: email, LinkedIn, WhatsApp) |

---

## 14. Agentic AI Operating Rules

> These rules are mandatory for any AI agent (Claude Code, Codex, Gemini CLI,
> Cursor, or any other) operating on this repository.

### Before writing any code

1. **Read this file in full first.** Do not skip sections.
2. Run `npx tsc --noEmit` and confirm zero new errors before and after changes.
3. Check `git status` to understand the current working state.
4. Never assume the database schema — read `src/db/schema.ts`.
5. Never assume what adapters exist — list `src/lib/services/scraping/adapters/`.

### Safe files to edit freely

- `src/lib/services/scraping/adapters/*.ts` — portal adapters
- `src/lib/services/scraping/search-broadener.ts` — salary/city expansion
- `src/lib/services/search-preferences.ts` — role synonyms
- `src/app/**/*.tsx` — UI pages and components
- `src/lib/services/documents/*.ts` — document generators
- `src/lib/services/scoring/*.ts` — ATS scoring logic
- `scripts/*.mjs` — install/bootstrap scripts

### Files requiring extra caution

| File | Reason |
|------|--------|
| `src/lib/services/scraping/orchestrator.ts` | Central dispatch — breaks everything if misedited |
| `src/lib/services/scraping/types.ts` | Interface changes break all adapters and the orchestrator |
| `src/lib/services/scraping/source-universe.ts` | Portal priority list — order matters for result quality |
| `src/db/schema.ts` | Schema changes require `npm run db:push` — cannot be done in code alone |
| `scripts/bootstrap.mjs` | Install sequence — wrong changes break first-run for all users |
| `.env.example` | Keep this accurate — it is the user's config reference |

### Files to never edit

| File | Reason |
|------|--------|
| `.env.local` | Secret file — gitignored, never committed |
| `~/.jobhunt-india/career-seek.db` | User's live database — never edit directly |
| `node_modules/**` | Always use `npm install` for dependency changes |
| `vendors/**` | Third-party vendored code — do not modify |

### TypeScript rules

- `strict: true` is enabled — do not add `any` casts to fix type errors
- Run `npx tsc --noEmit` after every meaningful change
- The only known pre-existing error is in `browser-use-agent.ts`
  (missing `../../config` module) — ignore it, it is a vendored file
- All new code must compile cleanly

### Adapter-specific rules

When adding or modifying a portal adapter:
- Extend `BasePortalAdapter` from `./base`
- Always implement `healthCheck()` and `scrape()`
- Always use `this.safeNavigate()` — never `page.goto()` directly
- Always use `this.detectAccessGate()` after navigation
- Always call `this.randomDelay()` after page load
- Always call `this.formatResult()` or `this.formatFailureResult()`
- Always deduplicate within the adapter using a `seen: Set<string>` keyed on
  `url.toLowerCase()::title.toLowerCase()`
- Default `uniqueVariants` limit: **5** (not 3, not 2)
- Default `searchLocations` limit: **5** (not 2)

### Search broadening rules

When touching query expansion logic:
- Expansion threshold: `scrapeResult.jobs.length < 10` (not 5)
- Maximum expansion levels: `expansionLevel < 5` (not 3)
- Salary ranges: always use ±20% of target, applied by `search-broadener.ts`
- Never remove the city alias groups from `search-broadener.ts`

### Git rules

- **Always commit before starting a significant change**
- **Commit message format**: `type(scope): short description`
  - Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`
  - Examples: `fix: raise search breadth across all adapters`
- **Never force-push to main**
- **Never commit `.env.local`, `*.db`, `node_modules/`, or `~/.jobhunt-india/`**
- After every successful feature: run `npx tsc --noEmit`, then commit
- Push to `origin main` with `git push origin main`

### Environment rules

- Never hardcode API keys, URLs, or credentials in source files
- All config must go through `process.env.*` reads
- Add new env vars to `.env.example` with a comment explaining the var
- Default values for optional vars must be set in the code, not in `.env.example`

### Adding a new portal adapter

1. Create `src/lib/services/scraping/adapters/newportal.ts`
2. Extend `BasePortalAdapter`, set `identifier` and `displayName`
3. Add the portal to `INDIA_JOB_SOURCES` in `source-universe.ts` with:
   - Appropriate `priority` (lower number = tried first)
   - `defaultEnabled: true` if it should run in every scan
   - Accurate `capabilities` flags
4. Register the adapter in `scraper-manager.ts`
5. Run the smoke test: `npm run qa:scrapers`
6. Add a note in `.env.example` if the portal needs a credential

### Adding a new AI feature

1. Read `src/lib/services/scoring/engine.ts` to understand the AI call pattern
2. Use `ai` package (Vercel AI SDK) — not `openai` or `@anthropic-ai/sdk` directly
3. Always handle `ai-fallback` gracefully — the user may have a different provider
4. Never block the main thread — wrap slow AI calls in the BullMQ worker queue
5. Add any new LLM prompts to `src/lib/services/documents/generation-rules.ts`
   if they are document-generation related

---

## 15. Git & Branch Strategy

### Branch naming

| Pattern | Use case |
|---------|----------|
| `main` | Production-ready code — always deployable |
| `feat/description` | New features in progress |
| `fix/description` | Bug fixes |
| `chore/description` | Dependency updates, tooling, docs |

### Commit cadence

- Commit after each complete, tested logical unit of work
- Do not accumulate 10 file changes in one uncommitted session
- Always verify `git diff --stat` before committing to catch accidental changes

### What gets gitignored

```
.env.local           # secrets
node_modules/
.next/               # build artifacts
*.db                 # user database
~/.jobhunt-india/    # user data dir (outside repo anyway)
dist/
.DS_Store
```

---

## 16. Common Scripts & Commands

```bash
# First-time setup
npm run setup

# Development (hot reload)
npm run launch:dev

# Production launch
npm run launch

# Type check (must pass clean)
npx tsc --noEmit

# Run all scrapers smoke test
npm run qa:scrapers

# Run ATS smoke test
npm run qa:ats

# Database schema push (after schema.ts changes)
npm run db:push

# Open Bull Board queue UI (enable in .env.local first)
npm run bull-board

# Run BullMQ worker standalone
npm run worker

# Doctor — check environment health
npm run doctor

# Clean run (clears .next cache and relaunches)
npm run launch:clean
```

---

## 17. Known Constraints & Gotchas

### LinkedIn auth gate

LinkedIn requires sign-in for authenticated search results. Without
`LINKEDIN_EMAIL` + `LINKEDIN_PASSWORD`, the adapter falls back to the public
guest HTML endpoint (`/jobs-guest/jobs/api/seeMoreJobPostings/`) which is
rate-limited to ~25 results per IP per day.

### Naukri rate limits

Naukri's `/jobapi/v3/search` returns HTTP 406 with a reCAPTCHA challenge when
too many unauthenticated requests come from the same IP. If this happens:
- Set `NAUKRI_EMAIL` + `NAUKRI_PASSWORD` for session cookies
- Or wait 30 minutes before the next scan

### Python-JobSpy

`python-jobspy` is an optional dependency. It requires Python 3.8+ and a
virtualenv. Bootstrap creates it at `scripts/python/venv/`. If Python is not
available, set `CAREER_SEEK_SKIP_PYTHON_SETUP=1` — all adapters have native
TypeScript fallbacks.

### Redis

Redis must be running. The `predev` and `prestart` hooks start it
automatically via `scripts/ensure-redis.mjs`. If Redis fails to start, the
BullMQ worker will not boot and no scans will run. Check `npm run doctor`.

### Windows compatibility

The repo is cross-platform. All scripts use Node.js `path.join()`. Shell
scripts in `scripts/` use `.mjs` (Node ESM) — never bash. Windows users
need WSL2 or Node 20+ native (Redis may need WSL or Docker on Windows).

### Playwright

Playwright Chromium is installed to the project cache (not globally) by
`npm run setup`. If browser automation fails, run:
```bash
npx playwright install chromium
```

### Port conflicts

`scripts/launch.mjs` does a TCP probe before starting — if port 3000 is in
use, it finds the next free port automatically. Check the console for the
actual URL.

---

## 18. Changelog Summary

### v1.2.0 (May 2026) — Search Broadening & Production Hardening
- Introduced `search-broadener.ts` — salary ±20% range, 18 Indian city alias
  groups, experience buffer logic
- Raised all adapter title variant limits: 3 → 5
- Raised all adapter location limits: 2 → 5
- Raised orchestrator expansion threshold: 5 → 10 jobs before widening
- Raised orchestrator max expansion levels: 3 → 5
- Added salary range params (LPA) to Naukri API calls
- Fixed python-jobspy keyword stuffing (title-only search term)
- Expanded `ROLE_SYNONYMS` to 50+ roles covering SDE tiers, mobile, data,
  sales, HR, marketing, finance, operations
- Production `package.json`: name, version, homepage, repository, bugs, MIT license
- Complete `.env.example` with all 7 sections and inline documentation
- README overhaul: accurate badges, v1.1 + v1.2 changelog, setup instructions

### v1.1.0 (May 2026) — Scraping Reliability & ATS Layer
- LinkedIn credential login with verification challenge detection
- Naukri credential login with session cookie persistence
- Python-JobSpy integration (child process spawn, mapJob normaliser)
- ATS scorer v2: keyword coverage + section placement + semantic (ONNX) +
  grounding components
- Greenhouse, Lever, Ashby ATS portal support
- Red-flag scoring, snooze, and feedback signals on job cards
- 3-format outreach pack: email, LinkedIn message, WhatsApp DM

### v1.0.0 (May 2026) — Initial Build
- Next.js 14 App Router scaffold
- SQLite + Drizzle schema
- BullMQ + Redis worker queue
- Playwright BrowserManager singleton
- 6 portal adapters: Naukri, LinkedIn, Foundit, Indeed, Glassdoor, Cutshort
- Role family pack system (24 role families)
- Resume upload, parse (pdf-parse + mammoth), embed (@xenova/transformers)
- Document generation: resume tailor, cover letter, outreach
- Coach RAG engine (Qdrant + chunker + embedder)
- First-run setup wizard (onboarding flow)
- Bootstrap + launch scripts for Mac and Windows

---

*This document was written by Claude Sonnet (claude-sonnet-4-5) in May 2026,
as part of an agentic development session. It reflects the actual codebase
state at v1.2.0. Keep it updated with every significant architectural change.*
