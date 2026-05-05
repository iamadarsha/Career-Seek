# Design + UX Audit: Career Seek

**Date**: 2026-04-25
**App URL**: http://localhost:3002
**Data dir**: `JOBHUNT_DATA_DIR=./data-test-run`
**Persona**: First-time job seeker, moderate tech comfort, mildly distracted, wants to quickly find the best next job action.
**Viewports**: Desktop 1440px and mobile 390px
**Method**: Frontend design review, UX walkthrough, screenshot inspection, DOM control checks, form-resilience spot test.

## Executive Scorecard

| Area | Score | Grade | Notes |
|---|---:|---|---|
| Frontend design | 76/100 | B- | Polished desktop cockpit, but too visually repetitive and mobile breaks the experience in key places. |
| UX walkthrough | 68/100 | C+ | Core task is understandable, but mobile navigation, coach layout, loading feedback, and form resilience create friction. |
| Combined product experience | 72/100 | B- | Strong foundation; main issues are interaction clarity and responsive composition. |

## Frontend Design Scorecard

| Dimension | Score | Finding |
|---|---:|---|
| Visual direction | 78 | Clear "calm operations cockpit" direction, but the app leans heavily on familiar Apple-style cards and pale blue surfaces. |
| Typography | 74 | Readable and confident, but headings are oversized on task screens and some hierarchy skips make screens feel less refined. |
| Color and contrast | 86 | Contrast is mostly strong after prior fixes; accent colors communicate status well. |
| Layout composition | 72 | Desktop is clean, but dashboard hero/stats push job actions below the fold and board layouts create awkward empty space. |
| Component polish | 78 | Buttons, cards, and status pills are consistent; repeated large rounded cards can make dense workflows feel soft and slow. |
| Responsive design | 55 | Mobile lacks app navigation, AI Coach clips badly, and some primary workflows become hard to operate. |
| Empty/loading states | 68 | Empty states are calm, but several pages use sparse spinners or blank-looking screens before useful content appears. |
| Interaction/motion | 70 | Subtle transitions exist, but there is little motion hierarchy or progressive reveal to guide the user through heavy workflows. |

## UX Walkthrough Scorecard

| Dimension | Score | Finding |
|---|---:|---|
| First impression | 82 | The dashboard immediately communicates that this is a local AI job command center. |
| Task clarity | 74 | "Refresh scan", "Ask Gemini", and job action buttons are understandable, but the first actionable job is below the initial fold. |
| Navigation | 60 | Desktop sidebar is good; mobile has no visible route navigation because the sidebar is hidden with no replacement. |
| Job search flow | 72 | Ranked jobs and source health are useful, but source failures dominate Discover before actual job review. |
| AI Coach flow | 52 | Desktop is understandable, but mobile two-pane layout clips the main content and controls. |
| Feedback and loading | 65 | Buttons and spinners exist, but initial Discover can look like a blank full-page wait before content settles. |
| Form resilience | 58 | Manual job tracking disables invalid submit, but partially typed modal data is lost after navigating away and returning. |
| Trust and recovery | 70 | Advisory labels are strong trust signals; unsaved-state warnings and clearer recovery affordances are missing. |
| Mobile usability | 48 | No mobile nav and clipped coach layout make the app feel desktop-only. |

## Key Findings

### High - Mobile has no app navigation

The sidebar is hidden below `lg`, and the top header does not provide a menu, tabs, or bottom navigation. A mobile user who lands on `/` has no visible way to reach Discover, Pipeline, Documents, Coach, or Settings.

Evidence:
- `src/components/Sidebar.tsx` hides the sidebar with `hidden ... lg:flex`.
- `src/components/AppChrome.tsx` renders only the title header above mobile content.
- Screenshot: `qa-artifacts/design-ux-audit/root-mobile.png`

Recommendation: Add a mobile bottom nav or compact hamburger/sheet using the same nav item set as the desktop sidebar.

### High - AI Coach mobile layout is clipped

At 390px width, the thread sidebar and chat pane render side-by-side, leaving the coach content squeezed into a narrow strip. The warning card and composer are visibly clipped.

