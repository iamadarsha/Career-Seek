# Career Seek Critical Hardening Design

Approved in sections on 2026-04-24.

## Goal

Harden Career Seek's first high-risk surface area without replacing the app shell or doing a full visual redesign.

The intact user flow remains:

Gemini key -> resume upload -> resume analysis -> clarification -> preferences -> scan -> ranked dashboard -> fit/doc/outreach actions -> apply -> pipeline tracking.

This pass focuses on:

- Scraper trust, scan accounting, and source diagnostics.
- Privacy-safe scraping logs.
- Mobile navigation and accessibility basics.
- Recoverable async states for scan, scoring, and document actions.

## Non-Goals

- No app-shell replacement.
- No full dashboard redesign.
- No direct execution of newly cloned third-party scraper code.
- No broad rebrand or theme replacement.
- No authenticated scraping or credentialed portal automation.

## Approach

Use a stabilization sprint rather than a full product polish pass.

This is the recommended first pass because the subagent audits found P1/P2 correctness risks in scraping and scan persistence, plus mobile/accessibility issues that can block normal usage. A UX-first pass would leave data-integrity risks alive. A full redesign would have too much blast radius for the current dirty worktree.

## Reliability And Data Integrity

### Scraper Link Trust

`BasePortalAdapter.extractJobLinksFromPage` should accept stricter source options:

- Allowed hostnames or hostname suffixes.
- Optional disallowed hostnames.
- Required URL path patterns for broad configured sources.
- Rejection of redirect/search/tracking links where the real destination is not a job page.
- Rejection of generic nav titles, careers landing pages, policy links, and unsupported domains.
- A small job-shape validator that checks title, URL, and nearby text before persistence.

Configured adapters should stop relying on broad tokens like `/jobs/`, `/job/`, `shine.com`, or `recruitment` without host allowlists.

### Scan Accounting

The scan total should reflect persisted unique normalized jobs, not raw scraped rows.

Portal runs may still keep raw discovered count and duplicate count if fields exist, but the top-level `scans.totalJobs` should match what the dashboard can actually use.

### Naukri Mapping

Fix Naukri placeholder extraction so fallback fields use placeholder values before labels. The app must not persist `location`, `salary`, or `experience` as actual values when the API row contains a value.

### Unknown Source Diagnostics

Unknown or stale selected sources should produce failed `scan_portal_runs` with a useful error. They should not disappear during source-ladder ordering.

If every selected source is invalid, the scan should finish as failed with explicit invalid-source diagnostics and `failedPortals` greater than zero.

### Privacy-Safe Logs

Raw third-party payloads and failure snapshots should be opt-in or redacted by default.

Minimum behavior:

- Redact likely emails, phone numbers, query tokens, auth-like values, and very long page bodies.
- Cap snapshot size.
- Avoid full HTML snapshots unless an explicit debug flag is enabled.
- Keep enough metadata to debug source failure: source, code, URL host/path, timestamp, and short text excerpt.

## Mobile UX And Accessibility

### Mobile Navigation

Authenticated pages need persistent mobile navigation.

Preferred first-pass design:

- Desktop keeps the current sidebar.
- Mobile gets a fixed bottom nav with core routes: Today, Discover, Pipeline, Documents, Coach, Settings.
- Touch targets are at least 44px.
- Active route is visually and semantically clear.
- Page content gets bottom padding so the nav does not cover CTAs.

### Form And Icon Accessibility

Add accessible names to high-use controls:

- Onboarding API key input.
- Discover search, sort, portal, tier, and action controls.
- Pipeline search/filter controls.
- Icon-only buttons in Pipeline and job cards.
- Modal close buttons and menu/status controls.

Use visible labels where placeholders carry meaning. Use `aria-label` only when visible text would be redundant.

### Dialog Semantics

Modal-like surfaces should become semantic dialogs:

- `role="dialog"`.
- `aria-modal="true"`.
- A labelled heading.
- Escape and close-button support where practical.
- Focus return to the trigger where practical.

This applies first to job-card detail/generation modal and pipeline add-job modal.

### Async Recovery

Scan, score, and document-generation actions should use guaranteed cleanup:

- `try/finally` for loading states.
- Inline recoverable error text.
- Buttons disabled only while their own action is active.
- No stuck "loading" state after rejected server actions.

### Pipeline Mobile Layout

Small screens should use stacked/list cards first. The horizontal Kanban board can remain for tablet/desktop.

Pipeline list items should avoid fixed-width desktop row assumptions on mobile and preserve job title/company/status clarity.

## Design Direction

The visual direction is a restrained career operations console:

- Compact, readable, work-focused.
- Strong status chips and source-health signals.
- Fewer oversized hero moments.
- Clear next actions.
- No full theme replacement in this pass.

This pass may slightly reduce excessive heading tightness or add spacing needed for mobile nav, but larger visual-system unification belongs in a later spec.

## Tests And Validation

Add a minimal test script if the repo still lacks one.

Targeted tests:

1. Adapter fallback safety: malicious/irrelevant anchors containing broad job tokens are rejected unless they match allowed host and job-shape rules.
2. Scan accounting: duplicate raw jobs do not inflate persisted scan totals.
3. Naukri fixture mapping: placeholder values populate location/salary/experience correctly.
4. Source selection: unknown sources create failed portal-run diagnostics.
5. Privacy logging: snapshots and raw payload logs are redacted or disabled by default.

Manual validation:

- `npm run typecheck`.
- New test command.
- Desktop and mobile browser smoke checks for Today, Discover, Pipeline, Documents, and job card actions.
- Keyboard Tab/Escape smoke check for dialogs and primary CTAs.
- Limited scan where Wellfound/Indeed or Google fail but other sources continue.

## Acceptance Criteria

- The app still follows the existing onboarding -> preferences -> scan -> dashboard flow.
- No broad fallback adapter can persist arbitrary wrong-domain links as jobs.
- Scan total jobs match persisted unique jobs.
- Unknown selected sources are visible as failed source runs.
- Naukri API fallback does not persist placeholder labels as values.
- Scraping debug artifacts are redacted or gated.
- Mobile users can navigate between core app pages after onboarding.
- High-use controls have accessible names.
- Modal-like surfaces are announced as dialogs.
- Async actions reset loading state on failure.
- Typecheck and targeted hardening tests pass.
