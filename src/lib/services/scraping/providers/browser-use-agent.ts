import { spawnSync } from 'child_process';
import path from 'path';
import { resolvePythonBinary, runPythonScript } from '../python-path';
import type { ScrapeInput, ScrapeProvider, PortalType } from '../scraper-manager';
import type { PortalScanResult, RawScrapedJob } from '../types';

function hasBrowserUse(): boolean {
  const result = spawnSync(resolvePythonBinary(), ['-c', 'import browser_use; print("ok")'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return result.status === 0;
}

function hasLlmApiKey(): boolean {
  return Boolean(
    process.env.OPENAI_API_KEY?.trim() ||
    process.env.ANTHROPIC_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim(),
  );
}

function buildTask(portal: string, searchTerm: string, location: string): string {
  const portalUrls: Record<string, string> = {
    linkedin: 'linkedin.com/jobs',
    naukri: 'naukri.com',
    wellfound: 'wellfound.com/jobs',
    foundit: 'foundit.in',
    instahyre: 'instahyre.com',
    indeed: 'in.indeed.com/jobs',
    company_ats: 'company careers pages',
    official: 'company careers pages',
    google_jobs: 'google.com jobs',
  };
  const site = portalUrls[portal] || portal;

  return (
    `Go to ${site} and search for "${searchTerm}" jobs in "${location}". ` +
    `Extract up to 20 job listings from the results page. ` +
    `For each job, return a JSON array where each element has these fields: ` +
    `title (string), company (string), location (string), url (string, the job detail or apply URL), snippet (string, short description if visible). ` +
    `Return ONLY the raw JSON array, no extra text.`
  );
}

function mapJob(portal: string, job: any): RawScrapedJob {
  return {
    portal,
    externalId: job.url || job.id,
    title: String(job.title || 'Untitled role'),
    company: String(job.company || 'Company not listed'),
    location: job.location,
    isRemote: Boolean(job.is_remote),
    url: String(job.url || ''),
    applyUrl: job.apply_url || job.url,
    snippet: String(job.snippet || '').replace(/\s+/g, ' ').trim().slice(0, 1_500),
    rawPayload: { provider: 'browser-use-agent', job },
  };
}

export class BrowserUseAgentProvider implements ScrapeProvider {
  readonly id = 'browser-use-agent';
  readonly label = 'Browser-Use AI agent (last resort)';

  supports(_portal: PortalType): boolean {
    return true;
  }

  async isAvailable(): Promise<boolean> {
    return hasBrowserUse() && hasLlmApiKey();
  }

  async scrape(input: ScrapeInput): Promise<PortalScanResult> {
    const searchTerm = [input.query.titleVariants?.[0], ...(input.query.keywords || []).slice(0, 3)]
      .filter(Boolean)
      .join(' ');
    const location = input.query.locations?.[0] || 'India';

    const llmProvider = process.env.OPENAI_API_KEY
      ? 'openai'
      : process.env.ANTHROPIC_API_KEY
        ? 'anthropic'
        : 'gemini';

    const llmApiKey =
      process.env.OPENAI_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
      '';

    const config = {
      portal: input.portal,
      task: buildTask(input.portal, searchTerm, location),
      llm_provider: llmProvider,
      llm_api_key: llmApiKey,
    };

    const jobs = await runPythonScript(
      path.join('scripts', 'python', 'browser_use_runner.py'),
      config,
      180_000,
    );

    const mapped = jobs
      .map((job) => mapJob(input.portal, job))
      .filter((job) => Boolean(job.url));

    return {
      portal: input.portal,
      status: mapped.length ? 'success' : 'failed',
      jobs: mapped,
      error: mapped.length ? undefined : 'empty_results: browser-use-agent returned no usable jobs.',
      failureCode: mapped.length ? undefined : 'empty_results',
      sourceHealthLabel: mapped.length ? 'healthy' : 'unavailable',
    };
  }
}
