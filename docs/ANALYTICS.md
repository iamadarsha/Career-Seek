# Analytics — Phase J

## Overview

Phase J adds a local-first analytics layer to JobHunt India. All computation happens on-device using SQLite; no data leaves the machine. Insights are derived by a rules engine that reads from existing job/application tables and writes to dedicated analytics tables.

## Service Files

Located in `src/lib/services/analytics/`:

| File | Responsibility |
|---|---|
| `analytics-service.ts` | Event tracking (`trackEvent`), snapshot writes, aggregate queries |
| `funnel-service.ts` | Conversion funnel computation across 8 pipeline stages |
| `insight-engine.ts` | Rule evaluation, insight persistence, deduplication |
| `weekly-review-service.ts` | Weekly metric rollup and review persistence |
| `experiment-service.ts` | Hypothesis tracking, experiment CRUD, metric computation |
| `search-analytics-service.ts` | Search profile yield and query-pattern analysis |

## Database Tables

All tables are created via the standard Drizzle migration in `src/lib/db/`.

```
analytics_events      — raw event log (eventType, entityId, entityType, payload)
analytics_snapshots   — periodic metric snapshots (snapshotDate, metricsJson)
insight_items         — persisted insights (ruleId, title, body, severity, dismissedAt)
weekly_reviews        — weekly rollup records (weekStart, weekEnd, metricsJson, actionsJson)
experiments           — hypothesis tests (name, hypothesis, status, metricsJson)
experiment_links      — join table (experimentId, entityType, entityId)
```

## Server Actions

`src/app/analytics/analytics-actions.ts` exports the following server actions:

```ts
trackEvent(eventType: string, entityType: string, entityId: string, payload?: object): Promise<void>
getAnalyticsSummary(since?: Date): Promise<AnalyticsSummary>
getSearchAnalytics(): Promise<SearchAnalytics>
getDocumentAnalytics(): Promise<DocumentAnalytics>
```

## UI — `src/app/analytics/page.tsx`

Single page with 6 tabs rendered via shadcn/ui `<Tabs>`:

1. **Overview** — KPI cards: total jobs, applications, active experiments, open insights
2. **Funnel** — Stage-by-stage conversion rates; dimension switcher (portal / tier)
3. **Search** — Search profile yield table; top query terms
4. **Documents** — Resume/cover letter usage rates; document-to-offer correlation
5. **Weekly Review** — Current week metrics and suggested actions; historical list
6. **Experiments** — Active and concluded experiments; inline create/conclude flow

## Local-First Principle

- All analytics queries run against the local SQLite database via Drizzle ORM.
- No analytics data is sent to any external service.
- `trackEvent` is fire-and-forget; failures are silently logged, never thrown.

## Insight Engine Entry Point

```ts
runInsightEngine(): Promise<InsightItem[]>
```

Evaluates all 8 rules sequentially, persists new insights, deduplicates by `ruleId`, and returns the current active insight list. Call this on page load or on a timed interval.
