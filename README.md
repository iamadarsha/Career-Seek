<div align="center">

<br/>

<img src="src/app/icon.svg" width="72" alt="Career Seek icon" />

<br/>

# Career Seek

### Your local AI job-search command center

**Scan job boards · Score fit against your resume · Generate tailored documents · Track every application · Get AI coaching**

Everything runs on your own machine — no subscription, no cloud account, no data leaving your laptop.

<br/>

[![Install on macOS](https://img.shields.io/badge/Install-macOS-000?style=for-the-badge&logo=apple&logoColor=fff)](#install-in-one-command)
[![Install on Windows](https://img.shields.io/badge/Install-Windows-0078d4?style=for-the-badge&logo=windows&logoColor=fff)](#install-in-one-command)
[![Next.js 14](https://img.shields.io/badge/Next.js-14_App_Router-000?style=flat-square&logo=next.js)](#tech-stack)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178c6?style=flat-square&logo=typescript&logoColor=fff)](#tech-stack)
[![SQLite](https://img.shields.io/badge/SQLite-Local_First-044a64?style=flat-square&logo=sqlite&logoColor=fff)](#tech-stack)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)](#)

<br/>

</div>

---

## Install in One Command

No prerequisites needed. The installer handles everything — Git, Node.js, Redis, Meilisearch, Chromium, and a portable Python runtime are all set up automatically.

### macOS / Linux — Terminal

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/iamadarsha/Career-Seek/main/installer/install-macos.sh)"
```

> Requires macOS 12 Monterey or later. Homebrew is installed automatically if missing.  
> Linux users: clone the repo and run `npm run bootstrap && npm run launch`.

### Windows — PowerShell

```powershell
powershell -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/iamadarsha/Career-Seek/main/installer/install-windows.ps1 | iex"
```

> Requires Windows 10 or later. Git and Node.js are installed automatically via winget if missing.

**What the installer does, in order:**

1. Installs missing tools (Homebrew / winget → Git → Node.js 22 LTS)
2. Clones this repository to `~/Career-Seek`
3. Installs all npm dependencies
4. Downloads Redis and Meilisearch binaries (no Docker needed)
5. Downloads a portable Python 3.12 runtime and installs `python-jobspy`
6. Installs Playwright Chromium for browser-backed job scraping
7. Initialises the local SQLite database and seeds source metadata
8. Runs the system doctor to verify everything is working
9. Builds the production app
10. Opens Career Seek at [http://localhost:3000](http://localhost:3000)

First run takes **5–10 minutes** depending on your internet speed. After that, start in under 10 seconds.

---

## Daily Usage — After Install

```bash
# macOS / Linux
cd ~/Career-Seek && ./setup.sh

# Windows (PowerShell)
cd ~/Career-Seek; .\setup.ps1
```

Or directly with npm from the `~/Career-Seek` directory:

```bash
npm run launch        # production server
npm run launch:dev    # hot-reload dev server
npm run doctor        # check system health
```

The app runs at **[http://localhost:3000](http://localhost:3000)**.

---

## What Career Seek Does

Career Seek is a local-first, AI-powered job search OS. It replaces the spreadsheet-and-browser workflow with a single workspace that handles discovery, scoring, document generation, outreach, application tracking, and coaching — all running on your machine.

```
 ┌────────────────────────────────────────────────────────────────────────┐
 │  Your Resume  →  AI Profile  →  Job Scan  →  Score & Rank             │
 │                                                                        │
 │  Ranked Jobs  →  Signal Feedback  →  Generate Documents  →  Apply     │
 │                                                                        │
 │  3-format Outreach Pack  →  Track in Pipeline  →  AI Coach            │
 └────────────────────────────────────────────────────────────────────────┘
```

---

## Feature Overview

### Job Discovery

Scans **LinkedIn, Naukri, Wellfound, Foundit, Instahyre, Indeed**, and hundreds of **company career pages** directly. Results are merged, deduplicated, and ranked by fit. No account needed for most sources.

The scraper stack has five tiers — tried in order, each tier falling back gracefully:

| Tier | Method | When it runs |
|------|--------|--------------|
| 1 | `jobspy_api` — ts-jobspy HTTP-direct (LinkedIn + Indeed) | Always first, no browser needed |
| 2 | Google Jobs discovery | Secondary pass |
| 3 | `python-jobspy` via portable Python | If tier 1 returns nothing |
| 4 | **Camoufox** anti-detect browser | For sites with anti-bot protection |
| 5 | **Browser-Use** AI agent | Last resort — fully autonomous browsing |

**Deduplication** uses a normalised signature that strips legal suffixes (`Pvt Ltd`, `Inc`, `Corp`, `LLP`, `Technologies`…) so "Accenture Pvt. Ltd." and "Accenture Solutions India" are recognised as the same company across sources.

---

### Resume Scoring

Scores each job against your resume on six dimensions, without sending data anywhere:

| Dimension | Max pts | What it measures |
|-----------|---------|-----------------|
| Title relevance | 20 | How closely job title matches your target role |
| Skill match | 20 | Overlap between your skills and JD requirements |
| Experience fit | 15 | Years-of-experience alignment |
| Work mode | 10 | Remote / hybrid / office preference match |
| ATS keyword coverage | 15 | Must-have and nice-to-have keyword presence |
| **Semantic similarity** | **12** | **TF-IDF cosine similarity — resume text vs JD** |
| Quality & listing sanity | ±20 | Deducts for generic listings, seniority mismatches |

**Red-flag filtering** automatically caps scores:
- Unpaid / "for exposure" / spec-work listings → score capped at **18**
- Equity-only / commission-only / no-budget listings → score capped at **40**

Each job card shows the score, tier (A/B/C/D), matched keywords, missing keywords, and improvement checklist.

---

### Feedback Signals & Smart Dismissal

Every job card has lightweight feedback controls:

| Action | What it does |
|--------|-------------|
| 👍 **Good fit** | Marks as relevant — surfaces in future recommendations |
| 👎 **Not relevant** | Marks as irrelevant — deprioritised in future scans |
| 🗑️ **Trash** | Marks as spam/garbage — filtered from future results |
| ⏰ **Snooze (2d / 5d / 10d)** | Hides the card until the chosen date — useful for roles that open up later |

Signals are stored locally in SQLite and never leave your machine.

---

### Document Generation

Generates ATS-safe, role-tailored documents for every job:

| Document | Format | What it does |
|----------|--------|--------------|
| Tailored resume | DOCX + PDF | Restructures bullets for the target role and ATS |
| Cover letter | DOCX | Written for the specific company and JD |
| **Outreach pack** | **Text (3 formats)** | **See below** |
| ATS report | JSON | Machine-readable keyword coverage breakdown |
| Plain-text sidecar | TXT | For copy-pasting into application form fields |

All files stay on your machine under `~/.jobhunt-india/`.

---

### 3-Format Outreach Pack

One click generates three ready-to-use outreach formats from your resume and the job description:

| Format | Length | Where to use |
|--------|--------|-------------|
| **Short pitch** | ≤ 55 words — hook + proof + CTA | LinkedIn bio, elevator pitch, networking events |
| **LinkedIn note** | ≤ 70 words — warm, specific | LinkedIn connection request |
| **Cold email** | 110–150 words + subject line | Direct recruiter or hiring manager email |

Each format has a one-click **Copy** button. The AI grounds every format in your actual resume — no invented metrics or made-up achievements. If AI generation fails, a deterministic fallback is used.

---

### AI Coach

Chat with an AI that knows your resume and every job you've saved. Uses **RAG (retrieval-augmented generation)** — retrieves relevant evidence from your local data before answering:

- "Rewrite my experience bullet for this role"
- "Why did I score 62 on this job?"
- "How should I explain the gap in my resume?"
- "Help me prepare for a system design interview at Razorpay"

Works with or without an API key. Without a key it returns a cited evidence summary from local data.

---

### Application Pipeline

A Kanban board for every application from discovery through offer:

```
Saved → Preparing → Applied → Interviewing → Offer / Rejected
```

Each card holds: timeline, notes, contact log, linked document versions, reminders, and follow-up tasks. Exports to CSV or calendar.

---

### Analytics & Insights

Weekly and cumulative analytics:

- Funnel health (saved → applied → interviewing → offer rates)
- Source performance (which job boards produce interviews)
- Document effectiveness (which resume version gets callbacks)
- Search pattern analysis
- Weekly review generation

---

## User Flow

```
                         ┌─────────────────────┐
                         │     Onboarding       │
                         │  (one-time setup)    │
                         └──────────┬──────────┘
                                    │
              ┌─────────────────────▼──────────────────────┐
              │  1. Choose AI provider (or skip for local)  │
              │  2. Upload resume (PDF or DOCX)             │
              │  3. AI extracts profile, skills, experience │
              │  4. Confirm profile & set job preferences   │
              │  5. Run first job scan                      │
              └─────────────────────┬──────────────────────┘
                                    │
                         ┌──────────▼──────────┐
                         │   Today Dashboard    │
                         └──────────┬──────────┘
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         │                          │                          │
 ┌───────▼───────┐        ┌─────────▼────────┐    ┌──────────▼──────────┐
 │   Discover    │        │    AI Coach      │    │     Analytics       │
 │               │        │                  │    │                     │
 │ Browse ranked │        │ Ask anything     │    │ Funnel health,      │
 │ jobs by fit   │        │ about your jobs  │    │ source performance, │
 │               │        │ and resume       │    │ weekly review       │
 └───────┬───────┘        └──────────────────┘    └─────────────────────┘
         │
         │  For each job:
         │  ┌─────────────────────────────────────────────────────────┐
         │  │ Signal feedback (👍/👎/🗑) · Snooze (2d/5d/10d)         │
         │  │ View fit brief · Generate documents                     │
         │  │ Get 3-format outreach pack · Mark applied               │
         │  └─────────────────────────────────────────────────────────┘
         │
 ┌───────▼──────────────────────────────────────────────────────────────┐
 │  Pipeline: track status → timeline → notes → follow-up reminders     │
 └──────────────────────────────────────────────────────────────────────┘
```

### Pages at a glance

| Page | What you do here |
|------|-----------------|
| `/today` | Daily command center — urgent tasks, pending scans, recent activity |
| `/discover` | Browse and filter ranked jobs; generate documents and outreach per job |
| `/pipeline` | Full application CRM — Kanban, timeline, notes, contacts |
| `/applied` | Quick view of submitted applications |
| `/documents` | All generated resumes, cover letters, and outreach notes |
| `/coach` | AI chat grounded in your resume and job history |
| `/notifications` | Reminders, follow-up alerts, scan results |
| `/analytics` | Search funnel, source health, weekly review |
| `/settings` | AI provider, profile, automation rules, local paths |

---

## AI Providers

Career Seek works without any API key — scoring, ATS analysis, and job discovery use local deterministic matching and TF-IDF semantic similarity. Add a key in **Settings** to unlock AI coaching, cover letter generation, outreach packs, and resume rewrites.

| Provider | Default Model | Free Tier |
|----------|--------------|-----------|
| Google Gemini | `gemini-2.5-flash` | ✅ Yes |
| Groq | `llama-4-scout` | ✅ Yes |
| DeepSeek | `deepseek-chat` | ✅ Yes |
| Ollama (local) | any model you pull | ✅ Free |
| OpenAI | `gpt-4.1-mini` | ❌ Paid |
| Anthropic Claude | `claude-sonnet-4-6` | ❌ Paid |
| OpenAI-compatible | LM Studio, Together, OpenRouter | Varies |

Add keys to `.env.local` (copy from `.env.example`) or paste them in **Settings** — no restart needed.

---

## What Gets Installed Where

| Component | Location | Notes |
|-----------|----------|-------|
| App source code | `~/Career-Seek/` | Git checkout |
| User data (resume, jobs, chats) | `~/.jobhunt-india/` | Private, never synced |
| Redis & Meilisearch binaries | `~/Career-Seek/binaries/` | Downloaded once by setup |
| Python 3.12 runtime | `~/Career-Seek/binaries/python/` | Portable, self-contained |
| Python venv + jobspy | `~/Career-Seek/.venv-career-seek/` | Auto-created by bootstrap |
| Playwright Chromium | System Playwright cache | Auto-installed by bootstrap |

Nothing is installed system-wide. To uninstall completely:

```bash
# macOS / Linux
rm -rf ~/Career-Seek ~/.jobhunt-india

# Windows (PowerShell)
Remove-Item -Recurse -Force ~/Career-Seek, ~/.jobhunt-india
```

---

## Resetting for a New User

To wipe all personal data and start fresh (code, binaries, and Python runtime are untouched):

```bash
# macOS / Linux
cd ~/Career-Seek && ./reset.sh       # type 'reset' to confirm

# Windows
cd ~/Career-Seek; .\reset.ps1
```

Then run `./setup.sh` to start with a clean slate.

---

## Tech Stack

| Layer | What's used |
|-------|-------------|
| **Frontend** | Next.js 15 (App Router), React 18, Tailwind CSS v3, shadcn/ui, Framer Motion |
| **Backend** | Next.js Server Actions, BullMQ background workers |
| **Database** | SQLite via `better-sqlite3`, Drizzle ORM |
| **Search** | Meilisearch (local binary, no Docker) |
| **Queue** | BullMQ + Redis (local binary, no Docker) |
| **AI** | Gemini, OpenAI, Anthropic, Groq, DeepSeek, Ollama — model-agnostic gateway |
| **Scraping** | ts-jobspy (HTTP), Playwright, python-jobspy, Camoufox, Browser-Use agent |
| **Documents** | `docx`, `mammoth`, pdf-parse, ATS-safe generation pipeline |
| **Scoring** | Rule-based multi-dimensional + TF-IDF cosine semantic similarity |
| **Skills taxonomy** | ESCO-lite (218 skills, 32 groups, Indian market enriched) |
| **Resume parsing** | Structured section extractor — skills, experience, education, achievements |
| **Embeddings** | `@xenova/transformers` — local vector store, RAG for AI Coach |

---

## System Requirements

| | Minimum | Recommended |
|--|---------|-------------|
| **macOS** | 12 Monterey | 13 Ventura or later |
| **Windows** | Windows 10 22H2 | Windows 11 |
| **Linux** | Ubuntu 22.04 / Debian 12 | — |
| **RAM** | 4 GB | 8 GB |
| **Disk** | 2 GB free | 5 GB free |
| **Internet** | Required for install | Required for job scanning |
| **Node.js** | 20 LTS | 22 LTS (auto-installed) |

---

## Development

```bash
git clone https://github.com/iamadarsha/Career-Seek.git
cd Career-Seek
cp .env.example .env.local   # add API keys if you have them
npm run bootstrap
npm run launch:dev            # hot-reload dev server at http://localhost:3000
```

Before opening a pull request:

```bash
npm run lint
npm run typecheck
npm run build
npm run doctor
```

---

## Updating After a New Release

```bash
# macOS / Linux
cd ~/Career-Seek
git pull origin main
npm install
npm run db:push:direct     # safe — runs ALTER TABLE only for new columns
npm run launch

# Windows (PowerShell)
cd ~/Career-Seek
git pull origin main
npm install
npm run db:push:direct
npm run launch
```

Or just re-run the one-command installer — it detects an existing checkout and does a safe `git pull` and re-bootstraps automatically.

---

## Changelog

### v1.2.0 — May 2026 (Latest)

#### Search Broadening
- **Salary range expansion** — "15 LPA expected" now searches 12–18 LPA (±20%). Your target becomes the midpoint, not the floor. Portals that support salary filters (Naukri) get `sminlakh`/`smaxlakh` params passed automatically.
- **City alias expansion** — "Bangalore" automatically also searches "Bengaluru". "Delhi" → "New Delhi", "Delhi NCR", "NCR". 18 Indian metro groups with all common spellings.
- **Remote opt-in** — when work model is remote/hybrid, "Remote" is added to every location query so you never miss remote-first listings.
- **Experience buffer** — band widened by 1 year each side from the start (3–5 yrs → 2–6 yrs). No more missing roles because you're 6 months short of the stated minimum.
- **Role synonym table 3× larger** — SDE/SWE tiers (SDE-1/2/3), mobile (Android/iOS/Flutter), Python/Node/React variants, Data Engineer, Business Analyst, Sales, HR, Customer Success, Marketing, Chief of Staff — all expanded automatically.
- **5-level search expansion** — if a portal returns too few results, the orchestrator progressively widens: add Remote → widen experience → widen salary range → drop avoid keywords → drop salary limits.
- **Wider scraping window** — python-jobspy `results_wanted` raised 25→30; recency window 14→21 days.

#### Reliability
- **Worker auto-restart** — BullMQ worker restarts automatically on crash (exponential backoff 1s→2s→4s→…→30s, max 5 restarts/60 s). App stays up; scanning recovers without restarting Career Seek.
- **Port conflict detection** — launch auto-finds the next free port if 3000 is taken. No more "address already in use" crash.
- **Atomic `.env.local` writes** — write to `.tmp` then rename; a kill mid-write can never corrupt your env file.
- **Cross-platform `.env.local` auto-creation** — both bootstrap and launch create `.env.local` with required defaults on first run; no manual step needed.
- **Node.js heap limit** — `--max-old-space-size=4096` set automatically during `next build` so 8 GB machines never OOM.
- **28-category preflight checker** — `npm run preflight` validates the full stack (Redis, Meilisearch, Python, Playwright, DB, env vars, disk space, port availability).

### v1.1.0 — May 2026

- **3-format outreach pack** — short pitch, LinkedIn note, cold email in one click, grounded in your actual resume.
- **Feedback signals** — 👍 / 👎 / 🗑️ per job card, stored locally.
- **Snooze** — hide jobs for 2 / 5 / 10 days.
- **Red-flag scoring** — unpaid listings capped at 18; equity-only capped at 40.
- **TF-IDF semantic similarity** — cosine resume↔JD scoring (up to 12 pts). Pure TypeScript, no API.
- **JobSpy2 multi-site** — Glassdoor + ZipRecruiter added via speedyapply fork.
- **sklearn ATS scorer** — Python cosine-similarity pre-check before LLM call.
- **Company name normalizer** — strips `Pvt Ltd`, `Inc`, `Corp`, `LLP` before deduplication.
- **ts-jobspy adapter** — `jobspy_api` uses `scrapeJobs()` HTTP-direct (no Playwright) for LinkedIn + Indeed.
- **Resume section extractor** — structured typed-section parsing (skills, bullets, education, achievements).
- **ESCO skills taxonomy** — 80 → 218 skills across 32 groups, Indian market enriched.
- **Auto-start Redis** — `npm run dev` and `npm run start` auto-start the bundled Redis.

---

<div align="center">

Built for job seekers who want evidence instead of guesswork.

</div>
