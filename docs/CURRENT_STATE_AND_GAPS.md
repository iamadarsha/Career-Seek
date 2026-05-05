# Current State And Gaps

## Executive verdict

The app is substantially built but not yet fully proven end to end. The core product shape exists in code: onboarding, resume parsing, provider-assisted or deterministic resume analysis, search preferences, multi-source scanning, ranking, job actions, generated documents, application tracking, AI Coach, analytics pages, local storage, and environment checks. It is not complete because the clean-state real-user path from provider selection through uploaded resume, live scan, populated dashboard, generated assets, and restart recovery has not been fully proven with current data and current external-source behavior.

Capability classification:

- Onboarding: Built but partially proven.
- Provider validation: Built first for Gemini and expanded through the provider-neutral manager; full real-key proof still depends on whichever user key or local model is configured.
- Resume parsing: Built and partially proven.
- OCR fallback: Built but environment-dependent.
- Clarification flow: Built but partially proven.
- Profile review: Built but partially proven.
- Search preferences: Built but partially proven.
- Scan orchestration: Built and proven with validation sources; live-source behavior remains fragile.
- Portal scraping: Built but operationally fragile.
- Official company career pages: Built but partially proven.
- ATS-family extraction: Built but incomplete for several ATS families.
- Google Jobs discovery: Built but fallback-only after live `auth_gate`.
- Ranking: Built and route/code validated; full live dashboard proof remains incomplete.
- ATS scoring: Built as advisory/local/provider-assisted scoring; not employer-certified.
- Save / Applied tracking: Built and proven in fixture path; needs fresh-state manual proof with live jobs.
- Generated documents: Built and fixture-proven; not fully proven in a clean real-user run.
- AI Coach: Built but useful model-backed answers depend on an exercised provider or local model plus indexed local data.
- RAG grounding: Built but needs populated-data proof.
- Analytics: Built but data-dependent and mostly route-validated.
- Automation: Built but partially proven and needs durability hardening.
- Notifications: Built but not fully end-to-end proven.
- Background worker: Built but operationally dependent on `npm run launch` or worker process.
- Restart recovery: Partially proven with isolated queue proof; still a completion blocker for broader durability.
- Profile scoping / identity: Implemented in many paths, but needs broader multi-profile/security review.
- Doctor / environment checks: Built and validated; safe modes need stricter capability gating.

## What is clearly built

- Mandatory onboarding exists, and incomplete setup redirects users to `/onboarding`.
- The onboarding state machine includes `welcome`, `api_key`, `resume`, `analysis`, `clarification`, `review`, `preferences`, `scan`, and `dashboard`.
- Provider setup is now conceptually provider-neutral, while legacy Gemini validation still exposes user-facing categories for `missing`, `invalid`, `timeout`, `quota/rate limit`, `connectivity`, and `unknown`.
- Resume upload supports PDF and DOCX.
- Resume parse metadata tracks scanned/image-based PDFs, low text density, weak date extraction, two-column/table-like order, and corrupted glyphs.
- Clarification answers are persisted in resume parse metadata and can be applied to the profile.
- Profile review/edit and search preferences exist in the onboarding flow.
- Search preferences include role/title selection and custom role input.
- Current scanning sources include LinkedIn, Naukri, Wellfound, Foundit, Indeed India, Instahyre, and curated official company career pages.
- `ScanOrchestrator` runs each source independently.
- Source failures are recorded per source in scan portal runs.
- Jobs are deduplicated by URL, external ID, and title/company/location signature.
- Scans can be marked `partial` when useful jobs exist despite some source failures.
- Ranking evaluates title fit, skill overlap, experience fit, work-mode fit, include/exclude keywords, positive factors, negative factors, and warnings.
- Save and Applied write to the canonical `applications` workflow rather than only loose UI state.
- Generated document assets are versioned and persisted.
- Download access is restricted through owned document assets and local app-data paths.
- AI Coach persistence exists through local coach threads, messages, and message sources.
- Analytics services and pages exist for funnels, source performance, documents, timing, insights, experiments, and weekly review.
- The app persists local data under `JOBHUNT_DATA_DIR` when set, otherwise under `~/.jobhunt-india`.
- `npm run build`, `npm run typecheck`, and `npm run doctor` passed in validation.
- Production route validation returned `200` for `/`, `/pipeline`, `/discover`, `/coach`, `/notifications`, `/analytics`, `/today`, `/settings`, `/settings/automation`, `/documents`, `/applied`, and `/saved`.

