# Critical Hardening Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden Career Seek's highest-risk reliability, privacy, mobile navigation, and accessibility surfaces while preserving the existing job-search flow.

**Architecture:** Add small pure utility modules for scraping validation and log redaction, then connect them to existing adapters and the scan orchestrator. Keep the current Next.js app shell, adding only a mobile nav and targeted accessibility/async-state fixes.

**Tech Stack:** Next.js 14, React 18, TypeScript, Tailwind, Playwright, SQLite/Drizzle, Node built-in test runner with `tsx`.

---

## Source Spec

Implement against:

- `docs/superpowers/specs/2026-04-24-critical-hardening-design.md`

Do not widen scope into the older final-hardening spec or a full redesign.

## File Structure

- Create `src/lib/services/scraping/job-link-validator.ts`
  Pure validation helpers for host allowlists, redirect-host rejection, title/job-shape checks, and post-extraction filtering.
- Create `src/lib/services/scraping/log-redaction.ts`
  Pure redaction and size-capping helpers for raw payloads and failure snapshots.
- Create `src/lib/services/scraping/__tests__/job-link-validator.test.ts`
  Unit tests for wrong-domain, redirect, generic-nav, and valid job links.
- Create `src/lib/services/scraping/__tests__/log-redaction.test.ts`
  Unit tests for email/phone/token redaction and size caps.
- Create `src/lib/services/scraping/__tests__/source-selection.test.ts`
  Unit tests for preserving unknown selected sources as failed diagnostics.
- Create `src/lib/services/scraping/adapters/__tests__/naukri.test.ts`
  Fixture test for Naukri placeholder value mapping.
- Create or modify `scripts/run-tests.mjs`
  Runs TypeScript test files through `tsx` and Node's test runner.
- Modify `package.json`
  Add `test` script.
- Modify `src/lib/services/scraping/adapters/base.ts`
  Add validation options to `extractJobLinksFromPage`, run post-extraction validation, and keep browser-side extraction tolerant.
- Modify `src/lib/services/scraping/adapters/configured-sources.ts`
  Add per-source `allowedHosts`, path signals, and stricter source configuration.
- Modify `src/lib/services/scraping/adapters/google-jobs.ts`, `jobspy-fallback.ts`, `company-ats.ts`, `official-companies.ts` as needed
  Pass stricter validation options and avoid broad hostless patterns.
- Modify `src/lib/services/scraping/failures.ts`
  Add `unknown_source`; use redacted snapshots and debug-gated full HTML.
- Create `src/lib/services/scraping/scan-run-utils.ts`
  Pure helpers for invalid-source portal-run values and persisted-job accounting, with no DB imports.
- Modify `src/lib/services/scraping/orchestrator.ts`
  Preserve invalid source IDs, create failed portal runs, count persisted unique jobs, and use redacted payload persistence.
- Modify `src/lib/services/scraping/source-universe.ts`
  Expose ordering that can retain invalid selections or return valid/invalid partitions.
- Modify `src/lib/services/scraping/adapters/naukri.ts`
  Fix placeholder helper and expose a small pure mapper if needed for tests.
- Create `src/components/MobileNav.tsx`
  Bottom navigation for mobile authenticated app pages.
- Modify `src/app/layout.tsx` and/or shell wrapper components
  Render mobile nav and add bottom padding for app content.
- Modify `src/components/OnboardingFlow.tsx`
  Label API-key input and any high-use unlabeled controls touched by the flow.
- Modify `src/app/discover/page.tsx`
  Add labels/aria names and `try/finally` around scan/scoring actions.
- Modify `src/components/jobs/RankedJobCard.tsx`
  Add accessible button names and dialog semantics.
- Modify `src/app/pipeline/page.tsx`
  Add labels/aria names, semantic add-job dialog, async cleanup, and mobile-first list layout.
- Modify `src/app/pipeline/[id]/page.tsx` if needed
  Add labels/aria names for status menus/tabs and prevent tab overflow.

---

## Chunk 1: Test Harness And Pure Scraping Utilities

### Task 1: Add A Minimal TypeScript Test Harness

**Files:**
- Modify: `package.json`
- Create: `scripts/run-tests.mjs`

- [ ] **Step 1: Add the test runner script file**

Create `scripts/run-tests.mjs`:

```js
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const roots = ['src'];
const filters = process.argv.slice(2).map((value) => value.toLowerCase());
const tests = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full);
    else if (/\.(test|spec)\.ts$/.test(entry)) tests.push(full);
  }
}

for (const root of roots) walk(root);

const selected = filters.length
  ? tests.filter((file) => filters.some((filter) => file.toLowerCase().includes(filter)))
  : tests;

if (!selected.length) {
  console.error('No TypeScript tests found.');
  process.exit(1);
}

const result = spawnSync('npx', ['tsx', '--test', ...selected], {
  stdio: 'inherit',
  shell: false,
});

process.exit(result.status ?? 1);
```

- [ ] **Step 2: Add package script**

In `package.json`, add:

```json
"test": "node scripts/run-tests.mjs"
```

- [ ] **Step 3: Run test script to verify runner behavior**

Run: `npm test`

Expected: PASS if existing TypeScript tests are already present; otherwise FAIL with `No TypeScript tests found.`

Filtered runs are supported by substring:

```bash
npm test -- job-link-validator
```

Expected after tests exist: only test files with `job-link-validator` in the path are passed to `tsx --test`.

- [ ] **Step 4: Commit**

```bash
git add package.json scripts/run-tests.mjs
git commit -m "test: add TypeScript test runner"
```

### Task 2: Define Job Link Validation Tests

