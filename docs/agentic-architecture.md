# Agentic Architecture Review

Date: 2026-04-30

## Decision

Do not integrate `google/agents-cli` into Career Seek's runtime at this stage.

Career Seek already has the useful agentic pieces for the current product shape: local Gemini calls, deterministic fallbacks, local SQLite persistence, background jobs, local RAG chunks, retrieval scopes, grounded coach answers, confidence/caveat handling, and source provenance. `agents-cli` is valuable as a reference for ADK project lifecycle, evaluation discipline, deployment, and observability, but using it directly would add a parallel Python/ADK project and Google Cloud deployment assumptions that do not match this local-first Next.js app.

## What Was Inspected

`google/agents-cli` was cloned to a temporary directory and inspected at commit `9e2966f509ae8ee8a866cf7ecc6e227209f347ff` from 2026-04-29.

Key findings:

- The repository is mostly documentation and coding-agent skills. The README states the CLI implementation is distributed as a pre-built wheel, not as ordinary source in the GitHub repo.
- Current docs describe `agents-cli` as a CLI and skill bundle for building, evaluating, deploying, publishing, and observing ADK agents on Google Cloud / Gemini Enterprise Agent Platform.
- Templates include ADK, A2A, and agentic RAG project shapes. These are oriented around standalone agent projects, ADK evals, Cloud Run / Agent Runtime / GKE, Terraform, and Google Cloud auth.
- The installed local CLI is version `0.1.1`; the cloned repo documents `0.1.2`. Running `agents-cli info` in Career Seek reported no agent project found, which is expected because this repo is not an ADK scaffold.

## Existing Career Seek Agent Surface

Current local implementation:

- `src/lib/services/coach/chunker.ts` builds local chunks from profile, resume, jobs, JD analysis, generated documents, search preferences, and application history.
- `src/lib/services/coach/embedder.ts` stores Gemini embeddings in SQLite as JSON arrays and records index runs.
- `src/lib/services/coach/retriever.ts` filters by profile, selected job, retrieval scope, current profile/resume, and relevance score.
- `src/lib/services/coach/answer.ts` performs grounded answer generation with strict JSON output, confidence levels, caveats, and source references.
- `src/lib/services/coach/persistence.ts` stores coach threads, messages, and message-source provenance.
- `src/db/schema.ts` already has document chunks, index runs, coach messages, message sources, background jobs, and AI request logs.

This is enough for the current user-facing coach. The main gaps are proof and hardening, not missing agent framework surface.

## Recommendation

Keep Career Seek's coach as an in-process local service. Do not scaffold `agents-cli enhance .`, do not add an ADK sidecar, and do not move RAG to Agent Platform Search or Vector Search unless the product direction changes to cloud-hosted multi-user agents.

Use `agents-cli` ideas selectively:

- Adopt the eval habit, but implement it in the existing TypeScript/Next stack first. For example, create a small fixture-based coach evaluation harness that checks groundedness, cited sources, low-confidence behavior, and no action claims without persistence.
- Keep prompts, retrieval, and persistence close to the current domain services. This avoids cross-runtime coupling and preserves the local-first privacy boundary.
- Revisit ADK / `agents-cli` only if Career Seek needs an externally callable agent service, A2A interoperability, Gemini Enterprise publication, managed Cloud Trace/BigQuery agent telemetry, or Google-managed RAG infrastructure.

## Non-Recommendations

- Do not add `agents-cli` as an app dependency. It is a developer/project lifecycle CLI, not a runtime library for this app.
- Do not create a separate custom agent/RAG architecture now. It would duplicate the local coach and increase operational risk.
- Do not introduce Google Cloud Agent Runtime, Cloud Run, GKE, Terraform, or Agent Platform Search for the current local-first desktop-style workflow.

## Minimal Future Integration Path

If the product later needs agent framework integration, use a separate proof branch or temporary scaffold:

1. Create a standalone prototype outside the app repo with `agents-cli scaffold create career-coach-agent --agent adk --prototype`.
2. Define a narrow adapter boundary to Career Seek data, ideally through read-only exported fixtures or explicit API endpoints.
3. Add evals before any product wiring.
4. Only then decide whether to embed, sidecar, or deploy it.

Until that threshold is met, the concrete local integration is this architecture decision record.
