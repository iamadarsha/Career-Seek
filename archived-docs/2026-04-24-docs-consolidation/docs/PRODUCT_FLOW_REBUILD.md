# Product Flow Rebuild

## Goal

Career Seek is now organized as a local-first AI job search command center for India. The product starts with the user’s Gemini key and current resume, then builds search intent, scans sources, ranks jobs, generates application assets, and tracks status in the local CRM.

## What Changed

- Kept the useful local architecture: SQLite, uploaded resume storage, master profiles, search profiles, scan runs, scored jobs, document assets, and applications.
- Rebuilt the primary UX away from a dark developer-console style into a guided, Apple-HIG-inspired dashboard.
- Made onboarding mandatory before the command center appears.
- Restored the successful dashboard anatomy: stats row, Ask Gemini search, filter chips, ranked cards, source/insight rail, scan progress, and card CTAs.
- Made Today the action queue, not a Tier A-only filter.

## End-to-End Journey

1. User launches the app.
2. If setup is incomplete, the guided onboarding takes over the full screen.
3. User validates Gemini key.
4. User uploads PDF or DOCX resume.
5. Resume text is extracted and extraction issues are recorded.
6. Gemini extracts profile data and returns confidence, issues, and clarification questions.
7. User answers clarification questions when required.
8. User reviews/edits extracted profile fields.
9. User selects role preferences, locations, salary, work mode, company types, and exclusions.
10. App starts a source-by-source scan.
11. User lands in the dashboard with ranked jobs and clear actions.

## Preserved CTA Model

Every ranked card keeps the previous high-value action model:

- Apply
- Brief
- Resume
- Cover Letter
- Connect
- Applied

Applied state is written to the canonical applications table and syncs into Pipeline/Applied views.
