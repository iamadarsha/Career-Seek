# Product Flow

Career Seek is a local-first job search and application workflow for one user in India. It combines resume parsing, provider-neutral AI profile extraction, job discovery, ranked review, document generation, application tracking, and local notes.

## Primary Loop

1. User completes onboarding.
2. User chooses an AI setup: cloud key, OpenAI-compatible endpoint, Ollama, or local-only fallback.
3. User uploads a PDF or DOCX resume.
4. The app parses the resume and records parse quality metadata.
5. The model gateway analyzes the resume when a provider is available; otherwise the app builds a deterministic reviewable profile.
6. If confidence is low, the app asks clarification questions and persists answers.
7. User confirms the profile and search preferences.
8. The app scans selected job sources.
9. The dashboard ranks jobs and exposes source health.
10. User reviews jobs, generates job-specific assets, applies, and tracks status.

## Onboarding Stages

- `welcome`
- `api_key`
- `resume`
- `analysis`
- `clarification`
- `review`
- `preferences`
- `scan`
- `dashboard`

Incomplete onboarding routes users to `/onboarding`.

## Main Pages

- `/today`: daily queue and command-center view.
- `/discover`: ranked jobs, filters, source health, and job actions.
- `/pipeline`: application CRM.
- `/documents`: uploaded resumes and generated assets.
- `/coach`: grounded AI coach.
- `/notifications`: reminders and task notifications.
- `/analytics`: local analytics and insights.
- `/settings`: AI provider, profile, paths, automation, and local setup controls.

## Job Card Actions

- Apply opens the source job URL.
- Save stores the opportunity for later review.
- Brief generates or opens the fit analysis.
- Resume generates a tailored resume asset.
- Cover letter generates a tailored cover letter asset.
- Outreach creates a short connection or recruiter note.
- Applied records an application status.

## Current Validation Boundary

- The route shell and core pages have been validated by build, typecheck, doctor, and route checks.
- Full fresh live onboarding through populated dashboard still needs clean manual proof runs for no-key, Ollama, and configured cloud-provider paths.
- Live scraping is best-effort and source-dependent.
