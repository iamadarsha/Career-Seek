# Final Hardening Report

Current authority: `docs/FINAL_RELEASE_STATUS.md`.

This file is retained as implementation history. It is not the final release-status wording.

Status: implementation complete; validation in progress.

## Implemented

- Cloned all requested vendor repos into `vendors/`.
- Excluded vendors and generated local data from app typecheck/git.
- Sanitized local proof config that contained a Gemini key.
- Hardened document downloads to use profile-owned `assetId` records.
- Added upload size/signature guards and failed-parse cleanup.
- Added Settings Gemini validation that does not reset completed onboarding.
- Added resume-analysis recovery CTA after upload/refresh.
- Made clarification answers refine the profile.
- Made failed scans fail background jobs when no usable jobs are found.
- Added API-first Naukri and guest-public LinkedIn paths with fallbacks.
- Persisted richer normalized job fields and raw payload snapshots.
- Added explicit OCR/helper capability metadata.
- Added deterministic ATS keyword coverage and ATS-safe PDF generation.
- Scoped coach threads/messages to the active profile.
- Added RAG relevance thresholding, application-history chunks, citation validation, and off-topic guardrails.
- Clarified Apply/Applied and Save behavior.

## Validation Snapshot

- `npm run typecheck`: pass after implementation.
- Full validation commands and browser dogfood results remain to be appended after final run.

## Known Honest Limits

- Live portals can still block or drift.
- PaddleOCR is cloned/reference-only, not installed as a runtime dependency.
- Scanned-PDF OCR depends on local Poppler/Tesseract availability.
- ATS score is an explainable estimate, not an employer ATS guarantee.
