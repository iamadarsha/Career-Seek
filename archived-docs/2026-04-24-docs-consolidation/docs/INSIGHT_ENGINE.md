# Insight Engine

## Location

`src/lib/services/analytics/insight-engine.ts`

## Entry Points

```ts
runInsightEngine(): Promise<InsightItem[]>
dismissInsight(id: string): Promise<void>
clearInsights(): Promise<void>
```

`runInsightEngine()` executes all 8 rules in sequence, persists new insights to `insight_items`, deduplicates by `ruleId`, and returns the full list of non-dismissed insights.

`dismissInsight(id)` sets `dismissedAt = now` on the given row; the insight is excluded from future `runInsightEngine()` results.

`clearInsights()` hard-deletes all rows from `insight_items`. Used for testing and manual resets.

## Persistence & Deduplication

Before inserting a new insight the engine checks for an existing non-dismissed row with the same `ruleId`. If one exists, the existing row is updated (title/body refreshed) rather than duplicated. Dismissed insights are never resurfaced by the same rule until `clearInsights()` is called.

## Data Threshold

Every rule has a `MIN_DATA_THRESHOLD` guard. If the dataset is too small (e.g. fewer than 5 applications), the rule returns `null` and no insight is written. This prevents noise on new installs.

## Rules

### 1. `portalPerformanceInsight`

Compares application-to-reply rate across portals. Fires when one portal's reply rate is more than 2x another's with at least 5 applications per portal. Severity: `info`.

### 2. `applyRateInsight`

Tracks the ratio of saved jobs to submitted applications over the last 30 days. Fires when the apply rate drops below 40%. Severity: `warning`. Minimum threshold: 10 saved jobs.

### 3. `staleOpportunityInsight`

Identifies jobs in `saved` or `prepared` status with no activity in 14+ days. Fires when stale count exceeds 3. Severity: `warning`.

### 4. `followUpEffectInsight`

Compares reply rates for applications with at least one follow-up vs. those with none. Fires when the follow-up group outperforms by 15%+. Severity: `info`. Minimum threshold: 10 applications in each group.

### 5. `atsGapInsight`

Cross-references resume keyword coverage against job description keywords for applications in `applied` status. Fires when average coverage falls below 60%. Severity: `warning`. Requires at least 5 applications with linked resume documents.

### 6. `timeToApplyInsight`

Measures median hours between job discovery (`createdAt`) and application submission. Fires when median exceeds 72 hours, suggesting delayed action on good opportunities. Severity: `info`.

### 7. `searchProfileYieldInsight`

Evaluates which search profiles produce the highest ratio of Tier A/B results. Fires when the lowest-yield active profile produces <20% Tier A/B results against a minimum of 20 discovered jobs. Severity: `info`.

### 8. `coverLetterUsageInsight`

Compares recruiter reply rates for applications with a cover letter vs. without. Fires when cover-letter applications outperform by 20%+ and at least 10 applications exist in each cohort. Severity: `info`.

## InsightItem Schema

```ts
type InsightItem = {
  id: string
  ruleId: string
  title: string
  body: string
  severity: 'info' | 'warning' | 'critical'
  createdAt: Date
  dismissedAt: Date | null
}
```