**Files:**
- Create: `src/lib/services/scraping/__tests__/job-link-validator.test.ts`
- Create: `src/lib/services/scraping/job-link-validator.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/services/scraping/__tests__/job-link-validator.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateExtractedJobLink } from '../job-link-validator';

const base = {
  portal: 'shine',
  title: 'AI Product Manager',
  url: 'https://www.shine.com/job-search/ai-product-manager-job-123',
  snippet: 'AI Product Manager job opening in India',
};

test('accepts allowlisted plausible job links', () => {
  const result = validateExtractedJobLink(base, {
    allowedHosts: ['shine.com'],
    queryTerms: ['product', 'manager'],
  });
  assert.equal(result.valid, true);
});

test('rejects wrong-domain links containing broad job tokens', () => {
  const result = validateExtractedJobLink({
    ...base,
    url: 'https://evil.example/jobs/shine.com-product-manager',
  }, {
    allowedHosts: ['shine.com'],
    queryTerms: ['product', 'manager'],
  });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'host_not_allowed');
});

test('rejects generic navigation links', () => {
  const result = validateExtractedJobLink({
    ...base,
    title: 'Careers',
    url: 'https://www.shine.com/careers',
    snippet: 'Explore life and benefits',
  }, {
    allowedHosts: ['shine.com'],
    queryTerms: ['product', 'manager'],
  });
  assert.equal(result.valid, false);
});

test('rejects redirect/search hosts without an allowlisted destination', () => {
  const result = validateExtractedJobLink({
    ...base,
    url: 'https://www.google.com/url?q=https%3A%2F%2Fevil.example%2Fjobs%2F1',
  }, {
    allowedHosts: ['shine.com'],
    queryTerms: ['product', 'manager'],
  });
  assert.equal(result.valid, false);
});

test('rejects title-only job signals when URL and snippet do not look like a job page', () => {
  const result = validateExtractedJobLink({
    ...base,
    title: 'Product Manager Job',
    url: 'https://www.shine.com/about/product-manager',
    snippet: 'Meet the product leadership team',
  }, {
    allowedHosts: ['shine.com'],
    queryTerms: ['product', 'manager'],
  });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'missing_job_signal');
});
```

- [ ] **Step 2: Run the specific test to verify failure**

Run: `npm test -- job-link-validator`

Expected: FAIL because `job-link-validator.ts` does not exist.

- [ ] **Step 3: Implement minimal validator**

Create `src/lib/services/scraping/job-link-validator.ts`:

```ts
export interface ExtractedJobLinkCandidate {
  portal: string;
  title: string;
  url: string;
  snippet?: string;
}

export interface JobLinkValidationOptions {
  allowedHosts?: string[];
  disallowedHosts?: string[];
  queryTerms?: string[];
  jobPathSignals?: string[];
}

export type JobLinkValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

const DEFAULT_JOB_SIGNALS = ['job', 'jobs', 'opening', 'position', 'requisition', 'posting', 'career'];
const REDIRECT_HOSTS = new Set(['google.com', 'www.google.com', 'lnkd.in']);

function hostMatches(host: string, allowed: string) {
  const clean = allowed.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');
  const normalizedHost = host.toLowerCase().replace(/^www\./, '');
  return normalizedHost === clean || normalizedHost.endsWith(`.${clean}`);
}

function destinationUrl(url: URL) {
  const q = url.searchParams.get('q') || url.searchParams.get('url') || url.searchParams.get('u');
  if (!q) return url;
  try {
    return new URL(q);
  } catch {
    return url;
  }
}

export function validateExtractedJobLink(
  candidate: ExtractedJobLinkCandidate,
  options: JobLinkValidationOptions = {},
): JobLinkValidationResult {
  let parsed: URL;
  try {
    parsed = new URL(candidate.url);
  } catch {
    return { valid: false, reason: 'invalid_url' };
  }

  const effective = REDIRECT_HOSTS.has(parsed.hostname) ? destinationUrl(parsed) : parsed;
  const allowedHosts = options.allowedHosts || [];
  if (allowedHosts.length && !allowedHosts.some((host) => hostMatches(effective.hostname, host))) {
    return { valid: false, reason: 'host_not_allowed' };
  }

  if ((options.disallowedHosts || []).some((host) => hostMatches(effective.hostname, host))) {
    return { valid: false, reason: 'host_disallowed' };
  }

  const title = candidate.title.replace(/\s+/g, ' ').trim();
  if (title.length < 4 || title.length > 140) return { valid: false, reason: 'bad_title_length' };
  if (/^(apply|view|jobs|careers|home|skip to main content|benefits|locations|teams)$/i.test(title)) {
    return { valid: false, reason: 'generic_title' };
  }
  if (/privacy|terms|cookie|login|signup|support|help|blog|press|investor|benefits/i.test(`${title} ${effective.pathname}`)) {
    return { valid: false, reason: 'non_job_page' };
  }

  const queryHaystack = `${title} ${effective.pathname} ${candidate.snippet || ''}`.toLowerCase();
  const queryTerms = (options.queryTerms || []).filter((term) => term.length > 2);
  if (queryTerms.length && !queryTerms.some((term) => queryHaystack.includes(term.toLowerCase()))) {
    return { valid: false, reason: 'missing_query_term' };
  }

  const jobSignalHaystack = `${effective.pathname} ${candidate.snippet || ''}`.toLowerCase();
  const jobSignals = options.jobPathSignals?.length ? options.jobPathSignals : DEFAULT_JOB_SIGNALS;
  if (!jobSignals.some((signal) => jobSignalHaystack.includes(signal.toLowerCase()))) {
    return { valid: false, reason: 'missing_job_signal' };
  }

  return { valid: true };
}
```

- [ ] **Step 4: Run tests**

Run: `npm test`

Expected: PASS for `job-link-validator.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/scraping/job-link-validator.ts src/lib/services/scraping/__tests__/job-link-validator.test.ts
git commit -m "test: cover scraped job link validation"
```

### Task 3: Define Log Redaction Tests

