# Phase 4 Local Smoke

Run:

```bash
npm run qa:phase4
```

This smoke is intentionally local-only. It creates an isolated temporary
`JOBHUNT_DATA_DIR`, deletes cloud AI provider environment variables for the
process, disables Ollama and model downloads, and blocks non-local HTTP(S)
fetches.

## Coverage

- Job indexing/search fallback: seeds two scored jobs and verifies
  `executeAiSearch` ranks the AI Search PM fixture through local matching with
  `source: "local"`.
- Dream-job ranking fallback: calls the semantic match export with a fake
  non-local embedding provider and verifies it falls back to deterministic
  `local_keyword_hash`.
- Coach RAG no-key behavior: when Coach indexing/answer exports exist, indexes
  local profile and job evidence, then verifies a no-provider Coach answer stays
  in low-confidence evidence-only mode.

The script prints a compact JSON summary on success. It should not touch the
normal app database, UI files, or live provider endpoints.
