# Timeline & Notes — Phase G

## Timeline

Every application has an immutable chronological event log.

### Event Types

`application_created`, `status_changed`, `applied_marked`, `resume_generated`, `cover_letter_generated`, `outreach_note_generated`, `ats_report_generated`, `outreach_copied`, `recruiter_contacted`, `referral_requested`, `follow_up_sent`, `note_added`, `reminder_created`, `reminder_completed`, `interview_scheduled`, `interview_completed`, `assessment_assigned`, `offer_received`, `rejection_recorded`, `document_attached`, `custom`.

### Storage

Events are stored in `application_timeline` with:
- `eventType` — machine-readable type
- `title` — human-readable summary
- `description` — optional detail
- `metadata` — JSON for event-specific data
- `createdAt` — immutable timestamp

## Notes

Notes support:
- **Categories**: general, recruiter, interview, salary, referral, follow_up
- **Pinning**: Important notes surface to top
- **Editing**: Content and category can be updated
- **Timeline integration**: Note creation is logged as a timeline event
