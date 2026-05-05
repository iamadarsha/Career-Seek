# ATS And Document Upgrades

## Deterministic Keyword Coverage

Added `src/lib/services/documents/keyword-coverage.ts`.

It deduplicates JD terms across:

- must-have skills
- preferred skills
- tool requirements
- domain language
- ATS keywords
- seniority and leadership signals

It then phrase-matches terms against resume sections and reports:

- matched keywords
- missing keywords
- section hits
- coverage percentage
- section-level recommendations

Gemini may still write prose, but matched/missing keyword coverage is deterministic.

## ATS Report

ATS reports now include:

- `keywordReport`
- deterministic section recommendations
- human-readable explanation
- provenance showing whether Gemini was used or fallback logic generated the report

Fallback ATS scoring is capped and marked as heuristic.

## Resume Assets

Resume generation now creates:

- ATS-safe DOCX
- ATS-safe selectable-text PDF
- versioned JD-linked metadata
- ATS score on both resume assets and ATS report assets

Download links use owned `assetId` routes instead of raw filesystem paths.
