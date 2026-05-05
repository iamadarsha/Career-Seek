import { BrowserContext } from 'playwright';
import { BasePortalAdapter } from './base';
import { JobQuery, PortalScanResult, RawScrapedJob } from '../types';

const FOUNDIT_JOB_LIMIT = Math.min(Number(process.env.JOBHUNT_FOUNDIT_LIMIT || 35) || 35, 60);

function uniqueVariants(query: JobQuery, limit = 3) {
  const seen = new Set<string>();
  const variants: string[] = [];
  for (const value of query.titleVariants || []) {
    const cleaned = String(value || '').replace(/\s+/g, ' ').trim();
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) continue;
    seen.add(key);
    variants.push(cleaned);
    if (variants.length >= limit) break;
  }
  return variants.length ? variants : ['Product Manager'];
}

function searchLocations(query: JobQuery, limit = 2) {
  const seen = new Set<string>();
  const locations: string[] = [];
  for (const value of query.locations || ['India']) {
    const cleaned = String(value || '').replace(/\s+/g, ' ').trim();
    if (!cleaned) continue;
    const normalized = /remote|anywhere/i.test(cleaned) ? 'India' : cleaned;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    locations.push(normalized);
    if (locations.length >= limit) break;
  }
  if (!locations.length) locations.push('India');
  return locations;
}

