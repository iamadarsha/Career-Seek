import { waitForRedisWindow } from '@/lib/queue/redis-rate-limit';

export function domainFromPortal(portal: string) {
  const domains: Record<string, string> = {
    linkedin: 'linkedin.com',
    indeed: 'indeed.com',
    naukri: 'naukri.com',
    wellfound: 'wellfound.com',
    foundit: 'foundit.in',
    instahyre: 'instahyre.com',
    company_ats: 'company_ats',
    official: 'official',
    google_jobs: 'google.com',
  };
  return domains[portal] || portal;
}

export async function waitForScrapeDomainSlot(portal: string, limit = 4, windowMs = 60_000) {
  await waitForRedisWindow(`scrape:${domainFromPortal(portal)}`, limit, windowMs);
}

export function domainFromUrl(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return value;
  }
}

export async function waitForCompanyCareerDomainSlot(url: string) {
  await waitForRedisWindow(`scrape:company:${domainFromUrl(url)}`, 1, 2_000);
}
