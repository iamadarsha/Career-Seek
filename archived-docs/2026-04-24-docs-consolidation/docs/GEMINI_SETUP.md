# Gemini API Setup

JobHunt India uses Google's Gemini models for local AI tasks. Current code references:
- `gemini-2.5-flash` (primary text generation)
- `gemini-2.5-flash-lite` (fallback)
- `text-embedding-004` (RAG embeddings)

## Obtaining a Key
1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Create an API key
3. Enter it during the JobHunt India Onboarding or via Settings.

## Privacy & Security
The API key is **never** sent to any third party other than Google's Gemini endpoint. It is stored securely in your local configuration directory (`~/.jobhunt-india/config/settings.json`) as plain text for the local runtime to use. Since this app runs entirely on localhost, the key remains on your machine.

## Usage in App
The key is strictly used for:
- Validating the connection.
- Extracting the Master Profile from your resume.
- Scoring/search enrichment, document generation, and AI coach RAG workflows.
