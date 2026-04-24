# Embedding & Retrieval — JobHunt India Phase F

## Embedding Strategy

### Model
- **Gemini `text-embedding-004`** — 768-dimensional vectors
- Free-tier friendly, production quality
- Task type: `RETRIEVAL_DOCUMENT` for indexing, `RETRIEVAL_QUERY` for queries

### Storage
- Embeddings stored as JSON float arrays in SQLite `document_chunks.embedding`
- No external vector database needed
- Metadata stored alongside for filtering

### Batch Processing
- 20 texts per batch to respect API rate limits
- Automatic fallback for individual failures (zero vector)

## Retrieval Strategy

### Hybrid Scoring
```
finalScore = (cosineSimilarity × 0.7) + (keywordOverlap × 0.3)
```

- **Cosine similarity** — semantic meaning match
- **Keyword overlap** — exact term match boost
- Combined score scaled to 0-100

### Scope Filtering
Before scoring, candidates are filtered by scope:

| Scope | Includes |
|---|---|
| `job_only` | Chunks where `scoredJobId = selected` |
| `job_and_profile` | Job chunks + profile chunks (null scoredJobId) |
| `job_and_resume` | Job chunks + resume_text + master_profile + tailored_resume |
| `all_materials` | All chunks |
| `profile_only` | Chunks where `scoredJobId IS NULL` |

### Top-K Selection
- **Concise mode**: Top 8 chunks
- **Detailed mode**: Top 12 chunks

## Performance Characteristics

For a typical corpus of ~200 chunks:
- **Embedding generation**: ~10-20 seconds (one-time)
- **Query embedding**: ~200ms
- **Similarity search**: <50ms (in-memory linear scan)
- **Total retrieval**: ~250ms

## Re-indexing

Triggers:
1. Manual "Index" or "Re-index" button in coach sidebar
2. Profile update → clear profile chunks → re-index
3. Resume regeneration → clear job chunks → re-index
4. ATS report update → clear job chunks → re-index

Freshness check:
- If last successful index run was >30 minutes ago, UI shows stale warning
- Users can always force re-index
