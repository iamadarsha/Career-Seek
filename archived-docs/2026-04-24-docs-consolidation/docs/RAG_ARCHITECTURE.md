# RAG Architecture — JobHunt India Phase F

## Overview

The AI Coach uses a Retrieval-Augmented Generation (RAG) architecture to provide grounded answers based on the user's actual materials — never generic advice.

```
Question → Query Embedding → Cosine Similarity Search → Top-K Chunks → Grounded Prompt → Gemini → Cited Answer
                                    ↑                        ↓
                              document_chunks          Source References
                              (SQLite + JSON)          (UI Evidence Panel)
```

## Components

### 1. Chunking Pipeline (`src/lib/services/coach/chunker.ts`)
- **Section-aware** — splits resume experience, projects, JD sections into separate chunks
- **Deterministic chunk IDs** — SHA-256 hash of `sourceType:sourceId:sectionIdx`
- **Source types**: `master_profile`, `resume_text`, `job_description`, `tailored_resume`, `ats_report`, `cover_letter`, `outreach_note`, `enrichment`, `search_preferences`, `jd_analysis`

### 2. Embedding Service (`src/lib/services/coach/embedder.ts`)
- **Model**: Gemini `text-embedding-004` (768-dim vectors)
- **Storage**: JSON float arrays in SQLite `document_chunks.embedding`
- **Batch processing**: 20 texts per batch
- **Caching**: skip existing chunks unless force reindex

### 3. Retrieval Engine (`src/lib/services/coach/retriever.ts`)
- **Hybrid scoring**: 70% cosine similarity + 30% keyword overlap
- **Metadata filtering** by scope, job ID, and source type
- **Top-K selection**: 8 chunks (concise) or 12 chunks (detailed)

### 4. Grounded Answer Service (`src/lib/services/coach/answer.ts`)
- **Structured output**: answer, confidence level, reasoning, source references, follow-ups, caveats
- **System prompt** enforces no fabrication, source attribution, honest uncertainty
- **Fallback handling** for API errors

## Why No External Vector DB?

This is a **local-first** application. Storing embeddings as JSON arrays in SQLite keeps the system:
- Zero-dependency (no Redis, Pinecone, ChromaDB)
- Fully portable (single .db file)
- Fast enough for <10K chunks on a modern laptop
- Easy to inspect and debug

## Chunk Budget

| Source Type | Typical Chunks |
|---|---|
| Master Profile | 8-15 (identity, skills, experience×N, projects×N, education, achievements, strengths) |
| Resume Text | 5-10 (paragraph-based) |
| Job Description | 2-4 per job (overview + snippet segments) |
| JD Analysis | 2 per job (requirements + context) |
| Enrichment | 1 per job (brief) |
| Tailored Resume | 3-6 per job (header + experience×N + skills) |
| ATS Report | 1 per job (summary) |
| Cover Letter | 1 per job |
| Outreach Note | 1 per job |
| Search Preferences | 1 |

**Total for a typical user with 20 scored jobs**: ~150-250 chunks

## Future Extensibility

- Swap embedding model by changing `EMBEDDING_MODEL` constant
- Add vector index (HNSW) if chunk count exceeds ~5K
- Add MMR (Maximal Marginal Relevance) for diversity
- Support cross-job comparative queries
