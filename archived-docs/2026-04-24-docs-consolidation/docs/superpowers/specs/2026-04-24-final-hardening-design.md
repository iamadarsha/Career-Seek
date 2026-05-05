# Career Seek Final Hardening Design

Approved on 2026-04-24.

## Goal

Harden Career Seek without replacing the product shell or changing the core flow:

Gemini key -> resume upload -> resume analysis -> clarification -> preferences -> scan -> ranked dashboard -> Brief / Resume / Cover Letter / Connect / Apply / Save / Applied -> Pipeline / Documents / Notifications / Coach.

## Vendor Strategy

Clone the requested open-source repositories into `vendors/` for auditability. Treat them as references unless a module is small, license-safe, and stack-compatible. Do not replace Career Seek with a vendor app.

High-value reuse:

- JobSpy and Naukri scraping repos: Naukri API patterns, salary/date parsing, retry ideas.
- LinkedIn scrapers: public guest URL/filter/pagination patterns, with no authenticated scraping dependency.
- PaddleOCR: optional advanced OCR provider pattern and preflight checks; keep lightweight local parsing as primary.
- OpenResume and ATS repos: ATS-safe document structure, section parsing ideas, deterministic keyword coverage.
- RAG demos: profile-scoped ownership, evidence thresholding, source disclosure, and index freshness ideas.

## Security And Setup

- Treat proof data and local app data as non-committable; ignore generated DB/config/log/output folders and SQLite sidecars.
- Replace raw-path downloads with profile-owned document asset downloads, preserving a safe legacy path only for owned assets.
- Add upload size/signature checks and cleanup failed uploaded files.
- Add setup/bootstrap/doctor checks for Node, DB, Playwright, and OCR tool availability.
- Make failed scans fail the platform job instead of reporting success with zero jobs.

## Scraping

Keep the existing orchestrator and source-independent partial-scan lifecycle.

Implement:

- Naukri API-first extraction with DOM fallback.
- LinkedIn guest-public extraction with DOM fallback.
- Source health and failure taxonomy: `selector_not_found`, `timeout`, `blocked`, `auth_gate`, `empty_results`, `browser_error`, `parse_error`, `unknown`.
- Per-source logs in existing portal/job logs.
- Safe-mode behavior when browsers are unavailable.
- Lightweight failure snapshots.
- Dedupe across URL, external ID, and title/company/location signature.
- Persist existing DB fields currently dropped by the orchestrator: apply URL, posted date, raw posted date, employment type, remote/hybrid flags, and raw payload snapshots.

## OCR And Resume Understanding

Keep PDF/DOCX parsing but improve trust signals:

- Add OCR capability probing for `pdftoppm`, `tesseract`, `pdfinfo`, and `pdftotext`.
- Add explicit parse flags for scanned/image-heavy PDFs, low density, two-column/order risk, glyph corruption, and weak dates.
- Try `pdftotext -layout` when available before OCR.
- Preserve manual recovery for weak extractions.
- Feed parser risk into Gemini prompts.
- Make clarification answers actually update the profile before review.

## ATS And Documents

Add deterministic coverage beside Gemini:

- JD keyword normalization and phrase matching.
- Matched/missing keyword report with section hits.
- Section-level suggestions.
- Human-readable ATS explanation.
- Versioned JD-linked document metadata.
- ATS-safe DOCX and selectable-text PDF outputs from the same structured model.
- Persist ATS score/provenance on resume assets and ATS report assets.

## RAG And AI Coach

Keep the existing Gemini + SQLite RAG design.

Implement:

- Profile/user-scoped coach threads and actions.
- Relevance thresholding and “not enough evidence” answers.
- Application history chunks.
- Citation validation before persistence.
- Guardrails for off-topic/non-career questions and unsupported job facts.

## UX Fixes

- Settings key validation must not reset completed onboarding.
- Resume upload refresh/interruption must show a continue-analysis path.
- Apply/Applied and Save states must be unambiguous.
- Source health should show readable failure labels.

## Validation

Run:

- `npm install`
- `npm run doctor`
- `npm run build`
- `npm run typecheck`

Validate:

- Clean DOCX, ambiguous/two-column PDF, scanned/image-heavy PDF.
- Gemini invalid key, timeout simulation, quota simulation, and one real-key flow if available.
- Healthy-source scan, partial-source-failure scan, interrupted scan recovery.
- Populated dashboard cards and all job CTAs.
- Clean first-run onboarding in browser, not route assertions only.

## Honesty Rule

Live portal success, OCR quality, ATS quality, and first-run proof must be reported as pass, partial, failed, or deferred based on actual validation evidence.
