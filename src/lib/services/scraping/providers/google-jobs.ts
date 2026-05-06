import crypto from 'crypto';
import { spawn, spawnSync } from 'child_process';
import path from 'path';
import type { BasePortalAdapter } from '../adapters/base';
import { classifySourceFailure, sourceFallbackSignal, sourceHealthLabelForFailure } from '../failures';
import { resolvePythonBinary } from '../python-path';
import { waitForScrapeDomainSlot } from '../rate-limiter';
import type { ScrapeInput, ScrapeProvider, PortalType } from '../scraper-manager';
import type { PortalScanResult, RawScrapedJob } from '../types';

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
      reject(new Error('timeout: Google Jobs discovery timed out.'));
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

function cleanSnippet(value: unknown, maxLength = 160) {
  const cleaned = String(value || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'Google surfaced a short preview only. Analyse this URL to fetch the full job description.';
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1).trim()}...` : cleaned;
}

function hostFromUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

function sourceSiteFromUrl(value: string) {
  const host = hostFromUrl(value);
  if (host.includes('linkedin.')) return { id: 'linkedin', label: 'LinkedIn' };
  if (host.includes('indeed.')) return { id: 'indeed', label: 'Indeed' };
  if (host.includes('naukri.')) return { id: 'naukri', label: 'Naukri' };
  if (host.includes('foundit.')) return { id: 'foundit', label: 'Foundit' };
  if (host.includes('instahyre.')) return { id: 'instahyre', label: 'Instahyre' };
  if (host.includes('greenhouse.')) return { id: 'greenhouse', label: 'Greenhouse' };
  if (host.includes('lever.')) return { id: 'lever', label: 'Lever' };
  if (host.includes('ashbyhq.')) return { id: 'ashby', label: 'Ashby' };
  if (host.includes('workdayjobs.')) return { id: 'workday', label: 'Workday' };
  if (host.includes('smartrecruiters.')) return { id: 'smartrecruiters', label: 'SmartRecruiters' };
  if (host.includes('oraclecloud.')) return { id: 'oraclecloud', label: 'Oracle Cloud' };
  const fallbackHost = host.split('.').slice(0, 2).join('.') || 'job source';
  const fallbackLabel = fallbackHost
    .replace(/\.[a-z]+$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  return { id: fallbackHost || 'source', label: fallbackLabel || 'Job source' };
}

function matchesPortalSource(inputPortal: PortalType, url: string) {
  const host = hostFromUrl(url);
  if (inputPortal === 'linkedin') return host.includes('linkedin.');
  if (inputPortal === 'indeed') return host.includes('indeed.');
  return true;
}

function searchTerm(input: ScrapeInput) {
  const title = [
    input.query.titleVariants?.[0],
    ...(input.query.keywords || []).slice(0, 4),
  ].filter(Boolean).join(' ').trim() || 'product manager';
  const location = input.query.locations?.[0] || 'India';
  const remote = input.query.isRemote ? ' remote' : '';
  if (input.portal === 'linkedin') {
    return `site:linkedin.com/jobs/view ${title} jobs near ${location}${remote}`;
  }
  if (input.portal === 'indeed') {
    return `site:indeed.com/viewjob OR site:in.indeed.com/viewjob ${title} jobs near ${location}${remote}`;
  }
  return `${title} jobs near ${location}${remote}`;
}

type GoogleSurfaceCard = {
  cardId: string;
  title: string;
  company: string;
  location?: string;
  sourceSiteLabel: string;
  postedDateText?: string;
  employmentType?: string;
  listSnippet: string;
  rawLines: string[];
};

type GoogleSurfaceDetail = {
  sourceUrl?: string;
  snippet?: string;
  encodedDocId?: string;
  applyLinks: Array<{ text: string; title: string; href: string }>;
};

function normalizeSearchVariant(value: string) {
  return String(value || '')
    .replace(/\bjobs?\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function googleSurfaceSearchTerms(input: ScrapeInput) {
  const location = input.query.locations?.[0] && !/anywhere/i.test(input.query.locations[0])
    ? input.query.locations[0]
    : 'India';
  const remoteHint = input.query.isRemote ? ' remote' : '';
  const variants = [
    ...(input.query.titleVariants || []),
    normalizeSearchVariant(String(input.query.titleVariants?.[0] || '').replace(/\bai\b/gi, ' ')),
    ...((input.query.keywords || []).filter((keyword) => (
      /\b(product|manager|engineer|developer|designer|analyst|compliance|aml|kyc|ux|ui)\b/i.test(keyword)
    ))),
  ]
    .map(normalizeSearchVariant)
    .filter(Boolean);

  const seen = new Set<string>();
  const queries: string[] = [];
  for (const variant of variants) {
    const candidate = `${variant} jobs ${location}${remoteHint}`.replace(/\s+/g, ' ').trim();
    if (!candidate || seen.has(candidate.toLowerCase())) continue;
    seen.add(candidate.toLowerCase());
    queries.push(candidate);
    if (queries.length >= 4) break;
  }

  if (queries.length === 0) {
    queries.push(`product manager jobs ${location}${remoteHint}`.replace(/\s+/g, ' ').trim());
  }

  return queries;
}

function googleSurfaceUrl(query: string) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}&udm=8`;
}

