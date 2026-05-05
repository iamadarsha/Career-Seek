# Applications And Documents

Phase 3 focus: make every application asset useful without hiding how it was made. A job seeker should be able to see why a job scored well, download clean files, and keep working even with no API key.

## Application CRM

Applications are tracked in the local `applications` table. Job cards, Pipeline, Applied, and Documents share application state instead of keeping separate loose JSON state.

Common statuses include:

- saved
- preparing
- applied
- interviewing
- offer
- rejected
- withdrawn

The pipeline can show timeline entries, notes, reminders, linked contacts, linked documents, and generated assets.

## Generated Assets

Document assets include:

- tailored resume DOCX
- ATS-oriented resume PDF when generated
- cover letter
- outreach note
- ATS report
- structured JSON sidecar with the resume data used for generation
- plain-text sidecar for quick copy/paste into application forms

Generated assets are versioned and linked to the selected job where possible. The sidecars matter because many application portals break formatting: the DOCX/PDF is for upload, the text sidecar is for form fields, and the JSON sidecar is the local record of what Career Seek used to build that version.

## Resume And Cover Letter Generation

Resume and cover-letter generation should use:

- the active master profile
- the selected job description or snippet
- role keywords
- user clarification answers where available

Fallback generation is deterministic when the selected AI provider is unavailable. Live model output uses whichever provider the user configured: OpenAI, Anthropic, Gemini, Groq, DeepSeek, an OpenAI-compatible endpoint, or Ollama.

Phase 3 document generation should keep layout separate from AI writing:

- Career Seek builds an ATS-safe resume structure first.
- The selected model can rewrite selected bullets, summaries, or cover-letter paragraphs when available.
- The renderer produces DOCX/PDF from the structured resume data, not from a free-form model response.
- The app always keeps the JSON and text sidecars beside the final document asset.

This keeps formatting predictable. If the model is offline, the user still gets a clean resume built from their saved profile and the selected job.

## ATS Score

ATS score is advisory and local-first. It is not employer-certified and is not an employer ATS guarantee.

The score combines three local checks:

- Keyword coverage: important skills and phrases from the job description compared with the resume.
- Semantic match: local embeddings compare the meaning of the resume and job, so related language can still match even when exact words differ.
- Resume structure: contact details, role titles, dates, impact bullets, education, and clear sections.

The selected AI provider is only used for qualitative feedback such as "add one bullet about stakeholder management" or "move SQL higher because the job asks for it." The numeric score should come from local calculations so it works with no key and stays consistent across providers.

When no API key or local model is available, Career Seek should still show:

- the local composite score
- matched keywords
- missing keywords
- structure warnings
- a plain-language checklist for what to improve

When an AI provider is available, Career Seek can add short explanations and rewrite suggestions, but it should not invent experience or treat the score as a pass/fail verdict.

## Local Embeddings

Semantic similarity uses local embeddings. In plain terms, Career Seek turns the resume and job description into number lists on the user's computer, then compares those lists to estimate meaning-level fit.

The app records the embedding provider, model, and dimensions with the chunks it stores. If those settings change, old vectors should be reindexed instead of mixed with new ones.

Expected behavior:

- Use a local embedding model when available.
- Fall back to deterministic keyword-hash vectors when the local model is unavailable.
- Store enough metadata to explain which mode produced the score.
- Never send the resume or job description to a cloud embedding service by default.

## Downloads

Downloads are served through generated document asset records. The download route restricts files to:

- an owned document asset
- supported file extensions
- paths inside the local Career Seek data directory

This prevents arbitrary local file download through a raw path.

Every generated application packet should be easy to inspect:

- `resume.docx` for ATS upload where DOCX is accepted
- `resume.pdf` for human review or portals that require PDF
- `resume.json` for the exact structured source used to render the resume
- `resume.txt` for paste-friendly form fields
- `cover-letter.txt` or `cover-letter.docx` when generated
- `ats-report.json` and a readable ATS summary

## Supporting Workflow

The application workflow also includes:

- contacts linked to applications
- local email-ready drafts
- calendar export files for reminders or interviews
- reminders and notifications
- backup/export metadata

These surfaces are local-first and should avoid background side effects without explicit user action.

## Current Limits

- Old proof files and local generated assets may still exist; they were not deleted without explicit approval.
- Document quality depends on profile quality, JD detail, and the availability of the selected AI provider. Local fallbacks remain available.
- Application tracking is local; it does not submit applications to employers.
- ATS score quality depends on the job description. Very short or vague postings produce weaker recommendations.
- Semantic similarity is helpful, but it cannot know what a recruiter or employer system will actually do.
- AI feedback is advisory. Users should review every rewritten bullet before applying.
- LinkedIn, Indeed, and some other job sources may block live scanning. Saved job text and company career pages remain the safer source for document generation.
