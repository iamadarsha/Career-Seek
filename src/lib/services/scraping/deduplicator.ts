import { NormalizedJob } from './types';
import { normalizeCompanyName } from '@/lib/jobs/company-normalize';

export function generateJobSignature(job: NormalizedJob): string {
  const normalizeText = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');

  const titleStr = normalizeText(job.title);
  // Use company normalizer: strips legal suffixes so "Accenture Pvt. Ltd." and "Accenture" collide
  const companyStr = normalizeCompanyName(job.company) || normalizeText(job.company);
  // Coarsen location to city-level (first word) to avoid "Bangalore" vs "Bengaluru" mismatches
  const locationStr = normalizeText((job.location || '').split(/[,/]/)[0]);

  // Signature based on core properties
  return `${titleStr}|${companyStr}|${locationStr}`;
}

// Logic for finding duplicates from an array of existing jobs
export function findDuplicates(newJobs: NormalizedJob[], existingJobs: NormalizedJob[]): { unique: NormalizedJob[], duplicates: Array<{ newJob: NormalizedJob, existingId: number, matchType: string }> } {
  const unique: NormalizedJob[] = [];
  const duplicates: Array<{ newJob: NormalizedJob, existingId: number, matchType: string }> = [];

  const existingByUrl = new Map<string, number>();
  const existingById = new Map<string, number>();
  const existingBySignature = new Map<string, number>();

  for (const ej of existingJobs) {
    if (ej.id === undefined) continue; // safety
    existingByUrl.set(ej.url, ej.id as number);
    if (ej.externalId) {
      existingById.set(`${ej.portal}-${ej.externalId}`, ej.id as number);
    }
    existingBySignature.set(generateJobSignature(ej), ej.id as number);
  }

  for (const nj of newJobs) {
    let duplicateId: number | undefined;
    let matchType: string | undefined;

    // 1. Exact URL Match
    if (existingByUrl.has(nj.url)) {
      duplicateId = existingByUrl.get(nj.url);
      matchType = 'exact_url';
    } 
    // 2. External ID Match
    else if (nj.externalId && existingById.has(`${nj.portal}-${nj.externalId}`)) {
      duplicateId = existingById.get(`${nj.portal}-${nj.externalId}`);
      matchType = 'external_id';
    }
    // 3. Signature Match
    else {
      const sig = generateJobSignature(nj);
      if (existingBySignature.has(sig)) {
        duplicateId = existingBySignature.get(sig);
        matchType = 'signature';
      }
    }

    if (duplicateId && matchType) {
      duplicates.push({ newJob: nj, existingId: duplicateId, matchType });
    } else {
      unique.push(nj);
      // Temporarily add to signatures to avoid self-duplicates in this batch
      const tempId = -Math.random(); // Dummy ID for in-batch deduplication
      existingByUrl.set(nj.url, tempId);
      if (nj.externalId) existingById.set(`${nj.portal}-${nj.externalId}`, tempId);
      existingBySignature.set(generateJobSignature(nj), tempId);
    }
  }

  return { unique, duplicates: duplicates.filter(d => d.existingId > 0) }; // Only real duplicates
}
