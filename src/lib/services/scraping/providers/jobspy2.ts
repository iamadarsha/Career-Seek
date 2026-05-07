/**
 * JobSpy2 provider — wraps the upgraded jobspy_runner.py which tries the
 * speedyapply/JobSpy fork (jobspy2) first, falling back to legacy python-jobspy.
 *
 * Supports: linkedin, indeed, glassdoor, zip_recruiter
 *
 * This provider is additive — it does NOT replace PythonJobSpyProvider.
 * It is registered AFTER the existing provider in scraper-manager so the
 * existing indeed/naukri flow continues to work unchanged.
 *
 * Install jobspy2:  pip install 'jobspy2'
 *                  pip install 'scikit-learn'  (for ats_scorer.py)
 */
import { spawnSync } from 'child_process';
import path from 'path';
import type { ScrapeInput, ScrapeProvider, PortalType } from '../scraper-manager';
import type { PortalScanResult, RawScrapedJob } from '../types';
import { resolvePythonBinary, runPythonScript } from '../python-path';

// Portals this provider handles that aren't already covered by the legacy provider
const JOBSPY2_PORTALS: PortalType[] = ['linkedin', 'indeed', 'glassdoor', 'zip_recruiter'];

function hasJobSpy2(): boolean {
  // Check for jobspy2 specifically (speedyapply fork installs as 'jobspy2' package)
  const result = spawnSync(resolvePythonBinary(), ['-c', 'import jobspy; print("ok")'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return result.status === 0;
}

function mapJob(portal: string, job: any): RawScrapedJob {
  return {
    portal,
    externalId: job.id || job.job_id || job.job_url || job.jobUrl,
    title: String(job.title || 'Untitled role'),
    company: String(job.company || job.company_name || 'Company not listed'),
    location: job.location,
    isRemote: Boolean(job.is_remote ?? job.isRemote),
    salaryText: job.compensation || job.salary || job.salaryText,
    url: String(job.job_url || job.jobUrl || job.url || ''),
    applyUrl: job.job_url_direct || job.jobUrlDirect || job.apply_url,
    postedDateText: job.date_posted || job.datePosted,
    snippet: String(job.description || job.snippet || '').replace(/\s+/g, ' ').trim().slice(0, 1_500),
    employmentType: job.job_type || job.jobType,
    rawPayload: { provider: 'jobspy2', job },
  };
}

export class JobSpy2Provider implements ScrapeProvider {
  readonly id = 'jobspy2';
  readonly label = 'JobSpy2 multi-site (speedyapply fork)';

  supports(portal: PortalType): boolean {
    return JOBSPY2_PORTALS.includes(portal);
  }

  async isAvailable(): Promise<boolean> {
    return hasJobSpy2();
  }

  async scrape(input: ScrapeInput): Promise<PortalScanResult> {
    // Map portal name: zip_recruiter stays as-is, glassdoor as-is, linkedin as-is
    const siteMap: Partial<Record<PortalType, string>> = {
      zip_recruiter: 'zip_recruiter',
      glassdoor: 'glassdoor',
      linkedin: 'linkedin',
      indeed: 'indeed',
    };
    const siteName = siteMap[input.portal] ?? input.portal;

    const jobs = await runPythonScript(
      path.join('scripts', 'python', 'jobspy_runner.py'),
      {
        site_name: siteName,
        search_term: [
          input.query.titleVariants?.[0],
          ...(input.query.keywords || []).slice(0, 4),
        ].filter(Boolean).join(' '),
        location: input.query.locations?.[0] || 'India',
        results_wanted: 25,
        country_indeed: 'india',
        is_remote: input.query.isRemote,
        hours_old: 24 * 14,
      },
      60_000,
    );

    const mapped = jobs
      .map((job) => mapJob(input.portal, job))
      .filter((job) => Boolean(job.url));

    return {
      portal: input.portal,
      status: mapped.length ? 'success' : 'failed',
      jobs: mapped,
      error: mapped.length ? undefined : `empty_results: jobspy2 returned no jobs for ${input.portal}.`,
      failureCode: mapped.length ? undefined : 'empty_results',
      sourceHealthLabel: mapped.length ? 'healthy' : 'unavailable',
    };
  }
}