## What is built but not fully proven

- The full onboarding path is implemented, but the complete fresh-state path across no-key, Ollama/local, and configured-provider modes has not been manually proven from clean state.
- Profile extraction, job brief generation, resume generation, cover letter generation, outreach generation, and ATS checks exist, but older runtime paths still need full migration away from direct Gemini service assumptions.
- A historical proof run showed a real Gemini key validating and generating fixture-based assets, but that proof used controlled proof data and should not be treated as current proof of the full fresh real-user journey. Phase 2 QA reports now preserve legacy Gemini fields only as compatibility evidence.
- Resume parsing was fixture-proven for clean DOCX, ambiguous PDF warnings, and scanned PDF recovery routing, but OCR quality was not proven as a reliable end-to-end capability across local machines.
- The populated dashboard was observed in a proof run with validation data, but the original validation did not prove a clean live onboarding-to-populated-dashboard path.
- Brief, Resume, Cover Letter, and Connect actions are wired and fixture-proven, but they still need a clean real-profile, real-scan, selected-live-job proof.
- Save and Applied persisted in validation proof, but they still need repeat validation against a clean current app state and live-source job set.
- AI Coach indexing, retrieval, grounded answer generation, and persistence are implemented, but useful model-backed results depend on populated local materials and an exercised provider or local model.
- Analytics routes and services are implemented, but meaningful analytics depend on accumulated scan, document, and application data.
- Background task recovery has isolated proof, but broader restart behavior across scans, document jobs, workers, and UI refresh states remains partially proven.
- Source universe seed files and source registry seeding exist, but complete live coverage across all role families and source families has not been proven.

## What is partial or fragile

- Live portal scraping is fragile because LinkedIn, Naukri, Wellfound, Foundit, Indeed India, Instahyre, and similar sources can change markup, block browser automation, rate limit requests, or require authentication.
- Official company career pages are supported as conservative employer-attributed leads; they are not universally structured ATS feeds.
- Greenhouse, Lever, and Ashby have stronger structured extraction paths than some other ATS families.
- Workday, BambooHR, Rippling, iCIMS, and SuccessFactors may be classified and browser-fallback supported, but not all have structured public extractors.
- Google Jobs discovery hit an `auth_gate` in live testing and should be treated as fallback-only.
- OCR fallback depends on local tools such as Poppler and Tesseract, plus source document quality.
- `doctor.mjs` checks important dependencies, but safe-mode behavior needs to be more capability-driven across browser scraping, OCR, selected AI provider, local model availability, embeddings, and storage.
- The background worker must be running for worker-backed jobs; route validation alone does not prove the full worker lifecycle.
- Restart recovery exists but is still an operational risk until proven against realistic interrupted user workflows.
- Profile scoping and identity are present in many service queries, but full profile isolation and multi-profile edge cases have not been exhaustively audited.
- Old proof files, generated assets, and local state may still exist; they were not deleted because deletion requires explicit approval.
- `npm audit` still reports 9 non-critical vulnerabilities that require a dedicated major-version upgrade pass.

## What is still missing

- A clean-state manual proof across the provider matrix: no-key deterministic mode, Ollama/local mode when available, and at least one configured cloud provider with current resume upload, clarification, preferences, live scan, populated dashboard, generated assets, Save, Applied, Pipeline, Documents, and AI Coach.
- Structured extractors or tested public endpoint strategies for Workday, BambooHR, Rippling, iCIMS, and SuccessFactors where stable public endpoints exist.
- A clear capability-driven safe-mode system that disables or labels unavailable browser scraping, OCR, selected AI provider, Ollama/local model, embeddings, and worker capabilities.
- Stronger persistent background task recovery for interrupted scans, document generation, and worker restarts.
- A complete operational proof that stuck scans cannot leave the UI or database in an ambiguous state.
- A dedicated major-version dependency upgrade pass to address remaining `npm audit` findings.
- A fresh verification pass proving that old proof data does not contaminate current dashboard, document, or profile behavior.
- Clear user-facing language that ATS scoring is advisory only, if not already visible everywhere the score appears.
- Broader live-source validation across multiple role families, locations, and source categories.

