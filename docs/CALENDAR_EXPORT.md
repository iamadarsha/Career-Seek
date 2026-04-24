# CALENDAR_EXPORT

## What it does
Exports local `.ics` files for reminders, follow-ups, and interview events.

## Storage
- Files: `<export-folder>/calendar-events/*.ics`
- Metadata table: `exported_calendar_events`

## Key behavior
- Event title, time, location/link, and notes are included.
- Reminder exports derive from reminder due time.
- Application-level interview/follow-up exports use configured defaults when explicit times are absent.
- Optional auto-open in default calendar (best effort, platform dependent).

## Related code
- `src/lib/services/integrations/calendar-export-service.ts`
- `src/app/pipeline/pipeline-actions.ts` (`actionExportReminderCalendar`, `actionExportApplicationCalendar`)
- `src/app/pipeline/[id]/page.tsx`

## Settings used
- `calendar.defaultDurationMinutes`
- `calendar.defaultLeadMinutes`
- `calendar.autoOpenInCalendar`
- `toggles.calendar`
