# EMAIL_DRAFTS

## What it does
Generates local email-ready drafts for:
- follow-up
- thank-you
- recruiter reply

Drafts are persisted with version history and can be exported as `.txt` or `.md`.

## Storage
- Table: `email_drafts`
- Exports: `<export-folder>/email-drafts/`

## Generation model
- Local deterministic templates based on application context.
- Contact-aware greeting when a linked contact is selected.
- Tone defaults are controlled from integration settings.

## Related code
- `src/lib/services/integrations/email-draft-service.ts`
- `src/app/pipeline/pipeline-actions.ts`
- `src/app/pipeline/[id]/page.tsx` (Drafts tab)

## Settings used
- `email.defaultTone`
- `email.signature`
- `toggles.emailDrafts`
