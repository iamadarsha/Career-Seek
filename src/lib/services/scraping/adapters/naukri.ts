import { BasePortalAdapter } from './base';
import { JobQuery, PortalScanResult, RawScrapedJob } from '../types';
import { BrowserContext } from 'playwright';

function uniqueVariants(query: JobQuery, limit = 5) {
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

function searchLocations(query: JobQuery, limit = 5) {
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

export class NaukriAdapter extends BasePortalAdapter {
  identifier = 'naukri';
  displayName = 'Naukri';
  private readonly maxJobs = Math.min(Number(process.env.JOBHUNT_NAUKRI_LIMIT || process.env.JOBHUNT_SOURCE_LIMIT || 40) || 40, 60);
  private static sessionAuthenticated = false;

  private async loginWithCredentials(context: BrowserContext, onProgress?: (msg: string) => void): Promise<boolean> {
    if (NaukriAdapter.sessionAuthenticated) return true;
    const email = process.env.NAUKRI_EMAIL?.trim();
    const password = process.env.NAUKRI_PASSWORD?.trim();
    if (!email || !password) return false;

    const page = await context.newPage();
    try {
      onProgress?.('Naukri: attempting credential login…');
      await page.goto('https://www.naukri.com/nlogin/login', { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await this.randomDelay(800, 1200);

      const emailEl = await this.firstSelector(page, ['#usernameField', 'input[name="email"]', 'input[type="email"]']);
      const passEl = await this.firstSelector(page, ['#passwordField', 'input[name="password"]', 'input[type="password"]']);
      if (!emailEl || !passEl) return false;

      await emailEl.fill(email);
      await this.randomDelay(400, 700);
      await passEl.fill(password);
      await this.randomDelay(500, 800);

      const submitEl = await this.firstSelector(page, ['button[type="submit"]', 'button.loginButton', 'input[type="submit"]']);
      if (submitEl) {
        await submitEl.click();
      } else {
        await passEl.press('Enter');
      }

      await page.waitForURL(/naukri\.com\/(?!nlogin)/, { timeout: 15_000 }).catch(() => {});
      const url = page.url();
      if (/nlogin/i.test(url)) {
        onProgress?.('Naukri: credential login failed — check NAUKRI_EMAIL/NAUKRI_PASSWORD.');
        return false;
      }
      NaukriAdapter.sessionAuthenticated = true;
      onProgress?.('Naukri: credential login succeeded — session cookies active.');
      return true;
    } catch {
      return false;
    } finally {
      await page.close();
    }
  }

  async healthCheck(context: BrowserContext): Promise<boolean> {
    const page = await context.newPage();
    const isUp = await this.safeNavigate(page, 'https://www.naukri.com/');
    await page.close();
    return isUp;
  }

  async scrape(context: BrowserContext, query: JobQuery, onProgress?: (msg: string) => void): Promise<PortalScanResult> {
    // Log in first so API requests carry session cookies
    await this.loginWithCredentials(context, onProgress).catch(() => false);

    const apiJobs = await this.scrapeApi(context, query, onProgress).catch((error) => {
      onProgress?.(`Naukri API fallback unavailable: ${error.message || error}`);
      return null;
    });
    if (apiJobs?.length) {
      return this.formatResult(apiJobs);
    }

    const page = await context.newPage();
    const jobs: RawScrapedJob[] = [];
    const seen = new Set<string>();
    
    try {
      for (const roleVariant of uniqueVariants(query, 5)) {
        if (jobs.length >= this.maxJobs) break;
        for (const locationValue of searchLocations(query, 2)) {
          if (jobs.length >= this.maxJobs) break;
          const loc = encodeURIComponent(locationValue.toLowerCase());
          const keywords = roleVariant
            .toLowerCase()
            .replace(/&/g, ' and ')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '') || 'jobs';

          let url = `https://www.naukri.com/${keywords}-jobs`;
          if (loc) url += `-in-${loc}`;

          onProgress?.(`Navigating to ${url}`);
          const success = await this.safeNavigate(page, url, 35000);
          if (!success) continue;

          const gate = await this.detectAccessGate(page);
          if (gate) throw new Error(gate === 'blocked' ? 'blocked: Naukri appears to be blocking automated access' : 'auth_gate: Naukri requires sign-in');

          await this.randomDelay(1800, 2800);

          const { selector, elements: jobCards } = await this.selectorChain(page, [
            'div.srp-jobtuple-wrapper',
            'article.jobTuple',
            'div.jobTuple',
            'div.cust-job-tuple',
            '[data-job-id]',
          ]);
          onProgress?.(`Found ${jobCards.length} job cards on Naukri for "${roleVariant}" in ${locationValue}`);
          if (jobCards.length === 0) {
            if (jobs.length === 0) {
              throw new Error(`selector_not_found: no Naukri job cards matched fallback chain (${selector || 'none'})`);
            }
            continue;
          }

          for (let i = 0; i < Math.min(jobCards.length, this.maxJobs); i++) {
            try {
              const card = jobCards[i];
              const titleEl = await this.firstSelector(card, ['a.title', '.title a', 'a[href*="job-listings"]', 'a']);
              const companyEl = await this.firstSelector(card, ['a.comp-name', '.comp-name a', '.companyInfo a', '.company']);
              const locationEl = await this.firstSelector(card, ['.locWdth', '.location', '[title*="Location"]']);
              const expEl = await this.firstSelector(card, ['.expwdth', '.experience', '[title*="Experience"]']);
              const salaryEl = await this.firstSelector(card, ['.sal', '.salary', '[title*="Salary"]']);
              const snippetEl = await this.firstSelector(card, ['.job-desc', '.job-description', '.job-desc-text']);

              const title = titleEl ? await titleEl.innerText() : 'Unknown Title';
              const company = companyEl ? await companyEl.innerText() : 'Unknown Company';
              const location = locationEl ? await locationEl.innerText() : undefined;
              const jobUrl = titleEl ? await titleEl.getAttribute('href') : url;
              const experience = expEl ? await expEl.innerText() : undefined;
              const salary = salaryEl ? await salaryEl.innerText() : undefined;
              const snippet = snippetEl ? await snippetEl.innerText() : undefined;

              let externalId;
              if (jobUrl) {
                const match = jobUrl.match(/-(\d{7,})/);
                if (match) externalId = match[1];
              }

              const job: RawScrapedJob = {
                portal: this.identifier,
                title: title.trim(),
                company: company.trim(),
                location: location?.trim(),
                experienceText: experience?.trim(),
                salaryText: salary?.trim(),
                snippet: snippet?.trim(),
                url: jobUrl || url,
                externalId,
              };
              const dedupeKey = `${String(job.url || '').toLowerCase()}::${String(job.title || '').toLowerCase()}`;
              if (job.title && job.url && !seen.has(dedupeKey)) {
                seen.add(dedupeKey);
                jobs.push(job);
              }
              if (jobs.length >= this.maxJobs) break;
            } catch (cardError) {
              console.warn('[Naukri] Error parsing card', cardError);
            }
          }
        }
      }

      if (jobs.length === 0) {
        throw new Error('parse_error: Naukri cards were found but no usable jobs could be parsed');
      }

      return this.formatResult(jobs);

    } catch (e: any) {
      return this.formatFailureResult(jobs, e, page);
    } finally {
      await page.close();
    }
  }

  private async scrapeApi(context: BrowserContext, query: JobQuery, onProgress?: (msg: string) => void): Promise<RawScrapedJob[]> {
    const jobs: RawScrapedJob[] = [];
    const seen = new Set<string>();
    const locations = query.locations?.length ? query.locations.slice(0, 3) : ['India'];
    const roleVariants = uniqueVariants(query);

    for (const keyword of roleVariants) {
      for (const location of locations) {
        for (let pageNo = 1; jobs.length < this.maxJobs && pageNo <= 2; pageNo++) {
          // Build salary range filter: Naukri uses salary in LPA (integer)
          // Convert INR to LPA (1 LPA = 100_000 INR)
          const salaryMinLPA = query.salaryMin != null
            ? Math.floor(query.salaryMin / 100_000)
            : undefined;
          const salaryMaxLPA = query.salaryMax != null
            ? Math.ceil(query.salaryMax / 100_000)
            : undefined;

          const params = new URLSearchParams({
            noOfResults: '20',
            urlType: 'search_by_keyword',
            searchType: 'adv',
            keyword,
            k: keyword,
            location,
            l: location,
            pageNo: String(pageNo),
            experience: query.experienceMin != null ? String(query.experienceMin) : '',
            // Salary range — only include when we have meaningful values
            ...(salaryMinLPA != null && salaryMinLPA > 0 ? { sminlakh: String(salaryMinLPA) } : {}),
            ...(salaryMaxLPA != null && salaryMaxLPA > 0 ? { smaxlakh: String(salaryMaxLPA) } : {}),
          });
          const url = `https://www.naukri.com/jobapi/v3/search?${params.toString()}`;
          onProgress?.(`Querying Naukri public job API for "${keyword}" in ${location} (page ${pageNo})`);

          const response = await (context as any).request.get(url, {
            headers: {
              accept: 'application/json',
              appid: '109',
              systemid: '109',
              'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
            },
            timeout: 30_000,
          });

          if (response.status() === 401 || response.status() === 403) {
            throw new Error('auth_gate: Naukri API requires auth or rejected this request');
          }
          if (response.status() === 406) {
            const body = await response.text().catch(() => '');
            if (/recaptcha|captcha/i.test(body)) {
              throw new Error('captcha: Naukri API requires recaptcha for this request');
            }
            throw new Error('provider_api_error: Naukri API rejected content negotiation');
          }
          if (response.status() === 429) {
            throw new Error('blocked: Naukri API rate-limited this request');
          }
          if (!response.ok()) {
            throw new Error(`browser_error: Naukri API returned HTTP ${response.status()}`);
          }

          const payload = await response.json().catch(() => null);
          const rows = this.extractRows(payload);
          if (!rows.length) break;

          for (const row of rows) {
            const mapped = this.mapApiJob(row);
            if (mapped) {
              const dedupeKey = `${mapped.url.toLowerCase()}::${mapped.title.toLowerCase()}`;
              if (!seen.has(dedupeKey)) {
                seen.add(dedupeKey);
                jobs.push(mapped);
              }
            }
            if (jobs.length >= this.maxJobs) break;
          }
        } // end pageNo loop
      }
    }

    if (jobs.length === 0) {
      throw new Error('empty_results: Naukri API returned no usable jobs');
    }
    return jobs;
  }

  private extractRows(payload: any): any[] {
    if (!payload) return [];
    if (Array.isArray(payload.jobDetails)) return payload.jobDetails;
    if (Array.isArray(payload.jobs)) return payload.jobs;
    if (Array.isArray(payload.data?.jobs)) return payload.data.jobs;
    if (Array.isArray(payload.data?.jobDetails)) return payload.data.jobDetails;
    return [];
  }

  private placeholder(row: any, label: RegExp): string | undefined {
    const placeholders = Array.isArray(row.placeholders) ? row.placeholders : [];
    const match = placeholders.find((item: any) => label.test(`${item.label || item.type || ''}`));
    return match?.value || match?.text || match?.label;
  }

  private mapApiJob(row: any): RawScrapedJob | null {
    const title = row.title || row.jobTitle || row.designation;
    const company = row.companyName || row.company || row.companyDetails?.name;
    const jobId = String(row.jobId || row.job_id || row.id || '').trim();
    const url = row.jdURL || row.jobUrl || row.applyUrl || (jobId ? `https://www.naukri.com/job-listings-${jobId}` : '');
    if (!title || !company || !url) return null;

    const location = row.location || row.locationText || this.placeholder(row, /location/i);
    const experience = row.experienceText || row.experience || this.placeholder(row, /experience/i);
    const salary = row.salary || row.salaryText || this.placeholder(row, /salary/i);
    const snippet = row.jobDescription || row.description || row.tagsAndSkills || row.keySkills;

    return {
      portal: this.identifier,
      externalId: jobId || undefined,
      title: String(title).trim(),
      company: String(company).trim(),
      location: location ? String(location).trim() : undefined,
      experienceText: experience ? String(experience).trim() : undefined,
      salaryText: salary ? String(salary).trim() : undefined,
      url: String(url).startsWith('http') ? String(url) : `https://www.naukri.com${url}`,
      applyUrl: row.applyUrl,
      postedDateText: row.footerPlaceholderLabel || row.postedDate || row.createdDate,
      snippet: Array.isArray(snippet) ? snippet.join(', ') : snippet ? String(snippet).replace(/<[^>]*>/g, ' ').trim() : undefined,
      employmentType: row.employmentType,
      rawPayload: row,
    };
  }
}
