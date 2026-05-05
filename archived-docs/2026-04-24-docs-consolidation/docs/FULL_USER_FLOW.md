# Full User Flow

## First Run

1. User lands in guided onboarding.
2. User enters a Gemini API key.
3. The key is validated and stored locally.
4. User uploads a current resume as PDF or DOCX.
5. The original file is stored locally.
6. Resume text is extracted.
7. Gemini extracts a structured profile.
8. The parser and Gemini analysis surface confidence, warnings, and ambiguity.
9. If needed, the user answers clarification questions.
10. User reviews and edits the extracted profile.
11. User selects preferred roles and types optional comma-separated custom roles.
12. User adds experience, salary, location, work mode, company type, and exclusions.
13. User starts the first India-focused scan.
14. The dashboard unlocks.

## Daily Use

1. User opens Today.
2. Today shows a practical action queue, not only Tier A jobs.
3. User refreshes scan if needed.
4. User filters by tier or source.
5. User asks Gemini natural language questions about the current search.
6. User opens Brief inline to understand fit.
7. User generates a tailored resume, cover letter, or outreach note.
8. User opens the source job URL and applies.
9. User marks the job Applied or saves it for later.
10. Pipeline, Applied, Saved, Documents, Notifications, Analytics, and AI Coach stay in sync through local DB state.

## Main Product Loop

```text
Gemini key -> resume upload -> clarification -> preferences -> scan -> ranked dashboard -> job actions -> tracking
```