**Files:**
- Create: `src/lib/services/scraping/__tests__/log-redaction.test.ts`
- Create: `src/lib/services/scraping/log-redaction.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/services/scraping/__tests__/log-redaction.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { redactSensitiveText, redactPayloadForLog } from '../log-redaction';

test('redacts email, phone, and token-like query values', () => {
  const text = 'Email recruiter@example.com phone +91 98765 43210 url https://x.test?a=1&token=secret';
  const redacted = redactSensitiveText(text);
  assert.doesNotMatch(redacted, /recruiter@example\.com/);
  assert.doesNotMatch(redacted, /98765/);
  assert.doesNotMatch(redacted, /secret/);
  assert.match(redacted, /\[redacted-email\]/);
});

test('caps payload output at requested limit', () => {
  const value = redactPayloadForLog({ text: 'x'.repeat(80_000) }, 50_000);
  assert.ok(value.length <= 50_000);
});
```

- [ ] **Step 2: Run specific test to verify failure**

Run: `npm test -- log-redaction`

Expected: FAIL because `log-redaction.ts` does not exist.

- [ ] **Step 3: Implement redaction helper**

Create `src/lib/services/scraping/log-redaction.ts`:

```ts
export function redactSensitiveText(input: string, maxLength = 20_000) {
  const redacted = String(input || '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/g, '[redacted-phone]')
    .replace(/([?&](?:token|key|api_key|auth|session|password|secret)=)[^&\s]+/gi, '$1[redacted-secret]')
    .replace(/\b(token|key|api_key|apiKey|auth|session|password|secret)\s*=\s*[^\s"'<>]+/gi, '$1=[redacted-secret]')
    .replace(/("(?:token|key|apiKey|api_key|auth|session|password|secret)"\s*:\s*")[^"]+(")/gi, '$1[redacted-secret]$2');
  return redacted.slice(0, maxLength);
}

export function redactPayloadForLog(payload: unknown, maxLength = 50_000) {
  const raw = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  return redactSensitiveText(raw || '', maxLength);
}
```

- [ ] **Step 4: Run tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/scraping/log-redaction.ts src/lib/services/scraping/__tests__/log-redaction.test.ts
git commit -m "test: cover scraping log redaction"
```

---

## Chunk 2: Wire Scraper Hardening Into Runtime

### Task 4: Apply Link Validation In Base Adapter

**Files:**
- Modify: `src/lib/services/scraping/adapters/base.ts`
- Modify: `src/lib/services/scraping/adapters/configured-sources.ts`
- Modify as needed: `src/lib/services/scraping/adapters/google-jobs.ts`
- Modify as needed: `src/lib/services/scraping/adapters/jobspy-fallback.ts`
- Modify as needed: `src/lib/services/scraping/adapters/company-ats.ts`

- [ ] **Step 1: Inspect current extraction context**

Read:

```bash
sed -n '1,240p' src/lib/services/scraping/adapters/base.ts
sed -n '1,80p' src/lib/services/scraping/types.ts
```

Confirm:

- `extractJobLinksFromPage` receives `page`, `query`, and `options`.
- `RawScrapedJob` already has optional `snippet`.
- Query terms can be derived from `query.titleVariants`, split on non-alphanumeric characters, filtered to terms longer than 2 characters.

- [ ] **Step 2: Extend extraction options**

In `BasePortalAdapter.extractJobLinksFromPage`, add option fields:

```ts
allowedHosts?: string[];
disallowedHosts?: string[];
jobPathSignals?: string[];
```

- [ ] **Step 3: Derive query terms explicitly**

Inside `extractJobLinksFromPage`, keep the existing title-term derivation and name it clearly:

```ts
const titleTerms = query.titleVariants
  .flatMap((title) => title.toLowerCase().split(/[^a-z0-9]+/))
  .filter((term) => term.length > 2 && !['and', 'the', 'for'].includes(term));
const extractionTerms = titleTerms.length ? titleTerms : ['product', 'manager'];
const validationTerms = titleTerms;
```

Pass `extractionTerms` into the existing browser-side `fallbackArgs.terms` so extraction stays tolerant when the profile has no usable title terms. Pass `validationTerms` to the validator; if no terms exist, validation receives `[]` so host/path/generic checks still run.

- [ ] **Step 4: Post-filter extracted jobs with validator**

After `page.evaluate`, run:

```ts
const { validateExtractedJobLink } = await import('../job-link-validator');
const validatedJobs = (jobs as RawScrapedJob[]).filter((job) => {
  const validation = validateExtractedJobLink({
    portal: job.portal,
    title: job.title,
    url: job.url,
    snippet: job.snippet,
  }, {
    allowedHosts: options.allowedHosts,
    disallowedHosts: options.disallowedHosts,
    jobPathSignals: options.jobPathSignals,
    queryTerms: validationTerms,
  });
  if (!validation.valid) {
    job.rawPayload = { ...(job.rawPayload || {}), rejectedReason: validation.reason };
  }
  return validation.valid;
});
return validatedJobs;
```

- [ ] **Step 5: Add host allowlists to configured sources**

In `configured-sources.ts`, extend `ConfiguredSource`:

```ts
allowedHosts: string[];
jobPathSignals?: string[];
```

Add exact allowlists, for example:

```ts
allowedHosts: ['shine.com'],
allowedHosts: ['timesjobs.com'],
allowedHosts: ['glassdoor.co.in'],
allowedHosts: ['placementindia.com'],
allowedHosts: ['cutshort.io'],
allowedHosts: ['hirist.tech'],
allowedHosts: ['iimjobs.com'],
allowedHosts: ['internshala.com'],
allowedHosts: ['freshersworld.com'],
allowedHosts: ['apna.co'],
allowedHosts: ['workindia.in'],
allowedHosts: ['sarkariresult.com', 'freejobalert.com', 'gov.in'],
```

- [ ] **Step 6: Wire configured-source validation options**

In `ConfiguredSourceAdapter.scrape()`, update the `extractJobLinksFromPage` call to pass the new source-level validation options:

```ts
const extracted = await this.extractJobLinksFromPage(page, query, {
  hrefIncludes: this.config.hrefIncludes,
  max: this.config.maxJobs || 12,
  defaultCompany: this.config.defaultCompany,
  defaultLocation: firstLocation(query),
  allowedHosts: this.config.allowedHosts,
  jobPathSignals: this.config.jobPathSignals,
});
```

This step is required; adding `allowedHosts` to the config without passing it into extraction does not satisfy the spec.

- [ ] **Step 7: Pass validation options from source adapters**

For Google/JobSpy discovery, use a bounded host list rather than hostless `/jobs/` patterns:

```ts
allowedHosts: [
  'linkedin.com',
  'naukri.com',
  'foundit.in',
  'shine.com',
  'greenhouse.io',
  'lever.co',
  'ashbyhq.com',
  'workdayjobs.com',
  'myworkdayjobs.com',
]
```

- [ ] **Step 8: Run tests and typecheck**

Run:

```bash
npm test
npm run typecheck
```

Expected: both PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/services/scraping/adapters/base.ts src/lib/services/scraping/adapters/configured-sources.ts src/lib/services/scraping/adapters/google-jobs.ts src/lib/services/scraping/adapters/jobspy-fallback.ts src/lib/services/scraping/adapters/company-ats.ts
git commit -m "fix: validate scraped job links before persistence"
```

