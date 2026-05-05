# Action Workbench A+ Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework Career Seek into a desktop-first Action Workbench that raises the design/UX scorecard to A+ while keeping mobile screens non-broken.

**Architecture:** Keep existing server actions, services, and data models. Build a focused presentation layer around the existing `getCommandCenterData()` and job/document state: shared shell fixes, route skeletons, dashboard workbench components, job-first Discover, responsive Coach, and Pipeline recovery polish.

**Tech Stack:** Next.js App Router, React client components, TypeScript, Tailwind CSS, lucide-react, SQLite-backed local services, Playwright/Lighthouse for browser verification.

---

## Source Spec

- `docs/superpowers/specs/2026-04-25-action-workbench-a-plus-design.md`
- Current audit report: `docs/design-ux-audit-2026-04-25.md`

## Scope Check

This plan covers one cohesive product slice: the Action Workbench redesign and scorecard recovery. It touches several routes, but they share one user-facing goal and one verification loop. Do not split this into backend, scraping, or AI-model work; those are out of scope.

## File Map

### Create

- `scripts/audit-action-workbench.mjs`
  - Playwright assertions for the A+ UX blockers: desktop first job above fold, Discover job-first ordering, Coach mobile non-clipping, route horizontal overflow, and accessible labels.
- `src/components/MobileNavFallback.tsx`
  - Compact mobile-only navigation escape hatch using the same route set as `Sidebar`.
- `src/components/ui/RouteSkeleton.tsx`
  - Shape-matched skeletons for dashboard, discover, coach, and pipeline routes.
- `src/components/workbench/ActionWorkbenchHeader.tsx`
  - Compact dashboard header and scan refresh state.
- `src/components/workbench/TopJobActionPanel.tsx`
  - Best-job summary and primary next action above the fold.
- `src/components/workbench/WorkbenchStatStrip.tsx`
  - Dense desktop stats row.
- `src/components/workbench/WorkbenchSupportRail.tsx`
  - Right rail container for readiness, coach prompt, source health, and recent assets.
- `src/components/workbench/ReadinessChecklist.tsx`
  - Job/application readiness checklist based on assets and application status.
- `src/components/workbench/SourceHealthSummary.tsx`
  - Compact/collapsible portal health summary reused by Dashboard and Discover.
- `src/lib/jobs/action-state.ts`
  - Small pure helper for deriving the job's primary action label/state.

### Modify

- `package.json`
  - Add `audit:workbench` script.
- `src/components/AppChrome.tsx`
  - Add mobile navigation fallback and keep desktop shell unchanged.
- `src/components/Sidebar.tsx`
  - Export route metadata for reuse by `MobileNavFallback`.
- `src/components/CommandCenterClient.tsx`
  - Replace hero-heavy dashboard with workbench layout and skeleton.
- `src/components/jobs/RankedJobCard.tsx`
  - Add action-state behavior, compact density, clearer primary/secondary actions, and optional Coach context link.
- `src/app/discover/page.tsx`
  - Make ranked jobs the primary content, demote source health to diagnostics, and use skeleton loading.
- `src/app/coach/page.tsx`
  - Fix responsive layout, label controls, support selected job from query params.
- `src/app/pipeline/page.tsx`
  - Preserve manual job draft, reduce board layout shift, improve loading/empty state.
- `src/app/settings/automation/page.tsx`
  - Add labels for toggles and time inputs.
- `src/app/globals.css`
  - Add small skeleton and density utilities only if Tailwind classes become too repetitive.

### Avoid Unless Required

- Database schema.
- Scraping adapters.
- Scoring engine.
- Gemini prompts.
- Document generation services.

## Verification Commands

Run these after each major chunk:

```bash
npm run lint
npm run typecheck
```

Run these before final handoff:

```bash
npm run build
JOBHUNT_DATA_DIR=./data-test-run npm run start -- -p 3002
npm run audit:workbench
```

Run Lighthouse manually or with existing local workflow on:

