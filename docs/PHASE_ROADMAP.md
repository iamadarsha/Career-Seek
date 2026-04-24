# PHASE_ROADMAP

Last validated: 2026-04-23

## Legacy roadmap (A-H) vs current code

| Phase | Intended focus | Repo status |
|---|---|---|
| A | Foundation shell + local storage + UI base | Implemented |
| B | Onboarding + profile extraction | Implemented |
| C | Scraping orchestration + normalization + dedupe | Implemented |
| D | Scoring + ranking + AI briefing | Implemented |
| E | Document generation + ATS + outreach | Implemented with runtime fragility (resume DOCX path bug) |
| F | AI Coach (RAG) | Implemented |
| G | Career CRM / pipeline | Implemented |
| H | Automation / notifications | Partially implemented; reliability gaps remain |

## Upcoming roadmap (requested)

### Phase I (Integrations & ecosystem hooks)
Status: `in_progress` (baseline implementation landed; hardening pending).

Planned scope:
1. Calendar event export (`.ics`) for interviews/reminders
2. Email-ready local draft generation and persistence
3. Lightweight local contacts/people metadata layer
4. Application packet export (JSON/zip/markdown)
5. Portable workspace backup/export
6. Safe import boundaries (backup restore + bounded artifact imports)
7. UI integration surfaces for above workflows
8. Integration settings/preferences
9. Documentation for integrations

Current Phase I implementation snapshot:
- Implemented local calendar exports with metadata persistence.
- Implemented local email draft generation + versioned persistence.
- Implemented lightweight contacts + contact linking to applications.
- Implemented application packet export (JSON + markdown + zip when available).
- Implemented workspace backup export + bounded import paths (backup JSON, contacts CSV, asset metadata).
- Added integration settings/toggles and UI entry points in pipeline detail + settings.

## Recommended sequencing before coding Phase I
1. Stabilize baseline runtime blockers (install + automation + document path bugs)
2. Introduce canonical schemas for Phase I artifacts
3. Build export-first services (calendar/email/application packet/backup)
4. Add import boundaries and UI entry points
5. Update docs and runbook with verified workflows
