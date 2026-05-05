# Funnel Service

## Location

`src/lib/services/analytics/funnel-service.ts`

## Functions

```ts
computeOverallFunnel(): Promise<FunnelResult>
computeFunnelByDimension(dimension: 'portal' | 'tier'): Promise<DimensionFunnelResult[]>
computeFunnelForPeriod(since: Date, until: Date): Promise<FunnelResult>
```

## Stage Definitions

The funnel has 8 ordered stages. `conversionFromPrev` is the percentage of the previous stage's count that reached this stage.

| # | Stage | Statuses Counted | Notes |
|---|---|---|---|
| 1 | `discovered` | All rows in `scored_jobs` | Total universe |
| 2 | `scored` | `score IS NOT NULL` | Rows that passed AI scoring |
| 3 | `saved` | status `saved`, `prepared`, `applied`, downstream | Explicitly saved by user |
| 4 | `prepared` | status `prepared`, `applied`, downstream | Resume/cover letter attached |
| 5 | `applied` | status `applied`, downstream | Application submitted |
| 6 | `recruiter_replied` | status `recruiter_replied`, downstream | Any recruiter response |
| 7 | `interview` | status `interview_scheduled`, `interview_completed` | Interview booked or done |
| 8 | `offer` | status `offer_received`, `offer_accepted`, `offer_declined` | Offer at any disposition |

Downstream means all statuses later in the pipeline also count toward that stage (cumulative, not exclusive).

## Return Types

```ts
type FunnelStage = {
  stage: string
  count: number
  conversionFromPrev: number | null  // null for stage 1
}

type FunnelResult = {
  stages: FunnelStage[]
  computedAt: Date
}

type DimensionFunnelResult = {
  dimensionValue: string   // e.g. "LinkedIn", "Naukri", "Tier A"
  stages: FunnelStage[]
}
```

## Period Filtering

`computeFunnelForPeriod` applies a `WHERE createdAt BETWEEN since AND until` filter on `scored_jobs` before counting. The same stage logic applies within the filtered set.

## Dimension Funnel

`computeFunnelByDimension('portal')` groups by `scoredJobs.portal`. `computeFunnelByDimension('tier')` groups by `scoredJobs.tier` (A / B / C / D). Each group returns its own independent `FunnelStage[]` array. Groups with fewer than 3 total jobs are omitted from results to avoid misleading percentages.
