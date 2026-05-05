import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { chromium } from 'playwright';
import Redis from 'ioredis';
import { desc, eq, inArray, sql } from 'drizzle-orm';
import { getDb, getSqliteInstance } from '@/db';
import { platformJobs, scanPortalRuns } from '@/db/schema';
import { getBaseAppDir, getStorageFallbackStatus } from '@/lib/local-paths';
import { getAIManager } from '@/lib/ai/manager';
import { buildDefaultScraperManager } from '@/lib/services/scraping/scraper-manager';
import { pythonCandidates } from '@/lib/services/scraping/python-path';

const execFileAsync = promisify(execFile);
const CHROMIUM_HEALTH_CACHE_MS = 5 * 60 * 1000;
let chromiumHealthCache: { checkedAt: number; item: HealthCheckItem } | null = null;

export type HealthState = 'pass' | 'warn' | 'fail' | 'skipped';

export interface HealthCheckItem {
  id: string;
  label: string;
  state: HealthState;
  message: string;
  action?: string;
  metadata?: Record<string, unknown>;
}

export interface SystemHealth {
  ok: boolean;
  status: HealthState;
  generatedAt: string;
  dataDir: string;
  checks: HealthCheckItem[];
  issues: string[];
  recovery: {
    interruptedJobs: number;
    recovering: boolean;
  };
  aiCircuitBreakers: ReturnType<ReturnType<typeof getAIManager>['getCircuitBreakerSnapshot']>;
}

function safeMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error || 'Unknown error'))
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted-api-key]')
    .replace(/sk-[0-9A-Za-z_-]{20,}/g, '[redacted-api-key]')
    .slice(0, 360);
}

function check(id: string, label: string, state: HealthState, message: string, action?: string, metadata?: Record<string, unknown>): HealthCheckItem {
  return { id, label, state, message, action, metadata };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs)),
  ]);
}

async function redisHealth(): Promise<HealthCheckItem> {
  const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  const client = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    connectTimeout: 3_000,
    retryStrategy: () => null,
    enableOfflineQueue: false,
  });
  client.on('error', () => undefined);
  try {
    await withTimeout(client.connect(), 3_000);
    const pong = await withTimeout(client.ping(), 2_000);
    return check('redis', 'Redis queue', pong === 'PONG' ? 'pass' : 'warn', 'Redis is reachable for BullMQ queues.', undefined, { redisUrl });
  } catch (error) {
    return check(
      'redis',
      'Redis queue',
      'fail',
      `Redis is not reachable at ${redisUrl}. Background scans and document jobs will wait.`,
      'Run ./setup.sh --repair or npm run launch so the bundled Redis starts.',
      { reason: safeMessage(error), redisUrl },
    );
  } finally {
    client.disconnect();
  }
}

