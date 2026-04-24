# Onboarding Flow

## Overview
The onboarding flow is responsible for establishing the user's local, AI-powered professional profile. It follows a multi-step wizard format to ensure clarity and trust.

## Steps
1. **Welcome**: Explains the local-first philosophy.
2. **API Key Setup**: Securely inputs the user's Gemini API Key. Validates it via a small test request before persisting.
3. **Resume Upload**: Accepts PDF or DOCX files. The local app uses `pdf-parse` or `mammoth` to extract raw text entirely locally.
4. **Profile Extraction**: The extracted text is sent to Gemini (using the key provided in Step 2) with a strict JSON schema prompt. Gemini returns a fully structured professional fingerprint.
5. **Review**: The user reviews the AI's extraction. Inferred skills and metadata are clearly separated from explicit facts.
6. **Preferences**: Collects job search intent (roles, locations, work model, etc.).
7. **Finish**: Finalizes the onboarding state.

## Persistence
- API keys and step state are stored in `~/.jobhunt-india/config/settings.json`.
- Resumes are stored in `~/.jobhunt-india/uploads/`.
- The Master Profile and Search Preferences are stored in the local SQLite database.