## Evidence reviewed

Current source-of-truth docs reviewed:

- `docs/FINAL_RELEASE_STATUS.md`
- `docs/HISTORY_AND_DECISIONS.md`
- `docs/PRODUCT_FLOW.md`
- `docs/ONBOARDING_AND_PROFILE.md`
- `docs/JOB_DISCOVERY_AND_RANKING.md`
- `docs/APPLICATIONS_AND_DOCUMENTS.md`
- `docs/AI_COACH_AND_RAG.md`
- `docs/ANALYTICS_AUTOMATION_AND_INTEGRATIONS.md`
- `docs/ARCHITECTURE_AND_DATA.md`
- `docs/LOCAL_RUNBOOK.md`

Historical docs reviewed as supporting evidence only:

- `archived-docs/2026-04-24-docs-consolidation/docs/FINAL_VALIDATION.md`
- `archived-docs/2026-04-24-docs-consolidation/docs/FINAL_PROOF_RUN.md`
- `archived-docs/2026-04-24-docs-consolidation/docs/FINAL_LOCAL_RUN_STATUS.md`
- `archived-docs/2026-04-24-docs-consolidation/docs/REAL_GEMINI_VALIDATION.md`
- `archived-docs/2026-04-24-docs-consolidation/docs/SOURCE_HEALTH_AND_FAILURES.md`
- `archived-docs/2026-04-24-docs-consolidation/docs/TASK_QUEUE_RECOVERY.md`
- `archived-docs/2026-04-24-docs-consolidation/docs/SCRAPING_HARDENING_REPORT.md`
- `archived-docs/2026-04-24-docs-consolidation/docs/FRESH_FIRST_RUN_PROOF.md`

Relevant code areas reviewed:

- `src/components/OnboardingFlow.tsx`
- `src/app/actions.ts`
- `src/lib/config.ts`
- `src/lib/services/gemini.ts`
- `src/lib/services/resume-parser.ts`
- `src/lib/services/scraping/orchestrator.ts`
- `src/lib/services/scraping/deduplicator.ts`
- `src/lib/services/scraping/failures.ts`
- `src/lib/services/scraping/browser-manager.ts`
- `src/lib/services/scraping/adapters/*`
- `src/lib/services/scoring/engine.ts`
- `src/app/discover/document-actions.ts`
- `src/app/api/download/route.ts`
- `src/lib/services/documents/*`
- `src/lib/services/crm/*`
- `src/app/coach/coach-actions.ts`
- `src/lib/services/coach/*`
- `src/app/analytics/analytics-actions.ts`
- `src/lib/services/analytics/*`
- `scripts/doctor.mjs`
- `scripts/job-worker.ts`
- `src/lib/jobs/service.ts`
- `src/lib/jobs/handlers/scan-handler.ts`

Validation evidence reviewed:

- `npm run build` passed.
- `npm run typecheck` passed, with the note that it should run after build because build regenerates `.next/types`.
- `npm run doctor` passed after environment repair.
- `better-sqlite3` required rebuild after a Node ABI mismatch.
- One validated launch served on `localhost:3002` because `3000` and `3001` were occupied.
- One production-style route validation served on `localhost:3000`.
- Key routes returned `200`.
- Isolated proof data showed partial scan behavior, source failure persistence, fixture document generation, Save/Applied persistence, and queue recovery behavior.

## End-to-end proof status

Static validation:

- Status: Built and proven.
- Evidence: `npm run build`, `npm run typecheck`, and `npm run doctor` passed.
- Caveat: `typecheck` should run after build because `.next/types` are regenerated by build.

Route validation:

