# CONTACTS

## What it does
Adds a lightweight local people layer tied to applications.

Tracked fields:
- full name
- role
- company
- source
- LinkedIn URL
- email
- notes
- outreach status

Linking:
- contacts are linked to applications via `contact_links`
- relationship label supports recruiter/hiring manager/referral/other

## Storage
- `contacts`
- `contact_links`

## UI
- Application detail page `Contacts` tab:
  - list linked contacts
  - link an existing contact
  - create + link a new contact

## Related code
- `src/lib/services/integrations/contacts-service.ts`
- `src/app/pipeline/pipeline-actions.ts`
- `src/app/pipeline/[id]/page.tsx`
