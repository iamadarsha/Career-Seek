# Pipeline Statuses — Phase G

## Default Lifecycle

| Status | Label | Description |
|---|---|---|
| `saved` | Saved | Job bookmarked for later review |
| `preparing` | Preparing | Generating materials (resume, cover letter) |
| `applied` | Applied | Application submitted |
| `follow_up_due` | Follow-up Due | Needs user attention |
| `recruiter_replied` | Recruiter Replied | Response received from company |
| `interview_scheduled` | Interview Scheduled | Interview date set |
| `interviewed` | Interviewed | Interview completed |
| `assessment` | Assessment | Take-home or technical assessment phase |
| `offer` | Offer | Offer received |
| `rejected` | Rejected | Application declined |
| `archived` | Archived | Closed/no longer pursuing |

## Transitions

Any status can transition to any other status. Status changes are:
- Recorded in the timeline as immutable events
- Stored with `previousStatus` for audit
- Timestamped via `lastStatusChangeAt`

## Board Columns

The board view shows 8 active columns (excludes rejected/archived/assessment by default).

## Future Extensions

- Custom statuses
- Status transition rules
- Automatic status suggestions based on timeline activity
