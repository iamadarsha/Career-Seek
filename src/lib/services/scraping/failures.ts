import fs from 'fs';
import path from 'path';
import { getAppSubDir } from '@/lib/local-paths';

export type SourceFailureCode =
  | 'selector_not_found'
  | 'blocked'
  | 'captcha'
  | 'rate_limited'
  | 'timeout'
  | 'auth_gate'
  | 'empty_results'
  | 'dependency_missing'
  | 'partial_source_failures'
  | 'source_drift'
  | 'browser_error'
  | 'parse_error'
  | 'network_error'
  | 'provider_api_error'
  | 'process_interrupted'
  | 'unsupported_provider'
  | 'invalid_url'
  | 'untrusted_domain'
  | 'robots_restricted'
  | 'result_quality_low'
  | 'manual_review_required'
  | 'unknown';

export interface SourceFailure {
  code: SourceFailureCode;
  message: string;
  debugSnapshotPath?: string;
  sourceHealthLabel?: SourceHealthLabel;
  gracefulFallback?: SourceGracefulFallbackSignal;
}

export type SourceHealthLabel =
  | 'healthy'
  | 'fallback_only'
  | 'auth_gated'
  | 'blocked_or_rate_limited'
  | 'unstable'
  | 'unavailable';

export interface SourceGracefulFallbackSignal {
  localOnly: boolean;
  label: string;
  reason: string;
  suggestedSourceIds?: string[];
}

export function sourceHealthLabelForFailure(code: SourceFailureCode, jobsFound = 0): SourceHealthLabel {
  if (jobsFound > 0) return 'fallback_only';
  if (code === 'auth_gate') return 'auth_gated';
  if (code === 'blocked' || code === 'captcha' || code === 'rate_limited' || code === 'robots_restricted') {
    return 'blocked_or_rate_limited';
  }
  if (code === 'selector_not_found' || code === 'source_drift' || code === 'parse_error' || code === 'result_quality_low') {
    return 'unstable';
  }
  if (code === 'empty_results') return 'healthy';
  return 'unavailable';
}

export function sourceFallbackSignal(portal: string, code: SourceFailureCode, message: string, jobsFound = 0): SourceGracefulFallbackSignal {
  const suggestionsByPortal: Record<string, string[]> = {
    linkedin: ['company_ats', 'official', 'jobspy', 'manual_url'],
    indeed: ['company_ats', 'official', 'jobspy', 'manual_url'],
    instahyre: ['cutshort', 'hirist', 'iimjobs', 'company_ats', 'manual_url'],
  };
  const label = jobsFound > 0
    ? 'Partial live results; source fallback was used'
    : code === 'auth_gate'
      ? 'Sign-in gated; use source alternatives'
      : code === 'blocked' || code === 'captcha' || code === 'rate_limited'
        ? 'Source blocked automation; use source alternatives'
        : 'Source unavailable; use source alternatives';

  return {
    localOnly: true,
    label,
    reason: message.replace(/^[a-z_]+:\s*/i, '').slice(0, 240),
    suggestedSourceIds: suggestionsByPortal[portal],
  };
}

