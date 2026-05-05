'use server';

import { getCommandCenterData } from '@/lib/services/dashboard/command-center';
import { triggerScoring, generateBriefForJob } from '@/app/discover/actions';
import { resolveContext } from '@/lib/platform/identity';
import { getDb } from '@/db';
import { searchProfiles } from '@/db/schema';
import { and, desc, eq } from 'drizzle-orm';

import { ONBOARDING_FLOW_VERSION, saveAppConfig } from '@/lib/config';
import { ScanOrchestrator } from '@/lib/services/scraping/orchestrator';
import { scoreUnscoredJobs } from '@/lib/services/scoring/engine';
import { DEFAULT_DISCOVERY_SOURCE_IDS } from '@/lib/services/scraping/source-universe';

export async function fetchCommandCenter() {
  return await getCommandCenterData();
}

export async function updateConfig(apiKey: string) {
  return saveAppConfig({ 
    geminiApiKey: apiKey, 
    isConfigured: false,
    onboardingVersion: ONBOARDING_FLOW_VERSION,
    onboardingStage: 'resume',
    onboardingStep: 1 
  });
}

export async function runQuickScan() {
  const db = getDb();
  const { profileId } = resolveContext();
  const profile = db.select().from(searchProfiles)
    .where(and(eq(searchProfiles.profileId, profileId), eq(searchProfiles.isActive, true)))
    .orderBy(desc(searchProfiles.id))
    .get();
  if (!profile) return { success: false, error: "No active profile" };
  
  const portals = profile.preferredPortals ? JSON.parse(profile.preferredPortals) : DEFAULT_DISCOVERY_SOURCE_IDS;
  const scan = await new ScanOrchestrator().runScan(profile.id, portals);
  const scoredCount = scan.status === 'failed' ? 0 : await scoreUnscoredJobs(profileId);
  return {
    success: scan.status !== 'failed',
    message: scan.status === 'failed' ? 'Scan finished with no usable jobs.' : 'Scan and scoring complete.',
    scan,
    scoredCount,
  };
}

export async function refreshScoring() {
  return await triggerScoring();
}

export async function generateBrief(scoredJobId: number) {
  return await generateBriefForJob(scoredJobId);
}

export async function performAiSearch(query: string) {
  const { aiSearch } = await import('@/lib/services/dashboard/command-center');
  return await aiSearch(query);
}
