# Phase F Notes — AI Coach & Grounded Q&A

## Completed

### 1. Database Schema (5 new tables)
- `document_chunks` — RAG corpus with embeddings
- `index_runs` — indexing operation tracking
- `coach_threads` — conversation threads
- `coach_messages` — messages with confidence metadata
- `message_sources` — source provenance per answer

### 2. Chunking Pipeline (`src/lib/services/coach/chunker.ts`)
- Section-aware chunking for 10 source types
- Deterministic chunk IDs (SHA-256 hash)
- Metadata preservation (role, company, project name, etc.)
- ~10-25 chunks per source type

### 3. Embedding Service (`src/lib/services/coach/embedder.ts`)
- Gemini `text-embedding-004` (768-dim)
- Local SQLite storage (no external vector DB)
- Batch processing with fallback
- Index run tracking and status

### 4. Retrieval Engine (`src/lib/services/coach/retriever.ts`)
- Hybrid scoring: 70% cosine similarity + 30% keyword overlap
- 5 retrieval scopes with metadata filtering
- Human-readable source labels
- Top-K selection (8 concise / 12 detailed)

### 5. Grounded Answer Service (`src/lib/services/coach/answer.ts`)
- Strict grounding via system prompt
- Structured output: answer, confidence, sources, follow-ups, caveats
- Gemini 2.5 Flash with fallback to Flash Lite
- 8 context-aware suggested prompt categories

### 6. Chat Persistence (`src/lib/services/coach/persistence.ts`)
- Full thread/message CRUD
- Source provenance tracking
- Conversation context injection (last 6 messages)
- Auto-titling from first question

### 7. Server Actions (`src/app/coach/coach-actions.ts`)
- Index management (index, reindex, status)
- Thread CRUD
- Question flow: create thread → user message → index check → retrieve → answer → persist → respond
- Job selector and suggestion generator

### 8. Coach UI (`src/app/coach/page.tsx`)
- Thread sidebar with create/delete
- Job selector and scope switcher
- Message composer with keyboard shortcuts
- Confidence badges (high/medium/low)
- Source evidence cards with expand/collapse
- Suggested prompt chips (empty state + inline)
- Loading, error, and stale index states
- Copy-to-clipboard for answers

### 9. Documentation (6 docs)
- `RAG_ARCHITECTURE.md`
- `AI_COACH.md`
- `EMBEDDING_AND_RETRIEVAL.md`
- `CONTEXT_SCOPES.md`
- `CHAT_PERSISTENCE.md`
- `PHASE_F_NOTES.md`

## Key Design Decisions

1. **No external vector DB** — embeddings in SQLite JSON for local-first simplicity
2. **Hybrid retrieval** — cosine + keyword for better precision
3. **Structured answers** — Zod-validated JSON for reliable UI rendering
4. **Source transparency** — every answer shows its evidence
5. **Scope controls** — user agency over retrieval context
6. **Auto-indexing** — triggers index on first question if empty

## Deferred for Future Phases

- [ ] Real-time re-index on profile/document update (currently manual)
- [ ] Detailed answer mode toggle in UI
- [ ] Cross-job comparative analysis
- [ ] Document Manager page (Phase E carry-over)
- [ ] Chat export to PDF/Markdown
- [ ] Voice assistant integration
- [ ] Advanced salary benchmarking with external data
- [ ] Multi-user cloud sync
- [ ] Recruiter CRM features
- [ ] MMR (Maximal Marginal Relevance) for source diversity
