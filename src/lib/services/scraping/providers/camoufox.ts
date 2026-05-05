import { spawnSync } from 'child_process';
import path from 'path';
import { resolvePythonBinary, runPythonScript } from '../python-path';
import type { ScrapeInput, ScrapeProvider, PortalType } from '../scraper-manager';
import type { PortalScanResult, RawScrapedJob } from '../types';

const SUPPORTED_PORTALS: PortalType[] = [
  'linkedin',
  'instahyre',
  'naukri',
  'indeed',
  'company_ats',
  'official',
  'wellfound',
  'foundit',
];

function hasCamoufox(): boolean {
  const result = spawnSync(resolvePythonBinary(), ['-c', 'import camoufox; print("ok")'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return result.status === 0;
}

function mapJob(portal: string, job: any): RawScrapedJob {
  return {
    portal,
    externalId: job.id || job.job_id || job.url,
    title: String(job.title || 'Untitled role'),
    company: String(job.company || 'Company not listed'),
    location: job.location,
    isRemote: Boolean(job.is_remote),
    url: String(job.url || ''),
    applyUrl: job.apply_url || job.url,
    snippet: String(job.snippet || '').replace(/\s+/g, ' ').trim().slice(0, 1_500),
    postedDateText: job.posted_date,
    employmentType: job.employment_type,
    rawPayload: { provider: 'camoufox', job },
  };
}

export class CamoufoxProvider implements ScrapeProvider {
  readonly id = 'camoufox';
  readonly label = 'Camoufox anti-detect browser';

  supports(portal: PortalType): boolean {
    return SUPPORTED_PORTALS.includes(portal);
  }

  async isAvailable(): Promise<boolean> {
    return hasCamoufox();
  }

  async scrape(input: ScrapeInput): Promise<PortalScanResult> {
    const config = {
      portal: input.portal,
      search_term: [input.query.titleVariants?.[0], ...(input.query.keywords || []).slice(0, 3)]
        .filter(Boolean)
        .join(' '),
      location: input.query.locations?.[0] || 'India',
      is_remote: Boolean(input.query.isRemote),
      results_wanted: 20,
    };

    const jobs = await runPythonScript(
      path.join('scripts', 'python', 'camoufox_runner.py'),
      config,
      120_000,
    );

    const mapped = jobs
      .map((job) => mapJob(input.portal, job))
      .filter((job) => Boolean(job.url));

    return {
      portal: input.portal,
      status: mapped.length ? 'success' : 'failed',
      jobs: mapped,
      error: mapped.length ? undefined : 'empty_results: camoufox returned no usable jobs.',
      failureCode: mapped.length ? undefined : 'empty_results',
      sourceHealthLabel: mapped.length ? 'healthy' : 'unavailable',
    };
  }
}
