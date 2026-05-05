# Document Linkage — Phase G

## Purpose

Every application is linked to the exact generated document versions used, providing historical clarity.

## Schema

`application_documents` stores:
- `applicationId` — the application
- `documentAssetId` — FK to `document_assets`
- `documentType` — resume, cover_letter, outreach_note, ats_report
- `version` — version number snapshot
- `atsScore` — ATS score snapshot at link time
- `linkedAt` — when the document was attached

## Auto-linking

`autoLinkDocuments(applicationId, scoredJobId)` scans `document_assets` for the scored job and links any unlinked assets automatically.

## UI

The Documents tab on each application shows:
- Document type with version
- ATS score if applicable
- Link timestamp
- Auto-link button for scored jobs