### Task 5: Fix Naukri Mapping

**Files:**
- Modify: `src/lib/services/scraping/adapters/naukri.ts`
- Create: `src/lib/services/scraping/adapters/__tests__/naukri.test.ts`

- [ ] **Step 1: Extract or expose a pure mapper**

If the Naukri API mapper is inline, extract:

```ts
export function mapNaukriApiRow(row: any, queryLocation: string): RawScrapedJob | null
```

- [ ] **Step 2: Write fixture test**

Create `naukri.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { mapNaukriApiRow } from '../naukri';

test('maps Naukri placeholder values instead of labels', () => {
  const row = {
    title: 'AI Product Manager',
    companyName: 'Acme',
    jdURL: 'https://www.naukri.com/job-listings-ai-product-manager-acme-123',
    placeholders: [
      { type: 'location', label: 'location', value: 'Bengaluru' },
      { type: 'experience', label: 'experience', value: '2-4 Yrs' },
      { type: 'salary', label: 'salary', value: '17-25 LPA' },
    ],
  };
  const job = mapNaukriApiRow(row, 'India');
  assert.equal(job?.location, 'Bengaluru');
  assert.equal(job?.experienceText, '2-4 Yrs');
  assert.equal(job?.salaryText, '17-25 LPA');
});
```

- [ ] **Step 3: Run test to verify failure or regression**

Run: `npm test -- naukri`

Expected before fix: FAIL if labels are returned.

- [ ] **Step 4: Fix placeholder helper**

Change helper precedence to:

```ts
return match?.value || match?.label || undefined;
```

Also support common keys like `name`, `type`, and `key`.

- [ ] **Step 5: Run tests**

Run:

```bash
npm test
npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/scraping/adapters/naukri.ts src/lib/services/scraping/adapters/__tests__/naukri.test.ts
git commit -m "fix: map Naukri placeholder values correctly"
```

### Task 6: Preserve Unknown Sources And Fix Scan Accounting

**Files:**
- Modify: `src/lib/services/scraping/source-universe.ts`
- Modify: `src/lib/services/scraping/orchestrator.ts`
- Modify: `src/lib/services/scraping/failures.ts`
- Create: `src/lib/services/scraping/scan-run-utils.ts`
- Create: `src/lib/services/scraping/__tests__/source-selection.test.ts`
- Create: `src/lib/services/scraping/__tests__/orchestrator-hardening.test.ts`

- [ ] **Step 1: Add source partition helper test**

Create `source-selection.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { partitionSourcesByAvailability } from '../source-universe';

test('keeps invalid selected sources for diagnostics', () => {
  const result = partitionSourcesByAvailability(['company', 'Not-A-Source', 'monster'], ['company_ats', 'foundit']);
  assert.deepEqual(result.valid, ['company_ats', 'foundit']);
  assert.deepEqual(result.invalid, ['Not-A-Source']);
});
```

- [ ] **Step 2: Add orchestrator invalid-source diagnostics tests**

Create `src/lib/services/scraping/__tests__/orchestrator-hardening.test.ts`.

Use one isolated temp data dir for this test file before importing DB-backed modules. Do not create a new DB after the first DB-backed import; `src/db` and `orchestrator.ts` are module singletons in-process.

