import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  masterProfiles,
  scans,
  searchProfiles,
  uploadedResumes,
} from '@/db/schema';
import { getAppConfig, ONBOARDING_FLOW_VERSION, type AppConfig } from '@/lib/config';
import { resolveContext } from '@/lib/platform/identity';

export interface OnboardingGate {
  isComplete: boolean;
  version: number;
  requiredVersion: number;
  stage: AppConfig['onboardingStage'];
  missing: string[];
  nextStep:
    | 'ai_setup'
    | 'resume_upload'
    | 'resume_analysis'
    | 'job_preferences'
    | 'first_scan'
    | 'dashboard';
}

export function getOnboardingGate(): OnboardingGate {
  const db = getDb();
  const config = getAppConfig();
  const { profileId } = resolveContext();

  const latestResume = db
    .select({ id: uploadedResumes.id })
    .from(uploadedResumes)
    .where(eq(uploadedResumes.profileId, profileId))
    .orderBy(desc(uploadedResumes.uploadedAt))
    .get();

  const latestProfile = db
    .select({ id: masterProfiles.id })
    .from(masterProfiles)
    .where(eq(masterProfiles.profileId, profileId))
    .orderBy(desc(masterProfiles.updatedAt))
    .get();

  const activeSearch = db
    .select({ id: searchProfiles.id })
    .from(searchProfiles)
    .where(and(eq(searchProfiles.profileId, profileId), eq(searchProfiles.isActive, true)))
    .orderBy(desc(searchProfiles.id))
    .get();

  const latestScan = db
    .select({ id: scans.id })
    .from(scans)
    .where(eq(scans.profileId, profileId))
    .orderBy(desc(scans.startedAt))
    .get();

  const missing: string[] = [];
  if (config.onboardingVersion !== ONBOARDING_FLOW_VERSION) missing.push('current guided onboarding version');
  if (!latestResume && !config.resumeUploadId) missing.push('uploaded resume');
  if (!latestProfile && !config.masterProfileId) missing.push('analysed resume profile');
  if (!activeSearch && !config.searchProfileId) missing.push('job search preferences');
  if (!latestScan && !config.lastInitialScanAt) missing.push('first India-focused scan');

  const isComplete =
    missing.length === 0 &&
    config.isConfigured === true &&
    config.onboardingStage === 'dashboard';

  let nextStep: OnboardingGate['nextStep'] = 'dashboard';
  if (config.onboardingVersion !== ONBOARDING_FLOW_VERSION) {
    nextStep = 'ai_setup';
  } else if (!latestResume && !config.resumeUploadId) {
    nextStep = 'resume_upload';
  } else if (!latestProfile && !config.masterProfileId) {
    nextStep = 'resume_analysis';
  } else if (!activeSearch && !config.searchProfileId) {
    nextStep = 'job_preferences';
  } else if (!latestScan && !config.lastInitialScanAt) {
    nextStep = 'first_scan';
  }

  return {
    isComplete,
    version: config.onboardingVersion || 0,
    requiredVersion: ONBOARDING_FLOW_VERSION,
    stage: config.onboardingStage || 'welcome',
    missing,
    nextStep,
  };
}
