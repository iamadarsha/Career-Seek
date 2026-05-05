import crypto from 'crypto';
import type { BrowserContext } from 'playwright';
import { logger } from '@/lib/logger';
import type { BasePortalAdapter } from './adapters/base';
import {
  classifySourceFailure,
  sourceFallbackSignal,
  sourceHealthLabelForFailure,
  type SourceFailure,
} from './failures';
import type { JobQuery, PortalScanResult, RawScrapedJob } from './types';
import { ExistingAdapterProvider } from './providers/existing-adapter';
import { GoogleJobsProvider } from './providers/google-jobs';
import { PythonJobSpyProvider } from './providers/python-jobspy';
import { TsJobSpyProvider } from './providers/ts-jobspy';
import { CamoufoxProvider } from './providers/camoufox';
import { BrowserUseAgentProvider } from './providers/browser-use-agent';
import { DomainReconService } from './recon';
import type { DomainReconResult } from './recon';
import { domainFromPortal } from './rate-limiter';

export type PortalType = string;

export interface ScrapeInput {
  portal: PortalType;
  query: JobQuery;
  context?: BrowserContext;
  bypassCache?: boolean;
  onProgress?: (message: string) => void;
  recon?: DomainReconResult;
}

export interface ScrapeProvider {
  readonly id: string;
  readonly label: string;
  supports(portal: PortalType): boolean;
  isAvailable(): Promise<boolean>;
  scrape(input: ScrapeInput): Promise<PortalScanResult>;
}

export interface ProviderHealth {
  id: string;
  label: string;
  available: boolean;
  portals: string[];
  checkedAt: string;
  message?: string;
}

const CACHE_TTL_SECONDS = 24 * 60 * 60;

function dateKey() {
  return new Date().toISOString().slice(0, 10);
}

function cacheNamespace() {
  const dataDir = process.env.JOBHUNT_DATA_DIR || process.cwd();
  return crypto.createHash('sha1').update(dataDir).digest('hex').slice(0, 10);
}

function normalizedQueryHash(input: ScrapeInput) {
  const payload = {
    portal: input.portal,
    titleVariants: [...(input.query.titleVariants || [])].map((item) => item.toLowerCase().trim()).sort(),
    locations: [...(input.query.locations || [])].map((item) => item.toLowerCase().trim()).sort(),
    isRemote: Boolean(input.query.isRemote),
    isHybrid: Boolean(input.query.isHybrid),
    salaryMin: input.query.salaryMin || null,
    experienceMin: input.query.experienceMin || null,
    experienceMax: input.query.experienceMax || null,
    keywords: [...(input.query.keywords || [])].map((item) => item.toLowerCase().trim()).sort(),
    avoidKeywords: [...(input.query.avoidKeywords || [])].map((item) => item.toLowerCase().trim()).sort(),
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 24);
}

function cacheKey(input: ScrapeInput) {
  return `scrape:cache:${cacheNamespace()}:${input.portal}:${normalizedQueryHash(input)}:${dateKey()}`;
}

async function getCachedResult(input: ScrapeInput): Promise<PortalScanResult | null> {
  try {
    const { redisConnection } = await import('@/lib/queue/connection');
    const cached = await redisConnection.get(cacheKey(input));
    if (!cached) return null;
    const result = JSON.parse(cached) as PortalScanResult;
    return {
      ...result,
      status: result.status === 'failed' ? 'partial' : result.status,
      gracefulFallback: result.gracefulFallback || {
        localOnly: true,
        label: 'Cached live results',
        reason: 'This source was scanned earlier today with the same normalized query.',
      },
    };
  } catch (error) {
    logger.debug({ err: error, portal: input.portal }, 'Scrape cache read skipped');
    return null;
  }
}

async function setCachedResult(input: ScrapeInput, result: PortalScanResult) {
  if (result.status === 'failed' || result.jobs.length === 0) return;
  try {
    const { redisConnection } = await import('@/lib/queue/connection');
    await redisConnection.set(cacheKey(input), JSON.stringify(result), 'EX', CACHE_TTL_SECONDS);
  } catch (error) {
    logger.debug({ err: error, portal: input.portal }, 'Scrape cache write skipped');
  }
}

function failureResult(portal: string, failures: SourceFailure[]): PortalScanResult {
  const last = failures[failures.length - 1] || {
    code: 'unknown' as const,
    message: 'No scraping provider returned a result.',
  };
  const message = `All providers failed for ${portal}: ${failures.map((failure) => `${failure.code}: ${failure.message}`).join(' | ')}`.slice(0, 1_000);
  return {
    portal,
    status: 'failed',
    jobs: [],
    error: message,
    failureCode: last.code,
    sourceHealthLabel: sourceHealthLabelForFailure(last.code, 0),
    gracefulFallback: sourceFallbackSignal(portal, last.code, message, 0),
  };
}