```ts
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { eq } from 'drizzle-orm';
import { BasePortalAdapter } from '../adapters/base';
import { countPersistedUniqueJobs } from '../scan-run-utils';

let appModules: Awaited<ReturnType<typeof initializeTestAppModules>>;

async function initializeTestAppModules() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'career-seek-hardening-'));
  process.env.JOBHUNT_DATA_DIR = dir;
  const env = { ...process.env, JOBHUNT_DATA_DIR: dir };
  for (const script of ['scripts/db-schema-push.mjs', 'scripts/k1-bootstrap-migration.mjs']) {
    const result = spawnSync('node', [script], { cwd: process.cwd(), env, stdio: 'inherit' });
    assert.equal(result.status, 0, `${script} should complete for isolated test DB`);
  }
  const dbModule = await import('../../../../db');
  const schema = await import('../../../../db/schema');
  const { ScanOrchestrator } = await import('../orchestrator');
  const db = dbModule.getDb();
  const ownerProfile = db.select({ id: schema.userProfiles.id })
    .from(schema.userProfiles)
    .where(eq(schema.userProfiles.isDefault, true))
    .get();
  assert.ok(ownerProfile, 'bootstrap profile should exist');
  return { dir, db, schema, ScanOrchestrator, ownerProfileId: ownerProfile.id };
}

before(async () => {
  appModules = await initializeTestAppModules();
});

test('all-invalid source selection creates failed source diagnostics without browser work', async () => {
  const { db, schema, ScanOrchestrator, ownerProfileId } = appModules;
  const profile = db.insert(schema.searchProfiles).values({
    profileId: ownerProfileId,
    title: 'Product Manager',
    locations: JSON.stringify(['India']),
    preferredPortals: JSON.stringify(['Not-A-Source']),
    isActive: true,
  }).returning({ id: schema.searchProfiles.id }).get();

  const result = await new ScanOrchestrator().runScan(profile.id, ['Not-A-Source']);
  const runs = db.select().from(schema.scanPortalRuns).where(eq(schema.scanPortalRuns.scanId, result.scanId)).all();

  assert.equal(result.status, 'failed');
  assert.equal(result.failedPortals > 0, true);
  assert.equal(runs[0].portal, 'Not-A-Source');
  assert.equal(runs[0].status, 'failed');
  assert.match(runs[0].error || '', /unknown_source/);
  assert.equal(runs[0].jobsFound, 0);
  assert.ok(runs[0].startedAt);
  assert.ok(runs[0].finishedAt);
});
```

Do not import `orchestrator.ts` or `src/db` at top level in this test file. They import DB-backed modules, so all orchestrator and DB imports must happen inside `initializeTestAppModules()` after `JOBHUNT_DATA_DIR` is set.

Run this test in its own filtered process with `npm test -- orchestrator-hardening` if needed, but still initialize one temp DB once per file before imports. Do not weaken the assertions to pure helpers only.

- [ ] **Step 3: Add scan accounting test before implementation**

Add to `orchestrator-hardening.test.ts`:

```ts
test('scan accounting uses persisted unique rows, not raw scraped rows', () => {
  const rawScrapedCount = 3;
  const persistedUniqueRows = [{ id: 1 }, { id: 2 }];
  const persistedCount = countPersistedUniqueJobs(persistedUniqueRows, rawScrapedCount);
  assert.equal(persistedCount, 2);
  assert.notEqual(persistedCount, rawScrapedCount);
});

test('runScan persists scan total as unique rows after duplicate raw jobs', async () => {
  const { db, schema, ScanOrchestrator, ownerProfileId } = appModules;
  class DuplicateAdapter extends BasePortalAdapter {
    identifier = 'duplicate_source';
    displayName = 'Duplicate source';
    async healthCheck() { return true; }
    async scrape() {
      return this.formatResult([
        { portal: this.identifier, title: 'AI Product Manager', company: 'Acme', location: 'India', url: 'https://acme.test/jobs/1' },
        { portal: this.identifier, title: 'AI Product Manager', company: 'Acme', location: 'India', url: 'https://acme.test/jobs/1' },
        { portal: this.identifier, title: 'Product Manager', company: 'Acme', location: 'India', url: 'https://acme.test/jobs/2' },
      ]);
    }
  }
  const profile = db.insert(schema.searchProfiles).values({
    profileId: ownerProfileId,
    title: 'Product Manager',
    locations: JSON.stringify(['India']),
    preferredPortals: JSON.stringify(['duplicate_source']),
    isActive: true,
  }).returning({ id: schema.searchProfiles.id }).get();
  const fakeBrowserManager = { init: async () => ({}), close: async () => undefined };
  const adapters = new Map([['duplicate_source', new DuplicateAdapter()]]);
  const scan = await new ScanOrchestrator({ browserManager: fakeBrowserManager as any, adapters }).runScan(profile.id, ['duplicate_source']);
  const scanRow = db.select().from(schema.scans).where(eq(schema.scans.id, scan.scanId)).get();
  const persisted = db.select().from(schema.normalizedJobs).all();
  assert.equal(scanRow?.totalJobs, persisted.length);
  assert.equal(persisted.length, 2);
});
```

These tests should fail until the helper exists, the orchestrator supports test-time adapter/browser injection, and the orchestrator uses the persisted count after dedupe.

- [ ] **Step 4: Implement helper**

In `source-universe.ts`:

```ts
export function partitionSourcesByAvailability(sourceIds: string[], availableIds: Iterable<string>) {
  const available = new Set(Array.from(availableIds));
  const ordered = orderSourcesByLadder(sourceIds);
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const originalSourceId of sourceIds) {
    const sourceId = originalSourceId.trim();
    const resolved = resolveSourceId(sourceId);
    if (available.has(resolved)) valid.push(resolved);
    else invalid.push(originalSourceId);
  }
  const validSet = new Set(valid);
  return { valid: ordered.filter((sourceId) => validSet.has(sourceId)), invalid: Array.from(new Set(invalid)) };
}
```

- [ ] **Step 5: Add `unknown_source` failure code**

In `failures.ts`, add `unknown_source` to `SourceFailureCode`.

- [ ] **Step 6: Create pure scan-run utilities**

Create `src/lib/services/scraping/scan-run-utils.ts`:

```ts
import { serializeSourceFailure } from './failures';

export function countPersistedUniqueJobs(uniqueJobs: unknown[], _rawScrapedCount?: number) {
  return uniqueJobs.length;
}

export function buildUnknownSourceRunValues(scanId: number, sourceId: string) {
  const now = new Date();
  return {
    scanId,
    portal: sourceId,
    status: 'failed' as const,
    error: serializeSourceFailure({
      code: 'unknown_source',
      message: `No scanner adapter is configured for source "${sourceId}".`,
    }),
    jobsFound: 0,
    startedAt: now,
    finishedAt: now,
  };
}
```

Keep this module free of DB imports.

