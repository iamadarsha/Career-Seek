'use server';

import { saveAppConfig } from "@/lib/config";
import { validateApiKey, extractProfile } from "@/lib/services/gemini";
import { parseResumeFile } from "@/lib/services/resume-parser";
import { getAppSubDir } from "@/lib/local-paths";
import fs from "fs";
import path from "path";
import { MasterProfile } from "@/lib/schemas/profile";
import { getDb } from "@/db";
import { uploadedResumes, masterProfiles, searchProfiles } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { resolveContext } from "@/lib/platform/identity";

export async function checkApiKey(apiKey: string) {
  const isValid = await validateApiKey(apiKey);
  if (isValid) {
    saveAppConfig({ geminiApiKey: apiKey });
    return { success: true };
  }
  return { success: false, error: "Invalid API key" };
}

export async function saveStep(step: number) {
  saveAppConfig({ onboardingStep: step });
  return { success: true };
}

export async function finishOnboarding() {
  saveAppConfig({ isConfigured: true });
  return { success: true };
}

export async function uploadAndParseResume(formData: FormData) {
  const file = formData.get('resume') as File;
  if (!file) return { success: false, error: "No file provided" };

  try {
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    // Save locally
    const uploadsDir = getAppSubDir('uploads');
    const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const filePath = path.join(uploadsDir, safeName);
    fs.writeFileSync(filePath, buffer);

    // Parse text
    const extractedText = await parseResumeFile(filePath, file.type);

    // Save to DB
    const db = getDb();
    const { profileId } = resolveContext();
    const result = db.insert(uploadedResumes).values({
      profileId: profileId,
      filename: file.name,
      originalPath: filePath,
      mimeType: file.type,
      parsedText: extractedText,
      uploadedAt: new Date(),
    }).returning({ id: uploadedResumes.id }).get();

    return { success: true, id: result.id, text: extractedText };
  } catch (error: any) {
    console.error("Parse error:", error);
    return { success: false, error: error.message || "Failed to process resume" };
  }
}

export async function generateMasterProfile(apiKey: string, resumeText: string) {
  try {
    const profile = await extractProfile(resumeText, apiKey);
    
    // Save to DB
    const db = getDb();
    const { profileId } = resolveContext();
    const result = db.insert(masterProfiles).values({
      profileId: profileId,
      fullName: profile.fullName,
      headline: profile.headline,
      yearsOfExperience: profile.yearsOfExperience,
      targetSeniority: profile.targetSeniority,
      skillsExplicit: JSON.stringify(profile.skills.explicit),
      skillsInferred: JSON.stringify(profile.skills.inferred),
      tools: JSON.stringify(profile.tools),
      domains: JSON.stringify(profile.domains),
      experience: JSON.stringify(profile.experience),
      projects: JSON.stringify(profile.projects),
      achievements: JSON.stringify(profile.achievements),
      education: JSON.stringify(profile.education),
      certifications: JSON.stringify(profile.certifications),
      strengths: JSON.stringify(profile.strengths),
      gaps: JSON.stringify(profile.gaps),
      rawSummary: profile.rawSummary,
      updatedAt: new Date(),
    }).returning({ id: masterProfiles.id }).get();

    return { success: true, profile, id: result.id };
  } catch (error: any) {
    console.error("Extraction error:", error);
    return { success: false, error: error.message || "Failed to extract profile" };
  }
}

export async function updateMasterProfile(id: number, profile: MasterProfile) {
  const db = getDb();
  const { profileId } = resolveContext();
  
  db.update(masterProfiles).set({
    fullName: profile.fullName,
    headline: profile.headline,
    yearsOfExperience: profile.yearsOfExperience,
    targetSeniority: profile.targetSeniority,
    skillsExplicit: JSON.stringify(profile.skills.explicit),
    skillsInferred: JSON.stringify(profile.skills.inferred),
    tools: JSON.stringify(profile.tools),
    domains: JSON.stringify(profile.domains),
    experience: JSON.stringify(profile.experience),
    projects: JSON.stringify(profile.projects),
    achievements: JSON.stringify(profile.achievements),
    education: JSON.stringify(profile.education),
    certifications: JSON.stringify(profile.certifications),
    strengths: JSON.stringify(profile.strengths),
    gaps: JSON.stringify(profile.gaps),
    rawSummary: profile.rawSummary,
    updatedAt: new Date(),
  }).where(and(eq(masterProfiles.id, id), eq(masterProfiles.profileId, profileId))).run();

  return { success: true };
}

export async function saveSearchProfile(data: any) {
  const db = getDb();
  const { profileId } = resolveContext();
  
  db.insert(searchProfiles).values({
    profileId: profileId,
    title: data.title || "Main Search",
    locations: JSON.stringify(data.locations || []),
    workModel: data.workModel,
    expectedSalary: data.expectedSalary,
    experienceBand: data.experienceBand,
    companyTypes: JSON.stringify(data.companyTypes || []),
    preferredPortals: JSON.stringify(data.preferredPortals || []),
    mustHaveKeywords: JSON.stringify(data.mustHaveKeywords || []),
    avoidKeywords: JSON.stringify(data.avoidKeywords || []),
    noticePeriod: data.noticePeriod,
    relocationWillingness: data.relocationWillingness,
  }).run();
  
  return { success: true };
}
