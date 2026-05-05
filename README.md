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
[![Next.js 15](https://img.shields.io/badge/Next.js-15_App_Router-000?style=flat-square&logo=next.js)](#tech-stack)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178c6?style=flat-square&logo=typescript&logoColor=fff)](#tech-stack)
[![SQLite](https://img.shields.io/badge/SQLite-Local_First-044a64?style=flat-square&logo=sqlite&logoColor=fff)](#tech-stack)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)](#)

<br/>

</div>

---

## Install in One Command

No prerequisites needed. The installer handles everything — Git, Node.js, Redis, Meilisearch, Chromium, and a portable Python runtime are all set up automatically.

### macOS (Terminal)

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/iamadarsha/Career-Seek/main/installer/install-macos.sh)"
```

> Requires macOS 12 Monterey or later. Homebrew is installed automatically if missing.

### Windows (PowerShell)

```powershell
powershell -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/iamadarsha/Career-Seek/main/installer/install-windows.ps1 | iex"
```

> Requires Windows 10 or later. Git and Node.js are installed automatically via winget if missing.

**What the installer does:**

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

First run takes **5–10 minutes** depending on your internet speed. After that, start in under 10 seconds with `./setup.sh` (macOS) or `.\setup.ps1` (Windows).

---

## What Career Seek Does

Career Seek is a local-first, AI-powered job search OS. It replaces the spreadsheet-and-browser workflow with a single workspace that handles discovery, scoring, document generation, application tracking, and coaching — all running on your machine.

```
 ┌──────────────────────────────────────────────────────────────────────┐
 │  Your Resume  →  AI Profile  →  Job Scan  →  Score & Rank           │
 │                                                                      │
 │  Ranked Jobs  →  Generate Documents  →  Apply  →  Track in Pipeline │
 │                                                                      │
 │  AI Coach knows your resume + every job you've saved                 │
 └──────────────────────────────────────────────────────────────────────┘
```

### Job Discovery

Scans **LinkedIn, Naukri, Wellfound, Foundit, Instahyre, Indeed**, and hundreds of **company career pages** directly. Results are merged, deduplicated, and ranked by fit against your profile. No account needed for most sources.

The scraper stack has five tiers — it tries each in order and falls back gracefully:

| Tier | Method | When it runs |
|------|--------|--------------|
| 1 | `ts-jobspy` (TypeScript native) | Always first |
| 2 | Google Jobs discovery | Secondary pass |
| 3 | `python-jobspy` via portable Python | If tier 1 returns nothing |
| 4 | **Camoufox** anti-detect browser | For sites with anti-bot protection |
| 5 | **Browser-Use** AI agent | Last resort — fully autonomous browsing |

Before each scrape, the engine runs a domain recon probe to detect anti-bot vendors (Cloudflare, DataDome, PerimeterX, Akamai, Imperva) and selects the right tier automatically.

### Resume Scoring

Scores each job against your resume using keyword matching and semantic embeddings — locally, without sending your data anywhere. Each job card shows:

- **Fit score** (0–100)
- **Matched keywords** — skills and terms that align
- **Missing keywords** — gaps worth addressing
- **ATS analysis** — how well your resume parses through applicant tracking systems
- **Improvement checklist** — specific suggestions to raise your score for that role

### Document Generation

Generates ATS-safe, role-tailored documents for every job:

| Document | Format | What it does |
|----------|--------|--------------|
| Tailored resume | DOCX + PDF | Restructures your resume bullets for the target role |
| Cover letter | DOCX | Written for the specific company and JD |
| Outreach note | Text | Short message for LinkedIn or email to recruiters |
| ATS report | JSON | Machine-readable breakdown of keyword coverage |
| Plain-text sidecar | TXT | For copy-pasting into application form fields |

All files stay on your machine under `~/.jobhunt-india/`.

### Application Tracker (Pipeline)

A Kanban-style board for every application from discovery through offer:

```
Saved → Preparing → Applied → Interviewing → Offer / Rejected
```

Each application card holds:
- Timeline of every status change
- Notes and contact log
- Linked documents (which resume version you sent)
- Reminders and follow-up tasks
- Export to CSV or calendar

### AI Coach

Chat with an AI that knows your resume and every job you've saved. The coach uses **RAG (retrieval-augmented generation)** — it retrieves relevant chunks from your local data before answering:

- "Rewrite my experience bullet for this role"
- "Why did I score 62 on this job?"
- "How should I explain the gap in my resume?"
- "Help me prepare for a system design interview at Razorpay"

Works with or without an API key — without a key it returns a cited evidence summary from your local data.

### Analytics & Insights

Weekly and cumulative analytics across your entire search:

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
              │  3. AI extracts your profile & skills       │
              │  4. Answer clarification questions          │
              │  5. Confirm profile & set job preferences   │
              │  6. Run first job scan                      │
              └─────────────────────┬──────────────────────┘
                                    │
                         ┌──────────▼──────────┐
                         │   Today Dashboard    │
                         │  Daily command view  │
                         └──────────┬──────────┘
                                    │
          ┌─────────────────────────┼──────────────────────────┐
          │                         │                          │
  ┌───────▼───────┐       ┌─────────▼────────┐     ┌──────────▼──────────┐
  │    Discover    │       │    AI Coach      │     │      Analytics      │
  │                │       │                  │     │                     │
  │ Browse ranked  │       │ Ask questions    │     │ Funnel & source     │
  │ jobs by fit    │       │ grounded in your │     │ health, weekly      │
  │                │       │ resume & history │     │ review, insights    │
  └───────┬───────┘       └──────────────────┘     └─────────────────────┘
          │
          │  For each job:
          │
  ┌───────▼───────────────────────────────────────────────────────────┐
  │  Review fit score → Generate documents → Apply → Move to Pipeline  │
  └───────────────────────────────────────────────────────────────────┘
          │
  ┌───────▼───────────────────────────────────────────────────────────┐
  │  Pipeline: track status → log timeline → notes → set reminders    │
  └───────────────────────────────────────────────────────────────────┘
```

### Pages at a glance

| Page | What you do here |
|------|-----------------|
| `/today` | Daily command center — urgent tasks, pending scans, recent activity |
| `/discover` | Browse and filter ranked jobs; generate documents per job |
| `/pipeline` | Full application CRM — Kanban, timeline, notes, contacts |
| `/applied` | Quick view of submitted applications |
| `/documents` | All generated resumes, cover letters, and outreach notes |
| `/coach` | AI chat grounded in your resume and job history |
| `/notifications` | Reminders, follow-up alerts, scan results |
| `/analytics` | Search funnel, source health, weekly review |
| `/settings` | AI provider, profile, automation rules, local paths |

---

## AI Providers

Career Seek works without any AI key — scoring, ATS analysis, and job discovery use local deterministic matching. Add a key in **Settings** to unlock AI coaching, cover letter generation, and resume rewrites.

| Provider | Default Model | Free Tier |
|----------|--------------|-----------|
| Google Gemini | `gemini-2.5-flash` | ✅ Yes |
| Groq | `llama-4-scout` | ✅ Yes |
| DeepSeek | `deepseek-chat` | ✅ Yes |
| Ollama (local) | any model you pull | ✅ Free |
| OpenAI | `gpt-4.1-mini` | ❌ Paid |
| Anthropic Claude | `claude-sonnet-4-6` | ❌ Paid |
| OpenAI-compatible | LM Studio, Together, OpenRouter | Varies |

Add keys to `.env.local` (copy from `.env.example`) or paste them directly in the Settings page — no restart needed.

---

## Daily Usage

Once installed, use these commands from the `~/Career-Seek` directory:

```bash
./setup.sh          # start Career Seek (macOS/Linux)
.\setup.ps1         # start Career Seek (Windows)
```

Or with npm directly:

```bash
npm run launch      # production server + background worker
npm run launch:dev  # hot-reload dev server
npm run doctor      # check system health
```

The app runs at [http://localhost:3000](http://localhost:3000).

---

## What Gets Installed Where

| Component | Location | Notes |
|-----------|----------|-------|
| App source code | `~/Career-Seek/` | Git checkout |
| User data (resume, jobs, chats) | `~/.jobhunt-india/` | Private, never synced |
| Redis & Meilisearch binaries | `~/Career-Seek/binaries/` | Downloaded once |
| Python 3.12 runtime | `~/Career-Seek/binaries/python/` | Portable, self-contained |
| Python venv + jobspy | `~/Career-Seek/.venv-career-seek/` | Auto-created |
| Playwright Chromium | System Playwright cache | Auto-installed |

Nothing is installed system-wide. To uninstall completely:

```bash
# macOS / Linux
rm -rf ~/Career-Seek ~/.jobhunt-india

# Windows (PowerShell)
Remove-Item -Recurse -Force ~/Career-Seek, ~/.jobhunt-india
```

---

## Resetting for a New User

To wipe all personal data and start fresh:

```bash
./reset.sh          # macOS/Linux — type 'reset' to confirm
.\reset.ps1         # Windows
```

Then run `./setup.sh` to start with a clean slate. The app code, binaries, and Python runtime are not affected.

---

## Tech Stack

| Layer | What's used |
|-------|-------------|
| **Frontend** | Next.js 15 (App Router), React 19, Tailwind CSS v4, shadcn/ui, Framer Motion |
| **Backend** | Next.js Server Actions, background job workers |
| **Database** | SQLite via `better-sqlite3`, Drizzle ORM |
| **Search** | Meilisearch (local binary, no Docker) |
| **Queue** | BullMQ + Redis (local binary, no Docker) |
| **AI** | Gemini, OpenAI, Anthropic, Groq, DeepSeek, Ollama — provider-agnostic gateway |
| **Scraping** | Playwright, python-jobspy, Camoufox, Browser-Use agent |
| **Documents** | `docx`, `mammoth`, PDF parsing, ATS-safe generation |
| **Embeddings** | Local vector store, RAG retrieval for AI Coach |

---

## System Requirements

| | Minimum | Recommended |
|--|---------|-------------|
| **macOS** | 12 Monterey | 13 Ventura or later |
| **Windows** | Windows 10 22H2 | Windows 11 |
| **RAM** | 4 GB | 8 GB |
| **Disk** | 2 GB free | 5 GB free |
| **Internet** | Required for install | Required for job scanning |
| **Node.js** | 20 LTS | 22 LTS (auto-installed) |

Linux is supported via the native bootstrap — clone the repo and run `npm run bootstrap && npm run launch`.

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

<div align="center">

Built for job seekers who want evidence instead of guesswork.

</div>