- [ ] **Step 7: Update orchestrator source loop**

In `orchestrator.ts`:

- Use `partitionSourcesByAvailability`.
- Stop mapping `selectedPortals` through `resolveSourceId` before partitioning; partitioning must preserve the original invalid selected ID for diagnostics.
- Insert failed portal runs for invalid sources before valid source scraping.
- Keep `failedPortals` accurate.
- If no valid sources remain, finish scan as failed with invalid-source message.
- Import and use `buildUnknownSourceRunValues` from `scan-run-utils.ts`.
- Add optional constructor injection for tests without changing production behavior:

```ts
constructor(options: { browserManager?: BrowserManager; adapters?: Map<string, BasePortalAdapter> } = {}) {
  this.browserManager = options.browserManager || new BrowserManager();
  this.adapters = options.adapters || new Map();
  if (!options.adapters) {
    // existing production adapter registration stays here
  }
}
```

- [ ] **Step 8: Fix total job accounting**

Change `totalJobsFound += scrapeResult.jobs.length` to count persisted unique rows:

```ts
const persistedCount = countPersistedUniqueJobs(unique, scrapeResult.jobs.length);
totalJobsFound += persistedCount;
```

Keep portal run `jobsFound` as persisted unique count for UI clarity. If raw scraped count is needed later, add a separate field in a future migration rather than overloading `jobsFound`.

- [ ] **Step 9: Run tests and typecheck**

Run:

```bash
npm test
npm run typecheck
```

- [ ] **Step 10: Commit**

```bash
git add src/lib/services/scraping/source-universe.ts src/lib/services/scraping/orchestrator.ts src/lib/services/scraping/failures.ts src/lib/services/scraping/scan-run-utils.ts src/lib/services/scraping/__tests__/source-selection.test.ts src/lib/services/scraping/__tests__/orchestrator-hardening.test.ts
git commit -m "fix: keep invalid sources visible in scan diagnostics"
```

### Task 7: Redact Raw Payloads And Failure Snapshots

**Files:**
- Modify: `src/lib/services/scraping/orchestrator.ts`
- Modify: `src/lib/services/scraping/failures.ts`
- Modify: `src/lib/services/scraping/log-redaction.ts`
- Create: `src/lib/services/scraping/__tests__/failure-snapshot.test.ts`

- [ ] **Step 1: Write runtime snapshot privacy tests**

Create `src/lib/services/scraping/__tests__/failure-snapshot.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { captureFailureSnapshot } from '../failures';

function fakePage(html: string, url = 'https://www.example.com/jobs?token=secret') {
  return {
    url: () => url,
    content: async () => html,
    locator: () => ({
      innerText: async () => html.replace(/<[^>]+>/g, ' '),
    }),
  };
}

test('default failure snapshot writes redacted excerpt and no full html', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'career-seek-snapshot-'));
  process.env.JOBHUNT_DATA_DIR = dir;
  delete process.env.JOBHUNT_DEBUG_SNAPSHOTS;
  const snapshot = await captureFailureSnapshot(fakePage('<html>recruiter@example.com +91 98765 43210 token=secret</html>'), 'test', 'blocked');
  assert.ok(snapshot);
  assert.equal(snapshot?.endsWith('.json'), true);
  const files = fs.readdirSync(path.join(dir, 'logs', 'source-failures'));
  assert.equal(files.some((file) => file.endsWith('.html')), false);
  const textFile = files.find((file) => file.endsWith('.txt'));
  assert.ok(textFile);
  const text = fs.readFileSync(path.join(dir, 'logs', 'source-failures', textFile!), 'utf8');
  assert.doesNotMatch(text, /recruiter@example\.com/);
  assert.doesNotMatch(text, /token=secret/);
  assert.ok(text.length <= 20_000);
});

test('debug snapshot writes capped redacted html only when enabled', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'career-seek-snapshot-'));
  process.env.JOBHUNT_DATA_DIR = dir;
  process.env.JOBHUNT_DEBUG_SNAPSHOTS = '1';
  await captureFailureSnapshot(fakePage(`<html>${'x'.repeat(500_000)} token=secret</html>`), 'test', 'blocked');
  const files = fs.readdirSync(path.join(dir, 'logs', 'source-failures'));
  const htmlFile = files.find((file) => file.endsWith('.html'));
  assert.ok(htmlFile);
  const html = fs.readFileSync(path.join(dir, 'logs', 'source-failures', htmlFile!), 'utf8');
  assert.ok(html.length <= 350_000);
  assert.doesNotMatch(html, /token=secret/);
});
```

Expected before implementation: FAIL because current snapshots write full HTML by default and do not redact.

- [ ] **Step 2: Use redaction in `persistRawPayload`**

In `orchestrator.ts`, replace raw JSON write with:

```ts
import { redactPayloadForLog } from './log-redaction';

fs.writeFileSync(filePath, redactPayloadForLog(rawPayload, 50_000), 'utf8');
```

- [ ] **Step 3: Gate full HTML snapshots**

In `captureFailureSnapshot`, default to writing a JSON metadata file plus a redacted text excerpt capped at 20 KB.

Only write full HTML when:

```ts
process.env.JOBHUNT_DEBUG_SNAPSHOTS === '1'
```

- [ ] **Step 4: Keep metadata useful**

Snapshot metadata should include:

```ts
{ portal, code, urlHost, urlPath, capturedAt, debugHtmlEnabled }
```

- [ ] **Step 5: Run tests and typecheck**

Run:

```bash
npm test
npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/scraping/orchestrator.ts src/lib/services/scraping/failures.ts src/lib/services/scraping/log-redaction.ts src/lib/services/scraping/__tests__/failure-snapshot.test.ts
git commit -m "fix: redact scraping debug artifacts"
```

---

## Chunk 3: Mobile Navigation, Accessibility, And Async Recovery