async function httpHealth(id: string, label: string, url: string | undefined, pathName: string, optional: boolean, action: string): Promise<HealthCheckItem> {
  if (!url) {
    return check(id, label, optional ? 'skipped' : 'warn', `${label} is not configured.`, action);
  }
  try {
    const response = await fetch(`${url.replace(/\/+$/, '')}${pathName}`, {
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return check(id, label, 'pass', `${label} is reachable.`, undefined, { url });
  } catch (error) {
    return check(id, label, optional ? 'warn' : 'fail', `${label} is unavailable; local fallback mode will be used.`, action, {
      url,
      reason: safeMessage(error),
    });
  }
}

async function chromiumHealth(): Promise<HealthCheckItem> {
  const now = Date.now();
  if (chromiumHealthCache && now - chromiumHealthCache.checkedAt < CHROMIUM_HEALTH_CACHE_MS) {
    return {
      ...chromiumHealthCache.item,
      metadata: {
        ...(chromiumHealthCache.item.metadata || {}),
        cached: true,
        checkedAt: new Date(chromiumHealthCache.checkedAt).toISOString(),
      },
    };
  }

  try {
    const browser = await withTimeout(chromium.launch({ headless: true }), 8_000);
    await browser.close();
    const item = check('chromium', 'Chromium browser', 'pass', 'Chromium launches successfully for browser-backed scraping and PDF checks.');
    chromiumHealthCache = { checkedAt: now, item };
    return item;
  } catch (error) {
    const item = check(
      'chromium',
      'Chromium browser',
      'warn',
      'Chromium could not launch. Browser-backed scraping may show honest source fallback messages.',
      'Run npx playwright install chromium, then ./setup.sh --repair.',
      { reason: safeMessage(error) },
    );
    chromiumHealthCache = { checkedAt: now, item };
    return item;
  }
}

async function pythonHealth(): Promise<HealthCheckItem> {
  const candidates = pythonCandidates();
  for (const candidate of [...new Set(candidates)]) {
    try {
      const version = await execFileAsync(candidate, ['-c', 'import sys; print(".".join(map(str, sys.version_info[:3]))); raise SystemExit(0 if sys.version_info >= (3, 9) else 2)'], { timeout: 3_000 });
      const [major, minor] = version.stdout.trim().split('.').map((part) => Number(part));
      if (major === 3 && minor >= 13) {
        return check(
          'python',
          'Python scraper fallback',
          'warn',
          `Python ${version.stdout.trim()} is installed, but python-jobspy is safest on Python 3.9-3.12. Career Seek can use the bundled Python 3.12 runtime after bootstrap.`,
          'Run ./setup.sh --repair to install or refresh the bundled Python 3.12 runtime.',
          { python: candidate },
        );
      }
      const jobspy = await execFileAsync(candidate, ['-c', 'import jobspy; print("ok")'], { timeout: 3_000 }).catch((error) => error);
      return check(
        'python',
        'Python scraper fallback',
        jobspy instanceof Error ? 'warn' : 'pass',
        jobspy instanceof Error
          ? `Python ${version.stdout.trim()} is available, but python-jobspy is not installed.`
          : `Python ${version.stdout.trim()} and python-jobspy are available.`,
        jobspy instanceof Error ? 'Run npm run bootstrap to create .venv-career-seek and install python-jobspy.' : undefined,
        { python: candidate },
      );
    } catch {
      // Try the next candidate.
    }
  }
  return check(
    'python',
    'Python scraper fallback',
    'warn',
    'Python 3.9-3.12 was not found yet. Career Seek will use other sources until bootstrap installs the bundled Python runtime.',
    'Run ./setup.sh --repair to install the bundled Python 3.12 runtime.',
  );
}

async function databaseHealth(): Promise<HealthCheckItem> {
  try {
    const sqlite = getSqliteInstance();
    const row = sqlite.prepare('PRAGMA quick_check').get() as Record<string, string> | undefined;
    const value = row ? Object.values(row)[0] : 'unknown';
    if (value !== 'ok') throw new Error(`quick_check returned ${value}`);
    getDb().select().from(platformJobs).limit(1).all();
    return check('database', 'SQLite database', 'pass', 'SQLite is readable and integrity check passed.', undefined, {
      path: path.join(getBaseAppDir(), 'db', 'jobhunt.db'),
    });
  } catch (error) {
    return check(
      'database',
      'SQLite database',
      'fail',
      'SQLite needs attention. The launcher will try to restore the latest backup on restart.',
      'Close the app and run ./setup.sh --repair.',
      { reason: safeMessage(error) },
    );
  }
}

async function storageHealth(): Promise<HealthCheckItem> {
  const status = getStorageFallbackStatus();
  const target = status.activeBaseDir;
  try {
    fs.mkdirSync(target, { recursive: true });
    const probe = path.join(target, `.health-${process.pid}-${Date.now()}`);
    fs.writeFileSync(probe, 'ok');
    fs.rmSync(probe, { force: true });
    return check(
      'storage',
      'Local file storage',
      status.usingFallback ? 'warn' : 'pass',
      status.usingFallback
        ? `Primary storage failed, so files are being saved in ${status.fallbackDir}.`
        : 'Local uploads and generated documents can be written.',
      status.usingFallback ? 'Free disk space or fix permissions on the original data folder.' : undefined,
      status,
    );
  } catch (error) {
    return check('storage', 'Local file storage', 'fail', 'Career Seek cannot write generated documents.', 'Free disk space or choose a writable JOBHUNT_DATA_DIR.', {
      reason: safeMessage(error),
      target,
    });
  }
}

async function diskHealth(): Promise<HealthCheckItem> {
  if (process.platform === 'win32') {
    return check('disk', 'Disk space', 'skipped', 'Disk space check is skipped on Windows in this runtime.');
  }
  try {
    const { stdout } = await execFileAsync('df', ['-k', getBaseAppDir()], { timeout: 3_000 });
    const lines = stdout.trim().split(/\r?\n/);
    const parts = lines[lines.length - 1]?.split(/\s+/) || [];
    const availableKb = Number(parts[3] || 0);
    const availableGb = availableKb / 1024 / 1024;
    return check(
      'disk',
      'Disk space',
      availableGb < 1 ? 'warn' : 'pass',
      availableGb < 1
        ? `Only ${availableGb.toFixed(1)} GB is free for resumes and generated documents.`
        : `${availableGb.toFixed(1)} GB free for local documents.`,
      availableGb < 1 ? 'Clear space before large resume/document batches.' : undefined,
      { availableGb: Number(availableGb.toFixed(2)) },
    );
  } catch (error) {
    return check('disk', 'Disk space', 'warn', 'Disk space could not be checked.', 'Make sure the data folder has free space before bulk generation.', {
      reason: safeMessage(error),
    });
  }
}

async function workerRecoveryHealth(): Promise<{ item: HealthCheckItem; interruptedJobs: number }> {
  try {
    const staleCutoff = new Date(Date.now() - 10 * 60 * 1000);
    const db = getDb();
    const interrupted = db.select({ count: sql<number>`count(*)` })
      .from(platformJobs)
      .where(inArray(platformJobs.status, ['running', 'processing']))
      .get()?.count || 0;
    const recentRecovered = db.select()
      .from(platformJobs)
      .where(eq(platformJobs.status, 'failed'))
      .all()
      .filter((job) => {
        if (!job.error || (job.updatedAt && job.updatedAt < staleCutoff)) return false;
        try {
          return JSON.parse(job.error).code === 'process_interrupted';
        } catch {
          return false;
        }
      }).length;
    return {
      interruptedJobs: interrupted + recentRecovered,
      item: check(
        'worker',
        'Background worker',
        interrupted || recentRecovered ? 'warn' : 'pass',
        interrupted || recentRecovered
          ? 'Interrupted work was detected. Use the recovery banner to resume or discard it.'
          : 'No interrupted worker jobs were detected.',
        interrupted || recentRecovered ? 'Use the Background Tasks recovery controls.' : undefined,
      ),
    };
  } catch (error) {
    return {
      interruptedJobs: 0,
      item: check('worker', 'Background worker', 'warn', 'Worker recovery status could not be checked.', 'Check Redis and SQLite health.', {
        reason: safeMessage(error),
      }),
    };
  }
}

async function scraperProviderHealth(): Promise<HealthCheckItem> {
  try {
    const providers = await buildDefaultScraperManager().health();
    const available = providers.filter((provider) => provider.available).length;
    return check(
      'scrapers',
      'Job source providers',
      available ? 'pass' : 'warn',
      available ? `${available}/${providers.length} scraper provider chains are available.` : 'No scraper provider chain is fully available.',
      available ? undefined : 'Check Chromium and Python. Blocked portals will show source-specific fallback labels.',
      { providers },
    );
  } catch (error) {
    return check('scrapers', 'Job source providers', 'warn', 'Scraper provider health could not be checked.', 'Continue with available sources or run ./setup.sh --repair.', {
      reason: safeMessage(error),
    });
  }
}

async function googleJobsDiscoveryHealth(): Promise<HealthCheckItem> {
  try {
    const providers = await buildDefaultScraperManager().health();
    const provider = providers.find((item) => item.id === 'google-jobs');
    let recentRuns: Array<typeof scanPortalRuns.$inferSelect> = [];
    try {
      recentRuns = getDb().select()
        .from(scanPortalRuns)
        .where(inArray(scanPortalRuns.portal, ['linkedin', 'indeed', 'google_jobs']))
        .orderBy(desc(scanPortalRuns.startedAt), desc(scanPortalRuns.id))
        .limit(12)
        .all();
    } catch {
      recentRuns = [];
    }
    const recentIssue = recentRuns.find((run) => /google-jobs/i.test(parsePortalFailureMessage(run.error)));
    const recentMessage = parsePortalFailureMessage(recentIssue?.error);

    if (!provider) {
      return check(
        'google_jobs',
        'Google Jobs discovery',
        'warn',
        'Google Jobs secondary discovery is not registered in the current scraper manager.',
        'Rebuild the app or run npm run typecheck to confirm the local provider bundle.',
      );
    }

    if (!provider.available) {
      return check(
        'google_jobs',
        'Google Jobs discovery',
        'warn',
        'Google Jobs secondary discovery is unavailable locally. LinkedIn and Indeed fallbacks will stay limited to their primary and tertiary providers.',
        'Run npm run bootstrap to restore python-jobspy or keep Chromium available for browser fallback.',
        { provider },
      );
    }

    if (recentIssue && /blocked|captcha|timed out|timeout|auth_gate|unavailable|rate_limited/i.test(recentMessage)) {
      return check(
        'google_jobs',
        'Google Jobs discovery',
        'warn',
        `Google Jobs preview discovery struggled in the latest ${recentIssue.portal} scan. ${recentMessage.slice(0, 180)}`,
        'Use View on Source and Paste Job URL for critical roles while Google is thin or blocked.',
        {
          provider,
          latestRunId: recentIssue.id,
          latestScanId: recentIssue.scanId,
          portal: recentIssue.portal,
        },
      );
    }

    return check(
      'google_jobs',
      'Google Jobs discovery',
      'pass',
      'Google Jobs secondary discovery is available for preview cards and URL handoff.',
      undefined,
      { provider },
    );
  } catch (error) {
    return check(
      'google_jobs',
      'Google Jobs discovery',
      'warn',
      'Google Jobs discovery health could not be checked.',
      'Run a Discover scan to refresh the fallback provider status.',
      { reason: safeMessage(error) },
    );
  }
}

function parsePortalFailureMessage(error: string | null | undefined) {
  if (!error) return '';
  try {
    const parsed = JSON.parse(error);
    if (parsed?.message) return String(parsed.message);
  } catch {
    // Stored errors may be plain text in older local databases.
  }
  return String(error);
}

function parseCompanyAtsStats(message: string) {
  const attempted = message.match(/attempted\s+(\d+)\s+company career sites/i)?.[1];
  const reached = message.match(/reached\s+(\d+)/i)?.[1];
  const structured = message.match(/structured ATS APIs\s+(\d+)/i)?.[1];
  const browser = message.match(/browser pages\s+(\d+)/i)?.[1];
  const html = message.match(/HTML fallbacks\s+(\d+)/i)?.[1];
  const failed = message.match(/failed\s+(\d+)/i)?.[1];
  const blocked = message.match(/blocked\s+(\d+)/i)?.[1];
  const timedOut = message.match(/timed out\s+(\d+)/i)?.[1];
  return {
    attempted: attempted ? Number(attempted) : null,
    reached: reached ? Number(reached) : null,
    structured: structured ? Number(structured) : null,
    browser: browser ? Number(browser) : null,
    htmlFallback: html ? Number(html) : null,
    failed: failed ? Number(failed) : null,
    blocked: blocked ? Number(blocked) : null,
    timedOut: timedOut ? Number(timedOut) : null,
  };
}

async function companyAtsReachHealth(): Promise<HealthCheckItem> {
  try {
    const latest = getDb().select()
      .from(scanPortalRuns)
      .where(eq(scanPortalRuns.portal, 'company_ats'))
      .orderBy(desc(scanPortalRuns.startedAt), desc(scanPortalRuns.id))
      .limit(1)
      .get();

    if (!latest) {
      return check(
        'company_ats_reach',
        'Company ATS career reach',
        'skipped',
        'Company career reach will appear after the first Discover scan.',
      );
    }

    const message = parsePortalFailureMessage(latest.error);
    const stats = parseCompanyAtsStats(message);
    const jobsFound = latest.jobsFound || 0;
    const reached = stats.reached ?? null;
    const attempted = stats.attempted ?? null;
    const state: HealthState = latest.status === 'failed'
      ? 'warn'
      : reached !== null
        ? reached >= 5 ? 'pass' : 'warn'
        : jobsFound >= 5 ? 'pass' : 'warn';
    const summary = reached !== null && attempted !== null
      ? `${reached} of ${attempted} ATS-backed company career sites were reached in the latest scan; ${jobsFound} matching jobs were saved.`
      : `Latest ATS-backed company scan saved ${jobsFound} matching jobs; source-level reach details were not recorded for that run.`;

    return check(
      'company_ats_reach',
      'Company ATS career reach',
      state,
      summary,
      state === 'warn' ? 'Use official company pages and Paste Job URL for blocked employers; run another scan after widening target companies.' : undefined,
      {
        latestRunId: latest.id,
        latestScanId: latest.scanId,
        status: latest.status,
        jobsFound,
        ...stats,
      },
    );
  } catch (error) {
    return check(
      'company_ats_reach',
      'Company ATS career reach',
      'warn',
      'Company ATS reach could not be read from the local scan history.',
      'Run a Discover scan to refresh source health.',
      { reason: safeMessage(error) },
    );
  }
}

export async function checkSystemHealth(): Promise<SystemHealth> {
  const [
    redis,
    meili,
    qdrant,
    chromiumItem,
    python,
    database,
    storage,
    disk,
    recovery,
    scrapers,
    googleJobs,
    companyAtsReach,
  ] = await Promise.all([
    redisHealth(),
    httpHealth('meilisearch', 'Meilisearch local index', process.env.MEILI_HOST || process.env.MEILISEARCH_URL || 'http://127.0.0.1:7700', '/health', true, 'Search will fall back to saved local results. Run ./setup.sh --repair to restart Meilisearch.'),
    httpHealth('qdrant', 'Qdrant vector store', process.env.QDRANT_URL || process.env.JOBS_QDRANT_URL, '/healthz', true, 'Dream Match will use deterministic in-memory matching unless Qdrant is enabled.'),
    chromiumHealth(),
    pythonHealth(),
    databaseHealth(),
    storageHealth(),
    diskHealth(),
    workerRecoveryHealth(),
    scraperProviderHealth(),
    googleJobsDiscoveryHealth(),
    companyAtsReachHealth(),
  ]);

  const checks = [redis, meili, qdrant, chromiumItem, python, database, storage, disk, recovery.item, scrapers, googleJobs, companyAtsReach];
  const issues = checks.filter((item) => item.state === 'fail' || item.state === 'warn').map((item) => item.message);
  const hasFail = checks.some((item) => item.state === 'fail');
  const hasWarn = checks.some((item) => item.state === 'warn');

  return {
    ok: !hasFail,
    status: hasFail ? 'fail' : hasWarn ? 'warn' : 'pass',
    generatedAt: new Date().toISOString(),
    dataDir: getBaseAppDir(),
    checks,
    issues,
    recovery: {
      interruptedJobs: recovery.interruptedJobs,
      recovering: recovery.interruptedJobs > 0,
    },
    aiCircuitBreakers: getAIManager().getCircuitBreakerSnapshot(),
  };
}