function mergeGoogleMetadata(existing: RawScrapedJob, incoming: RawScrapedJob): RawScrapedJob {
  const existingIsPreview = existing.portal === 'google_jobs';
  const incomingIsPreview = incoming.portal === 'google_jobs';
  const preferred = existingIsPreview && !incomingIsPreview ? incoming : existing;
  const secondary = preferred === existing ? incoming : existing;
  const preferredSnippet = String(preferred.snippet || '');
  const secondarySnippet = String(secondary.snippet || '');

  return {
    ...preferred,
    location: preferred.location || secondary.location,
    applyUrl: preferred.applyUrl || secondary.applyUrl,
    sourceUrl: preferred.sourceUrl || preferred.applyUrl || preferred.url || secondary.sourceUrl || secondary.applyUrl || secondary.url,
    sourceLabel: preferred.sourceLabel || secondary.sourceLabel,
    snippet: preferredSnippet.length >= secondarySnippet.length ? preferredSnippet : secondarySnippet,
    rawPayload: {
      ...(preferred.rawPayload || {}),
      discoveredViaGoogle: existing.portal === 'google_jobs' || incoming.portal === 'google_jobs',
      mergedProviders: Array.from(new Set([
        preferred.rawPayload?.provider,
        secondary.rawPayload?.provider,
      ].filter(Boolean))),
      alternatePayloads: [
        ...(preferred.rawPayload?.alternatePayloads || []),
        ...(secondary.rawPayload ? [secondary.rawPayload] : []),
      ],
    },
  };
}

function mergeJobs(existingJobs: RawScrapedJob[], incomingJobs: RawScrapedJob[]) {
  const merged = new Map<string, RawScrapedJob>();
  const keyFor = (job: RawScrapedJob) => {
    const urlKey = String(job.sourceUrl || job.applyUrl || job.url || '').toLowerCase().trim();
    const externalIdKey = job.externalId ? `${job.portal}:${String(job.externalId).toLowerCase().trim()}` : '';
    const signature = [
      String(job.title || '').toLowerCase().replace(/[^a-z0-9]+/g, ''),
      String(job.company || '').toLowerCase().replace(/[^a-z0-9]+/g, ''),
      String(job.location || '').toLowerCase().replace(/[^a-z0-9]+/g, ''),
    ].join('|');
    return urlKey || externalIdKey || signature;
  };

  for (const job of [...existingJobs, ...incomingJobs]) {
    const key = keyFor(job);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, job);
      continue;
    }
    merged.set(key, mergeGoogleMetadata(existing, job));
  }

  return Array.from(merged.values());
}

function partialResult(portal: string, jobs: RawScrapedJob[], failures: SourceFailure[]): PortalScanResult {
  const significantFailures = failures.filter((failure) => failure.code !== 'empty_results');
  if (significantFailures.length === 0) {
    return { portal, status: 'success', jobs };
  }
  const message = `partial_source_failures: ${significantFailures.map((failure) => failure.message).join(' | ')}`.slice(0, 1_000);
  return {
    portal,
    status: 'partial',
    jobs,
    error: message,
    failureCode: 'partial_source_failures',
    sourceHealthLabel: sourceHealthLabelForFailure('partial_source_failures', jobs.length),
    gracefulFallback: sourceFallbackSignal(portal, 'partial_source_failures', message, jobs.length),
  };
}

export class ScraperManager {
  private readonly recon = new DomainReconService();

  constructor(private readonly providers: ScrapeProvider[]) {}

  private providersFor(portal: PortalType) {
    return this.providers.filter((provider) => provider.supports(portal));
  }

  private providerById(id: string) {
    return this.providers.find((provider) => provider.id === id);
  }

  private async runProvider(provider: ScrapeProvider | undefined, input: ScrapeInput, failures: SourceFailure[]) {
    if (!provider || !provider.supports(input.portal)) {
      failures.push({ code: 'unsupported_provider', message: `${provider?.label || 'Provider'} does not support ${input.portal}.` });
      return null;
    }

    try {
      const available = await provider.isAvailable();
      if (!available) {
        failures.push({ code: 'dependency_missing', message: `${provider.label} is not available locally.` });
        return null;
      }

      input.onProgress?.(`Trying ${provider.label}...`);
      const { waitForScrapeDomainSlot } = await import('./rate-limiter');
      await waitForScrapeDomainSlot(input.portal);
      const result = await provider.scrape(input);
      if (result.jobs.length > 0 || result.status !== 'failed') {
        return result;
      }

      const failure = classifySourceFailure(result.error || `${provider.label} returned no usable jobs.`);
      failures.push({ ...failure, message: `${provider.id}: ${failure.message}` });
      return null;
    } catch (error) {
      const failure = classifySourceFailure(error);
      failures.push({ ...failure, message: `${provider.id}: ${failure.message}` });
      return null;
    }
  }

