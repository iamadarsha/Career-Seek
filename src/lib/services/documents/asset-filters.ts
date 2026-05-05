import type { documentAssets, masterProfiles } from '@/db/schema';

type DocumentAsset = typeof documentAssets.$inferSelect;
type MasterProfile = Pick<typeof masterProfiles.$inferSelect, 'id' | 'fullName' | 'updatedAt'>;
type JobSummary = {
  portal?: string | null;
  company?: string | null;
  title?: string | null;
};

const PROFILE_BOUND_TYPES = new Set(['resume', 'resume_pdf', 'ats_report']);

function normalizedName(value: string | null | undefined) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function isValidationJob(job: Partial<JobSummary> | null | undefined) {
  if (!job) return false;
  return (
    job.portal === 'validation_seed' ||
    /^validation\s+/i.test(job.company || '') ||
    /^validation\s+/i.test(job.title || '')
  );
}

export function shouldHideValidationJob(job: Partial<JobSummary> | null | undefined) {
  return isValidationJob(job) && process.env.JOBHUNT_ENABLE_VALIDATION_SOURCE !== '1';
}

export function assetBelongsToCurrentMasterProfile(asset: DocumentAsset, currentProfile: MasterProfile | null | undefined) {
  if (!currentProfile) return true;

  if (PROFILE_BOUND_TYPES.has(asset.type)) {
    try {
      const parsed = asset.content ? JSON.parse(asset.content) : null;
      const assetMasterProfileId = parsed?._meta?.masterProfileId;
      if (assetMasterProfileId && Number(assetMasterProfileId) !== currentProfile.id) return false;

      const assetFullName = normalizedName(parsed?.fullName);
      const currentFullName = normalizedName(currentProfile.fullName);
      if (assetFullName && currentFullName && assetFullName !== currentFullName) return false;
    } catch {
      // Legacy non-JSON assets are handled by the timestamp guard below.
    }
  }

  if (currentProfile.updatedAt && asset.createdAt && asset.createdAt < currentProfile.updatedAt) {
    return false;
  }

  return true;
}

export function shouldShowDocumentAsset(
  asset: DocumentAsset,
  currentProfile: MasterProfile | null | undefined,
  job?: Partial<JobSummary> | null,
) {
  if (shouldHideValidationJob(job)) return false;
  return assetBelongsToCurrentMasterProfile(asset, currentProfile);
}
