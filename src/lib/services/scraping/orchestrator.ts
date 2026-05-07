import { getDb } from '../../../db';
import { scans, scanPortalRuns, normalizedJobs, jobDuplicates, searchProfiles, searchExpansions } from '../../../db/schema';
import { eq, and } from 'drizzle-orm';
import { resolveContext } from '@/lib/platform/identity';
import { BrowserManager } from './browser-manager';
import { buildQueryFromProfile, expandQuery } from './query-builder';
import { normalizeJob } from './normalizer';
import { findDuplicates } from './deduplicator';
import { LinkedInAdapter } from './adapters/linkedin';
import { NaukriAdapter } from './adapters/naukri';
import { WellfoundAdapter } from './adapters/wellfound';
import { FounditAdapter } from './adapters/foundit';
import { IndeedAdapter } from './adapters/indeed';
import { InstahyreAdapter } from './adapters/instahyre';
import { OfficialCompaniesAdapter } from './adapters/official-companies';
import { CompanyAtsAdapter } from './adapters/company-ats';
import { GoogleJobsDiscoveryAdapter } from './adapters/google-jobs';
import { JobSpyFallbackAdapter } from './adapters/jobspy-fallback';
import { JobSpyApiAdapter } from './adapters/jobspy-api';
import { CONFIGURED_INDIA_SOURCES, ConfiguredSourceAdapter } from './adapters/configured-sources';
import { BasePortalAdapter } from './adapters/base';
import { ValidationFailAdapter, ValidationSeedAdapter } from './adapters/validation';
import { WorkAtStartupAdapter } from './adapters/workatastartup';
import { HiristAdapter } from './adapters/hirist';
import { PeerlistAdapter } from './adapters/peerlist';
import { CutshortAdapter } from './adapters/cutshort';
import { OttaAdapter } from './adapters/otta';
import { GrowthRolesAdapter } from './adapters/growthroles';
import { classifySourceFailure, serializeSourceFailure } from './failures';
import { buildDefaultScraperManager } from './scraper-manager';
import { DEFAULT_DISCOVERY_SOURCE_IDS, orderSourcesByLadder, resolveSourceId, withMandatoryCompanySources } from './source-universe';
import { getAppSubDir } from '@/lib/local-paths';
import { logger } from '@/lib/logger';
import fs from 'fs';
import path from 'path';

// Event emitter or callback approach to push progress updates to the UI
export type ProgressCallback = (status: { scanId: number, portal?: string, message: string, progress?: number }) => void;

const NON_EXPANDABLE_FAILURE_CODES = new Set([
  'auth_gate',
  'blocked',
  'captcha',
  'rate_limited',
  'robots_restricted',
  'dependency_missing',
  'unsupported_provider',
  'invalid_url',
  'untrusted_domain',
]);

const LOW_RESULT_NO_EXPAND_PORTALS = new Set([
  'company_ats',
  'official',
  'google_jobs',
]);

function shouldExpandAfterResult(result: { failureCode?: string; error?: string }) {
  if (!result.failureCode) return true;
  return !NON_EXPANDABLE_FAILURE_CODES.has(result.failureCode);
}

function shouldExpandPortal(portalId: string) {
  return !LOW_RESULT_NO_EXPAND_PORTALS.has(resolveSourceId(portalId));
}