- `http://localhost:3002/`
- `http://localhost:3002/discover`
- `http://localhost:3002/pipeline`
- `http://localhost:3002/coach`
- `http://localhost:3002/settings/automation`
- `http://localhost:3002/onboarding`

Expected final targets:

- Frontend design score: `92+`
- UX walkthrough score: `90+`
- Lighthouse route average: `95+`
- Accessibility: no audited route below `95`
- `npm run lint`, `npm run typecheck`, and `npm run build` pass.

---

## Chunk 1: Baseline And Audit Harness

### Task 1: Add Playwright UX Audit Script

**Files:**
- Create: `scripts/audit-action-workbench.mjs`
- Modify: `package.json`

- [ ] **Step 1: Create the failing audit script**

Create `scripts/audit-action-workbench.mjs`:

```js
import { chromium } from 'playwright';

const BASE_URL = process.env.AUDIT_BASE_URL || 'http://localhost:3002';
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

async function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function pageSummary(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const controls = [...document.querySelectorAll('button,input,select,textarea,a[href]')];
    const unnamedControls = controls.filter((el) => {
      if (!visible(el)) return false;
      const text = (el.innerText || el.textContent || '').trim();
      const id = el.id;
      const labelledBy = el.getAttribute('aria-labelledby');
      const hasLabel = id && document.querySelector(`label[for="${CSS.escape(id)}"]`);
      return !text && !el.getAttribute('aria-label') && !el.getAttribute('title') && !labelledBy && !hasLabel && !el.closest('label') && !el.getAttribute('placeholder');
    });
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      unnamedControls: unnamedControls.map((el) => el.outerHTML.slice(0, 180)),
      bodyText: document.body.innerText.replace(/\s+/g, ' ').trim(),
    };
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const desktop = await browser.newPage({ viewport: DESKTOP });
    await desktop.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await desktop.waitForTimeout(2500);
    const firstJobTop = await desktop.locator('article').first().evaluate((el) => el.getBoundingClientRect().top).catch(() => null);
    await assert(firstJobTop !== null, 'Dashboard should render at least one ranked job card.');
    await assert(firstJobTop < 760, `Dashboard first job should appear above desktop fold; got top=${firstJobTop}.`);

    await desktop.goto(`${BASE_URL}/discover`, { waitUntil: 'domcontentloaded' });
    await desktop.waitForTimeout(2500);
    const discoverOrder = await desktop.evaluate(() => {
      const text = document.body.innerText;
      return {
        jobsIndex: Math.min(...['Ranked jobs', 'No matching jobs yet', 'Teacher', 'Engineer', 'Manager'].map((needle) => {
          const idx = text.indexOf(needle);
          return idx === -1 ? Number.POSITIVE_INFINITY : idx;
        })),
        sourceIndex: text.indexOf('Source health'),
      };
    });
    await assert(discoverOrder.sourceIndex === -1 || discoverOrder.jobsIndex < discoverOrder.sourceIndex, 'Discover should present jobs before detailed source health.');

    const routes = ['/', '/discover', '/pipeline', '/coach', '/settings/automation'];
    for (const route of routes) {
      const mobile = await browser.newPage({ viewport: MOBILE });
      await mobile.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' });
      await mobile.waitForTimeout(2500);
      const summary = await pageSummary(mobile);
      await assert(summary.scrollWidth <= summary.clientWidth + 2, `${route} has horizontal overflow on mobile.`);
      await assert(summary.unnamedControls.length === 0, `${route} has unnamed controls: ${summary.unnamedControls.join(' | ')}`);
      if (route === '/coach') {
        await assert(summary.bodyText.includes('AI Coach'), 'Coach mobile should keep AI Coach content visible.');
        const coachPaneWidth = await mobile.locator('[data-testid="coach-chat-pane"]').evaluate((el) => el.getBoundingClientRect().width).catch(() => 0);
        await assert(coachPaneWidth >= 340, `Coach mobile chat pane is too narrow or missing: ${coachPaneWidth}px.`);
      }
      await mobile.close();
    }

    console.log('Action Workbench audit passed.');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
```

- [ ] **Step 2: Add package script**

