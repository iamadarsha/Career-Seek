# Career Seek Phase 1-4 LLM Handoff

Date: 2026-04-30
Repository: `/Users/debadritamukhopadhyay/Documents/Career Seek`
Purpose: Feed this document back to the LLM/model that generated the original Career Seek mandate.

## Executive Verdict

The core four-phase implementation is complete for the local-first, model-agnostic product path:

- one-command local app flow is documented and runnable
- provider-neutral AI gateway exists
- no-key deterministic mode works
- resume parsing/chunking/embedding/profile pipeline exists
- local ATS scoring and document sidecars exist
- optional local Meilisearch/Qdrant paths exist with local fallbacks
- Discover has keyword search and local dream-match ranking
- Coach RAG now routes through the model-agnostic gateway and falls back to local evidence
- source gating issues are labeled honestly instead of hidden

The original prompt also asked for several large enterprise/admin integrations. Those are not all fully implemented. The remaining items are listed under "Explicit Gaps And Deferred Work" so the next model does not hallucinate completion.

## Completed Phase Summary

### Phase 1: Local-First Foundation And Multi-LLM Gateway

Implemented:

- `AIManager` in `src/lib/ai/manager.ts`
- provider discovery in `src/lib/ai/providers.ts`
- shared AI types in `src/lib/ai/types.ts`
- usage ledger in `src/lib/ai/usage-ledger.ts`
- retry and fallback handling in `src/lib/ai/retry.ts`
- settings/onboarding support for provider-neutral setup
- local deterministic no-key mode
- installer and launch scripts:
  - `setup.sh`
  - `setup.ps1`
  - `installer/install-macos.sh`
  - `installer/install-windows.ps1`
  - `scripts/bootstrap.mjs`
  - `scripts/launch.mjs`
  - `scripts/doctor.mjs`
- local Docker support stack in `docker-compose.yml`

Supported generation providers:

- OpenAI
- Anthropic
- Google Gemini
- Groq
- DeepSeek
- OpenAI-compatible endpoints
- Ollama local

Important behavior:

- no API key is required to finish onboarding
- `AIManager.generate()` supports non-streaming and streaming requests
- JSON/text response modes are normalized
- provider fallback chain and usage metadata are recorded
- cloud calls happen only when user configuration makes a provider available

Verification:

- `npm run build`
- `npm run typecheck -- --pretty false`
- `npm run doctor`

### Phase 2: Model-Agnostic Resume Pipeline

Implemented:

- local PDF/DOCX parser in `src/lib/services/resume-parser.ts`
- adapter layer in `src/lib/services/resume/parser-adapters.ts`
- resume pipeline in `src/lib/services/resume/pipeline.ts`
- section-aware chunking in `src/lib/services/resume/chunker.ts`
- local embeddings in `src/lib/services/resume/embeddings.ts`
- optional Qdrant vector store in `src/lib/services/resume/vector-store.ts`
- structured extraction through `src/lib/ai/structured-extractor.ts`
- model-agnostic profile generation via AIManager where provider exists
- deterministic fallback where provider does not exist
- proof harness provider matrix metadata in `scripts/qa/proof-harness.ts` and related proof scripts

Important behavior:

- PDF/DOCX text extraction is local
- local embeddings default to safe local/deterministic behavior
- Qdrant is optional; the app keeps working without it
- no-key resume/profile path is available
- scanned PDFs need OCR helper tools or manual paste recovery

Known limitation:

- full ESCO-lite taxonomy integration is not complete as a broad local dataset; skill normalization exists through current profile/scoring logic but not as a full ESCO-backed taxonomy module.

### Phase 3: ATS Scoring And Document Generation

Implemented:

