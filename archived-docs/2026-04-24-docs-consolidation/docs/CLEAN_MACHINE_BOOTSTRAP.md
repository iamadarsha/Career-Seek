# Clean Machine Bootstrap

## Supported runtime

- Preferred Node version: Node 20 LTS, pinned in `.nvmrc`.
- Current validation machine: Node `v25.8.1`, accepted by doctor because the supported range is `>=20 <26`.

## Commands

```bash
npm install
npm run db:init
npm run db:push:direct
npm run k1:migrate
npm run doctor
npm run launch
```

## Doctor checks

`npm run doctor` now verifies:

- Node version
- package install status
- `better-sqlite3` native binding
- Playwright Chromium availability
- config path
- SQLite DB path
- output folders
- upload folders
- required scripts

If Playwright is unavailable, live browser scraping should be treated as reduced capability mode until `npx playwright install chromium` or `npm run bootstrap` equivalent setup is run.

## Audit status

`npm audit --audit-level=moderate --json` still reports:

- 4 moderate
- 5 high
- 0 critical

Remaining findings require major upgrades:

- Next.js advisories fixed by Next 16.x.
- `eslint-config-next` / `glob` fixed by Next ESLint config 16.x.
- Drizzle ORM and Drizzle Kit advisories fixed by major upgrades.

These were not force-upgraded in this pass because they are breaking dependency moves and need a dedicated framework/ORM upgrade pass.
