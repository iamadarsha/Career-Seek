# PHASE_J_NOTES

Phase J — Analytics, Insights & Optimization

## What Was Built

### DB Tables (6 new, in `src/db/schema.ts`)
- `analytics_events` — raw event log (eventType, entityType, entityId, portal, tier, score, applicationStatus, occurredAt)
- `analytics_snapshots` — derived period aggregates (snapshotType, snapshotKey, data, periodStart, periodEnd)
- `insight_items` — persisted insight engine output (insightType, title, body, confidence, recommendedAction, isDismissed, generatedAt)
- `weekly_reviews` — serialized weekly summary JSON (weekStart, weekEnd, summaryJson)
- `experiments` — job search hypothesis tracking (name, hypothesis, status, startedAt, endedAt, metricsJson, conclusion)
- `experiment_links` — many-to-many: experiments ↔ applications or scoredJobs

### Services (`src/lib/services/analytics/`)
| File | Purpose |
|---|---|
| `event-service.ts` | Raw event log: `logAnalyticsEvent()`, `backfillAnalyticsEvents()`, `queryEvents()` |
| `funnel-service.ts` | 8-stage pipeline funnel: overall, by portal/tier, by time window |
| `search-analytics-service.ts` | Portal performance, search profile performance, top locations |
| `document-analytics-service.ts` | ATS distribution, document usage, ATS vs outcomes, high-ATS unused jobs |
| `time-analytics-service.ts` | Apply latency, status duration, stale opportunities, drop-off count |
| `insight-engine.ts` | 8 rules-first insight rules, persist/deduplicate, `runInsightEngine()` |
| `weekly-review-service.ts` | Compute/save/load weekly strategy review |
| `experiment-service.ts` | Experiment CRUD, linking, metrics |
| `report-export-service.ts` | Markdown/JSON strategy report export to `~/.jobhunt-india/exports/reports/` |

### Server Actions (`src/app/analytics/analytics-actions.ts`)
All service functions wrapped as `'use server'` actions with `{ success, ... }` return shape.

### UI (`src/app/analytics/page.tsx`)
6-tab client component:
- **Overview** — KPI cards (applied, interviews, offers, avg days to apply, resumes, cover letters, best portal, tier A density) + active insights panel with dismiss
- **Funnel** — horizontal bar chart per stage with conversion %
- **Search** — portal performance table + search profile performance table
- **Documents** — ATS score distribution + document usage stats + ATS vs outcomes table
- **Weekly Review** — weekly metrics, suggested actions, top insights; export to .md/.json
- **Experiments** — list experiments, create new, conclude with conclusion text

## Design Principles
- **Local-first** — all analytics run against local SQLite; no external calls
- **Rules-first** — insight engine uses 8 deterministic rules; no ML
- **Empty-DB safe** — all services return zero/null gracefully when no data exists
- **Synchronous** — all DB operations use better-sqlite3 sync API (`.all()`, `.get()`, `.run()`)
- **Idempotent** — `backfillAnalyticsEvents()` and `saveWeeklyReview()` are safe to run multiple times

## Known Gaps / Non-Goals (as of Phase J)
- `analytics_snapshots` table exists but is not yet auto-populated; manual snapshot writes available via `reportExportService`
- `event-service.ts` backfill is idempotent but not yet wired to a scheduled automation rule (Phase H hook pending)
- No chart library (recharts/chart.js) — funnel uses CSS width bars; future phase can add proper charts
- Experiment metrics are counts only; statistical significance not computed (YAGNI)

## Commands
```bash
node scripts/db-schema-push.mjs  # push all 47 tables including Phase J
npm run dev                       # start app on port 3000
npm run typecheck                 # TS check — analytics files are clean
```
