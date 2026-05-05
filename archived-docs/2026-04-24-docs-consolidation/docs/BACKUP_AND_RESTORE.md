# BACKUP_AND_RESTORE

## Backup export
Workspace backup exports include:
- jobs metadata (`normalized_jobs`, `scored_jobs`, enrichments, JD analyses)
- applications, timeline, notes, reminders, linked docs
- generated asset metadata (`document_assets`)
- coach metadata (`coach_threads`, `coach_messages`)
- automation settings (`automation_rules`, `scheduled_tasks`, `notification_preferences`)
- contacts and email drafts
- app settings

Output:
- `workspace-backup.json`
- `manifest.json`
- optional `.zip` (best effort)

## Import boundaries
Implemented bounded imports:
1. restore workspace backup JSON
2. contacts CSV import
3. generated asset metadata import

## Storage
- Export run logs: `export_runs`
- Backup manifest records: `backup_manifests`
- Import run logs: `import_runs`

## Related code
- `src/lib/services/integrations/backup-service.ts`
- `src/lib/services/integrations/import-service.ts`
- `src/app/pipeline/pipeline-actions.ts`
- `src/app/settings/page.tsx`

## Safety posture
- All operations are local-file driven.
- Imports are explicit user-triggered actions.
- Duplicate rows are skipped on insert collisions.
