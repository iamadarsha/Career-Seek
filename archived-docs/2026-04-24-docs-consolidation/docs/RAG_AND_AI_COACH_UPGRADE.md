# RAG And AI Coach Upgrade

## What Changed

Career Seek kept its existing Gemini embedding + SQLite vector-like retrieval foundation.

Changes:

- Coach threads are now created with `userId` and `profileId`.
- Thread list/read/delete/message actions are scoped to the active profile.
- Available job selector and suggestions are profile-scoped.
- Retrieval applies a minimum relevance threshold before sources are sent to Gemini.
- Off-topic/non-career questions are rejected with a low-confidence coaching-scope answer.
- Application history is now chunked into the RAG corpus.
- Citation indexes are validated before persistence.
- Index status now reports the most recent run instead of the oldest run.

## Grounding Sources

The coach can ground answers in:

- master profile
- uploaded resume text
- search preferences
- job descriptions
- JD analysis
- AI brief/enrichment
- generated resumes
- ATS reports
- cover letters
- outreach notes
- saved/applied application history

## Limits

Career Seek does not claim fresh company facts unless those facts are in indexed app data. Salary/market claims should be low confidence unless scraped salary data or user-provided context exists.