function searchSlug(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export class FounditAdapter extends BasePortalAdapter {
  identifier = 'foundit';
  displayName = 'Foundit / Monster India';

  async healthCheck(context: BrowserContext): Promise<boolean> {
    const page = await context.newPage();
    const isUp = await this.safeNavigate(page, 'https://www.foundit.in/');
    await page.close();
    return isUp;
  }

  async scrape(context: BrowserContext, query: JobQuery, onProgress?: (msg: string) => void): Promise<PortalScanResult> {
    const page = await context.newPage();
    const jobs: RawScrapedJob[] = [];
    const seen = new Set<string>();

    try {
      for (const role of uniqueVariants(query, 3)) {
        if (jobs.length >= FOUNDIT_JOB_LIMIT) break;
        for (const location of searchLocations(query, 2)) {
          if (jobs.length >= FOUNDIT_JOB_LIMIT) break;
          const url = `https://www.foundit.in/search/${searchSlug(role)}-jobs-in-${searchSlug(location) || 'india'}`;
          onProgress?.(`Opening Foundit search for ${role} in ${location}`);
          const ok = await this.safeNavigate(page, url, 35000);
          if (!ok) continue;
          const gate = await this.detectAccessGate(page);
          if (gate) {
            jobs.push(...await this.scrapeMiddlewareSearch({
              ...query,
              titleVariants: [role],
              locations: [location],
            }, onProgress));
            if (jobs.length > 0) return this.formatResult(jobs);
            throw new Error(`${gate}: Foundit did not allow this public search`);
          }
          await this.randomDelay(1800, 2800);

          const extracted = await this.extractJobLinksFromPage(page, {
            ...query,
            titleVariants: [role],
            locations: [location],
          }, {
            hrefIncludes: ['foundit.in/job/', '/job/'],
            max: FOUNDIT_JOB_LIMIT - jobs.length,
            defaultLocation: location || 'India',
          });
          for (const job of extracted) {
            const dedupeKey = `${String(job.url || '').toLowerCase()}::${String(job.title || '').toLowerCase()}`;
            if (!seen.has(dedupeKey)) {
              seen.add(dedupeKey);
              jobs.push(job);
            }
          }
          if (jobs.length >= FOUNDIT_JOB_LIMIT) break;

          const cards = await page.$$('[class*="job"], [data-testid*="job"], article');
          onProgress?.(`Found ${cards.length} possible Foundit cards for "${role}" in ${location}`);

          for (const card of cards.slice(0, FOUNDIT_JOB_LIMIT)) {
            try {
              const titleEl = await card.$('a[href*="job"], h2, h3, [class*="title"]');
              const title = titleEl ? (await titleEl.innerText()).trim() : '';
              const href = titleEl ? await titleEl.getAttribute('href') : null;
              if (!title || title.length < 4) continue;
              const cardText = (await card.innerText()).trim();
              const lines: string[] = cardText.split('\n').map((line: string) => line.trim()).filter(Boolean);
              const job: RawScrapedJob = {
                portal: this.identifier,
                title,
                company: lines.find((line) => line !== title && line.length > 2) || 'Company not listed',
                location: lines.find((line) => /india|bengaluru|bangalore|mumbai|pune|hyderabad|delhi|remote/i.test(line)),
                snippet: lines.slice(0, 6).join(' '),
                url: href?.startsWith('http') ? href : href ? `https://www.foundit.in${href}` : url,
              };
              const dedupeKey = `${String(job.url || '').toLowerCase()}::${String(job.title || '').toLowerCase()}`;
              if (job.title && job.url && !seen.has(dedupeKey)) {
                seen.add(dedupeKey);
                jobs.push(job);
              }
              if (jobs.length >= FOUNDIT_JOB_LIMIT) break;
            } catch {
              // Keep scanning other cards; Foundit markup shifts frequently.
            }
          }

          if (jobs.length < FOUNDIT_JOB_LIMIT) {
            const fallback = await this.extractJobLinksFromPage(page, {
              ...query,
              titleVariants: [role],
              locations: [location],
            }, {
              hrefIncludes: ['foundit.in/job/', '/job/', 'job-detail', 'job-listing'],
              max: FOUNDIT_JOB_LIMIT - jobs.length,
              defaultLocation: location || 'India',
            });
            for (const job of fallback) {
              const dedupeKey = `${String(job.url || '').toLowerCase()}::${String(job.title || '').toLowerCase()}`;
              if (!seen.has(dedupeKey)) {
                seen.add(dedupeKey);
                jobs.push(job);
              }
            }
          }
        }
      }

      if (jobs.length === 0) {
        jobs.push(...await this.scrapeMiddlewareSearch(query, onProgress));
      }

      if (jobs.length === 0) {
        throw new Error('selector_not_found: no Foundit/Monster job cards or job links matched fallback selectors');
      }

      return this.formatResult(jobs);
    } catch (error: any) {
      return this.formatFailureResult(jobs, error, page);
    } finally {
      await page.close();
    }
  }

  private async scrapeMiddlewareSearch(query: JobQuery, onProgress?: (msg: string) => void): Promise<RawScrapedJob[]> {
    const jobs: RawScrapedJob[] = [];
    const seen = new Set<string>();
    const roleVariants = uniqueVariants(query, 3);

    try {
      onProgress?.('Foundit page markup was not parseable; trying public middleware search');
      for (const roleVariant of roleVariants) {
        if (jobs.length >= FOUNDIT_JOB_LIMIT) break;
        for (const location of searchLocations(query, 2)) {
          if (jobs.length >= FOUNDIT_JOB_LIMIT) break;
          const params = new URLSearchParams({
            query: roleVariant,
            locations: location || 'India',
            start: '0',
            limit: '25',
          });
          const url = `https://www.foundit.in/middleware/jobsearch?${params.toString()}`;
          const response = await fetch(url, {
            headers: {
              accept: 'application/json,text/plain,*/*',
              referer: `https://www.foundit.in/srp/results?${params.toString()}`,
              'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            },
          });
          if (!response.ok) {
            onProgress?.(`Foundit middleware fallback returned HTTP ${response.status} for "${roleVariant}" in ${location}`);
            continue;
          }
          const payload = await response.json();
          const rows = Array.isArray(payload?.jobSearchResponse?.data) ? payload.jobSearchResponse.data : [];

          for (const row of rows
            .filter((item: any) => item && (item.jobId || item.id || item.seoJdUrl || item.jdUrl || item.redirectUrl) && item.title)
            .slice(0, FOUNDIT_JOB_LIMIT)) {
            const jobPath = row.seoJdUrl || row.jdUrl || '';
            const fallbackId = row.jobId || row.id;
            const founditUrl = jobPath
              ? jobPath.startsWith('http') ? jobPath : `https://www.foundit.in${jobPath}`
              : fallbackId ? `https://www.foundit.in/job/${fallbackId}` : '';
            const jobUrl = founditUrl || row.redirectUrl;
            const salaryText = row.salary && !/^0-0\b/i.test(row.salary) ? row.salary : undefined;
            const experienceText = row.exp || [
              row.minimumExperience?.years,
              row.maximumExperience?.years,
            ].filter((value) => value !== undefined && value !== null).join('-');

            const job = {
              portal: this.identifier,
              externalId: String(row.jobId || row.id || ''),
              title: row.title || 'Foundit job',
              company: row.companyName || row.recruiterName || 'Company not listed',
              location: row.locations || location || 'India',
              salaryText,
              experienceText: experienceText ? `${experienceText}${String(experienceText).includes('Year') ? '' : ' Years'}` : undefined,
              url: jobUrl,
              applyUrl: row.applyUrl || row.redirectUrl || jobUrl,
              postedDateText: row.postedBy || row.updatedAt,
              snippet: [
                row.skills,
                Array.isArray(row.functions) ? row.functions.join(', ') : undefined,
                Array.isArray(row.industries) ? row.industries.join(', ') : undefined,
              ].filter(Boolean).join(' '),
              employmentType: Array.isArray(row.employmentTypes) ? row.employmentTypes.join(', ') : undefined,
              rawPayload: { extraction: 'foundit_middleware_jobsearch', row },
            };
            const dedupeKey = `${String(job.url || '').toLowerCase()}::${String(job.title || '').toLowerCase()}`;
            if (job.title && job.url && !seen.has(dedupeKey)) {
              seen.add(dedupeKey);
              jobs.push(job);
            }
            if (jobs.length >= FOUNDIT_JOB_LIMIT) break;
          }
        }
      }

      return jobs;
    } catch {
      return [];
    }
  }
}
