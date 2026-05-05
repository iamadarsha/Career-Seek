# Phase G Notes

## What was built

Phase G adds the Career CRM and Application Operations layer:

### Schema (6 new tables)
- `applications` — first-class application entity with full lifecycle
- `application_timeline` — immutable event log
- `application_notes` — categorized notes with pinning
- `application_reminders` — follow-ups with overdue detection
- `application_documents` — version-linked document assets
- `crm_settings` — user CRM preferences

### Services (7 new)
- `application-service.ts` — CRUD, status transitions, counts
- `timeline-service.ts` — immutable event recording
- `reminder-service.ts` — reminder lifecycle, overdue, recalculation
- `notes-service.ts` — CRUD with categories and pinning
- `dashboard-crm.ts` — aggregations, smart suggestions
- `document-linkage.ts` — asset linking, auto-link
- `export-service.ts` — JSON backup/restore

### UI
- `/pipeline` — board + list views with filters
- `/pipeline/[id]` — detail page with timeline, notes, reminders, documents
- Updated dashboard with CRM summaries and urgent items
- Updated sidebar with Pipeline navigation
- Updated settings with CRM export

### Documentation
- `APPLICATION_CRM.md`, `PIPELINE_STATUSES.md`, `TIMELINE_AND_NOTES.md`
- `REMINDERS.md`, `DOCUMENT_LINKAGE.md`, `PHASE_G_NOTES.md`

## Deferred items

- Custom status creation UI
- Drag-and-drop board status changes
- Automatic email/calendar integration
- CRM data import UI
- Tags management interface
- Recruiter contact database
- Multi-profile application tracking

## Dependencies

Run `npm run db:push` to apply the 6 new schema tables.