function matchesVisibleSource(portal: PortalType, visibleSourceLabel: string) {
  const lower = String(visibleSourceLabel || '').toLowerCase();
  if (portal === 'linkedin') return lower.includes('linkedin');
  if (portal === 'indeed') return lower.includes('indeed');
  return true;
}

function surfaceJobFromDetail(
  candidate: GoogleSurfaceCard,
  detail: GoogleSurfaceDetail,
  inputPortal: PortalType,
): RawScrapedJob | null {
  const sourceUrl = String(detail.sourceUrl || '').trim();
  if (!sourceUrl || !matchesPortalSource(inputPortal, sourceUrl)) return null;

  return {
    portal: 'google_jobs',
    externalId: String(detail.encodedDocId || '').trim()
      || crypto.createHash('sha256').update(sourceUrl).digest('hex').slice(0, 16),
    title: candidate.title,
    company: candidate.company,
    location: candidate.location,
    isRemote: /remote|work from home|wfh/i.test(`${candidate.listSnippet} ${detail.snippet || ''}`),
    url: sourceUrl,
    applyUrl: sourceUrl,
    sourceUrl,
    sourceLabel: `${candidate.sourceSiteLabel} (via Google)`,
    status: 'partial',
    snippet: cleanSnippet(detail.snippet || candidate.listSnippet),
    postedDateText: candidate.postedDateText,
    employmentType: candidate.employmentType || 'Preview only — analyse this URL for the full job description',
    rawPayload: {
      provider: 'playwright-google-surface',
      googlePreview: true,
      sourceLabel: `${candidate.sourceSiteLabel} (via Google)`,
      visibleSourceLabel: candidate.sourceSiteLabel,
      applyLinks: detail.applyLinks,
      rawLines: candidate.rawLines,
    },
  };
}

function mapGoogleJob(job: any, inputPortal: PortalType, provider: 'python-jobspy-google' | 'playwright-google'): RawScrapedJob | null {
  const sourceUrl = String(job.job_url || job.jobUrl || job.url || '').trim();
  if (!sourceUrl || !matchesPortalSource(inputPortal, sourceUrl)) return null;
  const source = sourceSiteFromUrl(sourceUrl);
  const title = String(job.title || 'Untitled role').trim();
  const company = String(job.company || job.company_name || 'Company not listed').trim();
  const location = String(job.location || '').trim() || undefined;
  const snippet = cleanSnippet(job.description || job.snippet || job.summary || '');
  const rawId = String(job.id || job.job_id || sourceUrl).trim();

  return {
    portal: 'google_jobs',
    externalId: rawId || crypto.createHash('sha256').update(sourceUrl).digest('hex').slice(0, 16),
    title: title || 'Untitled role',
    company: company || 'Company not listed',
    location,
    isRemote: Boolean(job.is_remote ?? job.isRemote ?? /remote|work from home|wfh/i.test(snippet)),
    url: sourceUrl,
    applyUrl: sourceUrl,
    sourceUrl,
    sourceLabel: `${source.label} (via Google)`,
    status: 'partial',
    snippet,
    employmentType: 'Preview only — analyse this URL for the full job description',
    rawPayload: {
      provider,
      googlePreview: true,
      sourceSite: source.id,
      sourceLabel: `${source.label} (via Google)`,
      job,
    },
  };
}

