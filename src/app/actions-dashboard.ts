'use server';

import { getCommandCenterData } from '@/lib/services/dashboard/command-center';
import { startJobScan, triggerScoring, generateBriefForJob } from '@/app/discover/actions';
import { resolveContext } from '@/lib/platform/identity';
import { getDb } from '@/db';
import { searchProfiles } from '@/db/schema';
import { eq } from 'drizzle-orm';

import { getAppConfig, saveAppConfig } from '@/lib/config';

export async function fetchCommandCenter() {
  return await getCommandCenterData();
}

export async function updateConfig(apiKey: string) {
  return saveAppConfig({ 
    geminiApiKey: apiKey, 
    isConfigured: true,
    onboardingStep: 1 
  });
}

export async function runQuickScan() {
  const db = getDb();
  const profile = db.select().from(searchProfiles).where(eq(searchProfiles.isActive, true)).get();
  if (!profile) return { success: false, error: "No active profile" };
  
  return await startJobScan(profile.id, ['linkedin', 'naukri', 'wellfound', 'foundit', 'indeed', 'instahyre']);
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
