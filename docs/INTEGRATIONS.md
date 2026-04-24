# INTEGRATIONS

Phase I introduces local-first integration hooks that keep user control and avoid background side effects.

## Implemented surfaces
- Calendar export (`.ics`) from application/reminder workflows.
- Email-ready drafts (follow-up, thank-you, recruiter reply) with local versioning.
- Contacts metadata and application-linked contacts.
- Application packet export (JSON + markdown + best-effort zip).
- Workspace backup export and bounded import flows.
- Integration settings for default paths, tone, calendar defaults, and feature toggles.

## Service boundaries
- `calendar-export-service.ts`
- `email-draft-service.ts`
- `contacts-service.ts`
- `application-export-service.ts`
- `backup-service.ts`
- `import-service.ts`
- `settings-service.ts`

## UI entry points
- Application detail page:
  - Export packet
  - Follow-up/interview calendar export
  - Reminder calendar export
  - Contacts tab
  - Drafts tab
- Settings page:
  - Integration defaults/toggles
  - Workspace backup export
  - Backup restore
  - Contacts CSV import
