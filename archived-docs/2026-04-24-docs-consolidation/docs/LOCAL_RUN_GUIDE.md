# Local Run Guide

## Install

```bash
npm install
```

If Node was changed or SQLite native bindings fail, rebuild:

```bash
npm rebuild better-sqlite3
```

## Bootstrap Local Data

```bash
npm run db:init
npm run db:push:direct
npm run k1:migrate
```

## Doctor

```bash
npm run doctor
```

The doctor checks:

- Node version
- Playwright or Chromium availability
- local data folders
- settings file
- SQLite database presence
- package scripts

If Chromium is missing, the doctor attempts:

```bash
npx playwright install chromium
```

## Run

```bash
npm run launch
```

This starts both:

- Next.js dev server
- background job worker

Manual alternative:

```bash
npm run dev
npm run worker
```

## URL

Default URL:

```text
http://localhost:3000
```

If port `3000` is busy, Next.js automatically tries the next ports such as `3001` or `3002`. Use the URL printed by `npm run launch`.

## First Launch

The app must show guided onboarding until setup completes:

1. Gemini key
2. resume upload
3. analysis and clarification
4. profile review
5. job preferences
6. first scan
7. dashboard

## Local Data

The app uses `JOBHUNT_DATA_DIR` from `.env.local` when present. Otherwise it stores data under:

```text
~/.jobhunt-india
```

Local data includes config, SQLite DB, uploads, generated resumes, cover letters, exports, logs, and cache.

## Expected Startup Behavior

If onboarding is incomplete, `/` redirects to `/onboarding`.

If onboarding is complete, `/` shows the Today dashboard command center.