Evidence:
- `src/app/coach/page.tsx` uses `flex h-[calc(100vh-8rem)]` with a fixed `w-64` sidebar.
- Screenshot: `qa-artifacts/design-ux-audit/coach-mobile.png`

Recommendation: Switch Coach to a mobile-first layout: thread list as a drawer or tab, full-width chat pane, horizontally scrollable scope controls, and labelled icon buttons.

### High - Dashboard delays the primary job action

The dashboard is visually impressive, but the first job card starts below the first viewport after the hero, stats, AI search, and filters. For a time-poor job seeker, "what should I apply to now?" should arrive faster.

Evidence:
- First article top position measured at ~853px in a 900px desktop viewport.
- Screenshot: `qa-artifacts/design-ux-audit/root-desktop.png`

Recommendation: Compress the hero after onboarding is complete, move "Apply today" and the top job into the first viewport, or create a split "Today action" panel beside the hero.

### Medium - Discover starts with source failures, not user jobs

Discover is operationally transparent, but the first major section is source health. For a job seeker, the emotional priority is "show me useful jobs", while source failures are secondary diagnostics.

Evidence:
- Screenshot: `qa-artifacts/design-ux-audit/discover-desktop-wait6.png`

Recommendation: Lead with ranked jobs and put source health in a collapsible diagnostics panel.

### Medium - Loading states are too sparse

The first Discover screenshot captured a full-screen spinner before data appeared. Onboarding also briefly shows "Recovering your setup progress". These are functional but feel like waits, not guided progress.

Evidence:
- Screenshot: `qa-artifacts/design-ux-audit/discover-desktop.png`
- Screenshot: `qa-artifacts/design-ux-audit/onboarding-desktop.png`

Recommendation: Use skeleton sections that match the eventual page shape and include short status copy where work can take more than a second.

### Medium - Manual job tracking loses partially entered data

Opening "Track Job", typing a partial title, navigating away, and returning loses the draft without warning.

Evidence:
- Spot test result: `partialFormPreserved: false`

Recommendation: Preserve modal drafts in component state keyed by route, or warn before navigating away when required fields have unsaved input.

### Medium - Some controls lack accessible names or labels

The Coach page has icon-only buttons and a job selector without an accessible label. Automation quiet-hour time inputs are read-only but unlabeled.

Evidence:
- Coach unnamed controls: delete thread, settings/sidebar toggle, send button.
- Coach select missing label.
- Automation quiet-hour time inputs missing labels.

Recommendation: Add `aria-label` to icon-only buttons and explicit labels for select/time inputs.

## What Works Well

- The desktop visual system feels coherent and calm.
- Source health cards are unusually transparent for a scraping-heavy app.
- Advisory estimate labels build trust by stating that scores are local estimates.
- Pipeline empty state is understandable and has a clear "Track Job" action.
- The app avoids horizontal page overflow in the checked desktop and mobile routes.

## Priority Recommendations

1. Add mobile navigation across the authenticated app shell.
2. Rebuild AI Coach mobile layout as single-pane chat with thread drawer.
3. Bring the top job/action queue into the first viewport on the dashboard.
4. Lead Discover with ranked jobs; make source health secondary.
5. Replace blank spinner waits with route-specific skeletons.
6. Add accessible labels to Coach icon buttons, Coach job selector, and automation time inputs.
7. Preserve or warn on unsaved modal input in Pipeline.

## Screenshots

- `qa-artifacts/design-ux-audit/root-desktop.png`
- `qa-artifacts/design-ux-audit/root-mobile.png`
- `qa-artifacts/design-ux-audit/discover-desktop-wait6.png`
- `qa-artifacts/design-ux-audit/discover-mobile-wait6.png`
- `qa-artifacts/design-ux-audit/pipeline-desktop.png`
- `qa-artifacts/design-ux-audit/pipeline-mobile.png`
- `qa-artifacts/design-ux-audit/coach-desktop.png`
- `qa-artifacts/design-ux-audit/coach-mobile.png`
- `qa-artifacts/design-ux-audit/settings-automation-desktop.png`
- `qa-artifacts/design-ux-audit/settings-automation-mobile.png`
