# Resume Parse And OCR Recovery

## Detection logic

Resume ingestion now records parse metadata with:

- extracted character count
- word count
- page count for PDFs
- extraction method
- confidence score
- issues
- warnings
- `needsManualRecovery`
- OCR attempt metadata

The parser flags:

- scanned or image-heavy PDFs
- low text density
- compact/two-column layouts
- weak date extraction
- corrupted glyphs or symbol noise
- extraction too weak for Gemini profile generation

## OCR behavior

For weak PDFs, the parser attempts OCR if both tools exist:

- `pdftoppm`
- `tesseract`

If OCR tools are unavailable or OCR output is too weak, onboarding stops before Gemini extraction and shows recovery options:

- upload a better PDF/DOCX
- paste resume text
- manually fill critical profile fields

## Validation evidence

Final proof used three fixtures:

- Clean DOCX: `confidence=92`, `needsManualRecovery=false`, no warnings.
- Ambiguous compact PDF: `confidence=84`, warning for short-line/two-column extraction, `needsManualRecovery=false`.
- Image-only scanned PDF: `characterCount=0`, `needsManualRecovery=true`, OCR attempted but unavailable on this machine, manual recovery required.

This means scanned PDF support is honest: OCR is attempted when available, but the app does not silently continue with a low-trust profile.
