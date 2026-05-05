# Hardening Final Pass

Current authority: `docs/FINAL_RELEASE_STATUS.md`.

This file preserves hardening history. Use the release-status document for the current distinction between solved, partially solved, and remaining gaps.

Date: 2026-04-24

This pass focused only on the remaining reliability risks: source drift, OCR-poor resumes, real Gemini validation, clean-machine setup, fresh dashboard proof, queue durability, and profile scoping.

## What changed

- Added source failure taxonomy and selector fallback support for scraper adapters.
- Persisted per-source failure details in `scan_portal_runs.error`.
- Marked scans `partial` when some sources fail but useful jobs are saved.
- Added validation-only source adapters to prove partial scans deterministically.
- Added resume low-trust detection for scanned PDFs, compact/two-column layouts, weak date extraction, glyph noise, and low text density.
- Added OCR fallback attempt using `pdftoppm` and `tesseract` when available.
- Added manual recovery for weak extraction: upload better PDF/DOCX, paste resume text, or manually fill critical fields.
- Added robust Gemini JSON parsing plus deterministic fallbacks for JD analysis, resume tailoring, ATS check, cover letter, and outreach note.
- Made `/` server-gated so first-run users land on `/onboarding`.
- Hardened background job recovery and retry execution for interrupted scan jobs.
- Removed hardcoded profile identity from live job monitor access.
- Made bootstrap scripts preserve explicit `JOBHUNT_DATA_DIR` and redact secrets in logs.

## Final proof artifacts

- Main proof JSON: `.proof-data/logs/final-proof-run.json`
- Dashboard screenshot: `.proof-data/logs/dashboard-browser-proof.png`
- First-run route proof used isolated `.route-proof-data`
- Queue proof used isolated `.queue-proof-data`

## Status

- Solved: mandatory onboarding route, populated dashboard fallback, source partial failure, malformed Gemini JSON recovery, document persistence, queue retry recovery, clean data-dir isolation.
- Partial: live public portal selectors remain inherently fragile; OCR requires local OCR tools and otherwise routes to manual recovery.
- Not solved: npm audit still reports 9 findings requiring major upgrades to Next 16 / Drizzle latest.
