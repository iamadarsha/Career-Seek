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

  // Track within-batch seen keys separately so in-batch duplicates are never
  // stored with a fake negative ID that would later escape the > 0 filter.
  const batchUrls = new Set<string>();
  const batchIds = new Set<string>();
  const batchSignatures = new Set<string>();

  for (const nj of newJobs) {
    let duplicateId: number | undefined;
    let matchType: string | undefined;

    const sig = generateJobSignature(nj);
    const portalExternalKey = nj.externalId ? `${nj.portal}-${nj.externalId}` : '';

    // 1. Exact URL Match — check persisted jobs first, then in-batch
    if (existingByUrl.has(nj.url)) {
      duplicateId = existingByUrl.get(nj.url);
      matchType = 'exact_url';
    } else if (batchUrls.has(nj.url)) {
      // in-batch URL duplicate — skip silently (don't add to duplicates table)
      continue;
    }
    // 2. External ID Match
    else if (portalExternalKey && existingById.has(portalExternalKey)) {
      duplicateId = existingById.get(portalExternalKey);
      matchType = 'external_id';
    } else if (portalExternalKey && batchIds.has(portalExternalKey)) {
      continue;
    }
    // 3. Signature Match
    else if (existingBySignature.has(sig)) {
      duplicateId = existingBySignature.get(sig);
      matchType = 'signature';
    } else if (batchSignatures.has(sig)) {
      continue;
    }

    if (duplicateId !== undefined && matchType) {
      duplicates.push({ newJob: nj, existingId: duplicateId, matchType });
    } else {
      unique.push(nj);
      // Register in batch sets so subsequent jobs in this batch are caught
      batchUrls.add(nj.url);
      if (portalExternalKey) batchIds.add(portalExternalKey);
      batchSignatures.add(sig);
    }
  }

  return { unique, duplicates: duplicates.filter(d => d.existingId > 0) };
}