export function classifySourceFailure(error: unknown): SourceFailure {
  const raw = error instanceof Error ? error.message : String(error || 'Unknown source failure');
  const message = raw.slice(0, 1000);
  const lower = message.toLowerCase();
  const explicitCode = lower.match(/^(selector_not_found|blocked|captcha|rate_limited|timeout|auth_gate|empty_results|dependency_missing|partial_source_failures|source_drift|browser_error|parse_error|network_error|provider_api_error|process_interrupted|unsupported_provider|invalid_url|untrusted_domain|robots_restricted|result_quality_low|manual_review_required)\b/);

  if (explicitCode) {
    return { code: explicitCode[1] as SourceFailureCode, message };
  }

  if (/selector|locator|element.*not found|no job cards|not found/i.test(message)) {
    return { code: 'selector_not_found', message };
  }
  if (/captcha|recaptcha|human verification|verify you are human/i.test(message)) {
    return { code: 'captcha', message };
  }
  if (/robots\.txt|robots restricted|crawl disallow|crawling restrictions/i.test(message)) {
    return { code: 'robots_restricted', message };
  }
  if (/blocked|forbidden|access denied|unusual traffic|robot|bot/i.test(message)) {
    return { code: 'blocked', message };
  }
  if (/rate.?limit|too many requests|http 429/i.test(message)) {
    return { code: 'rate_limited', message };
  }
  if (/timeout|timed out|navigation timeout/i.test(message)) {
    return { code: 'timeout', message };
  }
  if (/sign in|login|auth|permission|unauthorized/i.test(message)) {
    return { code: 'auth_gate', message };
  }
  if (/empty|zero results|no results/i.test(message)) {
    return { code: 'empty_results', message };
  }
  if (/dependency_missing|missing dependency|not installed|module not found/i.test(message)) {
    return { code: 'dependency_missing', message };
  }
  if (/partial_source_failures/i.test(message)) {
    return { code: 'partial_source_failures', message };
  }
  if (/markup|drift|changed layout|schema changed/i.test(message)) {
    return { code: 'source_drift', message };
  }
  if (/browser|chromium|target closed|context closed|page closed/i.test(message)) {
    return { code: 'browser_error', message };
  }
  if (/network|dns|tls|econnreset|enotfound|socket hang up|connection reset|fetch failed/i.test(message)) {
    return { code: 'network_error', message };
  }
  if (/provider api|api returned http|http 5\d\d|content negotiation|bad gateway|service unavailable/i.test(message)) {
    return { code: 'provider_api_error', message };
  }
  if (/parse|json|malformed|cannot read/i.test(message)) {
    return { code: 'parse_error', message };
  }
  if (/process_interrupted|interrupted platform job|worker recovered/i.test(message)) {
    return { code: 'process_interrupted', message };
  }
  if (/unsupported provider|unsupported ats|unsupported source/i.test(message)) {
    return { code: 'unsupported_provider', message };
  }
  if (/invalid url|malformed url|url parse/i.test(message)) {
    return { code: 'invalid_url', message };
  }
  if (/untrusted domain|domain not trusted|host not allowed/i.test(message)) {
    return { code: 'untrusted_domain', message };
  }
  if (/stale|low quality|too generic|off-intent|duplicate-heavy/i.test(message)) {
    return { code: 'result_quality_low', message };
  }
  if (/manual review|required confirmation|needs user confirmation/i.test(message)) {
    return { code: 'manual_review_required', message };
  }

  return { code: 'unknown', message };
}

export function serializeSourceFailure(failure: SourceFailure): string {
  const code = failure.code || 'unknown';
  const sourceHealthLabel = failure.sourceHealthLabel || sourceHealthLabelForFailure(code);
  return JSON.stringify({
    code,
    message: failure.message,
    debugSnapshotPath: failure.debugSnapshotPath,
    sourceHealthLabel,
    gracefulFallback: failure.gracefulFallback,
  });
}

export async function captureFailureSnapshot(page: any | null | undefined, portal: string, code: SourceFailureCode): Promise<string | undefined> {
  if (!page) return undefined;

  try {
    const dir = path.join(getAppSubDir('logs'), 'source-failures');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const base = `${stamp}-${portal}-${code}`.replace(/[^a-zA-Z0-9._-]/g, '_');
    const htmlPath = path.join(dir, `${base}.html`);
    const metaPath = path.join(dir, `${base}.json`);
    const html = await page.content().catch(() => '');
    const url = page.url();
    fs.writeFileSync(htmlPath, html.slice(0, 350_000), 'utf8');
    fs.writeFileSync(metaPath, JSON.stringify({ portal, code, url, capturedAt: new Date().toISOString() }, null, 2));
    return htmlPath;
  } catch {
    return undefined;
  }
}
