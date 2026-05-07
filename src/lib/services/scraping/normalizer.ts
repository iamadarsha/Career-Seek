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
      const text = raw.postedDateText.toLowerCase();
      if (text.includes('today') || text.includes('just now') || text.includes('hour') || text.includes('minute')) {
        normalized.postedDate = new Date();
      } else if (text.includes('yesterday')) {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        normalized.postedDate = d;
      } else if (text.includes('day')) {
        const match = text.match(/(\d+)/);
        if (match) {
          const d = new Date();
          d.setDate(d.getDate() - parseInt(match[1], 10));
          normalized.postedDate = d;
        }
      } else if (text.includes('week')) {
        const match = text.match(/(\d+)/);
        if (match) {
          const d = new Date();
          d.setDate(d.getDate() - parseInt(match[1], 10) * 7);
          normalized.postedDate = d;
        }
      } else if (text.includes('month')) {
        const match = text.match(/(\d+)/);
        if (match) {
          const d = new Date();
          d.setMonth(d.getMonth() - parseInt(match[1], 10));
          normalized.postedDate = d;
        }
      } else {
        const parsed = Date.parse(raw.postedDateText);
        if (!Number.isNaN(parsed)) normalized.postedDate = new Date(parsed);
      }
    } catch (e) {
      console.warn('Failed to parse date:', raw.postedDateText);
    }
  }

  // 2. Normalize Experience
  const inferredExperienceText = raw.experienceText || String(raw.snippet || '').match(/(?:experience|exp\.?)\s*[:\-]?\s*(\d+(?:\s*-\s*\d+)?\+?\s*(?:years?|yrs?))/i)?.[1];
  if (inferredExperienceText) {
    normalized.experienceText ||= inferredExperienceText;
    // E.g., "3-5 Yrs" or "5+ Years"
    const expMatch = inferredExperienceText.match(/(\d+)(?:\s*-\s*(\d+))?/);
    if (expMatch) {
      normalized.experienceMin = parseInt(expMatch[1], 10);
      if (expMatch[2]) {
        normalized.experienceMax = parseInt(expMatch[2], 10);
      }
    }
  }

  // 3. Normalize Salary
  const inferredSalaryText = raw.salaryText || String(raw.snippet || '').match(/(?:₹|rs\.?|inr)\s*[\d,.]+(?:\s*(?:-|to|–)\s*(?:₹|rs\.?|inr)?\s*[\d,.]+)?\s*(?:lpa|lakhs?|lacs?|crore|cr)?/i)?.[0];
  if (inferredSalaryText) {
    normalized.salaryText ||= inferredSalaryText;
    const lower = inferredSalaryText.toLowerCase();
    const compactLower = lower.replace(/,/g, '');
    const unitMultiplier = (value?: string) => {
      const unit = String(value || '').toLowerCase();
      if (/cr|crore/.test(unit)) return 10_000_000;
      if (/lpa|lac|lakh|lakhs/.test(unit)) return 100_000;
      if (/\bk\b/.test(unit)) return 1_000;
      return undefined;
    };
    const rangeMatch = compactLower.match(/(\d+(?:\.\d+)?)\s*(cr|crore|lpa|lac|lakh|lakhs|k)?\s*(?:-|to|–)\s*(\d+(?:\.\d+)?)\s*(cr|crore|lpa|lac|lakh|lakhs|k)?/);
    const multiplier =
      unitMultiplier(rangeMatch?.[2]) ||
      unitMultiplier(rangeMatch?.[4]) ||
      unitMultiplier(compactLower) ||
      1;

    if (rangeMatch && multiplier > 1) {
      normalized.salaryMin = Math.round(Number(rangeMatch[1]) * multiplier);
      normalized.salaryMax = Math.round(Number(rangeMatch[3]) * multiplier);
    } else {
      const salaryMatch = inferredSalaryText.match(/(\d+(?:,\d+)*(?:\.\d+)?)/g);
      if (salaryMatch && salaryMatch.length >= 1) {
        normalized.salaryMin = Math.round(Number(salaryMatch[0].replace(/,/g, '')) * multiplier);
        if (salaryMatch.length >= 2) {
          normalized.salaryMax = Math.round(Number(salaryMatch[1].replace(/,/g, '')) * multiplier);
        }
      }
    }

    if (inferredSalaryText.includes('₹') || lower.includes('inr')) {
      normalized.salaryCurrency = 'INR';
    } else if (inferredSalaryText.includes('$') || lower.includes('usd')) {
      normalized.salaryCurrency = 'USD';
    }
    if (!normalized.salaryCurrency && /lpa|lac|lakh|lakhs|₹|inr/.test(lower)) {
      normalized.salaryCurrency = 'INR';
    }
  }

  return normalized;
}
