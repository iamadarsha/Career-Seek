# Dashboard And Job Actions

## Dashboard Role

The dashboard is the main command center after onboarding. It is also the Today page.

It includes:

- guided header
- last scan timestamp
- Refresh scan CTA
- stats cards
- Ask Gemini search bar
- tier and source filter chips
- ranked job cards
- right-rail source, company, score, and next-action insights
- scan progress visibility

## Today Queue

Today is not limited to a tiny Tier A bucket.

The queue combines:

- Tier A jobs
- strongest Tier B jobs
- score
- freshness where available
- active search intent
- not-yet-applied state

## Job Card Content

Each ranked card shows:

- title
- company
- score
- tier
- source
- location
- salary
- experience
- posting date if available
- source snippet
- one-line Gemini or score-based fit insight

## Job Card Actions

The card supports:

- Apply: opens the original job URL safely.
- Save: persists a saved application record for later review.
- Brief: expands inline with Gemini fit analysis.
- Resume: generates a JD-specific DOCX and saves a document asset.
- Cover Letter: generates a role-specific letter, saves it, and supports download/copy.
- Connect: expands inline with a concise outreach note.
- Applied: toggles canonical application state.

## Persistence

Saved and Applied states are stored in the `applications` table, not loose JSON.

Generated assets are stored in `document_assets` and linked to scored jobs.