  private async scrapeWithGoogleSecondary(input: ScrapeInput): Promise<PortalScanResult> {
    const failures: SourceFailure[] = [];
    const primary = this.providerById('ts-jobspy');
    const secondary = this.providerById('google-jobs');
    const tertiary = input.portal === 'linkedin'
      ? this.providerById('existing-playwright-adapter')
      : this.providerById('python-jobspy');
    const quaternary = this.providerById('camoufox');
    const quinary = this.providerById('browser-use-agent');

    const primaryResult = await this.runProvider(primary, input, failures);
    let jobs = primaryResult?.jobs || [];

    const secondaryResult = await this.runProvider(secondary, input, failures);
    if (secondaryResult?.jobs?.length) {
      jobs = mergeJobs(jobs, secondaryResult.jobs);
    }

    const shouldRunTertiary = jobs.length < 5 || !primaryResult?.jobs?.length;
    if (shouldRunTertiary) {
      const tertiaryResult = await this.runProvider(tertiary, input, failures);
      if (tertiaryResult?.jobs?.length) {
        jobs = mergeJobs(jobs, tertiaryResult.jobs);
      }
    }

    // Camoufox: try when recon shows blocking or still no jobs for hard-blocked portals
    const isHardBlocked = input.recon?.antiBotVendor !== undefined && input.recon.antiBotVendor !== 'none';
    if (jobs.length === 0 || isHardBlocked) {
      const quaternaryResult = await this.runProvider(quaternary, input, failures);
      if (quaternaryResult?.jobs?.length) {
        jobs = mergeJobs(jobs, quaternaryResult.jobs);
      }
    }

    // Browser-Use: absolute last resort when everything else failed
    if (jobs.length === 0) {
      const quinaryResult = await this.runProvider(quinary, input, failures);
      if (quinaryResult?.jobs?.length) {
        jobs = mergeJobs(jobs, quinaryResult.jobs);
      }
    }

    if (jobs.length > 0) {
      const result = partialResult(input.portal, jobs, failures);
      await setCachedResult(input, result);
      return result;
    }

    return failureResult(input.portal, failures);
  }

  async scrape(input: ScrapeInput): Promise<PortalScanResult> {
    if (!input.bypassCache) {
      const cached = await getCachedResult(input);
      if (cached) {
        input.onProgress?.('Using cached source results from today.');
        return cached;
      }
    }

    // Run recon before provider selection to inform strategy
    if (!input.recon) {
      const domain = domainFromPortal(input.portal);
      if (domain && domain !== 'company_ats' && domain !== 'official') {
        try {
          input.recon = await this.recon.recon(domain);
          logger.debug(
            { portal: input.portal, vendor: input.recon.antiBotVendor, rateLimit: input.recon.rateLimitSignal },
            '[scraper] domain recon',
          );
        } catch {
          // recon failure is non-fatal
        }
      }
    }

    if (input.portal === 'linkedin' || input.portal === 'indeed') {
      return this.scrapeWithGoogleSecondary(input);
    }

    const failures: SourceFailure[] = [];
    const providers = this.providersFor(input.portal);
    for (const provider of providers) {
      const result = await this.runProvider(provider, input, failures);
      if (result) {
        await setCachedResult(input, result);
        return result;
      }
    }

    return failureResult(input.portal, failures);
  }

  async health(): Promise<ProviderHealth[]> {
    return Promise.all(this.providers.map(async (provider) => {
      try {
        const available = await provider.isAvailable();
        return {
          id: provider.id,
          label: provider.label,
          available,
          portals: KNOWN_PORTALS.filter((portal) => provider.supports(portal)),
          checkedAt: new Date().toISOString(),
        };
      } catch (error) {
        return {
          id: provider.id,
          label: provider.label,
          available: false,
          portals: KNOWN_PORTALS.filter((portal) => provider.supports(portal)),
          checkedAt: new Date().toISOString(),
          message: error instanceof Error ? error.message : String(error),
        };
      }
    }));
  }
}

export const KNOWN_PORTALS = ['linkedin', 'indeed', 'naukri', 'wellfound', 'foundit', 'instahyre', 'company_ats', 'official', 'google_jobs'];

export function buildDefaultScraperManager(adapters?: Map<string, BasePortalAdapter>) {
  return new ScraperManager([
    new TsJobSpyProvider(),
    new GoogleJobsProvider(adapters),
    new PythonJobSpyProvider(),
    new ExistingAdapterProvider(adapters),
    new CamoufoxProvider(),
    new BrowserUseAgentProvider(),
  ]);
}
