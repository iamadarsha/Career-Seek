# Onboarding And Resume Flow

## Mandatory Gate

The root route checks the onboarding gate before showing the dashboard.

Dashboard access requires:

- current onboarding flow version
- Gemini key
- uploaded resume
- analysed master profile
- active search profile
- first scan marker
- dashboard stage in local config

Old `isConfigured: true` settings are not enough to bypass onboarding.

## Gemini Key

The user enters a Gemini key before resume upload. Validation returns friendly categories for common failures:

- missing key
- invalid key
- timeout
- quota or rate limit
- connectivity
- unknown error

The key is stored in the local settings file.

## Resume Upload

Supported formats:

- PDF
- DOCX

The upload flow stores the original file in the local uploads directory, extracts text, and stores parser metadata in SQLite.

## Resume Analysis

Gemini extracts the normalized master profile:

- name and headline
- years of experience
- skills and tools
- domains
- experience
- projects
- achievements
- education
- certifications
- strengths and gaps

Parser metadata and Gemini analysis expose confidence, warnings, extraction issues, and clarification questions.

## Ambiguity Handling

The app explicitly handles weak extraction signals such as:

- scanned or image-heavy PDFs
- low text density
- few date signals
- two-column or table-like ordering
- corrupted glyphs
- unclear current role
- missing or overlapping dates
- education/work-history confusion

If Gemini is uncertain, the user answers clarification questions before profile confirmation.

## Profile Review

The user can edit critical extracted fields before moving to job preferences.

