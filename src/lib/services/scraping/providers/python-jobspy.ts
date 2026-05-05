import { spawn, spawnSync } from 'child_process';
import path from 'path';
import type { ScrapeInput, ScrapeProvider, PortalType } from '../scraper-manager';
import type { PortalScanResult, RawScrapedJob } from '../types';
import { resolvePythonBinary } from '../python-path';

function pythonBin() {
  return resolvePythonBinary();
}

function hasPythonJobSpy() {
  const result = spawnSync(pythonBin(), ['-c', 'import jobspy; print("ok")'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return result.status === 0;
}

function runPython(config: Record<string, unknown>, timeoutMs = 45_000): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin(), [
      path.resolve(process.cwd(), 'scripts/python/jobspy_runner.py'),
      JSON.stringify(config),
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('timeout: python-jobspy process timed out.'));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `python-jobspy exited with code ${code}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        resolve(Array.isArray(parsed.jobs) ? parsed.jobs : []);
      } catch (error) {
        reject(error);
      }
    });
  });
}

function mapJob(portal: string, job: any): RawScrapedJob {
  return {
    portal,
    externalId: job.id || job.job_id || job.job_url || job.jobUrl,
    title: String(job.title || 'Untitled role'),
    company: String(job.company || job.company_name || 'Company not listed'),
    location: job.location,
    isRemote: Boolean(job.is_remote ?? job.isRemote),
    salaryText: job.salary || job.salaryText,
    url: String(job.job_url || job.jobUrl || job.url || ''),
    applyUrl: job.job_url_direct || job.jobUrlDirect || job.apply_url,
    postedDateText: job.date_posted || job.datePosted,
    snippet: String(job.description || '').replace(/\s+/g, ' ').trim().slice(0, 1_500),
    employmentType: job.job_type || job.jobType,
    rawPayload: { provider: 'python-jobspy', job },
  };
}

export class PythonJobSpyProvider implements ScrapeProvider {
  readonly id = 'python-jobspy';
  readonly label = 'python-jobspy upstream package';

  supports(portal: PortalType): boolean {
    return portal === 'indeed' || portal === 'naukri';
  }

  async isAvailable(): Promise<boolean> {
    return hasPythonJobSpy();
  }

  async scrape(input: ScrapeInput): Promise<PortalScanResult> {
    const jobs = await runPython({
      site_name: input.portal,
      search_term: [input.query.titleVariants?.[0], ...(input.query.keywords || []).slice(0, 4)].filter(Boolean).join(' '),
      location: input.query.locations?.[0] || 'India',
      results_wanted: 25,
      country_indeed: 'india',
      is_remote: input.query.isRemote,
      hours_old: 24 * 14,
    });
    const mapped = jobs.map((job) => mapJob(input.portal, job)).filter((job) => Boolean(job.url));
    return {
      portal: input.portal,
      status: mapped.length ? 'success' : 'failed',
      jobs: mapped,
      error: mapped.length ? undefined : 'empty_results: python-jobspy returned no usable jobs.',
      failureCode: mapped.length ? undefined : 'empty_results',
    };
  }
}