### Task 8: Add Mobile App Navigation

**Files:**
- Create: `src/components/MobileNav.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Create mobile nav component**

Create `MobileNav.tsx` with client-side route active state:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Briefcase, FileText, Home, MessageSquare, Search, Settings } from 'lucide-react';

const items = [
  { href: '/today', label: 'Today', icon: Home },
  { href: '/discover', label: 'Discover', icon: Search },
  { href: '/pipeline', label: 'Pipeline', icon: Briefcase },
  { href: '/documents', label: 'Documents', icon: FileText },
  { href: '/coach', label: 'Coach', icon: MessageSquare },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary mobile navigation" className="fixed inset-x-0 bottom-0 z-50 border-t border-black/10 bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] shadow-lg backdrop-blur lg:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-6">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-semibold ${active ? 'text-primary' : 'text-muted-foreground'}`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Render it in app layout**

First inspect the existing app shell and route structure:

```bash
sed -n '1,140p' src/app/layout.tsx
sed -n '1,140p' src/components/Sidebar.tsx
fd -a 'page.tsx' src/app -d 2
```

Render `MobileNav` only inside the authenticated app shell or a path-gated client wrapper that excludes onboarding, setup, and public pages. Do not replace or restructure the existing desktop sidebar/shell.

Add bottom padding to the authenticated main content container on mobile, for example `pb-20 lg:pb-0`, so the fixed nav does not cover CTAs.

- [ ] **Step 3: Browser smoke check**

Open `http://localhost:3010/today` at mobile width. Verify bottom nav appears, active route is visible, and page CTA content is not covered.

- [ ] **Step 4: Typecheck and commit**

```bash
npm run typecheck
git add src/components/MobileNav.tsx src/app/layout.tsx
git commit -m "feat: add mobile app navigation"
```

### Task 9: Fix High-Use Labels And Dialog Semantics

**Files:**
- Modify: `src/components/OnboardingFlow.tsx`
- Modify: `src/app/discover/page.tsx`
- Modify: `src/components/jobs/RankedJobCard.tsx`
- Modify: `src/app/pipeline/page.tsx`
- Modify as needed: `src/app/pipeline/[id]/page.tsx`

- [ ] **Step 1: Label onboarding API key**

Add an `id` to the API key input and `htmlFor` to the label.

- [ ] **Step 2: Label Discover filters**

For search/filter/select controls, add visible labels or `aria-label`:

```tsx
<label htmlFor="discover-search" className="sr-only">Search jobs</label>
<input id="discover-search" ... />
```

- [ ] **Step 3: Label Pipeline filters/actions**

Add labels to search/status/source selects and `aria-label` to icon-only buttons.

- [ ] **Step 4: Add dialog semantics to job card modal**

For the modal container in `RankedJobCard.tsx`, add:

```tsx
role="dialog"
aria-modal="true"
aria-labelledby={`job-actions-${scoredJob.id}`}
```

Give the heading that matching ID. Add `aria-label="Close job actions"` to the close button.

- [ ] **Step 5: Add dialog semantics to add-job modal**

For Pipeline add-job modal, add `role`, `aria-modal`, labelled heading, close label, and Escape key close if not already present.

- [ ] **Step 6: Typecheck and commit**

```bash
npm run typecheck
git add src/components/OnboardingFlow.tsx src/app/discover/page.tsx src/components/jobs/RankedJobCard.tsx src/app/pipeline/page.tsx 'src/app/pipeline/[id]/page.tsx'
git commit -m "fix: improve app accessibility labels and dialogs"
```

### Task 10: Add Async Cleanup And Recoverable Errors

**Files:**
- Modify: `src/app/discover/page.tsx`
- Modify: `src/components/CommandCenterClient.tsx`
- Modify: `src/components/jobs/RankedJobCard.tsx`
- Modify as needed: `src/app/pipeline/page.tsx`

- [ ] **Step 1: Wrap Discover scan/score actions in `try/finally`**

Pattern:

```tsx
setScanLoading(true);
setActionError(null);
try {
  const result = await runScanAction();
  if (!result.success) setActionError(result.error || 'Scan failed.');
} catch (error) {
  setActionError(error instanceof Error ? error.message : 'Scan failed.');
} finally {
  setScanLoading(false);
}
```

- [ ] **Step 2: Show inline recoverable errors**

Render error text near the relevant CTA with `role="alert"` where appropriate.

- [ ] **Step 3: Ensure job document actions reset**

In `RankedJobCard.tsx`, wrap generation actions with `try/finally` so `loadingAction` clears on thrown errors.

- [ ] **Step 4: Ensure Command Center load failures are visible**

If `fetchCommandCenter()` fails, show a concise reloadable error instead of silently stopping loading.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/app/discover/page.tsx src/components/CommandCenterClient.tsx src/components/jobs/RankedJobCard.tsx src/app/pipeline/page.tsx
git commit -m "fix: make async actions recoverable"
```

### Task 11: Make Pipeline Mobile-First

**Files:**
- Modify: `src/app/pipeline/page.tsx`
- Modify as needed: `src/app/pipeline/[id]/page.tsx`

- [ ] **Step 1: Default mobile to list/card view**

Use responsive classes so the Kanban board is hidden on small screens and a stacked list is visible:

```tsx
<div className="md:hidden">...</div>
<div className="hidden md:block">...</div>
```

- [ ] **Step 2: Convert mobile application rows to cards**

Each mobile card should show:

- Title.
- Company/location.
- Status chip.
- Score/tier if available.
- Primary action to open details.

- [ ] **Step 3: Prevent application detail tab overflow**

Use `overflow-x-auto`, stable minimum tab widths, and visible focus states.

- [ ] **Step 4: Browser smoke check**

At 375px and 768px widths, verify no horizontal page scroll and application status remains readable.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/app/pipeline/page.tsx 'src/app/pipeline/[id]/page.tsx'
git commit -m "fix: improve pipeline mobile layout"
```

