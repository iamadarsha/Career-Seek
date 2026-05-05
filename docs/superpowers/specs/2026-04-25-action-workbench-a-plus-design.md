# Career Seek Action Workbench A+ Design

**Date**: 2026-04-25
**Status**: Draft approved for spec review
**Primary goal**: Raise the design/UX scorecard from B-/C+ to A+ for desktop web usage while keeping mobile screens non-broken.

## Context

Career Seek is primarily a desktop web app for job seekers who want a local-first AI command center for scanning jobs, ranking fit, generating tailored documents, asking an AI coach, and tracking applications.

The latest design and UX audit scored the product:

| Area | Current Score | Target |
|---|---:|---:|
| Frontend design | 76/100 | 92+ |
| UX walkthrough | 68/100 | 90+ |
| Combined product experience | 72/100 | 92+ |

The audit found a strong desktop foundation but several score blockers:

- The dashboard delays the first actionable job below the fold.
- Desktop screens are polished but too soft, broad, and card-heavy for repeated operational use.
- Discover leads with source diagnostics instead of ranked jobs.
- AI Coach clips badly on mobile and has unlabeled controls.
- Loading states often appear as full-screen spinners instead of shaped skeletons.
- Pipeline manual job entry can lose partially typed drafts after navigation.
- Mobile is not the primary surface, but must not show broken layouts.

## Decision

Adopt the **Action Workbench** approach.

This is a desktop-first redesign that makes the first screen answer: **"What should I do next for my job search?"**

The app should feel like a sharp job-search command center:

- Action first.
- Evidence nearby.
- Diagnostics secondary.
- AI assistance contextual.
- Mobile baseline intact but not optimized as the primary experience.

## Scope

### In Scope

- Rework the dashboard into a desktop action workbench.
- Make the top job and next action visible above the fold on desktop.
- Add a right support rail for readiness, AI Coach entry points, source health, and recent document state.
- Make Discover job-first, with source health collapsed or demoted to diagnostics.
- Fix AI Coach responsive behavior so mobile uses a single-pane fallback.
- Add accessible names and labels to Coach and automation controls.
- Replace blank/full-page spinners with route-specific skeleton loading states.
- Improve Pipeline empty states, layout stability, and manual job draft safety.
- Preserve existing backend services, server actions, database schema, and AI workflows unless a UI fix requires a small state-shape change.
- Re-audit after implementation against the scorecard below.

### Out of Scope

- Full mobile redesign.
- New scraping sources or scoring algorithms.
- New AI model behavior beyond clearer UI state, context handoff, and evidence framing.
- Major database migrations.
- Command palette or keyboard-first power user system.
- Brand overhaul.

## Experience Architecture

### App Shell

The desktop sidebar remains the primary navigation model. It should continue to support fast route switching for daily desktop use.

The top header remains compact. It should not compete with the page-level action area.

Mobile needs a baseline navigation escape hatch, such as a compact menu or bottom navigation, because the desktop sidebar is hidden below large breakpoints. This is a baseline usability fix, not a full mobile product redesign.

### Today Dashboard

The dashboard becomes the **Action Workbench**.

The first desktop viewport should contain:

- A compact top action strip.
- The best current job action.
- Compact health/stats signals.
- The start of the ranked job queue.
- A right support rail.

The first ranked job should not begin below the fold on a normal desktop viewport.

The hero language should be reduced from a large introductory panel into a concise operational header. Once onboarding is complete, users do not need a landing-page sized explanation on every visit.

### Right Support Rail

The right rail should keep supporting context available without pushing jobs down:

- AI Coach starter for the selected or top job.
- Application readiness checklist: brief, resume, cover letter, applied status.
- Source health summary collapsed by default.
- Recent generated documents or downloads.

The rail should not become a second dashboard full of unrelated cards. It exists to support the selected/top job action.

### Discover

Discover becomes the expanded ranked-search workspace.

It should lead with ranked jobs and filtering controls. Source health remains available but should move into a diagnostics section or collapsible panel.