Modify `package.json`:

```json
{
  "scripts": {
    "audit:workbench": "node scripts/audit-action-workbench.mjs"
  }
}
```

Preserve all existing scripts.

- [ ] **Step 3: Run audit and verify it fails on current UI**

Run:

```bash
JOBHUNT_DATA_DIR=./data-test-run npm run start -- -p 3002
npm run audit:workbench
```

Expected: FAIL on at least one current blocker, likely dashboard first job below fold, Coach mobile width, or unnamed controls.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json scripts/audit-action-workbench.mjs
git commit -m "test: add action workbench UX audit"
```

---

## Chunk 2: Shared Shell, Navigation, And Skeletons

### Task 2: Share Navigation Metadata

**Files:**
- Modify: `src/components/Sidebar.tsx`
- Create: `src/components/MobileNavFallback.tsx`
- Modify: `src/components/AppChrome.tsx`

- [ ] **Step 1: Export nav metadata**

In `src/components/Sidebar.tsx`, export the existing nav item array:

```ts
export const appNavItems = [
  // existing nav item objects
];
```

Update `Sidebar` to map `appNavItems` instead of a private constant.

- [ ] **Step 2: Create mobile fallback nav**

Create `src/components/MobileNavFallback.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { appNavItems } from '@/components/Sidebar';

export function MobileNavFallback() {
  const pathname = usePathname();
  const primaryItems = appNavItems.filter((item) => ['/', '/discover', '/pipeline', '/coach'].includes(item.href));

  return (
    <nav aria-label="Primary mobile navigation" className="lg:hidden border-t border-black/10 bg-white/95 backdrop-blur-xl">
      <div className="grid grid-cols-5">
        {primaryItems.map((item) => {
          const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${active ? 'text-primary' : 'text-muted-foreground'}`}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          );
        })}
        <Link href="/settings" className="flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-semibold text-muted-foreground">
          <Menu className="h-4 w-4" />
          More
        </Link>
      </div>
    </nav>
  );
}
```

- [ ] **Step 3: Mount mobile nav**

In `src/components/AppChrome.tsx`, import and render `MobileNavFallback` inside the non-onboarding shell:

```tsx
import { MobileNavFallback } from '@/components/MobileNavFallback';
```

Place it after `</main>` and before `<JobMonitor />`, or as a bottom sticky element inside the main layout. Ensure desktop remains unchanged.

- [ ] **Step 4: Verify mobile navigation appears**

Run:

```bash
npm run lint
npm run typecheck
```

Then screenshot `/` at `390x844`. Expected: mobile has visible navigation and no horizontal overflow.

- [ ] **Step 5: Commit**

```bash
git add src/components/Sidebar.tsx src/components/MobileNavFallback.tsx src/components/AppChrome.tsx
git commit -m "feat: add mobile navigation fallback"
```

### Task 3: Add Route Skeletons

**Files:**
- Create: `src/components/ui/RouteSkeleton.tsx`
- Modify: `src/components/CommandCenterClient.tsx`
- Modify: `src/app/discover/page.tsx`
- Modify: `src/app/coach/page.tsx`
- Modify: `src/app/pipeline/page.tsx`

- [ ] **Step 1: Create skeleton component**

Create `src/components/ui/RouteSkeleton.tsx`:

```tsx
function Bar({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-surface-container-high ${className}`} />;
}

export function DashboardSkeleton() {
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_20rem]">
      <section className="space-y-4">
        <Bar className="h-24" />
        <div className="grid gap-3 md:grid-cols-4">
          <Bar className="h-16" />
          <Bar className="h-16" />
          <Bar className="h-16" />
          <Bar className="h-16" />
        </div>
        <Bar className="h-36" />
        <Bar className="h-36" />
      </section>
      <aside className="space-y-3">
        <Bar className="h-28" />
        <Bar className="h-24" />
        <Bar className="h-24" />
      </aside>
    </div>
  );
}

export function DiscoverSkeleton() {
  return (
    <div className="space-y-5">
      <Bar className="h-20" />
      <Bar className="h-14" />
      <Bar className="h-32" />
      <Bar className="h-32" />
    </div>
  );
}

export function CoachSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-[16rem_1fr]">
      <Bar className="hidden h-[32rem] md:block" />
      <div className="space-y-4">
        <Bar className="h-14" />
        <Bar className="h-64" />
        <Bar className="h-14" />
      </div>
    </div>
  );
}