- Status: Route-verified.
- Evidence: key routes returned `200` in production-style route validation.
- Caveat: route `200` does not prove full business behavior on each page.

Onboarding proof:

- Status: Built but partially proven.
- Evidence: incomplete onboarding redirects to `/onboarding`; onboarding stages and actions are implemented; first-run route gating was validated.
- Caveat: full clean-state manual onboarding with no-key deterministic mode, Ollama/local mode, and a configured provider was not proven through populated dashboard.

Scan proof:

- Status: Built and partially proven.
- Evidence: isolated validation sources showed `complete` and `partial` scan states with failure records.
- Caveat: live portal scraping remains source-dependent and was not proven across all listed sources.

Populated dashboard proof:

- Status: Simulated/fixture-proven, not fully fresh-state proven.
- Evidence: proof run observed a populated dashboard with validation data and visible CTAs.
- Caveat: the original validation did not prove a full fresh live onboarding-to-populated-dashboard run from clean state.

Document generation proof:

- Status: Built and fixture-proven.
- Evidence: proof run generated resume, cover letter, outreach/connect note, and persisted document assets.
- Caveat: full real-key, real-job, clean-profile generation path still requires fresh manual proof.

AI/provider proof:

- Status: Built but environment- and data-dependent.
- Evidence: historical real-key validation showed Gemini key validation and fixture-based AI generation; Phase 2 proof scripts now emit provider-matrix metadata for deterministic, Ollama/local, Gemini, OpenAI, Anthropic, Groq, DeepSeek, and OpenAI-compatible modes; AI Coach code supports retrieval and grounded answer persistence.
- Caveat: AI Coach quality depends on populated indexed materials and an exercised provider/local model. Provider detection in QA reports is not the same as a live provider call.

Recovery/restart proof:

- Status: Partially proven.
- Evidence: isolated queue proof showed running jobs detected, retrying state, failed orphaned scan, and successful retry.
- Caveat: broader recovery for realistic interrupted scans, document jobs, browser failures, and UI refresh behavior remains a blocker.

## Environment readiness

Hard requirements:

- Node.js, preferably Node 20 LTS.
- npm dependencies installed with `npm install`.
- SQLite native binding through `better-sqlite3`.
- Local data directory, either `JOBHUNT_DATA_DIR` or default `~/.jobhunt-india`.
- Database initialization and schema push.
- Optional configured AI provider key or local Ollama model for real model-backed analysis, document generation, and AI Coach behavior. The no-key deterministic path should remain available for setup and QA.

Validated commands:

- `npm run build`
- `npm run typecheck`
- `npm run doctor`
- `npm run db:init`
- `npm run db:push:direct`
- `npm run k1:migrate`
- `npm run source:seed`
- `npm run launch` in a validation run

Run notes:

- One validation served at `http://localhost:3002` because ports `3000` and `3001` were occupied.
- One production-style route validation served at `http://localhost:3000`.
- Actual port depends on availability.
- `better-sqlite3` needed rebuild after a Node ABI mismatch.

Doctor checks:

- Node version.
- dependency install status.
- `better-sqlite3` native binding.
- Playwright browser availability.
- local folder presence.
- SQLite DB path.
- required scripts.
- source seed command availability.
- OCR helper availability for scanned PDF workflows.

Degraded optional capabilities:

- Browser scraping should degrade when Playwright or Chrome is unavailable.
- OCR should route to manual recovery when OCR tools are missing or extraction confidence is low.
- Provider-dependent flows should stop, fall back to Ollama/local mode where supported, or use deterministic fallback where available when the selected provider is missing, invalid, or unavailable.
- Analytics pages can load with empty states when no local data exists.

Environment-sensitive areas:

- Live scraping depends on network, browser install, source markup, and anti-bot behavior.
- OCR depends on installed local OCR tools and document quality.
- Worker-backed processing depends on the background worker being started.
- Local state can affect what appears in the dashboard unless a clean `JOBHUNT_DATA_DIR` is used.

## Current blockers

