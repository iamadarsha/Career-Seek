<div align="center">

# Career Seek

### AI-powered job search command center for Indian and global applications

[![Next.js](https://img.shields.io/badge/Next.js-App_Router-000?style=for-the-badge&logo=next.js)](#tech-stack)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178c6?style=for-the-badge&logo=typescript&logoColor=fff)](#tech-stack)
[![SQLite](https://img.shields.io/badge/SQLite-Local_First-044a64?style=for-the-badge&logo=sqlite&logoColor=fff)](#tech-stack)
[![Gemini](https://img.shields.io/badge/Gemini-AI_Workflows-f59e0b?style=for-the-badge)](#product-surface)

</div>

---

## Recruiter Quick Scan

| Signal | Details |
|---|---|
| Product | Job-search OS for tracking opportunities, scoring fit, tailoring documents, and managing outreach |
| What it demonstrates | Full-stack product thinking, AI workflow design, document generation, analytics, CRM flows, and automation |
| Differentiator | Combines candidate CRM, AI scoring, ATS document tailoring, reminders, and reporting in one workspace |
| Stack | Next.js, React, TypeScript, Drizzle ORM, SQLite, Gemini, Playwright, docx, Tailwind CSS |

## Product Surface

- Opportunity CRM with application state, notes, reminders, and timeline history
- AI-assisted job scoring, enrichment, and search-query generation
- Resume parsing, ATS checks, tailored resume generation, cover letters, and outreach drafts
- Analytics for funnel health, weekly reviews, search performance, and document effectiveness
- Automation jobs for scans, enrichments, scoring, urgency checks, and notifications
- Local-first SQLite storage for fast demos and private experimentation

## Architecture Highlights

```text
src/
  db/                 Drizzle schema and local persistence
  lib/services/       AI, scoring, scraping, CRM, analytics, documents
  lib/jobs/           Background job registry and handlers
  components/         Dashboard and workflow UI
  app/                Next.js routes and screens
```

## Quick Start

```bash
npm install
cp .env.example .env.local
npm run db:init
npm run dev
```

Useful commands:

```bash
npm run typecheck
npm run doctor
npm run worker
```

## Tech Stack

| Layer | Tooling |
|---|---|
| App | Next.js, React, TypeScript |
| Data | SQLite, Drizzle ORM |
| AI | Google Gemini workflows |
| Automation | Playwright, background workers |
| Documents | `docx`, `mammoth`, PDF parsing |
| UI | Tailwind CSS, Framer Motion, Lucide |

## Status

Active product experiment. Built to demonstrate end-to-end AI product execution around a real, high-friction workflow: finding, evaluating, and applying to better roles with evidence instead of guesswork.
