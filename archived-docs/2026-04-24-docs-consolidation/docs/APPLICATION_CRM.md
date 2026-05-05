# Application CRM — Phase G

## Overview

The Career CRM transforms JobHunt India from a search tool into a career operations system. Every job opportunity can become a tracked application with full lifecycle management.

## Application Entity

The `applications` table is a first-class entity, distinct from jobs:

| Field | Purpose |
|---|---|
| `scoredJobId` | Links to scored job (optional) |
| `normalizedJobId` | Links to normalized job (optional) |
| `title`, `company`, `location` | Denormalized for fast display |
| `status` | Current lifecycle status |
| `previousStatus` | Enables undo/audit |
| `scoreSnapshot`, `tierSnapshot` | Frozen at time of tracking |
| `savedAt`, `appliedAt` | Key lifecycle timestamps |
| `nextFollowUpAt` | Auto-calculated from reminders |
| `priority` | `high`, `normal`, `low` |
| `tags` | JSON array for user categorization |

## Application Lifecycle

```
Saved → Preparing → Applied → Follow-up Due → Recruiter Replied
                                    ↓
                            Interview Scheduled → Interviewed → Offer
                                    ↓
                               Assessment
                                    ↓
                        Rejected ←──┘ or ──→ Archived
```

A job can exist without an application. An application starts when the user explicitly tracks it.

## Key Relationships

- `application_timeline` — immutable event log
- `application_notes` — user notes with categories and pinning
- `application_reminders` — follow-ups with completion and overdue states
- `application_documents` — links to exact generated asset versions

## Services

| Service | Purpose |
|---|---|
| `application-service.ts` | CRUD, status transitions, counts |
| `timeline-service.ts` | Immutable event recording |
| `reminder-service.ts` | Follow-up management |
| `notes-service.ts` | Note CRUD with pinning |
| `dashboard-crm.ts` | Aggregated dashboard summaries |
| `document-linkage.ts` | Asset version linking |
| `export-service.ts` | JSON backup/restore |
