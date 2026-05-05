# Final Proof Run

Current authority: `docs/FINAL_RELEASE_STATUS.md`.

This file preserves proof-run history using validation fixtures and isolated data directories. It should not be treated as current proof that every live portal, every ATS family, or a full fresh real-key onboarding-to-populated-dashboard path is validated.

## Commands run

```bash
npm install
npm run doctor
npm run typecheck
npm run build
npm audit --audit-level=moderate --json
JOBHUNT_DATA_DIR=.proof-data npm run db:init
JOBHUNT_DATA_DIR=.proof-data npm run db:push:direct
JOBHUNT_DATA_DIR=.proof-data npm run k1:migrate
JOBHUNT_DATA_DIR=.proof-data npm run doctor
JOBHUNT_DATA_DIR=.proof-data npm run proof:final
JOBHUNT_DATA_DIR=.proof-data JOBHUNT_ENABLE_VALIDATION_SOURCE=1 npm run launch
```

## Final proof summary

From `.proof-data/logs/final-proof-run.json`:

- Gemini validation: `valid`
- Resume fixtures: clean DOCX passed, ambiguous PDF warned, scanned PDF routed to recovery
- Scan result: `partial`
- Healthy source: `validation_seed`
- Failing source: `validation_fail` with `selector_not_found`
- Scored jobs: `2`
- Document assets: `4`
- Brief: succeeded
- Resume: succeeded with DOCX output
- Cover Letter: succeeded with file output
- Connect: succeeded
- Save: persisted
- Applied: persisted

## Browser proof

Opened locally with Playwright at:

- `http://localhost:3001/`

Observed:

- dashboard opened after onboarding completion
- Today queue showed a populated job card
- card CTAs were visible: Apply, Brief, Resume, Cover Letter, Connect
- source health was visible

First-run route proof used `.route-proof-data` on `http://localhost:3031`:

- `/` redirected to `/onboarding`
- `/discover` redirected to `/onboarding`
- `/today` redirected to `/onboarding`
- `/settings` redirected to `/onboarding`
- `/onboarding` showed onboarding

Additional source-state proof used isolated `.source-proof-data`:

- all healthy validation source: `complete`, 6 jobs, 0 failed portals
- healthy plus two failures: `partial`, 6 jobs, 2 failed portals
- failures persisted as `selector_not_found` and `unknown`

## Remaining partials

- Live public portal selectors can still drift or be blocked.
- OCR can only succeed when OCR tooling exists locally.
- `npm audit` still has 9 findings requiring major upgrades.
