# Career Ops India — Project Architecture

> Authoritative reference for AI agents and contributors. Read this before modifying any file.

---

## What It Is

**Career Ops India** is a local-first, AI-augmented job search pipeline built for Adarsha Chatterjee — an AI Product Manager targeting ₹25 LPA+ roles in India. It runs entirely on a local Mac, stores all data in flat JSON files, and uses Gemini 2.0 Flash as its only external AI service.

---

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CAREER OPS INDIA — System                        │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  SCRAPE LAYER                                               │   │
│  │  india-jobs.mjs          extended-portals.mjs               │   │
│  │  LinkedIn · Naukri       TimesJobs · Shine · Hirist         │   │
│  │  Foundit · Indeed        Cutshort · iimjobs                 │   │
│  │  Wellfound · Monster                                        │   │
│  │                          company-careers.mjs                │   │
│  │                          275 companies from CSV             │   │
│  └──────────────────────────────┬──────────────────────────────┘   │
│                                 │ deduplicated by composite job ID  │
│                                 ▼                                   │
│  DATA LAYER          data/india-jobs-raw.json                       │
│                                 │                                   │
│  ┌──────────────────────────────▼──────────────────────────────┐   │
│  │  SCORE LAYER  scoring/match-engine.mjs                      │   │
│  │  Rule-based:  titleMatch · companyTier · salary · location  │   │
│  │  AI bonus:    Gemini keyword match · fit summary · angle     │   │
│  └──────────────────────────────┬──────────────────────────────┘   │
│                                 ▼                                   │
│               data/india-jobs-scored.json                           │
│               { matchScore 0–100, tier A/B/C/D, geminiInsights }    │
│                                 │                                   │
│  ┌──────────────────────────────▼──────────────────────────────┐   │
│  │  DASHBOARD LAYER  dashboard/india-serve.mjs  :3030          │   │
│  │  GET  /               Full HTML dashboard                   │   │
│  │  POST /api/scan        Trigger live scrape + score          │   │
│  │  GET  /api/scan-status Poll scan progress                   │   │
│  │  POST /api/ai-search   Gemini natural language search       │   │
│  │  POST /api/ai-brief    Gemini fit analysis per job          │   │
│  │  POST /api/resume-build      Tailored DOCX resume           │   │
│  │  POST /api/cover-letter-build DOCX cover letter             │   │
│  │  POST /api/linkedin-outreach  LinkedIn connection note      │   │
│  │  POST /api/track-applied      Toggle applied status         │   │
│  │  GET  /api/applied            Applied jobs map              │   │
│  │  GET  /api/queue              Download apply-queue.md       │   │
│  │  GET  /api/data               Raw JSON job list             │   │
│  └──────────────────────────────┬──────────────────────────────┘   │
│                                 │                                   │
│  ┌──────────────────────────────▼──────────────────────────────┐   │
│  │  GENERATION LAYER                                           │   │
│  │  scripts/resume-builder.mjs                                 │   │
│  │    Stage 1: Gemini analyses JD → tailored content (7 sec)   │   │
│  │    Stage 2: docx lib builds DOCX (Calibri, centered name)   │   │
│  │    Stage 3: Gemini ATS verify → score + missing keywords    │   │
│  │    Output:  output/resumes/*.docx + *-analysis.json         │   │
│  │                                                             │   │
│  │  scripts/cover-letter-builder.mjs                           │   │
│  │    Gemini generates human-voice letter (temp 0.85)          │   │
│  │    Output: output/cover-letters/*.docx                      │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Four Pipeline Stages

| # | Stage | Input | Output | Key Files |
|---|-------|-------|--------|-----------|
| 1 | **Scrape** | Portal URLs + 275 company pages | `india-jobs-raw.json` | `scrapers/*.mjs` |
| 2 | **Score** | Raw jobs + candidate profile | `india-jobs-scored.json` | `scoring/match-engine.mjs` |
| 3 | **Review** | Scored jobs | Browser dashboard | `dashboard/india-serve.mjs` |
| 4 | **Generate** | Scored job + JD text | DOCX resume + cover letter | `scripts/resume-builder.mjs`, `scripts/cover-letter-builder.mjs` |

---

## Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| **Flat JSON over database** | Single-user, ~300–500 job scale; zero infra needed |
| **Playwright with real Chrome** | Indian portals (Naukri, Foundit) detect headless Chromium and return empty pages |
| **Gemini 2.0 Flash only** | Free tier sufficient; lower latency; integrates with Google Search grounding |
| **DOCX not PDF** | ATS parsers handle DOCX better; user can edit in Word before submitting |
| **child_process.spawn for scans** | Keeps HTTP server alive during long scrapes; progress streamed via polling |
| **All-in-one dashboard file** | `india-serve.mjs` has server + HTML + all API handlers — zero build step |
| **No Express/framework** | Native `node:http` only — no runtime dependencies for the server |

---

## Complete File Structure

```
career-ops-india/
│
├── scrapers/
│   ├── india-jobs.mjs              # Primary 7-portal scraper (Playwright)
│   ├── extended-portals.mjs        # 5 niche portals + Gemini page fallback
│   ├── company-careers.mjs         # 275 company career pages (CSV-driven)
│   └── stealth-config.mjs          # UA rotation, jitter delays, Playwright helpers
│
├── scoring/
│   └── match-engine.mjs            # Rule-based + Gemini scoring → 0–100 + tier
│
├── scripts/
│   ├── resume-builder.mjs          # 3-stage DOCX generator (Gemini × 2 + docx lib)
│   ├── cover-letter-builder.mjs    # Gemini cover letter → DOCX
│   ├── apply-queue.mjs             # Generate daily apply-queue.md for Tier A
│   ├── cron-setup.sh               # Optional OS cron for auto-scans
│   └── notify-telegram.mjs         # Telegram push for new Tier A jobs
│
├── dashboard/
│   └── india-serve.mjs             # HTTP server + HTML UI + 12 API routes (1 file)
│
├── data/
│   ├── india-jobs-raw.json         # All scraped jobs pre-scoring
│   ├── india-jobs-scored.json      # All jobs with scores, tiers, Gemini insights
│   ├── india-scan-history.json     # Scan run history
│   ├── applied.json                # Jobs marked as applied (toggle tracker)
│   └── company-careers-list.csv   # 275 companies: name, tier, careers URL
│
├── output/
│   ├── resumes/                    # Generated .docx + -analysis.json pairs
│   └── cover-letters/              # Generated .docx cover letters
│
├── docs/                           # Detailed component documentation
│   ├── ARCHITECTURE.md
│   ├── TECH_STACK.md
│   ├── SCRAPERS.md
│   ├── SCORING.md
│   ├── USER_FLOW.md
│   ├── RESUME_ENGINE.md
│   └── DASHBOARD.md
│
├── .env                            # API keys (never commit)
├── ADARSHA_PROFILE.md              # Canonical profile — resume source of truth
└── package.json                    # 20+ npm scripts
```

---

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `GEMINI_API_KEY` | ✅ Yes | All AI features (scoring, resume, brief, search, outreach) |
| `LINKEDIN_EMAIL` | Recommended | LinkedIn portal scraping |
| `LINKEDIN_PASSWORD` | Recommended | LinkedIn portal scraping |
| `TELEGRAM_BOT_TOKEN` | Optional | Push notifications for new Tier A jobs |
| `TELEGRAM_CHAT_ID` | Optional | Paired with bot token |
| `DASHBOARD_PORT` | Optional | Default: 3030 |

---

## In-Memory Server State

The dashboard server maintains one in-memory object for scan tracking:

```js
let _scan = {
  running: false,       // is scan actively running?
  phase: '',            // 'jobs' | 'score' | 'done' | 'error'
  log: [],              // rolling log lines (last 20 returned to client)
  startedAt: null,      // Date.now() timestamp
  finishedAt: null,
  error: null,
};
```

This survives page reloads but resets on server restart.
