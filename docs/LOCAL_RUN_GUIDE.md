# Local Run Guide — JobHunt India

## Quick Start

```bash
# 1. Install dependencies (only needed once or after package changes)
npm install

# 2. Initialize DB schema (safe to re-run)
node scripts/db-schema-push.mjs

# 3. Bootstrap the default user/profile (safe to re-run)
node scripts/k1-bootstrap-migration.mjs

# 4. Build production
npm run build

# 5. Start production server
npm start
```

**App will be available at: http://localhost:3000**

---

## Environment

The app reads `JOBHUNT_DATA_DIR` from `.env.local`:

```
JOBHUNT_DATA_DIR=./data
GEMINI_API_KEY=your_key_here
```

All data is stored under `./data/` (relative to project root):
- `./data/db/jobhunt.db` — SQLite database
- `./data/config/settings.json` — App configuration (isConfigured, geminiApiKey)
- `./data/output/` — Generated resumes and cover letters
- `./data/uploads/` — Uploaded resume files
- `./data/logs/` — Automation logs

> If `JOBHUNT_DATA_DIR` is not set, falls back to `~/.jobhunt-india/`

---

## First-Time Setup

After `npm start`, visit http://localhost:3000.

If `data/config/settings.json` has `"isConfigured": false`, the app redirects to `/onboarding`.
Complete the 6-step wizard to:
1. Add your Gemini API key
2. Upload your resume
3. Review the extracted profile
4. Set search preferences

To skip onboarding for development, set `data/config/settings.json`:
```json
{ "isConfigured": true, "onboardingStep": 5 }
```

---

## Bootstrap Mode (Single-User)

The app currently runs in **bootstrap mode** — no auth, single user.
- Bootstrap User ID: `1`
- Bootstrap Profile ID: `1`

When you add real auth later (K-6 phase), swap `resolveContext()` in
`src/lib/platform/identity.ts` without touching call sites.

---

## Development Mode

For faster iteration with verbose errors:
```bash
npm run dev
```

Dev server also at http://localhost:3000.

---

## Background Worker

A separate worker process handles scan, score, and generation jobs:
```bash
npx tsx scripts/job-worker.ts
```

---

## Verified Routes

| Route | Status |
|-------|--------|
| `/` | ✓ Home dashboard |
| `/discover` | ✓ Job discovery |
| `/pipeline` | ✓ Application CRM |
| `/pipeline/[id]` | ✓ Application detail |
| `/today` | ✓ Daily priorities |
| `/coach` | ✓ AI coaching |
| `/notifications` | ✓ Alerts |
| `/analytics` | ✓ Metrics |
| `/settings` | ✓ Settings |
| `/settings/automation` | ✓ Automation rules |
| `/documents` | ✓ Document assets |
| `/api/jobs/active` | ✓ Background job status |
