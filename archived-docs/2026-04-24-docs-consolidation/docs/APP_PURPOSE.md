# App Purpose

Career Seek is a local-first AI job search operating system for one user in India.

It is not just a job board, scraper, or resume generator. It connects the full job acquisition loop:

- configure Gemini
- upload and understand a resume
- clarify uncertain profile details
- define target roles and constraints
- scan India-focused job sources
- deduplicate and rank opportunities
- generate job-specific application assets
- apply, save, and track progress

## Product Promise

The core promise is:

```text
setup -> understand profile -> define intent -> scan -> rank -> act -> track
```

## Privacy Model

The app runs locally. SQLite data, uploaded resumes, generated documents, settings, and logs stay on the local machine.

Content is sent to Gemini only when the user validates a key, analyses a resume, asks for a job brief, generates a document, or uses AI Coach.

## Primary User

The current product is designed for a single local user managing their own India-focused job search.

The app should always answer:

```text
What should I do next?
```

