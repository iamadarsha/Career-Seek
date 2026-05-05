# OCR And Resume Recovery

## Primary Flow

Career Seek still parses:

- PDF through `pdf-parse`
- DOCX through `mammoth`

Gemini profile extraction runs only after the parser output is trusted enough or the user provides manual recovery text.

## Added Recovery Signals

Parser metadata now records:

- OCR/helper availability: `pdftotext`, `pdfinfo`, `pdftoppm`, `tesseract`, optional `paddleocr`.
- Probable scanned/image PDF.
- Low text density.
- Two-column/text-order risk.
- Glyph corruption risk.
- Weak date signals.

If Poppler `pdftotext` is available, the parser tries `pdftotext -layout` before OCR when text order or date signals look weak.

## Manual Recovery

If extraction is low trust:

- Gemini is not called.
- The UI asks the user to upload a clearer PDF/DOCX or paste resume text.
- Pasted text must be at least 500 characters.

## Clarification Fix

Clarification answers are no longer cosmetic. Saving answers now refines the latest master profile with Gemini when available, and falls back to a deterministic profile note if Gemini fails.

## Current Machine Status

Earlier evaluation showed `pdftoppm`, `tesseract`, and `pdfinfo` were not available on this machine. `npm run doctor` reports the current state.
