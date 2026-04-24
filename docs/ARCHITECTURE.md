# Architecture

## Tech Stack
- **Framework:** Next.js 14 App Router
- **Language:** TypeScript
- **Styling:** Tailwind CSS + Apple HIG-inspired variables
- **Database:** SQLite (Better-SQLite3)
- **ORM:** Drizzle ORM
- **AI Engine:** Google Gemini 2.5 Flash (with fallback to Flash Lite)
- **Document Generation:** `docx` library for Word documents
- **File Management:** Local filesystem storage at `~/.jobhunt-india`

## Core Principles
1. **Local-First**: All data, settings, and output files live exclusively on the user's local disk. No cloud sync except for AI requests.
2. **Native Feel**: The UI utilizes glassmorphism, depth, and Apple HIG typography to feel like a native macOS app.
3. **Modular Domain Logic**: Each major feature (CRM, AI Coach, Automation, Scraping) is isolated in its own service directory under `src/lib/services`.
4. **Resilient Automation**: Background tasks are managed with a locking mechanism in the database to prevent concurrent execution overlaps.

## System Layers

### 1. Presentation Layer (Next.js App Router)
- `src/app/`: File-based routing.
- `src/components/`: Reusable UI components (Sidebar, Dashboard, CRM boards).

### 2. Business Logic Layer (Services)
- **Scraping Service**: Orchestrates scans across multiple job portals.
- **Scoring Service**: Ranks jobs using rules + Gemini AI.
- **Document Service**: Generates tailored resumes and cover letters.
- **AI Coach (RAG)**: Retrieval-augmented generation for grounded career coaching.
- **CRM Service**: Manages application lifecycle, timeline, and document linkage.
- **Automation Service**: Handles task scheduling, rule evaluation, and notifications.
- **Integration Services (Phase I)**: Calendar `.ics` exports, email draft persistence, contacts linking, application packet export, backup/restore import boundaries.

### 3. Persistence Layer (SQLite + Drizzle)
- `src/db/schema.ts`: Single source of truth for the database schema (currently 40 tables).
- `src/db/index.ts`: Database connection management.

### 4. Integration Layer (Gemini AI)
- `src/lib/services/gemini.ts`: Centralized interface for AI interactions, handling model selection, prompt templates, and structured output.

## Directory Structure
```
src/
├── app/                # UI Routes & Server Actions
├── components/         # UI Components
├── db/                 # Database Schema & Connection
└── lib/
    ├── services/       # Domain Logic (Scraping, Scoring, CRM, Integrations, etc.)
    ├── utils/          # Helper functions
    └── config.ts       # Global Configuration
```