- No current clean-state manual proof from provider selection through populated dashboard and all major job actions across the full provider matrix.
- Live scraping is not reliable enough to support a complete claim without source-by-source fallback expectations and user-visible failure states.
- Google Jobs discovery hit `auth_gate` and cannot be treated as a dependable primary source.
- Several ATS families are classified but do not yet have complete structured public extractors.
- Background task restart recovery is only partially proven and remains an operational risk.
- OCR behavior is not fully proven across local environments.
- Real configured-provider paths require a valid user key or local model and cannot be fully validated without one. No-key deterministic proof is available but lower fidelity.
- Old proof/local data may still exist and may affect manual validation unless a clean data directory is used.
- Remaining `npm audit` findings require a major-version upgrade pass.

## Recommended next actions

1. Run clean-state manual proofs with a new `JOBHUNT_DATA_DIR` for no-key deterministic mode, Ollama/local mode when available, and at least one configured cloud provider.
2. Record proof artifacts for onboarding state, parse metadata, provider matrix, provider validation category where exercised, scan source runs, dashboard cards, generated assets, downloads, Save, Applied, Pipeline, Documents, and AI Coach answers.
3. Harden background task recovery for interrupted scans and document jobs, then repeat restart testing with realistic worker interruption.
4. Make `doctor.mjs` enforce capability-driven safe modes for browser scraping, OCR, selected provider, Ollama/local model, embeddings, local storage, and worker availability.
5. Add or clearly defer structured extractors for Workday, BambooHR, Rippling, iCIMS, and SuccessFactors.
6. Add user-visible labels wherever ATS score appears stating it is a local advisory estimate, not employer-certified.
7. Run live-source validation across representative role families: product, engineering, design, sales, operations, education, healthcare, and freshers.
8. Run a dependency upgrade branch to address the remaining `npm audit` findings.
9. Verify clean profile scoping and local data isolation, especially after proof files or old generated assets exist.
10. Update this document after each proof pass with exact evidence and remaining caveats.

## Definition of complete

The app can honestly be described as complete only after all of the following are true:

- Fresh `JOBHUNT_DATA_DIR` runs prove onboarding from `/onboarding` through dashboard in no-key deterministic mode, Ollama/local mode when available, and at least one configured-provider mode with a real uploaded resume.
- Resume parsing, clarification, profile review/edit, and search preferences are proven in the browser with persisted state.
- At least one scan returns useful jobs while at least one failing source records an honest failure without breaking the scan.
- Live-source behavior is documented per source with expected failure modes and fallback behavior.
- Dashboard cards are populated and all major CTAs are manually tested: Apply, Save, Applied, Brief, Resume, Cover Letter, Connect.
- Generated resume, cover letter, outreach note, ATS report, and downloads are validated against the current profile and selected job.
- Pipeline, Saved, Applied, Documents, Notifications, and Analytics remain consistent after the job actions.
- AI Coach answers are proven with indexed local materials, cited sources, and honest low-confidence behavior when evidence is missing.
- Background worker restart recovery is proven for interrupted scans and document jobs.
- Browser unavailable mode, OCR unavailable mode, missing/invalid provider mode, Ollama unavailable mode, and source-blocked mode are all tested and user-visible.
- Old proof data is either isolated from the proof run through a clean data directory or explicitly retained and documented.
- Dependency audit findings are either fixed or formally accepted with documented risk.

## Final conclusion

Verdict: MOSTLY BUILT BUT NOT COMPLETE

Why:
- The main product surfaces and service layers are implemented, and static plus route validation passed.
- Important end-to-end behavior is proven only with fixtures, historical proof data, or route checks, not a current clean real-user run.
- External dependencies remain fragile: configured provider availability, local model availability, browser scraping, Google auth gates, OCR tooling, and worker recovery.

Must-finish before calling it complete:
- Run and record clean-state onboarding-to-populated-dashboard proofs across no-key deterministic mode, Ollama/local mode when available, and at least one configured cloud provider.
- Prove live scan resilience and dashboard/job-action behavior with current sources and a real uploaded resume.
- Harden and prove background task restart recovery for scans and document jobs.
- Finish or explicitly defer structured extractor coverage for the remaining ATS families.
