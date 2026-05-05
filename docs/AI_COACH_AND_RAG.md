# AI Coach And RAG

## Purpose

The AI Coach answers questions using locally indexed career materials. It should not act as a generic chatbot when relevant local evidence is missing.

## Grounding Sources

The coach can use:

- master profile
- resume text
- job descriptions and snippets
- JD analyses
- generated resumes
- ATS reports
- cover letters
- outreach notes
- application history
- local notes where indexed

## Retrieval Flow

1. Source material is chunked into local document chunks.
2. Embeddings are created for retrieval.
3. Query retrieval selects relevant chunks.
4. The model-agnostic Coach RAG engine embeds the question locally and includes retrieved evidence.
5. The response includes confidence and source references where available.

## Generation Policy

Coach generation now runs through the local-first AI gateway:

- if the user has selected/configured a provider, `AIManager` generates the answer from local evidence
- if no provider is configured, the Coach returns a cited evidence summary
- outbound cloud generation is never attempted merely because a default provider exists
- local retrieval and indexing still work with no key

## Persistence

Conversations persist locally through:

- `coach_threads`
- `coach_messages`
- `message_sources`

This allows the user to return to prior coaching threads.

## Context Scopes

Context scopes can restrict retrieval to:

- job and profile
- job only
- job and resume
- all materials
- profile only

The selected scope controls what evidence is sent to the selected provider, or used in evidence-only mode when no provider exists.

## Limits

- Cloud calls require the user's selected provider key.
- Ollama calls require a reachable local Ollama endpoint.
- Low retrieval confidence should result in caveats instead of fabricated certainty.
- Embedding and answer quality depend on the indexed local material.
- The coach should not claim actions were taken unless the app persisted them.