export function PipelineSkeleton() {
  return (
    <div className="space-y-5">
      <Bar className="h-20" />
      <div className="grid gap-3 md:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => <Bar key={index} className="h-20" />)}
      </div>
      <Bar className="h-56" />
    </div>
  );
}
```

- [ ] **Step 2: Replace dashboard spinner**

In `src/components/CommandCenterClient.tsx`, replace the current centered spinner loading branch with:

```tsx
return <DashboardSkeleton />;
```

- [ ] **Step 3: Replace Discover spinner**

In `src/app/discover/page.tsx`, replace the loading branch with:

```tsx
return <DiscoverSkeleton />;
```

- [ ] **Step 4: Add Coach and Pipeline loading use**

Use `CoachSkeleton` and `PipelineSkeleton` where those pages currently render sparse loading or initial empty shell. If there is no explicit loading branch, add a small `initialLoading` state that flips false after first data load.

- [ ] **Step 5: Verify**

Run:

```bash
npm run lint
npm run typecheck
```

Expected: no lint/type errors, no full-page spinner screenshots on primary routes during initial load.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/RouteSkeleton.tsx src/components/CommandCenterClient.tsx src/app/discover/page.tsx src/app/coach/page.tsx src/app/pipeline/page.tsx
git commit -m "feat: add route-shaped loading skeletons"
```

---

## Chunk 3: Dashboard Action Workbench

### Task 4: Add Job Action State Helper

**Files:**
- Create: `src/lib/jobs/action-state.ts`
- Modify: `src/components/jobs/RankedJobCard.tsx`

- [ ] **Step 1: Create helper**

Create `src/lib/jobs/action-state.ts`:

```ts
export type JobActionState = {
  primaryLabel: string;
  primaryKind: 'prepare' | 'apply' | 'follow_up' | 'continue';
  readinessLabel: string;
};

export function getJobActionState(input: {
  applicationStatus?: string | null;
  hasResume?: boolean;
  hasCoverLetter?: boolean;
}) {
  const prepared = Boolean(input.hasResume || input.hasCoverLetter);
  if (input.applicationStatus === 'applied') {
    return { primaryLabel: 'Follow up', primaryKind: 'follow_up', readinessLabel: 'Applied' } satisfies JobActionState;
  }
  if (input.applicationStatus === 'saved' && prepared) {
    return { primaryLabel: 'Apply', primaryKind: 'apply', readinessLabel: 'Ready to apply' } satisfies JobActionState;
  }
  if (input.applicationStatus === 'saved') {
    return { primaryLabel: 'Continue', primaryKind: 'continue', readinessLabel: 'Saved' } satisfies JobActionState;
  }
  if (prepared) {
    return { primaryLabel: 'Apply', primaryKind: 'apply', readinessLabel: 'Prepared' } satisfies JobActionState;
  }
  return { primaryLabel: 'Prepare application', primaryKind: 'prepare', readinessLabel: 'Needs assets' } satisfies JobActionState;
}
```

- [ ] **Step 2: Use helper in job card**

In `src/components/jobs/RankedJobCard.tsx`, derive:

```ts
const actionState = getJobActionState({
  applicationStatus,
  hasResume: Boolean(latestResume || latestResumePdf),
  hasCoverLetter: Boolean(latestCover),
});
```

Use `actionState.primaryLabel` for the most prominent job button. Keep existing individual asset buttons as secondary actions.

- [ ] **Step 3: Verify**

Run:

```bash
npm run lint
npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/jobs/action-state.ts src/components/jobs/RankedJobCard.tsx
git commit -m "feat: derive primary job actions"
```

