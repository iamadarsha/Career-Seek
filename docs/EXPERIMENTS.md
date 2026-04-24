# Experiment Tracking Service

## Location

`src/lib/services/analytics/experiment-service.ts`

## Purpose

Experiments let the user test job-search hypotheses (e.g. "applying within 24 hours of posting increases replies") and track their outcomes against linked applications or scored jobs.

## Functions

```ts
createExperiment(input: CreateExperimentInput): Promise<Experiment>
updateExperiment(id: string, patch: Partial<Experiment>): Promise<Experiment>
linkToExperiment(experimentId: string, entityType: 'application' | 'scoredJob', entityId: string): Promise<void>
listExperiments(status?: ExperimentStatus): Promise<Experiment[]>
getExperiment(id: string): Promise<Experiment | null>
computeExperimentMetrics(id: string): Promise<ExperimentMetrics>
```

## Experiment Schema

```ts
type Experiment = {
  id: string
  name: string                  // unique; used as human-readable identifier
  hypothesis: string
  status: 'running' | 'concluded' | 'cancelled'
  startedAt: Date
  endedAt: Date | null          // set when status → concluded or cancelled
  affectedCriteria: string      // free-text description of what changed (e.g. "apply within 24h")
  metricsJson: string           // serialized ExperimentMetrics snapshot
  conclusion: string | null     // free-text outcome written by user on conclude
  createdAt: Date
  updatedAt: Date
}
```

## experiment_links Table

```
experimentId   — FK → experiments.id
entityType     — 'application' | 'scoredJob'
entityId       — FK → applications.id or scored_jobs.id
linkedAt       — timestamp
```

One experiment can link to many entities. `linkToExperiment()` is idempotent; duplicate links are ignored via `INSERT OR IGNORE`.

## computeExperimentMetrics

Queries all linked entities and computes:

```ts
type ExperimentMetrics = {
  linkedApplications: number
  linkedScoredJobs: number
  replyRate: number           // % of linked applications with recruiter_replied or later
  interviewRate: number       // % of linked applications with interview status
  offerRate: number           // % of linked applications with offer status
  avgDaysToApply: number | null
}
```

Returns live metrics from the database. The result is also serialized and stored in `metricsJson` on the experiment row each time it is called.

## UI — Experiments Tab

Located within `src/app/analytics/page.tsx` under the Experiments tab.

- **List view**: shows all experiments grouped by status (running first, then concluded, cancelled)
- **Inline create**: a form that collects `name`, `hypothesis`, `affectedCriteria`; calls `createExperiment()` on submit
- **Inline conclude**: for running experiments, a button opens a textarea for `conclusion`; calls `updateExperiment({ status: 'concluded', endedAt: now, conclusion })` on confirm
- **Metrics panel**: expanded row shows live `ExperimentMetrics` fetched via `computeExperimentMetrics(id)`
- **Link panel**: shows linked entity count with a picker to add applications or scored jobs to the experiment

## Status Transitions

```
running → concluded   (user concludes with a written conclusion)
running → cancelled   (user cancels; no conclusion required)
```

Concluded and cancelled experiments are read-only. `updateExperiment` enforces this by rejecting patches to non-`running` experiments except for `conclusion` edits on `concluded` ones.