The page should answer:

- "What jobs did we find?"
- "Which ones are worth reviewing?"
- "Why are some sources missing?"

In that order.

### AI Coach

AI Coach remains an evidence assistant.

On desktop:

- Thread list and chat can coexist.
- Job selector and retrieval scope controls remain visible.
- Evidence/source cards stay close to answers.

On mobile:

- Use a single-pane chat layout.
- Move threads into a drawer or toggled panel.
- Keep scope controls horizontally scrollable or collapsed.
- No clipped warning cards, composer, or chat content.

When Coach is opened from a job, it should inherit that job context and suggest job-specific prompts such as:

- "What are my weak points for this job?"
- "What should I emphasize in interviews?"
- "Which missing requirements matter most?"

### Pipeline

Pipeline remains the CRM.

The board/list model should stay, but the implementation should:

- Reduce layout shift in the board area.
- Preserve or warn on partially typed manual job drafts.
- Improve empty states with a clear next action.
- Keep the Track Job flow clear, labelled, and recoverable.

## UI System Direction

The current visual system is calm and coherent, but too broad and soft for repeated job-search operations.

The A+ design should become:

- Denser where decisions happen.
- Calmer where evidence is reviewed.
- Less hero-like after onboarding.
- More explicit about primary versus secondary actions.

### Component Changes

#### Compact Job Cards

Job cards should reduce vertical height while preserving trust signals.

Each card should show:

- Role and company.
- Location/salary/experience chips.
- Advisory score.
- One strongest fit reason.
- One primary next action based on state.
- Secondary actions grouped visually quieter.

Primary action logic:

- Unprepared job: `Prepare application`
- Prepared job: `Apply`
- Applied job: `Follow up`
- Saved job: `Continue`

#### Support Rail Panels

Support rail panels should use smaller headings and tighter spacing than current large cards.

Panels should be scannable and purposeful:

- Readiness checklist.
- Coach quick prompt.
- Source health summary.
- Recent assets.

#### Loading Skeletons

Replace blank spinners with shape-matched skeletons:

- Dashboard skeleton: action strip, stat row, first jobs, support rail.
- Discover skeleton: filter row, job list, collapsed source summary.
- Coach skeleton: thread/sidebar shell and chat shell.
- Pipeline skeleton: metrics, controls, board columns.

Any operation taking more than one second should include short status copy.

#### Desktop Density

Operational screens should use:

- Smaller route headings than marketing-style hero text.
- Fewer oversized rounded containers.
- More stable grid dimensions.
- Clearer grouping between primary and secondary actions.
- Consistent status colors and advisory labels.

## UX Behavior Rules

### One Primary Action Per Job State

Each job card should guide the user toward one next step. Secondary actions remain accessible but should not visually compete with the primary action.

### Evidence Is Predictable

Brief, ATS score, fit reasons, advisory warnings, and document readiness should live in predictable places rather than scattered across multiple panels.

An evidence drawer or right-side panel can provide a consistent home for job-specific detail.

### Coach Inherits Context

When launched from a job card or evidence panel, Coach should open with that job selected. The user should not need to re-select the role.

### Draft Safety

Manual job tracking should not silently discard partially typed input when the user navigates away or closes the modal accidentally.

Acceptable implementations:

- Preserve draft state in component state/local storage until submission or explicit cancel.
- Warn before closing/navigation if required fields have content.

### Explicit AI States

AI-related disabled states should explain what is missing:

- Missing Gemini key.
- No indexed materials.
- No selected job.
- Generation failed.
- Source unavailable.

The UI should keep advisory/evidence framing visible near AI outputs.

## Error Handling

### Loading

Use skeletons instead of full-page spinners for primary routes.

If loading can take longer than one second, include route-specific copy such as:

- "Loading ranked jobs..."
- "Checking source health..."
- "Preparing coach evidence..."

### Empty States

Empty states should say what is empty and what to do next.

Examples:

- Pipeline empty: "No tracked applications yet. Track a job to start follow-ups."
- Documents empty: "No generated assets yet. Prepare an application from a ranked job."
- Coach empty: "Index your materials or pick a job to ask grounded questions."

### Failed Actions

Failed generation, indexing, saving, or downloading should surface an inline error near the action that failed and keep the user's context intact.

## Accessibility Requirements

- All icon-only buttons need `aria-label` or visible text.
- All selects and inputs need explicit labels or accessible names.
- Coach job selector needs a label.
- Automation quiet-hour time inputs need labels, even if read-only.
- Keyboard focus should remain visible.
- Modal/dialog flows should have labelled titles and safe close behavior.
- Mobile baseline should not introduce horizontal overflow or clipped interactive controls.

## Data Flow

Keep existing services and server actions.

Primary data flow:

1. `getCommandCenterData()` feeds the Action Workbench.
2. The selected or top-ranked job feeds the support rail.
3. Document asset state feeds readiness checklist.
4. Scan/source state feeds the collapsed diagnostics panel.
5. Coach receives selected job context when launched from a job-specific action.
6. Pipeline draft state remains local until saved.

No backend rewrite is required for the initial A+ redesign.

## Testing And Acceptance

### Automated Checks

The implementation must pass:

- `npm run lint`
- `npm run typecheck`
- `npm run build`

### Browser Audit Targets

Run Lighthouse on primary routes after implementation:

- `/`
- `/discover`
- `/pipeline`
- `/coach`
- `/settings/automation`
- `/onboarding`

Target:

- Average Lighthouse score: 95+
- Accessibility: no route below 95
- No known clipped content on mobile baseline routes

### Design/UX Audit Targets

Repeat the design and UX audit using the same scoring framework.

Targets:

- Frontend design: 92+
- UX walkthrough: 90+
- Combined product experience: 92+

### Key UX Acceptance Criteria

- The top job action is visible above the fold on desktop.
- Discover shows ranked jobs before detailed source diagnostics.
- Coach is usable on 390px mobile without clipping.
- Pipeline manual job draft is preserved or warns before loss.
- Full-page spinners are replaced on primary routes.
- All previously identified unlabeled controls are labelled.
- AI-generated or AI-adjacent outputs retain advisory/evidence context.

## Implementation Notes

Likely touchpoints:

- `src/components/AppChrome.tsx`
- `src/components/Sidebar.tsx`
- `src/components/CommandCenterClient.tsx`
- `src/components/jobs/RankedJobCard.tsx`
- `src/app/discover/page.tsx`
- `src/app/coach/page.tsx`
- `src/app/pipeline/page.tsx`
- `src/app/settings/automation/page.tsx`
- `src/app/globals.css`

Recommended component extractions:

- `ActionWorkbenchHeader`
- `TopJobActionPanel`
- `WorkbenchSupportRail`
- `ReadinessChecklist`
- `SourceHealthSummary`
- `RouteSkeleton`
- `MobileNavFallback`

These names are suggestions, not strict requirements. The implementation should follow existing codebase style and avoid broad unrelated refactors.

## Risks

- Reworking dashboard layout can regress Lighthouse performance if too much client-only UI is added.
- Compacting job cards can hide too much evidence if not balanced carefully.
- Coach responsive fixes may be harder if the current component remains a single large file.
- Existing dirty worktree state requires careful staging and review to avoid mixing unrelated changes.

## Open Questions

- Should source health be collapsed by default on both Dashboard and Discover, or visible as a compact summary on Discover?
- Should the support rail follow the currently selected job, or always prioritize the top job until the user explicitly selects another?
- Should Pipeline draft preservation use local storage or only in-memory navigation warnings?

## Approved Direction

The user approved:

- Desktop-first A+ scorecard.
- Mobile baseline required, but not full mobile optimization.
- Action Workbench approach.
- Experience architecture.
- UI system direction.
- UX flow rules.
- Technical boundaries and score targets.
