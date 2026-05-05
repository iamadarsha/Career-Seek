# Real Gemini Validation

## Real-key path tested

The final proof run used the locally configured Gemini key without printing it.

Observed:

- `validateApiKeyDetailed`: `success=true`, `category=valid`
- Resume profile extraction completed for the clean DOCX.
- Brief generation succeeded.
- Resume generation succeeded and saved a DOCX.
- Cover letter generation succeeded and saved a text file.
- Connect note generation succeeded and saved a document asset.

## Simulated states tested

`validateApiKeyDetailed` was also tested with:

- `JOBHUNT_SIMULATE_GEMINI=invalid`
- `JOBHUNT_SIMULATE_GEMINI=timeout`
- `JOBHUNT_SIMULATE_GEMINI=quota`
- `JOBHUNT_SIMULATE_GEMINI=connectivity`
- `JOBHUNT_SIMULATE_GEMINI=valid`

Each produced the expected user-facing category and recovery action.

## Malformed response recovery

During proof, Gemini returned malformed JSON for JD analysis once.

The app recovered by:

- logging the parse error
- using deterministic JD analysis fallback
- continuing Resume, ATS, Cover Letter, and Connect generation
- persisting generated assets

This is intentionally not hidden: logs remain detailed while the user action does not dead-end.
