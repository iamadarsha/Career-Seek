# API_SURFACE

Last validated: 2026-04-23

This codebase primarily exposes functionality through Next.js Server Actions, not a broad REST API.

## Route handlers (`src/app/api`)

### `GET /api/download`
- File: `src/app/api/download/route.ts`
- Query param: `path`
- Behavior: reads a local file path and returns as attachment.
- Notes: only basic file checks; path validation is minimal.

## Server Action surfaces

### Onboarding actions (`src/app/actions.ts`)
- `checkApiKey`
- `saveStep`
- `finishOnboarding`
- `uploadAndParseResume`
- `generateMasterProfile`
- `updateMasterProfile`
- `saveSearchProfile`

### Discover/scan/scoring actions (`src/app/discover/actions.ts`)
- `startJobScan`
- `getLatestScanStatus`
- `getActiveProfile`
- `triggerScoring`
- `getDashboardData`
- `generateBriefForJob`

### Document generation actions (`src/app/discover/document-actions.ts`)
- `getOrGenerateJdAnalysis`
- `generateResumePipeline`
- `generateCoverLetterAction`
- `generateOutreachNoteAction`
- `toggleAppliedStatus`
- `getDocumentAssets`

### Pipeline CRM actions (`src/app/pipeline/pipeline-actions.ts`)
- Application CRUD/status
- Timeline add/list
- Notes CRUD/pin
- Reminder CRUD/complete/list
- Document linkage fetch/auto-link
- CRM dashboard + suggestion queries
- CRM export listing/export
- Calendar export actions (application/reminder `.ics`)
- Email draft generation/list/export actions
- Contacts create/list/link actions
- Application packet export action
- Workspace backup export action
- Backup/contacts/asset import actions
- Integration settings get/update actions

### AI Coach actions (`src/app/coach/coach-actions.ts`)
- Index/reindex/status
- Thread CRUD/list
- Message retrieval
- `askCoach`
- Prompt suggestions
- Available jobs selector

### Automation/notification actions (`src/app/automation-actions.ts`)
- Notification list/read/archive
- Daily priorities
- Run scheduler now
- Preferences list/update
- Recent logs

## Page routes (UI entry points)
- `/` home dashboard
- `/onboarding`
- `/today`
- `/discover`
- `/pipeline`
- `/pipeline/[id]`
- `/coach`
- `/notifications`
- `/settings`
- `/settings/automation`
- placeholder pages: `/saved`, `/applied`, `/documents`, `/analytics`

## Gaps vs docs from legacy specs
- No Node `http` dashboard server in this repo.
- No legacy `/api/scan`, `/api/scan-status`, `/api/ai-search` REST endpoints; equivalent capabilities exist via server actions.