- local composite ATS scorer in `src/lib/ats/scorer.ts`
- ATS text helpers in `src/lib/ats/text.ts`
- ATS-safe builder in `src/lib/ats/builder.ts`
- HackMyResume/FRESH compatibility metadata in `src/lib/ats/hackmyresume.ts`
- ATS report authority wired into `src/lib/services/documents/ats.ts`
- sidecar export wiring in `src/app/discover/document-actions.ts`
- ATS report UI in `src/components/ui/AtsReportBreakdown.tsx`
- Discover document panel compatibility in `src/app/discover/JobActionPanel.tsx`
- Phase 3 smoke in `scripts/qa/phase3-ats-smoke.ts`
- package script `npm run qa:ats`

Important behavior:

- ATS score is local and deterministic
- AI can add qualitative feedback only when a configured provider exists
- no AI provider is required for scoring
- generated resume outputs include DOCX/PDF plus sidecars:
  - plain text
  - JSON Resume
  - FRESH/HackMyResume-style JSON
  - manifest
- sidecars are stored with document metadata

Verification:

- `npm run qa:ats`
- `npm run typecheck -- --pretty false`
- `npm run build`

### Phase 4: Job Discovery, Local Search, Dream Match, And Coach RAG

Implemented:

- Meilisearch-compatible local search service:
  - `src/lib/search/client.ts`
  - `src/lib/search/local.ts`
  - `src/lib/search/types.ts`
  - `src/lib/search/index.ts`
- scoring-to-search-index integration in `src/lib/services/scoring/engine.ts`
- search integration in `src/lib/services/scoring/ai-search.ts`
- Discover keyword/dream-match UI in `src/app/discover/page.tsx`
- local job vector discovery in `src/lib/services/search/job-vector-discovery.ts`
- service export barrel in `src/lib/services/search/index.ts`
- model-agnostic Coach RAG engine in `src/lib/services/coach/rag-engine.ts`
- Coach action routing through RAG engine in `src/app/coach/coach-actions.ts`
- source-health taxonomy in `src/lib/services/scraping/failures.ts`
- source fallback propagation in `src/lib/services/scraping/adapters/base.ts`
- LinkedIn auth-gate fallback labels in `src/lib/services/scraping/adapters/linkedin.ts`
- Indeed blocked/gated RSS fallback labels in `src/lib/services/scraping/adapters/indeed.ts`
- Instahyre direct-URL-403 proof labels in `src/lib/services/scraping/adapters/instahyre.ts`
- PM role-family downranking/capping in `src/lib/services/scoring/engine.ts`
- Phase 4 smoke in `scripts/qa/phase4-local-smoke.ts`
- package script `npm run qa:phase4`

Important behavior:

- SQLite remains the source of truth
- Meilisearch is optional and local
- if Meilisearch is unavailable, search falls back to in-process local filtering
- Dream match uses local embeddings and can optionally use local Qdrant
- if Qdrant is unavailable, dream match uses deterministic in-memory cosine ranking
- Coach embeds the question locally, retrieves local evidence, then calls AIManager only if a provider is configured
- if no provider exists, Coach returns a cited local evidence summary

Verification:

- `npm run qa:phase4`
- `npm run qa:ats`
- `npm run typecheck -- --pretty false`
- `npm run build`
- route checks:
  - `/onboarding` returned 200
  - `/discover` returned 200
  - `/coach` returned 200

## Prompt Requirement Audit

Status key:

- Complete: implemented and verified in repo
- Partial: implemented in a narrower/local-first form
- Deferred: not implemented yet

