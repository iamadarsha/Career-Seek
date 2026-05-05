# Pipeline And Documents

## Canonical Applications

Applications are tracked in the `applications` table. The Applied button does not write loose JSON state. It creates or updates an application record through `createFromScoredJob()` and `changeStatus()`.

Synced surfaces:

- Today
- Discover
- Pipeline
- Saved
- Applied

## Document Assets

Generated assets are saved to `document_assets` with:

- profile ownership
- scored job linkage
- type
- content
- file path where applicable
- ATS score where applicable
- version
- created timestamp

Supported asset types:

- tailored resume
- ATS report
- cover letter
- outreach note

## Resume Generation

The Resume action runs:

1. JD analysis
2. tailored resume generation
3. DOCX build
4. ATS fit check
5. document asset persistence

Generated resumes are saved under `~/.jobhunt-india/output/resumes`.

## Cover Letter And Outreach

Cover letters are saved as versioned content and local text files under `~/.jobhunt-india/output/cover-letters`.

Outreach notes are saved as versioned content and exposed with copy-friendly UI.

## Pipeline Role

Pipeline remains the CRM:

- statuses
- notes
- reminders
- document linkage
- follow-up dates
- contacts/outreach status
- timeline