function titleFromLinkedInUrl(url: string) {
  const match = url.match(/\/jobs\/view\/([^/?#]+)/i)?.[1] || '';
  const cleaned = match.replace(/-\d+(?:\/)?$/i, '').replace(/\/$/, '');
  const titleSlug = cleaned.split(/-at-/i)[0] || cleaned;
  return titleSlug
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function inferSearchResultJob(result: { url: string; title: string; snippet: string }, inputPortal: PortalType): RawScrapedJob | null {
  const sourceUrl = String(result.url || '').trim();
  if (!sourceUrl || !matchesPortalSource(inputPortal, sourceUrl)) return null;

  const source = sourceSiteFromUrl(sourceUrl);
  const rawTitle = String(result.title || '').replace(/\s+\|\s+(linkedin|indeed).*/i, '').trim();
  const rawSnippet = cleanSnippet(result.snippet || '');
  const titleParts = rawTitle.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);
  let title = titleParts[0] || titleFromLinkedInUrl(sourceUrl) || 'Untitled role';
  let company = titleParts[1] || 'Company not listed';
  let location = titleParts[2] || undefined;

  if (source.id === 'linkedin' && titleParts.length < 2) {
    const slugTitle = titleFromLinkedInUrl(sourceUrl);
    if (slugTitle) title = slugTitle;
  }

  if (!location) {
    const locationMatch = rawSnippet.match(/\b(Bengaluru|Bangalore|Mumbai|Pune|Hyderabad|Chennai|Delhi|Gurugram|Gurgaon|Noida|Remote)\b/i);
    location = locationMatch?.[1];
  }

  if (/company not listed/i.test(company) && source.id !== 'linkedin') {
    company = source.label;
  }

  return {
    portal: 'google_jobs',
    externalId: crypto.createHash('sha256').update(sourceUrl).digest('hex').slice(0, 16),
    title,
    company,
    location,
    isRemote: /remote|work from home|wfh/i.test(rawSnippet),
    url: sourceUrl,
    applyUrl: sourceUrl,
    sourceUrl,
    sourceLabel: `${source.label} (via Google)`,
    status: 'partial',
    snippet: rawSnippet,
    employmentType: 'Preview only — analyse this URL for the full job description',
    rawPayload: {
      provider: 'playwright-google-web-search',
      googlePreview: true,
      sourceSite: source.id,
      sourceLabel: `${source.label} (via Google)`,
      searchResult: result,
    },
  };
}

function dedupeJobs(jobs: RawScrapedJob[]) {
  const merged = new Map<string, RawScrapedJob>();
  for (const job of jobs) {
    const key = [
      String(job.sourceUrl || job.applyUrl || job.url || '').toLowerCase(),
      String(job.title || '').toLowerCase(),
      String(job.company || '').toLowerCase(),
    ].join('|');
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, job);
      continue;
    }
    const existingSnippet = String(existing.snippet || '');
    const nextSnippet = String(job.snippet || '');
    merged.set(key, {
      ...existing,
      location: existing.location || job.location,
      snippet: nextSnippet.length > existingSnippet.length ? nextSnippet : existingSnippet,
      rawPayload: {
        ...(existing.rawPayload || {}),
        alternateGooglePayloads: [
          ...(existing.rawPayload?.alternateGooglePayloads || []),
          job.rawPayload,
        ],
      },
    });
  }
  return Array.from(merged.values());
}

async function detectGoogleGate(page: any) {
  const title = await page.title().catch(() => '');
  const url = typeof page.url === 'function' ? page.url() : '';
  const body = await page.locator('body').innerText().catch(() => '');
  const lower = `${title}\n${body}\n${url}`.toLowerCase();
  if (/google\.com\/sorry|unusual traffic|verify (?:that )?you are human|captcha|access denied|robot check/i.test(lower)) {
    return 'blocked';
  }
  return null;
}

async function extractGoogleJobsSurfaceCards(page: any, portal: PortalType, maxCards = 10): Promise<GoogleSurfaceCard[]> {
  const evaluationArgs = {
    currentPortal: portal,
    maxVisibleCards: maxCards,
  };

  return (page as any).evaluate(String.raw`(() => {
    const { currentPortal, maxVisibleCards } = ${JSON.stringify(evaluationArgs).replace(/</g, '\\u003c')};
    const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const isLikelyJobTitle = (value) => /manager|engineer|developer|designer|analyst|consultant|specialist|architect|scientist|intern|officer/i.test(value);
    const matchesSource = (sourceLabel) => {
      const lower = clean(sourceLabel).toLowerCase();
      if (currentPortal === 'linkedin') return lower.includes('linkedin');
      if (currentPortal === 'indeed') return lower.includes('indeed');
      return true;
    };

    const seen = new Set();
    let seq = 0;
    const stamp = Date.now().toString(36);

    return Array.from(document.querySelectorAll('div[role="button"]')).flatMap((node) => {
      const element = node;
      const lines = String(element.innerText || '')
        .split(/\n+/)
        .map(clean)
        .filter(Boolean);
      const sourceLine = lines.find((line) => /(?:^|•)\s*via\s+/i.test(line));
      if (!sourceLine) return [];

      let titleIndex = 0;
      while (titleIndex < 2 && lines[titleIndex] && lines[titleIndex].length <= 2) {
        titleIndex += 1;
      }

      const title = clean(lines[titleIndex] || '');
      const company = clean(lines[titleIndex + 1] || '');
      const sourceMatch = clean(sourceLine).match(/^(.*?)\s*(?:•\s*)?via\s+(.+)$/i);
      const location = clean(sourceMatch?.[1] || '');
      const sourceSiteLabel = clean(sourceMatch?.[2] || '');
      if (!title || !company || !sourceSiteLabel || !matchesSource(sourceSiteLabel) || !isLikelyJobTitle(title)) {
        return [];
      }

      const key = [title.toLowerCase(), company.toLowerCase(), location.toLowerCase(), sourceSiteLabel.toLowerCase()].join('|');
      if (seen.has(key)) return [];
      seen.add(key);

      const cardId = 'career-seek-google-card-' + stamp + '-' + (seq += 1);
      element.setAttribute('data-career-seek-google-card', cardId);

      return [{
        cardId,
        title,
        company,
        location: location || undefined,
        sourceSiteLabel,
        postedDateText: lines.find((line) => /\b(?:\d+\s+(?:hour|day|week|month|year)s?\s+ago|today|yesterday)\b/i.test(line)) || undefined,
        employmentType: lines.find((line) => /\b(full.?time|part.?time|contract|temporary|internship|freelance)\b/i.test(line)) || undefined,
        listSnippet: clean(lines.slice(titleIndex, Math.min(lines.length, titleIndex + 5)).join(' ')),
        rawLines: lines.slice(0, 8),
      }];
    }).slice(0, maxVisibleCards);
  })()`);
}

async function extractGoogleSurfaceDetail(page: any, candidate: GoogleSurfaceCard, portal: PortalType): Promise<GoogleSurfaceDetail | null> {
  const evaluationArgs = {
    title: candidate.title,
    company: candidate.company,
    sourceSiteLabel: candidate.sourceSiteLabel,
    currentPortal: portal,
  };

  return (page as any).evaluate(String.raw`(() => {
    const { title, company, sourceSiteLabel, currentPortal } = ${JSON.stringify(evaluationArgs).replace(/</g, '\\u003c')};
    const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const decodeHref = (value) => {
      try {
        const url = new URL(value, location.href);
        if (url.hostname.includes('google.') && url.pathname === '/url') {
          return url.searchParams.get('q') || url.searchParams.get('url') || value;
        }
        return url.href;
      } catch {
        return value;
      }
    };
    const matchesPortal = (href) => {
      const lower = String(href || '').toLowerCase();
      if (currentPortal === 'linkedin') return /linkedin\./i.test(lower);
      if (currentPortal === 'indeed') return /indeed\./i.test(lower);
      return true;
    };

    const normalizedTitle = clean(title);
    const normalizedCompany = clean(company);
    const normalizedSourceLabel = clean(sourceSiteLabel).toLowerCase();
    const titleGroups = Array.from(document.querySelectorAll('div[role="group"][data-title]')).filter((node) => (
      clean(node.getAttribute('data-title') || '') === normalizedTitle
    ));
    const matchingGroups = titleGroups.filter((group) => {
      const text = clean(group.innerText || '');
      return text.includes(normalizedCompany) || /job description/i.test(text);
    });
    const orderedGroups = [...matchingGroups].reverse();
    const summaryGroup = orderedGroups.find((group) => {
      const text = clean(group.innerText || '');
      return /apply on|more jobs at|see web results/i.test(text) && text.includes(normalizedCompany);
    });
    const descriptionGroup = orderedGroups.find((group) => /job description/i.test(clean(group.innerText || '')));

    const links = Array.from(summaryGroup?.querySelectorAll('a[href]') || []).map((node) => {
      const link = node;
      return {
        href: decodeHref(link.href || ''),
        text: clean(link.innerText || link.textContent || ''),
        title: clean(link.getAttribute('title') || ''),
      };
    }).filter((link) => link.href);

    const descriptionText = clean((descriptionGroup?.innerText || '').replace(/^Job description\b/i, ''));
    const score = (link) => {
      const linkText = clean((link.text || '') + ' ' + (link.title || '')).toLowerCase();
      let value = 0;
      if (matchesPortal(link.href)) value += 25;
      if (normalizedSourceLabel && linkText.includes(normalizedSourceLabel)) value += 15;
      if (normalizedSourceLabel.includes('linkedin') && /linkedin\./i.test(link.href)) value += 12;
      if (normalizedSourceLabel.includes('indeed') && /indeed\./i.test(link.href)) value += 12;
      if (/apply on/i.test(link.text) || /apply on/i.test(link.title)) value += 2;
      return value;
    };

    const bestLink = [...links].sort((left, right) => score(right) - score(left))[0];
    const encodedDocId = clean(
      summaryGroup?.querySelector('[data-encoded-docid]')?.getAttribute('data-encoded-docid')
      || descriptionGroup?.querySelector('[data-encoded-docid]')?.getAttribute('data-encoded-docid')
      || '',
    );

    if (!bestLink?.href) return null;

    return {
      sourceUrl: bestLink.href,
      snippet: descriptionText || clean(summaryGroup?.innerText || ''),
      encodedDocId: encodedDocId || undefined,
      applyLinks: links,
    };
  })()`);
}

async function runGoogleJobsSurface(input: ScrapeInput): Promise<RawScrapedJob[]> {
  if (!input.context) return [];
  const page = await input.context.newPage();
  const jobs: RawScrapedJob[] = [];
  const queries = googleSurfaceSearchTerms(input);
  const maxJobs = input.portal === 'google_jobs' ? 18 : 12;

  try {
    for (const query of queries) {
      if (jobs.length >= maxJobs) break;

      input.onProgress?.(`Opening Google Jobs preview search for "${query}"`);
      await page.goto(googleSurfaceUrl(query), {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
      await page.waitForTimeout(1_400);

      const gate = await detectGoogleGate(page);
      if (gate) {
        throw new Error(`${gate}: Google gated the live Jobs preview surface.`);
      }

      const cards = await extractGoogleJobsSurfaceCards(page, input.portal, 10);
      if (cards.length === 0) continue;

      input.onProgress?.(`Google surfaced ${cards.length} preview cards for "${query}"`);
      for (const candidate of cards) {
        if (jobs.length >= maxJobs) break;

        const locator = page.locator(`[data-career-seek-google-card="${candidate.cardId}"]`).first();
        if (!(await locator.count().catch(() => 0))) continue;

        await locator.scrollIntoViewIfNeeded().catch(() => undefined);
        await locator.click({ timeout: 8_000 }).catch(() => undefined);
        await page.waitForTimeout(900);

        const detail = await extractGoogleSurfaceDetail(page, candidate, input.portal).catch(() => null);
        if (!detail) continue;

        const job = surfaceJobFromDetail(candidate, detail, input.portal);
        if (job) {
          job.rawPayload = {
            ...(job.rawPayload || {}),
            surfaceQuery: query,
          };
          jobs.push(job);
        }
      }
    }

    return dedupeJobs(jobs);
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function runGoogleSearchFallback(input: ScrapeInput) {
  if (!input.context) return [] as RawScrapedJob[];
  const page = await input.context.newPage();
  try {
    input.onProgress?.('Searching Google web results for original job URLs');
    await page.goto(`https://www.google.com/search?q=${encodeURIComponent(searchTerm(input))}`, {
      waitUntil: 'domcontentloaded',
      timeout: 25_000,
    });
    await page.waitForTimeout(1_200);
    const gate = await detectGoogleGate(page);
    if (gate) throw new Error(`${gate}: Google blocked the web-search fallback.`);

    const rawResults = await page.evaluate(({ portal }: { portal: string }) => {
      const clean = (value: unknown) => String(value || '').replace(/\s+/g, ' ').trim();
      const decodeHref = (value: string) => {
        try {
          const url = new URL(value);
          if (url.hostname.includes('google.') && url.pathname === '/url') {
            return url.searchParams.get('q') || url.searchParams.get('url') || '';
          }
          return value;
        } catch {
          return value;
        }
      };
      const matchesPortal = (href: string) => {
        const lower = href.toLowerCase();
        if (portal === 'linkedin') return /linkedin\.com\/jobs/i.test(lower);
        if (portal === 'indeed') return /indeed\./i.test(lower);
        return /linkedin\.com\/jobs|indeed\.|naukri\.|greenhouse\.|lever\.|ashbyhq\.|workdayjobs\./i.test(lower);
      };

      const seen = new Set<string>();
      const anchors = Array.from(document.querySelectorAll('a[href]')).filter((anchor) => anchor.querySelector('h3'));
      return anchors.flatMap((anchor) => {
        const href = decodeHref((anchor as HTMLAnchorElement).href || '');
        if (!href || !matchesPortal(href) || seen.has(href)) return [];
        seen.add(href);

        const container = anchor.closest('div.g, div.tF2Cxc, div.MjjYud, div[data-snc], div[data-hveid]') || anchor.parentElement || anchor;
        const title = clean(anchor.querySelector('h3')?.textContent || anchor.textContent || '');
        const snippet = clean(
          container.querySelector('.VwiC3b, .yXK7lf, .MUxGbd, .GI74Re, .s3v9rd')?.textContent
          || container.textContent
          || '',
        );

        if (!title) return [];
        return [{ url: href, title, snippet }];
      }).slice(0, 12);
    }, { portal: input.portal });

    return dedupeJobs(rawResults
      .map((result: any) => inferSearchResultJob(result, input.portal))
      .filter((job: RawScrapedJob | null): job is RawScrapedJob => Boolean(job)));
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function runSerpApi(input: ScrapeInput): Promise<RawScrapedJob[]> {
  const apiKey = process.env.SERPAPI_API_KEY?.trim();
  if (!apiKey) throw new Error('no_serpapi_key');

  const query = [
    input.query.titleVariants?.[0] || 'jobs',
    input.query.isRemote ? 'remote' : '',
    input.query.locations?.[0] || 'India',
  ].filter(Boolean).join(' ');

  const params = new URLSearchParams({
    engine: 'google_jobs',
    q: query,
    location: input.query.locations?.[0] || 'India',
    hl: 'en',
    gl: 'in',
    api_key: apiKey,
  });

  const res = await fetch(`https://serpapi.com/search.json?${params.toString()}`, {
    signal: AbortSignal.timeout(20_000),
  });

  if (res.status === 401) throw new Error('auth_gate: SerpAPI key invalid or quota exhausted');
  if (!res.ok) throw new Error(`browser_error: SerpAPI returned HTTP ${res.status}`);

  const data = await res.json();
  const rows: any[] = Array.isArray(data.jobs_results) ? data.jobs_results : [];

  return rows.slice(0, 20).map((job) => {
    const sourceUrl = (
      (job.related_links as any[])?.[0]?.link ||
      job.apply_link ||
      ''
    );
    const source = sourceSiteFromUrl(sourceUrl);
    return {
      portal: 'google_jobs',
      externalId: String(job.job_id || sourceUrl || '').slice(0, 64) || undefined,
      title: String(job.title || 'Untitled role').trim(),
      company: String(job.company_name || 'Company not listed').trim(),
      location: String(job.location || '').trim() || undefined,
      isRemote: /remote|work from home|wfh/i.test(String(job.location || '') + String(job.description || '')),
      url: sourceUrl,
      applyUrl: sourceUrl,
      sourceUrl: sourceUrl || undefined,
      sourceLabel: sourceUrl ? `${source.label} (via Google)` : 'Google Jobs',
      status: 'partial' as const,
      postedDateText: job.detected_extensions?.posted_at,
      employmentType: job.detected_extensions?.schedule_type,
      snippet: cleanSnippet(job.description || ''),
      rawPayload: { provider: 'serpapi-google-jobs', job },
    };
  }).filter((job) => Boolean(job.url));
}

export class GoogleJobsProvider implements ScrapeProvider {
  readonly id = 'google-jobs';
  readonly label = 'Google Jobs preview discovery';

  constructor(private readonly adapters?: Map<string, BasePortalAdapter>) {}

  supports(portal: PortalType): boolean {
    return portal === 'linkedin' || portal === 'indeed' || portal === 'google_jobs';
  }

  async isAvailable(): Promise<boolean> {
    return hasPythonJobSpy() || Boolean(this.adapters?.has('google_jobs'));
  }

  async scrape(input: ScrapeInput): Promise<PortalScanResult> {
    const failures: string[] = [];
    let jobs: RawScrapedJob[] = [];
    const googleQuery = searchTerm(input);

    await waitForScrapeDomainSlot('google_jobs', 1, 2_000);

    // SerpAPI: structured Google Jobs data, no CAPTCHA, 100 free req/month
    if (process.env.SERPAPI_API_KEY?.trim()) {
      try {
        input.onProgress?.('Querying Google Jobs via SerpAPI…');
        const serpJobs = await runSerpApi(input);
        if (serpJobs.length > 0) {
          jobs = dedupeJobs([...jobs, ...serpJobs]);
          input.onProgress?.(`SerpAPI returned ${serpJobs.length} Google Jobs results`);
        }
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }

    if (hasPythonJobSpy()) {
      try {
        const results = await runPython({
          site_name: 'google',
          search_term: input.query.titleVariants?.[0] || 'product manager',
          google_search_term: googleQuery,
          location: input.query.locations?.[0] || 'India',
          results_wanted: input.portal === 'google_jobs' ? 20 : 14,
          country_indeed: 'india',
          is_remote: input.query.isRemote,
          hours_old: 24 * 14,
        }, 35_000);
        jobs = dedupeJobs(results
          .map((job) => mapGoogleJob(job, input.portal, 'python-jobspy-google'))
          .filter((job): job is RawScrapedJob => Boolean(job)));
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    } else {
      failures.push('dependency_missing: python-jobspy is not installed for Google Jobs discovery.');
    }

    if (input.context) {
      try {
        await waitForScrapeDomainSlot('google_jobs', 1, 2_000);
        const surfaceJobs = await runGoogleJobsSurface(input);
        if (surfaceJobs.length > 0) {
          jobs = dedupeJobs([...jobs, ...surfaceJobs]);
        }
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }

    if (jobs.length === 0 && input.context && this.adapters?.has('google_jobs')) {
      try {
        const adapter = this.adapters.get('google_jobs');
        if (!adapter) throw new Error('unsupported_provider: Google Jobs adapter is unavailable.');
        await waitForScrapeDomainSlot('google_jobs', 1, 2_000);
        const fallback = await adapter.scrape(input.context, input.query, input.onProgress);
        const mapped = fallback.jobs
          .map((job) => mapGoogleJob(job, input.portal, 'playwright-google'))
          .filter((job): job is RawScrapedJob => Boolean(job));
        jobs = dedupeJobs(mapped);
        if (jobs.length === 0 && fallback.error) {
          failures.push(fallback.error);
        }
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }

    if (jobs.length === 0 && input.context) {
      try {
        await waitForScrapeDomainSlot('google_jobs', 1, 2_000);
        jobs = await runGoogleSearchFallback(input);
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }

    if (jobs.length > 0) {
      return {
        portal: 'google_jobs',
        status: 'success',
        jobs,
      };
    }

    const failureMessage = failures.find(Boolean) || 'empty_results: Google Jobs returned no usable preview jobs.';
    const failure = classifySourceFailure(failureMessage);
    return {
      portal: 'google_jobs',
      status: 'failed',
      jobs: [],
      error: failure.message,
      failureCode: failure.code,
      sourceHealthLabel: sourceHealthLabelForFailure(failure.code, 0),
      gracefulFallback: sourceFallbackSignal('google_jobs', failure.code, failure.message, 0),
    };
  }
}
