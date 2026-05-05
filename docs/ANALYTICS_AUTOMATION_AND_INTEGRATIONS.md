# Analytics, Automation, And Integrations

## Analytics

The analytics layer is local-first and reads from existing job, scoring, document, and application tables.

Tracked or derived areas include:

- funnel progression
- portal/source performance
- application activity
- score and tier distribution
- document usage
- ATS gap signals
- stale opportunities
- weekly review summaries

Analytics pages may show empty states when there is no local scan or application data.

## Insights

Insight generation should stay explainable and local. It can surface patterns such as:

- low apply rate
- stale saved jobs
- follow-up opportunities
- weak source yield
- repeated ATS keyword gaps

Insights are recommendations, not automated decisions.

## Experiments

Experiment tracking can compare different resume, cover-letter, source, or outreach strategies. Experiment links connect local actions and outcomes so later review can compare results.

## Automation And Background Tasks

Background work is tracked through platform job tables and logs. Current hardening has improved visibility, but durable recovery remains a priority.

Next hardening should ensure interrupted scans and document jobs resume, fail visibly, or can be retried cleanly after restart.

## Notifications And Reminders

Notifications and reminders are local workflow helpers. They should not cancel, submit, email, or contact third parties without explicit user action.

## Integrations

Local integration hooks include:

- calendar `.ics` export
- email-ready drafts
- contacts
- backups and exports

These integrations are local artifacts unless the user separately sends or uploads them.

## Current Limits

- Scheduler and background task behavior still need stronger recovery validation.
- Automation should be treated as assisted workflow, not autonomous third-party communication.
- Analytics results are only as complete as the local data captured by scans, applications, and documents.