| Original mandate area | Status | Notes |
| --- | --- | --- |
| 100% local-first app, no cloud except user-supplied AI keys | Complete | Native app uses local files/SQLite and optional local containers. AI calls require user config. |
| User can use OpenAI, Anthropic, Gemini, Groq, DeepSeek, OpenAI-compatible, Ollama | Complete | Provider catalog and AIManager support these. |
| Model-agnostic gateway with `generate`, retries, fallback, usage ledger | Complete | `src/lib/ai/manager.ts`; supports streaming through request flags. |
| Provider swap via env/settings | Complete | Settings/actions/config support provider selection. |
| Resume parsing with PDF/DOCX no AI | Complete | `pdf-parse` and `mammoth` paths exist. |
| Structured extraction with strict schema | Complete | `src/lib/ai/structured-extractor.ts`; schema validation through app pipeline. |
| Chunking and local embeddings | Complete | local keyword hash and Xenova fallback paths. |
| Qdrant vector store | Partial | Optional local Qdrant client exists for resume/job vectors; app works without it. |
| Clarification loop | Complete | Onboarding/profile pipeline supports clarification answers. |
| Offline skill taxonomy / ESCO-lite | Partial | Skills are normalized by existing logic, but no full ESCO-lite dataset module is complete. |
| Docker compose local stack | Complete | PostgreSQL, Redis, Meilisearch, Qdrant, MinIO, Browserless, Mailpit, Ollama profile. |
| Replace SQLite with PostgreSQL | Deferred | Docker includes Postgres, but native app source of truth is still SQLite. |
| Redis + BullMQ + Bull Board | Deferred | Redis is in Docker; BullMQ/Bull Board are not integrated. Current queue remains app-local. |
| better-auth multi-user auth | Deferred | Platform identity exists; better-auth is not integrated. |
| pino structured logging | Partial | Pino dependency/logger exists, but not every path is uniformly converted. |
| AdminJS dashboard | Deferred | Not implemented. |
| Flagsmith self-hosted | Deferred | Not implemented. |
| Umami self-hosted | Deferred | Not implemented. |
| HackMyResume integration | Partial | FRESH/HackMyResume-compatible sidecars exist; direct HackMyResume binary flow is not required yet. |
| open-resume / Reactive Resume template study | Partial | ATS-safe output/sidecars exist; no direct template import. |
| Keyword analyzer | Complete | Local keyword coverage/scoring exists through ATS and scoring services. |
| Job embeddings and dream job discovery | Complete | Local vector ranking and optional Qdrant implemented. |
| Composite ATS score | Complete | Keyword + semantic + section + grounding penalty score. |
| Tailored document generation | Complete | DOCX/PDF and sidecars are generated locally. |
| Meilisearch job index | Complete | Optional local Meili index with fallback. |
| Coach RAG | Complete | Local retrieval + AIManager + evidence-only fallback. |
| Ethical auto-apply browser extension | Deferred | Product idea remains future work. |
| Interview simulator | Deferred | Future work. |
| Career time machine | Deferred | Future work. |
| Local job market analytics | Partial | Analytics pages/services exist; full local market trend product not complete. |
| CV Battle Mode | Deferred | Future work. |
| Live-source proof for UX and HR candidates | Deferred | Prompt explicitly said these were not complete; they remain future proof work. |

## Verification Record From Latest Run

Commands that passed:

```bash
git diff --check
npm run typecheck -- --pretty false
npm run qa:phase4
npm run qa:ats
npm run build
npm run doctor
```

Phase 4 smoke result:

- job search fallback passed
- dream-job ranking fallback passed with `local_keyword_hash`
- Coach no-key local indexing passed
- blocked outbound fetches: none

Phase 3 ATS smoke result:

- composite scorer present
- ATS builder present
- sidecar files generated
- DOCX/PDF generated
- no cloud dependency

Doctor result:

- core checks passed
- Playwright Chromium works
- OCR helpers missing:
  - `pdftotext`
  - `pdfinfo`
  - `pdftoppm`
  - `tesseract`

Impact: scanned/image PDFs may require manual paste recovery until these local tools are installed.

## Current Local App State

Production server was started with:

```bash
npm run start -- --hostname 127.0.0.1 --port 3000
```

Routes checked:

- `http://127.0.0.1:3000/onboarding` -> 200
- `http://127.0.0.1:3000/discover` -> 200
- `http://127.0.0.1:3000/coach` -> 200

## Files Most Relevant To The Four Phases

AI:

