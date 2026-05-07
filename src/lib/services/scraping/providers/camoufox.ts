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

/**
 * FIX #11: read LinkedIn/Naukri credentials from live .env.local and pass them
 * into the Python subprocess environment. Previously the spawned Python process
 * only inherited process.env (stale) and never had credentials, making
 * Camoufox unable to log in to LinkedIn or Naukri.
 */
function getLiveCredentials(): Record<string, string> {
  try {
    const { readEnvKeys } = require('../../../env-writer') as typeof import('../../../env-writer');
    return readEnvKeys([
      'LINKEDIN_EMAIL', 'LINKEDIN_PASSWORD',
      'NAUKRI_EMAIL', 'NAUKRI_PASSWORD',
    ]);
  } catch {
    return {};
  }
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
    // FIX #11: merge live credentials into the config passed to the Python script
    const liveCredentials = getLiveCredentials();

    const config = {
      portal: input.portal,
      search_term: [input.query.titleVariants?.[0], ...(input.query.keywords || []).slice(0, 3)]
        .filter(Boolean)
        .join(' '),
      location: input.query.locations?.[0] || 'India',
      is_remote: Boolean(input.query.isRemote),
      results_wanted: 20,
      // FIX #11: pass credentials so camoufox_runner.py can log in
      linkedin_email: liveCredentials.LINKEDIN_EMAIL || '',
      linkedin_password: liveCredentials.LINKEDIN_PASSWORD || '',
      naukri_email: liveCredentials.NAUKRI_EMAIL || '',
      naukri_password: liveCredentials.NAUKRI_PASSWORD || '',
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