function persistRawPayload(portal: string, scanId: number, index: number, rawPayload: any): string | undefined {
  if (!rawPayload) return undefined;
  try {
    const dir = path.join(getAppSubDir('logs'), 'raw-jobs', String(scanId), portal);
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${index + 1}.json`);
    fs.writeFileSync(filePath, JSON.stringify(rawPayload, null, 2).slice(0, 250_000), 'utf8');
    return filePath;
  } catch {
    return undefined;
  }
}

function jobInsertValues(job: any, ownerProfileId: number, rawPayloadPath?: string) {
  return {
    profileId: ownerProfileId,
    scanId: job.scanId,
    searchProfileId: job.searchProfileId,
    portal: job.portal,
    externalId: job.externalId,
    title: job.title,
    company: job.company,
    location: job.location,
    isRemote: job.isRemote,
    isHybrid: job.isHybrid,
    url: job.url,
    applyUrl: job.applyUrl,
    snippet: job.snippet,
    salaryRaw: job.salaryText,
    experienceRaw: job.experienceText,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    salaryCurrency: job.salaryCurrency,
    experienceMin: job.experienceMin,
    experienceMax: job.experienceMax,
    postedDateRaw: job.postedDateText,
    postedDate: job.postedDate,
    employmentType: job.employmentType,
    rawPayloadPath,
    scrapedAt: job.scrapedAt,
  };
}

export class ScanOrchestrator {
  private browserManager: BrowserManager;
  private adapters: Map<string, BasePortalAdapter>;

  constructor() {
    this.browserManager = new BrowserManager();
    this.adapters = new Map();
    this.adapters.set('company_ats', new CompanyAtsAdapter());
    this.adapters.set('google_jobs', new GoogleJobsDiscoveryAdapter());
    this.adapters.set('jobspy', new JobSpyFallbackAdapter());
    this.adapters.set('jobspy_api', new JobSpyApiAdapter()); // HTTP-direct, no browser needed
    this.adapters.set('linkedin', new LinkedInAdapter());
    this.adapters.set('naukri', new NaukriAdapter());
    this.adapters.set('foundit', new FounditAdapter());
    for (const source of CONFIGURED_INDIA_SOURCES) {
      this.adapters.set(source.identifier, new ConfiguredSourceAdapter(source));
    }
    this.adapters.set('instahyre', new InstahyreAdapter());
    this.adapters.set('wellfound', new WellfoundAdapter());
    this.adapters.set('indeed', new IndeedAdapter());
    this.adapters.set('official', new OfficialCompaniesAdapter());
    this.adapters.set('workatastartup', new WorkAtStartupAdapter());
    this.adapters.set('hirist', new HiristAdapter());
    this.adapters.set('peerlist', new PeerlistAdapter());
    this.adapters.set('cutshort', new CutshortAdapter());
    this.adapters.set('otta', new OttaAdapter());
    this.adapters.set('growthroles', new GrowthRolesAdapter());
    if (process.env.JOBHUNT_ENABLE_VALIDATION_SOURCE === '1') {
      this.adapters.set('validation_seed', new ValidationSeedAdapter());
      this.adapters.set('validation_fail', new ValidationFailAdapter());
    }
  }

  async runScan(
    searchProfileId: number,
    selectedPortals?: string[],
    onProgress?: ProgressCallback,
    options: { bypassCache?: boolean } = {},
  ): Promise<{ scanId: number; totalJobsFound: number; failedPortals: number; status: string }> {
    const db = getDb();
    const { profileId: ownerProfileId } = resolveContext();
    
    // 1. Fetch search profile, ensuring ownership
    const profile = db.select().from(searchProfiles)
      .where(and(eq(searchProfiles.id, searchProfileId), eq(searchProfiles.profileId, ownerProfileId)))
      .get();
    if (!profile) {
      throw new Error('Search profile not found or access denied');
    }

    let portalsToScan = selectedPortals?.filter(Boolean).map(resolveSourceId) || [];
    if (portalsToScan.length === 0 && profile.preferredPortals) {
      try {
        const parsed = JSON.parse(profile.preferredPortals);
        portalsToScan = Array.isArray(parsed) ? parsed.filter(Boolean).map(resolveSourceId) : [];
      } catch {
        portalsToScan = [];
      }
    }
    if (portalsToScan.length === 0) {
      portalsToScan = DEFAULT_DISCOVERY_SOURCE_IDS;
    }
    portalsToScan = withMandatoryCompanySources(portalsToScan);
    portalsToScan = orderSourcesByLadder(portalsToScan, this.adapters.keys());

    // 2. Create scan record (legacy linking, keep for now as it stores results)
    const scan = db.insert(scans).values({
      profileId: ownerProfileId,
      searchProfileId: searchProfileId,
      status: 'preparing',
      startedAt: new Date(),
    }).returning().get();

    onProgress?.({ scanId: scan.id, message: `Starting scan for ${profile.title}...`, progress: 5 });

    try {
      let totalJobsFound = 0;
      let failedPortals = 0;
      let initialQuery = buildQueryFromProfile(profile);

      // Fetch all existing normalized jobs for deduplication, scoped to this profile
      const existingJobsRows = db.select().from(normalizedJobs)
        .where(eq(normalizedJobs.profileId, ownerProfileId))
        .all();
      const existingJobs = existingJobsRows as any[]; // casting

      db.update(scans).set({ status: 'scraping' }).where(eq(scans.id, scan.id)).run();

      // 3. Initialize Browser when available. Upstream providers can still run
      // without Playwright, so browser safe mode should not fail the whole scan.
      let context;
      try {
        context = await this.browserManager.init();
        onProgress?.({ scanId: scan.id, message: "Browser initialized", progress: 10 });
      } catch (error: any) {
        const failure = classifySourceFailure(error);
        logger.warn({ failure }, 'Browser unavailable; upstream scraper providers will be tried first');
        onProgress?.({ scanId: scan.id, message: `Browser fallback unavailable: ${failure.message}`, progress: 10 });
      }

      const scraperManager = buildDefaultScraperManager(this.adapters);

      try {
        // 4. Run portals sequentially
        for (let i = 0; i < portalsToScan.length; i++) {
          const portalId = portalsToScan[i];
          const adapterKey = resolveSourceId(portalId);
          const adapter = this.adapters.get(adapterKey);
          if (!adapter) {
            const portalRun = db.insert(scanPortalRuns).values({
              scanId: scan.id,
              portal: portalId,
              status: 'failed',
              error: serializeSourceFailure({
                code: 'unknown',
                message: 'No scanner adapter is configured for this source.',
              }),
              jobsFound: 0,
              startedAt: new Date(),
              finishedAt: new Date()
            }).returning().get();
            failedPortals++;
            onProgress?.({ scanId: scan.id, portal: portalId, message: `Skipped ${portalId}: adapter unavailable.`, progress: Math.floor(10 + (i / portalsToScan.length) * 80) });
            continue;
          }

          // Create portal run record
          const portalRun = db.insert(scanPortalRuns).values({
            scanId: scan.id,
            portal: portalId,
            status: 'running',
            startedAt: new Date()
          }).returning().get();

          onProgress?.({ scanId: scan.id, portal: portalId, message: `Started scraping ${adapter.displayName}...` });
          
          const portalProgressBase = 10 + (i / portalsToScan.length) * 80;

          try {
            if (context) {
              const healthy = await adapter.healthCheck(context);
              if (!healthy) {
                onProgress?.({
                  scanId: scan.id,
                  portal: portalId,
                  message: `${adapter.displayName} health check was inconclusive; trying the search URL anyway.`,
                });
              }
            }

            // Perform the scrape through provider chain: upstream libraries first,
            // then the existing Playwright adapter when a browser is available.
            let query = { ...initialQuery };
            let scrapeResult = await scraperManager.scrape({
              portal: portalId,
              query,
              context,
              bypassCache: options.bypassCache,
              onProgress: (msg) => {
               onProgress?.({ scanId: scan.id, portal: portalId, message: msg, progress: Math.floor(portalProgressBase + 5) });
              },
            });

            // Adaptive Expansion
            // Trigger when a portal returns fewer than 10 jobs (raised from 5 — 6-9
            // jobs is still too few to give users a meaningful ranked list).
            // Max 5 expansion levels to match the full range in expandQuery().
            let expansionLevel = 0;
            while (scrapeResult.jobs.length < 10 && expansionLevel < 5 && shouldExpandPortal(portalId) && shouldExpandAfterResult(scrapeResult)) {
              expansionLevel++;
              const newQuery = expandQuery(query, expansionLevel);
              onProgress?.({ scanId: scan.id, portal: portalId, message: `Too few results. Expanding search (level ${expansionLevel})...` });
              
              // Log expansion
              db.insert(searchExpansions).values({
                scanPortalRunId: portalRun.id,
                reason: 'low_results',
                oldQuery: JSON.stringify(query),
                newQuery: JSON.stringify(newQuery),
                timestamp: new Date()
              }).run();

              query = newQuery;
              const expandedResult = await scraperManager.scrape({
                portal: portalId,
                query,
                context,
                bypassCache: options.bypassCache,
                onProgress: (msg) => {
                 onProgress?.({ scanId: scan.id, portal: portalId, message: msg });
                },
              });

              // Merge results
              scrapeResult.jobs = [...scrapeResult.jobs, ...expandedResult.jobs];
              if (expandedResult.error) scrapeResult.error = expandedResult.error;
              if (expandedResult.failureCode) scrapeResult.failureCode = expandedResult.failureCode;
            }

            if (scrapeResult.jobs.length < 10 && !shouldExpandAfterResult(scrapeResult)) {
              onProgress?.({
                scanId: scan.id,
                portal: portalId,
                message: `Skipping query expansion for ${adapter.displayName}; source reported ${scrapeResult.failureCode}.`,
              });
            }

            // Normalize
            onProgress?.({ scanId: scan.id, portal: portalId, message: 'Normalizing and deduplicating jobs...' });
            const newNormalized = scrapeResult.jobs.map(j => normalizeJob(j, scan.id, searchProfileId, ownerProfileId));

            // Deduplicate
            const { unique, duplicates } = findDuplicates(newNormalized, existingJobs);

            // Persist unique jobs
            for (let jobIndex = 0; jobIndex < unique.length; jobIndex++) {
              const job = unique[jobIndex];
              const rawPayloadPath = persistRawPayload(job.portal, scan.id, jobIndex, job.rawPayload);
              const inserted = db.insert(normalizedJobs).values(jobInsertValues(job, ownerProfileId, rawPayloadPath)).returning({ id: normalizedJobs.id }).get();
              
              existingJobs.push({ ...job, id: inserted.id });
            }

            // Persist duplicates
            for (let dupIndex = 0; dupIndex < duplicates.length; dupIndex++) {
              const dup = duplicates[dupIndex];
              const rawPayloadPath = persistRawPayload(dup.newJob.portal, scan.id, unique.length + dupIndex, dup.newJob.rawPayload);
              const inserted = db.insert(normalizedJobs).values(jobInsertValues(dup.newJob, ownerProfileId, rawPayloadPath)).returning({ id: normalizedJobs.id }).get();

              db.insert(jobDuplicates).values({
                canonicalJobId: dup.existingId,
                duplicateJobId: inserted.id,
                matchType: dup.matchType,
                detectedAt: new Date()
              }).run();
            }

            totalJobsFound += scrapeResult.jobs.length;

            // Update portal run
            db.update(scanPortalRuns).set({
              status: scrapeResult.error ? (scrapeResult.jobs.length > 0 ? 'complete' : 'failed') : 'complete',
              error: scrapeResult.error
                ? serializeSourceFailure({
                    code: (scrapeResult.failureCode as any) || classifySourceFailure(scrapeResult.error).code,
                    message: scrapeResult.error,
                    debugSnapshotPath: scrapeResult.debugSnapshotPath,
                    sourceHealthLabel: scrapeResult.sourceHealthLabel as any,
                    gracefulFallback: scrapeResult.gracefulFallback,
                  })
                : null,
              jobsFound: scrapeResult.jobs.length,
              finishedAt: new Date()
            }).where(eq(scanPortalRuns.id, portalRun.id)).run();

            if (scrapeResult.error && scrapeResult.jobs.length === 0) {
              failedPortals++;
            }

            onProgress?.({ scanId: scan.id, portal: portalId, message: `Finished ${adapter.displayName}: ${scrapeResult.jobs.length} jobs.`, progress: Math.floor(portalProgressBase + (100 - portalProgressBase) / portalsToScan.length) });

          } catch (e: any) {
            logger.error({ err: e, portalId }, 'Error in portal scan');
            failedPortals++;
            const failure = classifySourceFailure(e);
            db.update(scanPortalRuns).set({
              status: 'failed',
              error: serializeSourceFailure(failure),
              finishedAt: new Date()
            }).where(eq(scanPortalRuns.id, portalRun.id)).run();
            onProgress?.({ scanId: scan.id, portal: portalId, message: `Failed (${failure.code}): ${failure.message}` });
          }
        }
      } finally {
        // Always close the browser — even if a portal throws after init
        await this.browserManager.close();
      }

      // Mark scan complete
      db.update(scans).set({
        status: failedPortals > 0 && totalJobsFound > 0 ? 'partial' : totalJobsFound > 0 ? 'complete' : 'failed',
        totalJobs: totalJobsFound,
        error: totalJobsFound === 0 ? 'No sources returned usable jobs.' : null,
        finishedAt: new Date()
      }).where(eq(scans.id, scan.id)).run();
      
      onProgress?.({ scanId: scan.id, message: `Scan completed successfully. Found ${totalJobsFound} jobs.`, progress: 100 });
      return {
        scanId: scan.id,
        totalJobsFound,
        failedPortals,
        status: failedPortals > 0 && totalJobsFound > 0 ? 'partial' : totalJobsFound > 0 ? 'complete' : 'failed',
      };

    } catch (e: any) {
      logger.error({ err: e }, 'Scan failed');
      await this.browserManager.close();
      db.update(scans).set({
        status: 'failed',
        error: e.message,
        finishedAt: new Date()
      }).where(eq(scans.id, scan.id)).run();
      
      onProgress?.({ scanId: scan.id, message: `Scan failed: ${e.message}` });
      throw e; // Rethrow so the job handler knows it failed
    }
  }
}