- `src/lib/ai/manager.ts`
- `src/lib/ai/providers.ts`
- `src/lib/ai/structured-extractor.ts`
- `src/lib/ai/types.ts`
- `src/lib/ai/usage-ledger.ts`

Resume:

- `src/lib/services/resume-parser.ts`
- `src/lib/services/resume/pipeline.ts`
- `src/lib/services/resume/chunker.ts`
- `src/lib/services/resume/embeddings.ts`
- `src/lib/services/resume/vector-store.ts`

ATS/documents:

- `src/lib/ats/scorer.ts`
- `src/lib/ats/builder.ts`
- `src/lib/ats/hackmyresume.ts`
- `src/lib/services/documents/ats.ts`
- `src/app/discover/document-actions.ts`

Search/discovery:

- `src/lib/search/index.ts`
- `src/lib/search/client.ts`
- `src/lib/search/local.ts`
- `src/lib/services/search/job-vector-discovery.ts`
- `src/lib/services/scoring/engine.ts`
- `src/lib/services/scoring/ai-search.ts`
- `src/app/discover/page.tsx`

Coach:

- `src/lib/services/coach/rag-engine.ts`
- `src/app/coach/coach-actions.ts`
- `src/lib/services/coach/embedder.ts`
- `src/lib/services/coach/retriever.ts`
- `src/lib/services/coach/chunker.ts`

Source hardening:

- `src/lib/services/scraping/failures.ts`
- `src/lib/services/scraping/adapters/base.ts`
- `src/lib/services/scraping/adapters/linkedin.ts`
- `src/lib/services/scraping/adapters/indeed.ts`
- `src/lib/services/scraping/adapters/instahyre.ts`

Install/local stack:

- `README.md`
- `setup.sh`
- `setup.ps1`
- `docker-compose.yml`
- `scripts/bootstrap.mjs`
- `scripts/launch.mjs`
- `scripts/doctor.mjs`

QA:

- `scripts/qa/phase3-ats-smoke.ts`
- `scripts/qa/phase4-local-smoke.ts`
- `scripts/qa/proof-harness.ts`
- `scripts/final-proof-run.ts`

## Instructions For The Next LLM

Do not claim the entire original mega-prompt is fully implemented. The core four-phase local-first product path is implemented and verified, but the following remain explicit follow-up tasks:

1. Decide whether PostgreSQL should truly replace SQLite for native single-command installs. If yes, implement a real Drizzle PostgreSQL migration and prove install/run on macOS and Windows.
2. Add BullMQ/Bull Board only if persistent background queues are required beyond the current local queue.
3. Add better-auth only if true multi-user login is required; current local-first default-user identity is simpler.
4. Add AdminJS, Flagsmith, and Umami only if the local admin/analytics surface justifies the extra containers and UX complexity.
5. Complete ESCO-lite taxonomy integration as a real local JSON dataset and normalization service.
6. Complete live-source market proof for UX and HR candidates.
7. Build future product features separately:
   - Ethical Auto-Apply extension
   - Interview Simulator
   - Career Time Machine
   - CV Battle Mode
   - richer local job-market analytics
8. Keep the no-key path sacred: no cloud calls, no auto-downloads of large models, and no blocked onboarding.
9. Keep source failures honest: auth-gated/blocked public job boards should surface fallback guidance, not fake success.
10. Keep AI advisory: generated content should never invent experience, credentials, salary, applications, or outreach history.

## Safe Continuation Prompt

Use this prompt if another model continues the work:

```text
You are continuing Career Seek after Phase 1-4 implementation.
Core local-first, model-agnostic workflows are implemented and verified.
Read docs/LLM_PHASE_1_TO_4_HANDOFF.md first.
Do not redo completed AIManager, resume, ATS, local search, dream-match, or Coach RAG work.
Focus only on explicit deferred items, starting with a product decision: should Career Seek remain native SQLite-first, or should PostgreSQL become mandatory?
Maintain the constraints: no cloud services except user-supplied AI provider keys; no-key onboarding must work; local deterministic fallback must remain available.
```