### Task 5: Create Workbench Components

**Files:**
- Create: `src/components/workbench/ActionWorkbenchHeader.tsx`
- Create: `src/components/workbench/TopJobActionPanel.tsx`
- Create: `src/components/workbench/WorkbenchStatStrip.tsx`
- Create: `src/components/workbench/ReadinessChecklist.tsx`
- Create: `src/components/workbench/SourceHealthSummary.tsx`
- Create: `src/components/workbench/WorkbenchSupportRail.tsx`

- [ ] **Step 1: Create compact header**

Create `ActionWorkbenchHeader.tsx` with props:

```ts
type Props = {
  name: string;
  headline: string;
  target: string;
  lastScan?: string | null;
  isScanning: boolean;
  refreshing: boolean;
  onRefresh: () => void;
};
```

Render a compact row: title, subtitle, last scan, refresh button. Do not use hero-sized `md:text-6xl`.

- [ ] **Step 2: Create stat strip**

Create `WorkbenchStatStrip.tsx`:

```tsx
export function WorkbenchStatStrip({ stats }: { stats: any }) {
  const items = [
    { label: 'Apply today', value: stats.applyToday, tone: 'text-green-600' },
    { label: 'Actionable', value: stats.actionableJobs, tone: 'text-primary' },
    { label: 'Avg fit', value: stats.averageScore, tone: 'text-foreground' },
    { label: 'Sources', value: stats.portalsActive, tone: 'text-foreground' },
  ];
  return (
    <div className="grid gap-2 md:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-2xl border border-black/10 bg-white px-4 py-3 shadow-sm">
          <p className={`text-2xl font-bold ${item.tone}`}>{item.value}</p>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{item.label}</p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create top job panel**

Create `TopJobActionPanel.tsx` with `item`, `capabilities`, and optional `onSelect` props. It should render the first/top job in a compact panel and reuse `RankedJobCard` in compact mode if possible.

- [ ] **Step 4: Create readiness checklist**

Create `ReadinessChecklist.tsx` with props:

```ts
type Props = {
  topJob?: any;
};
```

For this first pass, derive readiness from `topJob.application` and available document assets if present. If assets are unavailable in command-center data, show neutral states and link to the job card actions instead of fetching new data.

- [ ] **Step 5: Create source health summary**

Create `SourceHealthSummary.tsx` that accepts `portalHealth` and `defaultCollapsed`. It should show:

- complete count
- failed count
- running count
- collapsible details

- [ ] **Step 6: Create support rail**

Create `WorkbenchSupportRail.tsx` that composes:

- Readiness checklist.
- Coach CTA link to `/coach?job=<scoredJobId>` when a top job exists.
- Source health summary.
- Recent/high-level source counts.

- [ ] **Step 7: Verify**

Run:

```bash
npm run lint
npm run typecheck
```

- [ ] **Step 8: Commit**

```bash
git add src/components/workbench
git commit -m "feat: add action workbench components"
```

### Task 6: Rework Dashboard Layout

**Files:**
- Modify: `src/components/CommandCenterClient.tsx`

- [ ] **Step 1: Import workbench components**

Replace local `StatCard`/`InsightCard` usage where possible with the new workbench components.

- [ ] **Step 2: Derive top job**

Add:

```ts
const topJob = filteredJobs[0] || data.priorityQueue?.[0] || null;
```

- [ ] **Step 3: Replace hero section**

Replace the large hero with:

```tsx
<ActionWorkbenchHeader ... />
```

Use compact copy:

- Title: `Today for {name}`
- Subtitle: `{headline} · Targeting {target}`

- [ ] **Step 4: Add workbench grid**

Use:

```tsx
<div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
  <main className="space-y-4">
    <TopJobActionPanel item={topJob} capabilities={...} />
    <WorkbenchStatStrip stats={data.stats} />
    {/* filters and job queue */}
  </main>
  <WorkbenchSupportRail topJob={topJob} data={data} />
