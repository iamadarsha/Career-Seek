# Local Runbook

## Install

```bash
npm install
```

## Bootstrap

```bash
npm run db:init
npm run db:push:direct
npm run k1:migrate
npm run source:seed
```

`npm run bootstrap` also installs dependencies and Playwright Chromium, then runs the database and source seed steps.

## Doctor

```bash
npm run doctor
```

Doctor checks include:

- Node version
- dependency install status
- `better-sqlite3` native binding
- Playwright browser availability
- local folders
- SQLite DB path
- required scripts
- source seed command availability

If browser support is unavailable, live browser-backed scraping should be treated as reduced capability mode.

## Build And Typecheck

```bash
npm run build
npm run typecheck
```

Run `typecheck` after `build` because build regenerates `.next/types`.

## Launch

Development:

```bash
npm run dev
```

Full local ecosystem:

```bash
npm run launch
```

`npm run launch` runs doctor, then starts the Next.js dev server and background worker.

## Ports

One validated launch served at `http://localhost:3002` because ports `3000` and `3001` were occupied.

A separate local production-style validation served at `http://localhost:3000`.

The actual port depends on availability.

## Local Data Directory

Set `JOBHUNT_DATA_DIR` to control where runtime data is stored.

If unset, the default is `~/.jobhunt-india`.

Common local folders:

- `config`
- `db`
- `uploads`
- `output`
- `logs`
- `exports`
- `cache`

## Known Setup Issues

- `better-sqlite3` can fail after a Node ABI change; run `npm rebuild better-sqlite3`.
- OCR quality depends on local OCR tools and the uploaded document.
- Live scraping depends on browser availability, network access, and source behavior.
- `npm audit` still reports 9 non-critical findings requiring a major-version upgrade pass.

## Validation Commands

Useful local checks:

```bash
npm run build
npm run typecheck
npm run doctor
npm run source:seed
```

For route checks, start the app and curl the key routes listed in `FINAL_RELEASE_STATUS.md`.
