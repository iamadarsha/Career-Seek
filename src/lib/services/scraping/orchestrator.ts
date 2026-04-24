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
import { BasePortalAdapter } from './adapters/base';

// Event emitter or callback approach to push progress updates to the UI
export type ProgressCallback = (status: { scanId: number, portal?: string, message: string, progress?: number }) => void;

export class ScanOrchestrator {
  private browserManager: BrowserManager;
  private adapters: Map<string, BasePortalAdapter>;

  constructor() {
    this.browserManager = new BrowserManager();
    this.adapters = new Map();
    this.adapters.set('linkedin', new LinkedInAdapter());
    this.adapters.set('naukri', new NaukriAdapter());
    this.adapters.set('wellfound', new WellfoundAdapter());
  }

  async runScan(searchProfileId: number, selectedPortals: string[], onProgress?: ProgressCallback) {
    const db = getDb();
    const { profileId: ownerProfileId } = resolveContext();
    
    // 1. Fetch search profile, ensuring ownership
    const profile = db.select().from(searchProfiles)
      .where(and(eq(searchProfiles.id, searchProfileId), eq(searchProfiles.profileId, ownerProfileId)))
      .get();
    if (!profile) {
      throw new Error('Search profile not found or access denied');
    }

    // 2. Create scan record (legacy linking, keep for now as it stores results)
    const scan = db.insert(scans).values({
      profileId: ownerProfileId,
      searchProfileId: searchProfileId,
      status: 'preparing',
      startedAt: new Date(),
    }).returning().get();

    onProgress?.({ scanId: scan.id, message: `Starting scan for ${profile.title}...`, progress: 5 });

    try {
      // 3. Initialize Browser
      const context = await this.browserManager.init();
      
      let totalJobsFound = 0;
      let initialQuery = buildQueryFromProfile(profile);

      // Fetch all existing normalized jobs for deduplication, scoped to this profile
      const existingJobsRows = db.select().from(normalizedJobs)
        .where(eq(normalizedJobs.profileId, ownerProfileId))
        .all();
      const existingJobs = existingJobsRows as any[]; // casting

      db.update(scans).set({ status: 'scraping' }).where(eq(scans.id, scan.id)).run();
      onProgress?.({ scanId: scan.id, message: "Browser initialized", progress: 10 });

      // 4. Run portals sequentially
      for (let i = 0; i < selectedPortals.length; i++) {
        const portalId = selectedPortals[i];
        const adapter = this.adapters.get(portalId);
        if (!adapter) {
          console.warn(`Adapter not found for ${portalId}`);
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
        
        const portalProgressBase = 10 + (i / selectedPortals.length) * 80;

        try {
          // Perform the scrape
          let query = { ...initialQuery };
          let scrapeResult = await adapter.scrape(context, query, (msg) => {
             onProgress?.({ scanId: scan.id, portal: portalId, message: msg, progress: Math.floor(portalProgressBase + 5) });
          });

          // Adaptive Expansion
          let expansionLevel = 0;
          while (scrapeResult.jobs.length < 5 && expansionLevel < 3) {
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
            const expandedResult = await adapter.scrape(context, query, (msg) => {
               onProgress?.({ scanId: scan.id, portal: portalId, message: msg });
            });

            // Merge results
            scrapeResult.jobs = [...scrapeResult.jobs, ...expandedResult.jobs];
            if (expandedResult.error) scrapeResult.error = expandedResult.error;
          }

          // Normalize
          onProgress?.({ scanId: scan.id, portal: portalId, message: 'Normalizing and deduplicating jobs...' });
          const newNormalized = scrapeResult.jobs.map(j => normalizeJob(j, scan.id, searchProfileId, ownerProfileId));

          // Deduplicate
          const { unique, duplicates } = findDuplicates(newNormalized, existingJobs);

          // Persist unique jobs
          for (const job of unique) {
            const inserted = db.insert(normalizedJobs).values({
              profileId: ownerProfileId,
              scanId: job.scanId,
              searchProfileId: job.searchProfileId,
              portal: job.portal,
              externalId: job.externalId,
              title: job.title,
              company: job.company,
              location: job.location,
              url: job.url,
              snippet: job.snippet,
              salaryRaw: job.salaryText,
              experienceRaw: job.experienceText,
              salaryMin: job.salaryMin,
              salaryMax: job.salaryMax,
              salaryCurrency: job.salaryCurrency,
              experienceMin: job.experienceMin,
              experienceMax: job.experienceMax,
              scrapedAt: job.scrapedAt,
            }).returning({ id: normalizedJobs.id }).get();
            
            existingJobs.push({ ...job, id: inserted.id });
          }

          // Persist duplicates
          for (const dup of duplicates) {
            const inserted = db.insert(normalizedJobs).values({
              profileId: ownerProfileId,
              scanId: dup.newJob.scanId,
              searchProfileId: dup.newJob.searchProfileId,
              portal: dup.newJob.portal,
              externalId: dup.newJob.externalId,
              title: dup.newJob.title,
              company: dup.newJob.company,
              location: dup.newJob.location,
              url: dup.newJob.url,
              snippet: dup.newJob.snippet,
              scrapedAt: dup.newJob.scrapedAt,
            }).returning({ id: normalizedJobs.id }).get();

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
            error: scrapeResult.error,
            jobsFound: scrapeResult.jobs.length,
            finishedAt: new Date()
          }).where(eq(scanPortalRuns.id, portalRun.id)).run();

          onProgress?.({ scanId: scan.id, portal: portalId, message: `Finished ${adapter.displayName}: ${scrapeResult.jobs.length} jobs.`, progress: Math.floor(portalProgressBase + (100 - portalProgressBase) / selectedPortals.length) });

        } catch (e: any) {
          console.error(`Error in portal ${portalId}`, e);
          db.update(scanPortalRuns).set({
            status: 'failed',
            error: e.message,
            finishedAt: new Date()
          }).where(eq(scanPortalRuns.id, portalRun.id)).run();
          onProgress?.({ scanId: scan.id, portal: portalId, message: `Failed: ${e.message}` });
        }
      }

      await this.browserManager.close();

      // Mark scan complete
      db.update(scans).set({
        status: 'complete',
        totalJobs: totalJobsFound,
        finishedAt: new Date()
      }).where(eq(scans.id, scan.id)).run();
      
      onProgress?.({ scanId: scan.id, message: `Scan completed successfully. Found ${totalJobsFound} jobs.`, progress: 100 });

    } catch (e: any) {
      console.error('Scan failed', e);
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