</div>
```

Keep the first ranked job visible above fold on `1440x900`.

- [ ] **Step 5: Keep AI search but reduce prominence**

Move `Ask Gemini` from above the job queue into the support rail or below the first job. The top job action must come first.

- [ ] **Step 6: Verify audit script**

Run:

```bash
npm run lint
npm run typecheck
npm run audit:workbench
```

Expected: dashboard first-job assertion passes.

- [ ] **Step 7: Commit**

```bash
git add src/components/CommandCenterClient.tsx
git commit -m "feat: make dashboard action-first"
```

---

## Chunk 4: Discover Job-First Workspace

### Task 7: Demote Source Health To Diagnostics

**Files:**
- Modify: `src/app/discover/page.tsx`
- Reuse: `src/components/workbench/SourceHealthSummary.tsx`

- [ ] **Step 1: Move source health below jobs**

In `src/app/discover/page.tsx`, move the `scanStatus?.scan` source-health section below the search/filter controls and ranked job list.

- [ ] **Step 2: Add compact diagnostics toggle**

Use `SourceHealthSummary` near the header as a collapsed summary:

```tsx
<SourceHealthSummary portalHealth={scanStatus?.portalRuns || []} defaultCollapsed />
```

Do not render all portal failure cards before the jobs.

- [ ] **Step 3: Keep action errors visible**

Keep `actionError`, `actionMessage`, and capability warnings near the top because they affect user action.

- [ ] **Step 4: Verify ordering**

Run:

```bash
npm run audit:workbench
```

Expected: Discover ordering assertion passes.

- [ ] **Step 5: Commit**

```bash
git add src/app/discover/page.tsx src/components/workbench/SourceHealthSummary.tsx
git commit -m "feat: make discover job-first"
```

---

## Chunk 5: Coach Responsive And Accessibility Fixes

### Task 8: Add Accessible Names

**Files:**
- Modify: `src/app/coach/page.tsx`

- [ ] **Step 1: Label icon-only buttons**

Add `aria-label` to:

- new thread button
- delete thread button
- sidebar toggle button
- force re-index button
- send button

Example:

```tsx
<button aria-label="Create new coach thread" ...>
```

- [ ] **Step 2: Label job selector**

Add a visually hidden label:

```tsx
<label htmlFor="coach-job-selector" className="sr-only">Select job for AI Coach</label>
<select id="coach-job-selector" ...>
```

- [ ] **Step 3: Verify**

Run:

```bash
npm run lint
npm run typecheck
npm run audit:workbench
```

Expected: unnamed Coach controls assertion passes.

- [ ] **Step 4: Commit**

```bash
git add src/app/coach/page.tsx
git commit -m "fix: label coach controls"
```

### Task 9: Make Coach Mobile Single-Pane

**Files:**
- Modify: `src/app/coach/page.tsx`

- [ ] **Step 1: Change root layout classes**

Replace:

```tsx
<div className="flex h-[calc(100vh-8rem)] gap-0">
```

with a responsive layout:

```tsx
<div className="flex h-[calc(100vh-8rem)] min-h-[34rem] flex-col overflow-hidden rounded-[1.25rem] border border-card-border bg-white md:flex-row">
```

Add a stable test hook to the main chat pane:

```tsx
<div data-testid="coach-chat-pane" className="flex min-w-0 flex-1 flex-col">
```

- [ ] **Step 2: Make thread sidebar desktop-first**

Use:

```tsx
<div className={`${showSidebar ? 'flex' : 'hidden'} h-full border-card-border bg-card/30 md:w-64 md:shrink-0 md:border-r ${showSidebar ? 'max-md:absolute max-md:inset-0 max-md:z-20' : ''}`}>
```

Ensure mobile either shows sidebar as an overlay/drawer or hides it entirely behind the labelled toggle.

- [ ] **Step 3: Make top bar wrap**

For the top bar, change the controls container to:

```tsx
<div className="min-w-0 flex-1 flex flex-wrap items-center gap-2">
```

Make scope options horizontally scrollable on small widths:

```tsx
<div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-lg bg-muted/30 p-0.5">
```

- [ ] **Step 4: Keep composer visible**

Ensure the composer uses:

```tsx
<div className="shrink-0 border-t border-card-border bg-card/30 px-3 py-3 md:px-6 md:py-4">
```

- [ ] **Step 5: Support job query param**

Import `useSearchParams` and initialize `selectedJobId` from `?job=<id>` once jobs load:

```tsx
const searchParams = useSearchParams();
const jobFromUrl = searchParams.get('job');
```

After jobs load, if `jobFromUrl` matches and no selected job exists, select it.

- [ ] **Step 6: Verify mobile**

Run:

```bash
npm run audit:workbench
```

Also screenshot:

```bash
npx playwright screenshot --full-page --viewport-size=390,844 http://localhost:3002/coach qa-artifacts/action-workbench/coach-mobile.png
```

Expected: no clipped two-pane layout.

- [ ] **Step 7: Commit**

```bash
git add src/app/coach/page.tsx
git commit -m "fix: make coach responsive"
```

---

## Chunk 6: Pipeline Recovery And Automation Accessibility

### Task 10: Preserve Track Job Drafts

**Files:**
- Modify: `src/app/pipeline/page.tsx`

- [ ] **Step 1: Identify manual job modal state**

Find the `TrackJobModal` or manual job form state near the lower half of `src/app/pipeline/page.tsx`.

- [ ] **Step 2: Add draft local storage key**

Inside the manual job modal component:

```ts
const DRAFT_KEY = 'career-seek:pipeline:manual-job-draft';
```

Persist title, company, location, portal, and URL when they change.

- [ ] **Step 3: Restore draft on open**

On modal mount, restore draft if present. Do not restore after successful save.

- [ ] **Step 4: Clear draft on explicit cancel**

When the user clicks `Cancel`, clear the draft. If the modal is closed via overlay or close icon and fields are dirty, confirm:

```ts
if (isDirty && !window.confirm('Discard this unsaved job draft?')) return;
```

- [ ] **Step 5: Reduce board layout shift**

Give board columns stable min heights and avoid late insertion jumps:

```tsx
className="min-h-32 ..."
```

Keep horizontal board scrolling on desktop if needed, but ensure mobile does not create document-level horizontal overflow.

- [ ] **Step 6: Verify draft preservation**

Manual browser test:

1. Open `/pipeline`.
2. Click `Track Job`.
3. Type a role title.
4. Navigate to `/`.
5. Go back to `/pipeline`.
6. Reopen `Track Job`.

Expected: draft is restored, or user was warned before leaving.

- [ ] **Step 7: Commit**

```bash
git add src/app/pipeline/page.tsx
git commit -m "fix: preserve pipeline job drafts"
```

### Task 11: Label Automation Controls

**Files:**
- Modify: `src/app/settings/automation/page.tsx`

- [ ] **Step 1: Label toggles**

Change each toggle label to include accessible text:

```tsx
<label className="relative inline-flex cursor-pointer items-center" aria-label={`Toggle ${p.category} in-app alerts`}>
```

Or add:

```tsx
<span className="sr-only">Toggle {p.category} in-app alerts</span>
```

inside the label.

- [ ] **Step 2: Label time inputs**

Add visible labels or `aria-label`:

```tsx
<label className="sr-only" htmlFor="quiet-hours-start">Quiet hours start</label>
<input id="quiet-hours-start" type="time" ... />
<label className="sr-only" htmlFor="quiet-hours-end">Quiet hours end</label>
<input id="quiet-hours-end" type="time" ... />
```

- [ ] **Step 3: Verify**

Run:

```bash
npm run lint
npm run typecheck
npm run audit:workbench
```

Expected: settings automation has no unnamed controls.

- [ ] **Step 4: Commit**

```bash
git add src/app/settings/automation/page.tsx
git commit -m "fix: label automation controls"
```

---

## Chunk 7: Final Verification And Scorecard

### Task 12: Full Build And Browser Verification

**Files:**
- Modify as needed only if checks fail.
- Add audit artifacts under `qa-artifacts/action-workbench/`.

- [ ] **Step 1: Run static gates**

```bash
npm run lint
npm run typecheck
npm run build
```

Expected: all pass.

- [ ] **Step 2: Start production app**

```bash
JOBHUNT_DATA_DIR=./data-test-run npm run start -- -p 3002
```

- [ ] **Step 3: Run workbench audit**

```bash
npm run audit:workbench
```

Expected: `Action Workbench audit passed.`

- [ ] **Step 4: Capture screenshots**

```bash
mkdir -p qa-artifacts/action-workbench
npx playwright screenshot --full-page --viewport-size=1440,900 http://localhost:3002/ qa-artifacts/action-workbench/root-desktop.png
npx playwright screenshot --full-page --viewport-size=1440,900 http://localhost:3002/discover qa-artifacts/action-workbench/discover-desktop.png
npx playwright screenshot --full-page --viewport-size=390,844 http://localhost:3002/coach qa-artifacts/action-workbench/coach-mobile.png
npx playwright screenshot --full-page --viewport-size=390,844 http://localhost:3002/ qa-artifacts/action-workbench/root-mobile.png
```

- [ ] **Step 5: Run Lighthouse pass**

Run Lighthouse on:

```bash
npx lighthouse http://localhost:3002/ --quiet --output=json --output-path=qa-artifacts/action-workbench/lighthouse-root.json --chrome-flags="--headless --no-sandbox"
npx lighthouse http://localhost:3002/discover --quiet --output=json --output-path=qa-artifacts/action-workbench/lighthouse-discover.json --chrome-flags="--headless --no-sandbox"
npx lighthouse http://localhost:3002/coach --quiet --output=json --output-path=qa-artifacts/action-workbench/lighthouse-coach.json --chrome-flags="--headless --no-sandbox"
npx lighthouse http://localhost:3002/pipeline --quiet --output=json --output-path=qa-artifacts/action-workbench/lighthouse-pipeline.json --chrome-flags="--headless --no-sandbox"
npx lighthouse http://localhost:3002/settings/automation --quiet --output=json --output-path=qa-artifacts/action-workbench/lighthouse-settings-automation.json --chrome-flags="--headless --no-sandbox"
```

- [ ] **Step 6: Summarize scores**

```bash
jq -r '[(input_filename|split("/")[-1]|sub(".json$";"")),((.categories.performance.score*100)|round),((.categories.accessibility.score*100)|round),((.categories["best-practices"].score*100)|round),((.categories.seo.score*100)|round)] | @tsv' qa-artifacts/action-workbench/lighthouse-*.json
```

Expected: route average `95+`, no accessibility route below `95`.

- [ ] **Step 7: Update scorecard report**

Create or update:

- `docs/design-ux-audit-2026-04-25-action-workbench-followup.md`

Include:

- Before scores from `docs/design-ux-audit-2026-04-25.md`.
- After scores from visual/UX re-audit.
- Lighthouse table.
- Remaining issues, if any.

- [ ] **Step 8: Final commit**

```bash
git add scripts/audit-action-workbench.mjs package.json package-lock.json src/components src/app src/lib/jobs docs/design-ux-audit-2026-04-25-action-workbench-followup.md qa-artifacts/action-workbench
git commit -m "feat: deliver action workbench A+ redesign"
```

## Rollback Plan

If the dashboard redesign regresses build or performance:

1. Keep `MobileNavFallback`, labels, and skeletons.
2. Revert only the `CommandCenterClient.tsx` workbench layout.
3. Restore previous dashboard sections.
4. Re-run `npm run build` and `npm run audit:workbench`.

## Notes For Implementer

- The repo may already have unrelated dirty files. Do not revert them.
- Stage only files changed for the current task.
- Commit after each chunk or task as written.
- Use existing Tailwind and component style; avoid adding a new UI library.
- Prefer small extracted components over making `CommandCenterClient.tsx` or `coach/page.tsx` larger.
- Keep advisory labels visible near AI/scoring output.
- Use desktop screenshots as the main product-quality signal, but never ship obviously clipped mobile pages.