---

## Chunk 4: Final Validation And Documentation

### Task 12: Run Automated Validation

**Files:**
- No code files unless failures require fixes.

- [ ] **Step 1: Run tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run optional doctor/build if time allows**

Run:

```bash
npm run doctor
npm run build
```

Expected: PASS or document blockers.

### Task 13: Run Browser Smoke Checks

**Files:**
- No code files unless failures require fixes.

- [ ] **Step 1: Desktop shell check**

Use the running dev server or start:

```bash
JOBHUNT_DATA_DIR=./data npm run dev -- -p 3010
```

Open:

- `http://localhost:3010/today`
- `http://localhost:3010/discover`
- `http://localhost:3010/pipeline`
- `http://localhost:3010/documents`

Expected: desktop sidebar remains usable.

- [ ] **Step 2: Mobile shell check**

At 375px width, verify:

- Bottom nav appears.
- Today, Discover, Pipeline, Documents, Coach, Settings are reachable.
- No core CTA is covered by the nav.
- No horizontal page scroll on Pipeline.

- [ ] **Step 3: Keyboard check**

Tab through:

- Discover filters and job card actions.
- Job card modal open/close.
- Pipeline add-job modal open/close.

Expected: controls have names, focus is visible, Escape closes dialogs where implemented.

- [ ] **Step 4: Limited partial-scan continuation check**

Run a deliberately small deterministic scan in an explicit validation data directory, not the user's normal local DB:

```bash
HARDENING_DATA_DIR="$(mktemp -d -t career-seek-hardening)"
JOBHUNT_DATA_DIR="$HARDENING_DATA_DIR" node scripts/db-schema-push.mjs
JOBHUNT_DATA_DIR="$HARDENING_DATA_DIR" node scripts/k1-bootstrap-migration.mjs
JOBHUNT_DATA_DIR="$HARDENING_DATA_DIR" JOBHUNT_ENABLE_VALIDATION_SOURCE=1 npx tsx -e "import { getDb } from './src/db'; import { searchProfiles, scanPortalRuns } from './src/db/schema'; import { eq } from 'drizzle-orm'; import { ScanOrchestrator } from './src/lib/services/scraping/orchestrator'; (async()=>{ const db=getDb(); const profile=db.insert(searchProfiles).values({ profileId:1, title:'Product Manager', locations: JSON.stringify(['India']), preferredPortals: JSON.stringify(['validation_seed','validation_fail']), isActive:true }).returning({ id: searchProfiles.id }).get(); const scan=await new ScanOrchestrator().runScan(profile.id, ['validation_seed','validation_fail']); const runs=db.select().from(scanPortalRuns).where(eq(scanPortalRuns.scanId, scan.scanId)).all(); console.log(JSON.stringify({ scan, runs: runs.map(r=>({ portal:r.portal, status:r.status, jobsFound:r.jobsFound, error:r.error })) }, null, 2)); })().catch((error)=>{ console.error(error); process.exit(1); });"
```

Expected validation outcome:

- `validation_fail` records a failed source run.
- `validation_seed` records a successful source run with usable jobs.
- `scan_portal_runs` contains both failed/partial and successful source records when available.
- The scan status is `partial` or `complete` when at least one source returns usable jobs; it is not marked successful with zero usable jobs.

Optional live check after deterministic validation:

```bash
JOBHUNT_DATA_DIR="$HARDENING_DATA_DIR" JOBHUNT_COMPANY_SOURCE_LIMIT=3 npx tsx -e "import { getDb } from './src/db'; import { searchProfiles, scanPortalRuns } from './src/db/schema'; import { eq } from 'drizzle-orm'; import { ScanOrchestrator } from './src/lib/services/scraping/orchestrator'; (async()=>{ const db=getDb(); const profile=db.insert(searchProfiles).values({ profileId:1, title:'Product Manager', locations: JSON.stringify(['India']), preferredPortals: JSON.stringify(['company_ats','google_jobs']), isActive:true }).returning({ id: searchProfiles.id }).get(); const scan=await new ScanOrchestrator().runScan(profile.id, ['company_ats','google_jobs']); const runs=db.select().from(scanPortalRuns).where(eq(scanPortalRuns.scanId, scan.scanId)).all(); console.log(JSON.stringify({ scan, runs: runs.map(r=>({ portal:r.portal, status:r.status, jobsFound:r.jobsFound, error:r.error })) }, null, 2)); })().catch((error)=>{ console.error(error); process.exit(1); });"
```

If the live network blocks all sources, document that as a validation limitation in `docs/CRITICAL_HARDENING_VALIDATION.md`; deterministic validation remains the source of truth for continuation logic.

### Task 14: Document Validation Result

**Files:**
- Create: `docs/CRITICAL_HARDENING_VALIDATION.md`

- [ ] **Step 1: Write validation report**

Include:

- Commands run.
- Pass/fail status.
- Browser smoke results.
- Known remaining gaps.
- Any deferred build/doctor blockers.

- [ ] **Step 2: Commit validation report**

```bash
git add docs/CRITICAL_HARDENING_VALIDATION.md
git commit -m "docs: record critical hardening validation"
```

## Execution Notes

- Do not revert unrelated dirty worktree changes.
- Prefer `apply_patch` for manual edits.
- Keep changes scoped to the files above unless tests expose a directly related dependency.
- Run `git status --short` before each commit and stage only files changed for that task.
- If a task touches a file with unrelated user edits, inspect the diff carefully and preserve those edits.

## Completion Criteria

- All chunks completed.
- `npm test` passes.
- `npm run typecheck` passes.
- Mobile nav is usable at 375px.
- Dialogs and high-use controls have accessible names.
- Scraping hardening tests pass.
- Validation report exists.
