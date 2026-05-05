# Onboarding And Profile

## AI Setup

The user chooses an AI setup before resume analysis. They can provide a cloud API key, configure an OpenAI-compatible endpoint, use Ollama, or continue with local-only fallback. Provider validation distinguishes:

- `missing`
- `invalid`
- `timeout`
- `quota/rate limit`
- `connectivity`
- `unknown`

The full live-model path requires a reachable configured provider. Simulated, deterministic, and fallback paths should not be treated as proof that a live cloud or Ollama model was exercised.

## Resume Upload

Supported upload formats:

- PDF
- DOCX

Parsed resume text is stored locally with metadata. Upload and generated files remain under the configured local data directory.

## Resume Parse Metadata

Resume parsing records warnings for:

- scanned or image-based PDFs
- low text density
- weak date extraction
- two-column or table-like reading order
- corrupted glyphs

These warnings are used to decide whether the app can continue to profile extraction or should ask for manual recovery.

## OCR And Recovery

OCR behavior depends on local tooling and source document quality. When OCR or parsing is weak, the app should route the user to recovery options instead of silently creating a low-trust profile.

Recovery options include:

- upload a better PDF or DOCX
- paste resume text manually
- fill important profile fields manually

## Clarification

When resume analysis is uncertain, clarification questions are shown before final profile confirmation. Answers are persisted and can refine the profile through the selected AI provider when available, with deterministic patching as fallback.

## Profile Shape

The master profile includes:

- full name
- headline
- years of experience
- target seniority
- explicit and inferred skills
- tools
- domains
- experience
- projects
- achievements
- education
- certifications
- strengths
- gaps
- raw summary

Explicit resume evidence should be preferred over inferred profile claims.

## Local Storage

The app stores local profile and resume data under `JOBHUNT_DATA_DIR` when set, otherwise under `~/.jobhunt-india`.
