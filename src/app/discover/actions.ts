'use server';

import { getDb } from '@/db';
import { applications, masterProfiles, searchProfiles, scans, scanPortalRuns, normalizedJobs, scoredJobs, jobEnrichments, jdAnalyses, platformJobs } from '@/db/schema';
import { eq, desc, and, inArray, like } from 'drizzle-orm';
import { scoreUnscoredJobs, upsertScoreForNormalizedJob } from '@/lib/services/scoring/engine';
import { generateJobBrief } from '@/lib/services/scoring/enrichment';
import { executeAiSearch } from '@/lib/services/scoring/ai-search';
import { rankDreamJobs, type JobSearchableDocument } from '@/lib/services/search';
import { indexDocuments } from '@/lib/services/coach/embedder';
import crypto from 'crypto';

import { resolveContext } from '@/lib/platform/identity';

function safeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function isDisplayableJob(job?: {
  portal?: string | null;
  title?: string | null;
  company?: string | null;
  url?: string | null;
  applyUrl?: string | null;
}) {
  if (!job) return false;
  const portal = String(job.portal || '');
  const title = String(job.title || '').trim();
  const company = String(job.company || '').trim();
  const url = String(job.applyUrl || job.url || '');
  if (process.env.JOBHUNT_ENABLE_VALIDATION_SOURCE !== '1' && portal.startsWith('validation_')) return false;
  if (/\/undefined(?:$|[/?#])/i.test(url)) return false;
  if (/^foundit job$/i.test(title) && /^company not listed$/i.test(company)) return false;
  if (/<[^>]+>|src=|data-nimg|logo\.svg/i.test(title)) return false;
  return true;
}

function excludeNonDisplayableRows<T extends { normalizedJob?: {
  portal?: string | null;
  title?: string | null;
  company?: string | null;
  url?: string | null;
  applyUrl?: string | null;
} | null }>(rows: T[]) {
  return rows.filter((row) => isDisplayableJob(row.normalizedJob || undefined));
}

type DiscoverSearchMode = 'keyword' | 'dream';

function toDreamJobDocument(item: {
  scoredJob: typeof scoredJobs.$inferSelect;
  normalizedJob: typeof normalizedJobs.$inferSelect | null;
}): JobSearchableDocument | null {
  const job = item.normalizedJob;
  if (!job) return null;

  return {
    id: item.scoredJob.id,
    title: job.title,
    company: job.company,
    location: job.location,
    snippet: job.snippet,
    description: [
      job.title,
      job.company,
      job.location,
      job.portal,
      job.snippet,
      job.salaryRaw,
      job.experienceRaw,
      item.scoredJob.tier,
      item.scoredJob.breakdown,
    ].filter(Boolean).join('\n'),
    source: job.portal,
    url: job.applyUrl || job.url,
    metadata: {
      score: item.scoredJob.score,
      tier: item.scoredJob.tier,
      portal: job.portal,
      scoredJobId: item.scoredJob.id,
      normalizedJobId: job.id,
    },
  };
}

export async function startJobScan(profileId: number, portals: string[]) {
  const { userId, profileId: ownerProfileId } = resolveContext();
  const { enqueueScrapeJob } = await import('@/lib/queue/enqueue');
  const { withMandatoryCompanySources } = await import('@/lib/services/scraping/source-universe');
  const job = await enqueueScrapeJob({
    searchProfileId: profileId,
    selectedPortals: withMandatoryCompanySources(portals || []),
    bypassCache: true,
    userId,
    profileId: ownerProfileId,
  }, { userId, profileId: ownerProfileId, priority: 10, maxAttempts: 4 });
  return {
    success: true,
    queued: true,
    message: 'Re-scan queued. Results will appear here as the worker processes sources.',
    jobId: job.id,
    scoredCount: 0,
  };
}

export async function getScrapingSourceHealth() {
  const { buildDefaultScraperManager } = await import('@/lib/services/scraping/scraper-manager');
  const providers = await buildDefaultScraperManager().health();
  return { success: true, providers };
}

function stripHtml(value: string) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function metaContent(html: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return stripHtml(match[1]);
  }
  return '';
}

function findJobPostingJsonLd(html: string) {
  const scripts = Array.from(html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi));
  const candidates: any[] = [];
  const visit = (value: any) => {
    if (!value) return;
    if (Array.isArray(value)) return value.forEach(visit);
    if (typeof value !== 'object') return;
    if (String(value['@type'] || '').toLowerCase().includes('jobposting')) candidates.push(value);
    if (Array.isArray(value['@graph'])) value['@graph'].forEach(visit);
  };
  for (const script of scripts) {
    try {
      visit(JSON.parse(stripHtml(script[1]).replace(/&quot;/g, '"')));
    } catch {
      try {
        visit(JSON.parse(script[1].trim()));
      } catch {
        // Keep looking; many pages include analytics JSON-LD variants.
      }
    }
  }
  return candidates[0] || null;
}

function locationFromJobPosting(jobPosting: any) {
  const location = jobPosting?.jobLocation;
  const values = Array.isArray(location) ? location : [location];
  const parts = values.flatMap((item) => {
    const address = item?.address || item;
    return [
      address?.addressLocality,
      address?.addressRegion,
      address?.addressCountry,
      typeof item === 'string' ? item : '',
    ];
  }).filter(Boolean);
  return Array.from(new Set(parts.map(String))).join(', ');
}

async function fetchLinkedInGuestJobPage(url: string) {
  const jobId = url.match(/\/jobs\/view\/(\d+)/i)?.[1];
  if (!jobId) return null;

  try {
    const response = await fetch(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`, {
      redirect: 'follow',
      signal: AbortSignal.timeout(18_000),
      headers: {
        'user-agent': 'Mozilla/5.0 CareerSeek/1.0 local job URL importer',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    if (!response.ok) return null;
    const html = await response.text();
    const title = stripHtml(html.match(/top-card-layout__title[^>]*>([\s\S]*?)</i)?.[1] || '');
    const company = stripHtml(html.match(/topcard__org-name-link[^>]*>([\s\S]*?)</i)?.[1] || '');
    const location = stripHtml(html.match(/topcard__flavor topcard__flavor--bullet[^>]*>([\s\S]*?)</i)?.[1] || '');
    const description = stripHtml(html.match(/show-more-less-html__markup[^>]*>([\s\S]*?)<\/div>/i)?.[1] || '').slice(0, 6_000);
    const employmentType = stripHtml(html.match(/Employment type[\s\S]*?description__job-criteria-text[^>]*>([\s\S]*?)</i)?.[1] || '');

    if (!title && !description) return null;
    return {
      title,
      company,
      description,
      location,
      employmentType,
      source: 'linkedin_guest_api',
    };
  } catch {
    return null;
  }
}

async function fetchManualJobPage(url: string) {
  let direct: { title?: string; company?: string; description?: string; location?: string; employmentType?: string; source: string } | null = null;
  const hostname = new URL(url).hostname.replace(/^www\./, '').toLowerCase();

  if (hostname.includes('linkedin.com')) {
    const guest = await fetchLinkedInGuestJobPage(url);
    const guestHasDescription = guest?.description && guest.description.length > 280;
    if (guestHasDescription) return guest;
    direct = guest || null;
  }

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(18_000),
      headers: {
        'user-agent': 'Mozilla/5.0 CareerSeek/1.0 local job URL importer',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    const html = await response.text();
    const jobPosting = findJobPostingJsonLd(html);
    const title = jobPosting?.title || metaContent(html, 'og:title') || metaContent(html, 'twitter:title') || stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
    const description = stripHtml(jobPosting?.description || metaContent(html, 'og:description') || metaContent(html, 'description') || html).slice(0, 6_000);
    direct = {
      title,
      company: jobPosting?.hiringOrganization?.name || metaContent(html, 'og:site_name'),
      description,
      location: locationFromJobPosting(jobPosting),
      employmentType: jobPosting?.employmentType,
      source: response.ok ? 'direct_http' : `direct_http_${response.status}`,
    };
  } catch {
    direct = direct || null;
  }

  const hasEnoughDirectText = direct?.description && direct.description.length > 280 && !/sign in|captcha|enable javascript|access denied/i.test(direct.description);
  if (hasEnoughDirectText) return direct;

  try {
    const { BrowserManager } = await import('@/lib/services/scraping/browser-manager');
    const browser = new BrowserManager();
    const context = await browser.init();
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25_000 });
    await page.waitForTimeout(1_200);
    const title = await page.title().catch(() => direct?.title || '');
    const metaDescription = await page.locator('meta[name="description"]').getAttribute('content').catch(() => '');
    const ogDescription = await page.locator('meta[property="og:description"]').getAttribute('content').catch(() => '');
    const bodyText = await page.locator('body').innerText({ timeout: 6_000 }).catch(() => '');
    await page.close().catch(() => undefined);
    await browser.close();
    const description = stripHtml([ogDescription, metaDescription, bodyText].filter(Boolean).join('\n')).slice(0, 6_000);
    if (description.length > (direct?.description?.length || 0)) {
      return {
        ...direct,
        title: title || direct?.title,
        description,
        source: 'playwright',
      };
    }
  } catch {
    // Direct fetch data, even if thin, is still better than refusing a URL rescue.
  }

  return direct;
}

async function manualJobFromUrl(input: string) {
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Use a valid http or https job URL.');
  }
  const hostname = url.hostname.replace(/^www\./, '');
  const page = await fetchManualJobPage(url.toString());
  const company = hostname
    .split('.')
    .slice(0, -1)
    .join(' ')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase()) || hostname;
  const pathTitle = url.pathname
    .split('/')
    .filter(Boolean)
    .slice(-2)
    .join(' ')
    .replace(/[-_]+/g, ' ')
    .replace(/\b(?:jobs?|careers?|job|apply|openings?|positions?)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  const pageTitle = String(page?.title || '').replace(/\s+\|\s+LinkedIn.*$/i, '').replace(/\s+-\s+LinkedIn.*$/i, '').trim();
  const linkedInParts = pageTitle.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);
  const inferredLinkedInTitle = hostname.includes('linkedin.com') && linkedInParts.length >= 2 ? linkedInParts[0] : '';
  const inferredLinkedInCompany = hostname.includes('linkedin.com') && linkedInParts.length >= 2 ? linkedInParts[1] : '';
  const linkedInSlug = hostname.includes('linkedin.com')
    ? (url.pathname.match(/\/jobs\/view\/([^/?#]+)/i)?.[1] || '')
    : '';
  const linkedInSlugCore = linkedInSlug.replace(/-\d+(?:\/)?$/i, '').replace(/\/$/, '');
  const linkedInSlugParts = linkedInSlugCore.split(/-at-/i);
  const slugLinkedInTitle = linkedInSlugParts[0]
    ? linkedInSlugParts[0].replace(/[-_]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()).trim()
    : '';
  const slugLinkedInCompany = linkedInSlugParts[1]
    ? linkedInSlugParts[1].replace(/[-_]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()).trim()
    : '';
  const cleanCompany = page?.company && !/^in linkedin$/i.test(page.company) ? page.company : '';
  const cleanPageTitle = pageTitle && !/^linkedin$/i.test(pageTitle) ? pageTitle : '';
  const tentativeTitle = cleanPageTitle.length >= 5
    ? cleanPageTitle
    : inferredLinkedInTitle || slugLinkedInTitle || (pathTitle.length >= 4 ? pathTitle.replace(/\b\w/g, (char) => char.toUpperCase()) : 'Manual imported role');
  const tentativeCompany = cleanCompany || inferredLinkedInCompany || slugLinkedInCompany || company;
  const rawSnippet = String(page?.description || '').trim();
  const linkedInBlockedSnippet = hostname.includes('linkedin.com') && (
    rawSnippet.length < 80 ||
    /li-icon|vertical-align|display:block|linkedin/i.test(rawSnippet.slice(0, 600))
  );
  const cleanSnippet = linkedInBlockedSnippet
    ? `LinkedIn job URL imported for ${tentativeTitle} at ${tentativeCompany}. Verify the live description on LinkedIn before applying.`
    : rawSnippet;
  const hasFullDescription = cleanSnippet.length >= 280 && !linkedInBlockedSnippet;

  return {
    url: url.toString(),
    company: tentativeCompany,
    title: tentativeTitle,
    location: page?.location,
    snippet: cleanSnippet,
    employmentType: page?.employmentType,
    extractionSource: page?.source || 'url_metadata',
    hasFullDescription,
    externalId: crypto.createHash('sha256').update(url.toString()).digest('hex').slice(0, 16),
  };
}

type ManualImportOptions = {
  requireFullDescription?: boolean;
};

export async function manualImportJobUrl(searchProfileId: number, inputUrl: string, options?: ManualImportOptions) {
  const db = getDb();
  const { profileId: ownerProfileId } = resolveContext();
  const profile = db.select().from(searchProfiles)
    .where(and(eq(searchProfiles.id, searchProfileId), eq(searchProfiles.profileId, ownerProfileId)))
    .get();
  if (!profile) return { success: false, error: 'Search profile not found or access denied.' };

  let manualJob;
  try {
    manualJob = await manualJobFromUrl(inputUrl.trim());
  } catch (error: any) {
    return { success: false, error: error?.message || 'Invalid URL.' };
  }

  if (options?.requireFullDescription && !manualJob.hasFullDescription) {
    return {
      success: false,
      error: 'Career Seek could not extract the full description from this job page yet. Open the source page manually, then try again from a public job or company URL.',
    };
  }

  const existing = db.select({
    id: normalizedJobs.id,
    portal: normalizedJobs.portal,
    scanId: normalizedJobs.scanId,
  }).from(normalizedJobs)
    .where(and(eq(normalizedJobs.profileId, ownerProfileId), eq(normalizedJobs.url, manualJob.url)))
    .get();
  if (existing) {
    if (existing.portal === 'google_jobs') {
      db.update(normalizedJobs).set({
        portal: 'manual_url',
        externalId: manualJob.externalId,
        title: manualJob.title,
        company: manualJob.company,
        location: manualJob.location || safeJson<string[]>(profile.locations, [])[0] || 'India',
        applyUrl: manualJob.url,
        snippet: manualJob.snippet || 'Manual URL import. Verify the live job description on the official page before applying.',
        employmentType: manualJob.employmentType || `Pasted Job URL — ${manualJob.extractionSource}`,
        scrapedAt: new Date(),
      }).where(eq(normalizedJobs.id, existing.id)).run();

      const existingScore = db.select({ id: scoredJobs.id }).from(scoredJobs)
        .where(and(eq(scoredJobs.profileId, ownerProfileId), eq(scoredJobs.normalizedJobId, existing.id)))
        .get();
      if (existingScore) {
        db.delete(jobEnrichments).where(eq(jobEnrichments.scoredJobId, existingScore.id)).run();
        db.delete(jdAnalyses).where(eq(jdAnalyses.scoredJobId, existingScore.id)).run();
      }

      await upsertScoreForNormalizedJob(ownerProfileId, existing.id);
      return {
        success: true,
        message: 'Google preview upgraded with the full job page. Briefs, scoring, and tailored documents are now unlocked.',
        scoredCount: 1,
      };
    }

    const scoredCount = await scoreUnscoredJobs(ownerProfileId);
    return { success: true, message: 'This URL was already imported. Existing job was rescored if needed.', scoredCount };
  }

  const scan = db.insert(scans).values({
    profileId: ownerProfileId,
    searchProfileId,
    status: 'complete',
    startedAt: new Date(),
    finishedAt: new Date(),
    totalJobs: 1,
  }).returning().get();

  db.insert(scanPortalRuns).values({
    scanId: scan.id,
    portal: 'manual_url',
    status: 'complete',
    jobsFound: 1,
    startedAt: new Date(),
    finishedAt: new Date(),
  }).run();

  const inserted = db.insert(normalizedJobs).values({
    profileId: ownerProfileId,
    scanId: scan.id,
    searchProfileId,
    portal: 'manual_url',
    externalId: manualJob.externalId,
    title: manualJob.title,
    company: manualJob.company,
    location: manualJob.location || safeJson<string[]>(profile.locations, [])[0] || 'India',
    url: manualJob.url,
    applyUrl: manualJob.url,
    snippet: manualJob.snippet || 'Manual URL import. Verify the live job description on the official page before applying.',
    employmentType: manualJob.employmentType || `Pasted Job URL — ${manualJob.extractionSource}`,
    scrapedAt: new Date(),
  }).returning({ id: normalizedJobs.id }).get();

  const scored = await upsertScoreForNormalizedJob(ownerProfileId, inserted.id);
  const scoredCount = scored ? 1 : await scoreUnscoredJobs(ownerProfileId);
  return { success: true, message: 'Manual URL imported and scored.', scoredCount };
}



export async function getLatestScanStatus(profileId: number) {
  const db = getDb();
  const latestScan = db.select().from(scans)
    .where(eq(scans.searchProfileId, profileId))
    .orderBy(desc(scans.startedAt))
    .get();

  const activeJob = db.select().from(platformJobs)
    .where(and(
      eq(platformJobs.jobType, 'scan_jobs'),
      inArray(platformJobs.status, ['queued', 'running', 'processing', 'retrying'])
    ))
    .orderBy(desc(platformJobs.queuedAt))
    .all()
    .find((candidate) => {
      try {
        const payload = JSON.parse(candidate.payload || '{}');
        return payload.searchProfileId === profileId;
      } catch {
        return false;
      }
    }) || null;

  if (!latestScan) return { scan: null, portalRuns: [], progress: activeJob?.progress || 0, activeJob };

  const portalRuns = db.select().from(scanPortalRuns)
    .where(eq(scanPortalRuns.scanId, latestScan.id))
    .all();

  // Try to find an active platform job for this scan
  let progress = activeJob?.progress || 0;
  if (['preparing', 'scraping'].includes(latestScan.status)) {
    const activeScanJob = db.select().from(platformJobs)
      .where(and(
        eq(platformJobs.jobType, 'scan_jobs'),
        inArray(platformJobs.status, ['queued', 'running', 'processing', 'retrying'])
      ))
      .orderBy(desc(platformJobs.queuedAt))
      .get();
    
    if (activeScanJob && activeScanJob.payload) {
      const payload = JSON.parse(activeScanJob.payload);
      if (payload.searchProfileId === profileId) {
        progress = activeScanJob.progress || 0;
      }
    }
  }

  return { scan: latestScan, portalRuns, progress, activeJob };
}

export async function getActiveProfile() {
  const db = getDb();
  const { profileId } = resolveContext();
  return db.select().from(searchProfiles)
    .where(and(eq(searchProfiles.profileId, profileId), eq(searchProfiles.isActive, true)))
    .orderBy(desc(searchProfiles.id)).get()
    || db.select().from(searchProfiles).where(eq(searchProfiles.profileId, profileId)).orderBy(desc(searchProfiles.id)).get();
}

export async function triggerScoring() {
  const { profileId } = resolveContext();
  const scoredCount = await scoreUnscoredJobs(profileId);
  const indexed = await indexDocuments({ includeProfile: true, includeAllJobs: true }).catch((error) => ({
    chunksCreated: 0,
    chunksSkipped: 0,
    error: error instanceof Error ? error.message : String(error),
  }));
  return {
    success: true,
    message: indexed.error ? "Scoring complete. Coach evidence refresh will retry after the next scan." : "Scoring complete and coach evidence refreshed",
    scoredCount,
    indexedChunks: indexed.chunksCreated,
  };
}

export async function getDashboardData(
  profileId: number,
  tierFilter?: string,
  portalFilter?: string,
  searchQuery?: string,
  searchMode: DiscoverSearchMode = 'keyword',
) {
  const db = getDb();
  
  // Basic query logic, using SQLite directly via Drizzle
  // We'll fetch all scored jobs with their normalized job info
  let allScored = excludeNonDisplayableRows(db.select({
    scoredJob: scoredJobs,
    normalizedJob: normalizedJobs,
    enrichment: jobEnrichments
  }).from(scoredJobs)
    .leftJoin(normalizedJobs, eq(scoredJobs.normalizedJobId, normalizedJobs.id))
    .leftJoin(jobEnrichments, eq(jobEnrichments.scoredJobId, scoredJobs.id))
    .where(eq(scoredJobs.searchProfileId, profileId))
    .orderBy(desc(scoredJobs.score))
    .all());

  // Handle AI natural language search if provided
  let aiSearchResults: number[] | null = null;
  let searchMeta: {
    mode: DiscoverSearchMode;
    backend: string;
    matched: number;
    note?: string;
  } | null = null;
  if (searchQuery) {
    if (searchMode === 'dream') {
      const dreamJobs = allScored
        .map((item) => toDreamJobDocument(item))
        .filter((job): job is JobSearchableDocument => Boolean(job));
      const ranked = await rankDreamJobs({
        dreamJob: searchQuery,
        jobs: dreamJobs,
        limit: 50,
      });
      const meaningful = ranked.filter((item) => item.score > 0);
      aiSearchResults = meaningful.map((item) => Number(item.job.id)).filter(Number.isFinite);
      searchMeta = {
        mode: 'dream',
        backend: meaningful[0]?.metadata.searchMode || 'local_vector',
        matched: aiSearchResults.length,
        note: meaningful[0]?.metadata.fallbackReason,
      };
    }

    if (!aiSearchResults?.length) {
      const aiResults = await executeAiSearch(searchQuery, allScored.map(s => ({
        id: s.scoredJob.id,
        tier: s.scoredJob.tier,
        normalizedJob: s.normalizedJob
      })));
      aiSearchResults = aiResults.map((r: any) => r.id);
      searchMeta = {
        mode: searchMode,
        backend: aiResults[0]?.source || 'local',
        matched: aiSearchResults.length,
      };
    }
  }

  // Filter in memory for simplicity (in a real prod app with 100k jobs, do it in DB)
  let filtered = allScored;

  if (aiSearchResults) {
    filtered = filtered.filter(s => aiSearchResults!.includes(s.scoredJob.id));
    // Sort by AI results order
    filtered.sort((a, b) => aiSearchResults!.indexOf(a.scoredJob.id) - aiSearchResults!.indexOf(b.scoredJob.id));
  }

  if (tierFilter && tierFilter !== 'All') {
    filtered = filtered.filter(s => s.scoredJob.tier === tierFilter);
  }
  if (portalFilter && portalFilter !== 'All') {
    filtered = filtered.filter(s => s.normalizedJob?.portal === portalFilter);
  }

  const { profileId: ownerProfileId } = resolveContext();
  const tracked = db.select().from(applications).where(eq(applications.profileId, ownerProfileId)).all();
  const trackedByScoredJob = new Map(tracked.map(app => [app.scoredJobId, app]));
  const jobs = filtered.map((item) => ({
    ...item,
    application: trackedByScoredJob.get(item.scoredJob.id) || null,
  }));

  // Stats
  const totalScored = allScored.length;
  const tierCounts = {
    A: allScored.filter(s => s.scoredJob.tier === 'A').length,
    B: allScored.filter(s => s.scoredJob.tier === 'B').length,
    C: allScored.filter(s => s.scoredJob.tier === 'C').length,
    D: allScored.filter(s => s.scoredJob.tier === 'D').length,
  };

  const portalCounts = allScored.reduce((acc, curr) => {
    const p = curr.normalizedJob?.portal;
    if (p) acc[p] = (acc[p] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    jobs,
    stats: {
      total: totalScored,
      tierCounts,
      portalCounts
    },
    searchMeta,
  };
}

export async function generateBriefForJob(scoredJobId: number) {
  const db = getDb();
  
  // get details
  const jobRecord = db.select({
    scoredJob: scoredJobs,
    normalizedJob: normalizedJobs
  }).from(scoredJobs)
    .innerJoin(normalizedJobs, eq(scoredJobs.normalizedJobId, normalizedJobs.id))
    .where(eq(scoredJobs.id, scoredJobId)).get();

  if (!jobRecord) return { success: false, error: 'Not found' };

  const master = db.select().from(masterProfiles).where(eq(masterProfiles.id, jobRecord.scoredJob.masterProfileId)).get();
  const search = db.select().from(searchProfiles).where(eq(searchProfiles.id, jobRecord.scoredJob.searchProfileId)).get();

  const brief = await generateJobBrief(scoredJobId, jobRecord.normalizedJob, master, search);
  
  if (brief) {
    return { success: true, brief };
  }
  return { success: false, error: 'Failed to generate brief' };
}
