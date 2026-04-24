# Phase B Notes

## Completed
1. **Onboarding Flow**: Fully functional multi-step wizard (`src/app/onboarding/page.tsx`).
2. **Gemini API Setup**: UI for key entry, validation via `@google/generative-ai`, and persistence to `settings.json`.
3. **Resume Parsing**: Services added (`src/lib/services/resume-parser.ts`) to extract text from PDFs (`pdf-parse`) and DOCX (`mammoth`). Files are saved locally to `~/.jobhunt-india/uploads`.
4. **AI Profile Extraction**: Gemini extracts a structured profile from the raw resume text using a highly specific prompt mapped to `MasterProfile` Zod schema.
5. **Profile Editing UI**: The wizard provides a review screen for the extracted profile, distinguishing explicit vs inferred skills.
6. **Search Preferences**: Collected during onboarding and saved to the SQLite DB.
7. **Settings Integration**: Users can revisit and edit API Key, Master Profile, and Search Preferences via the Settings page.

## Deferred to Phase C
- **Scraping Engine**: No active crawlers or Playwright instances yet.
- **Job Match Scoring**: The match system comparing `MasterProfile` with `Job` descriptions.
- **Tailoring**: Resume and cover letter generation based on matched jobs.
- **Complex Agent Tooling**: Orchestration using Google Agents CLI or LangChain.
