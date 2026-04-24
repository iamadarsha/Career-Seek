import { NormalizedJob, RawScrapedJob } from './types';


export function normalizeJob(raw: RawScrapedJob, scanId: number, searchProfileId: number, ownerProfileId: number): NormalizedJob {
  const normalized: NormalizedJob = {
    ...raw,
    scanId,
    searchProfileId,
    profileId: ownerProfileId,
    scrapedAt: new Date(),
  };

  // 1. Normalize Date
  if (raw.postedDateText) {
    try {
      // Very basic normalization, should be expanded based on portal specifics
      // E.g., "2 days ago", "1 week ago", "Just now"
      const text = raw.postedDateText.toLowerCase();
      const now = new Date();
      if (text.includes('day')) {
        const match = text.match(/(\d+)/);
        if (match) {
          now.setDate(now.getDate() - parseInt(match[1], 10));
          normalized.postedDate = now;
        }
      } else if (text.includes('hour') || text.includes('just now')) {
        normalized.postedDate = now;
      } else if (text.includes('week')) {
        const match = text.match(/(\d+)/);
        if (match) {
          now.setDate(now.getDate() - parseInt(match[1], 10) * 7);
          normalized.postedDate = now;
        }
      }
    } catch (e) {
      console.warn('Failed to parse date:', raw.postedDateText);
    }
  }

  // 2. Normalize Experience
  if (raw.experienceText) {
    // E.g., "3-5 Yrs" or "5+ Years"
    const expMatch = raw.experienceText.match(/(\d+)(?:\s*-\s*(\d+))?/);
    if (expMatch) {
      normalized.experienceMin = parseInt(expMatch[1], 10);
      if (expMatch[2]) {
        normalized.experienceMax = parseInt(expMatch[2], 10);
      }
    }
  }

  // 3. Normalize Salary
  if (raw.salaryText) {
    // E.g., "₹ 20,00,000 - 30,00,000 P.A."
    const salaryMatch = raw.salaryText.match(/(\d+(?:,\d+)*)/g);
    if (salaryMatch && salaryMatch.length >= 1) {
      normalized.salaryMin = parseInt(salaryMatch[0].replace(/,/g, ''), 10);
      if (salaryMatch.length >= 2) {
        normalized.salaryMax = parseInt(salaryMatch[1].replace(/,/g, ''), 10);
      }
      if (raw.salaryText.includes('₹') || raw.salaryText.toLowerCase().includes('inr')) {
        normalized.salaryCurrency = 'INR';
      } else if (raw.salaryText.includes('$') || raw.salaryText.toLowerCase().includes('usd')) {
        normalized.salaryCurrency = 'USD';
      }
    }
  }

  return normalized;
}
