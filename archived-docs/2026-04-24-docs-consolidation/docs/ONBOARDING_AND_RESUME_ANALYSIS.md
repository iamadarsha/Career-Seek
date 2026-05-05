# Onboarding And Resume Analysis

## Stages

The first-run funnel is implemented in `src/components/OnboardingFlow.tsx` and persisted through `src/lib/config.ts`.

Stages:

- `welcome`
- `api_key`
- `resume`
- `analysis`
- `clarification`
- `review`
- `preferences`
- `scan`
- `dashboard`

## Gemini Key

`checkApiKey()` validates a key before the user can upload a resume. The response distinguishes:

- missing key
- invalid key
- timeout
- quota/rate limit
- connectivity
- unknown failure

The key is saved only after validation succeeds.

## Resume Upload

`uploadAndParseResume()` supports PDF and DOCX. It stores the original file in `~/.jobhunt-india/uploads`, saves extracted text in `uploaded_resumes`, and writes parse metadata into `parse_metadata`.

Tracked parse risks include:

- scanned or image-based PDFs
- low text density
- weak date extraction signals
- two-column or table-like text order
- corrupted symbols/glyphs

## Gemini Analysis

`extractProfileWithAnalysis()` returns:

- normalized master profile
- confidence score
- confidence notes
- extraction issues
- clarification questions

Clarification answers are saved in `uploaded_resumes.parse_metadata` so the user can close the app mid-flow and continue.

## Profile Review

Users can edit name, headline, years of experience, target seniority, explicit skills, and strengths before search begins. The final profile is saved to `master_profiles`.
