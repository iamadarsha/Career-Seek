# DATA_MODEL

Last validated: 2026-04-23
Source of truth: `src/db/schema.ts`

## Storage model
- Database: SQLite (`better-sqlite3`)
- ORM: Drizzle
- Table count: 40 (`sqliteTable(...)` declarations)
- DB file: `~/.jobhunt-india/db/jobhunt.db`

## Table groups

### Core config/profile
- `app_settings`
- `uploaded_resumes`
- `master_profiles`
- `search_profiles`

### Discovery/scraping/scoring
- `scans`
- `scan_portal_runs`
- `search_expansions`
- `normalized_jobs`
- `job_duplicates`
- `scored_jobs`
- `job_enrichments`
- `search_queries`
- `jd_analyses`

### Document generation
- `document_assets`
- `generated_documents` (legacy/unused in active services)


### AI coach / RAG
- `document_chunks`
- `index_runs`
- `coach_threads`
- `coach_messages`
- `message_sources`

### CRM / pipeline
- `applications`
- `application_timeline`
- `application_notes`
- `application_reminders`
- `application_documents`
- `crm_settings`

### Phase I integrations
- `contacts`
- `contact_links`
- `email_drafts`
- `exported_calendar_events`
- `export_runs`
- `backup_manifests`
- `import_runs`

### Automation / notifications
- `automation_rules`
- `scheduled_tasks`
- `automation_run_logs`
- `notifications`
- `notification_preferences`

### Legacy carryover
- `saved_jobs`

## High-signal relationship notes
- `scored_jobs.normalized_job_id` is unique.
- `job_enrichments.scored_job_id` is unique.
- `jd_analyses.scored_job_id` is unique.
- `applications` can reference both `scored_jobs` and `normalized_jobs` but also stores denormalized title/company snapshots.
- `application_documents` links CRM records to specific `document_assets` versions.
- `coach_messages` + `message_sources` persist evidence provenance for AI Coach answers.

## Data model risks
2. Legacy tables (`saved_jobs`, `generated_documents`) exist but are not central to current UI flows.
3. Backup/import operations are intentionally permissive (duplicate-skip insertion) and need stricter conflict policy for high-assurance restore workflows.
