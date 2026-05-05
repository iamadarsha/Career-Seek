'use server';

import fs from 'fs';
import path from 'path';
import { and, desc, eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { getDb } from '@/db';
import {
  masterProfiles,
  searchProfiles,
  uploadedResumes,
  userProfiles,
} from '@/db/schema';
import { saveAppConfig, getAppConfig, ONBOARDING_FLOW_VERSION, getAIRuntimeEnv } from '@/lib/config';
import { getAIManager } from '@/lib/ai/manager';
import { AI_PROVIDER_CATALOG, isAIProviderName } from '@/lib/ai/providers';
import type { AIProviderName } from '@/lib/ai/types';
import { extractProfileWithGateway } from '@/lib/ai/structured-extractor';
import {
  refineProfileWithClarifications,
  type ResumeAnalysisResult,
} from '@/lib/services/gemini';
import {
  buildResumePipelineMetadata,
  runLocalResumePipeline,
} from '@/lib/services/resume';
import { getAppSubDir } from '@/lib/local-paths';
import { getSystemCapabilities } from '@/lib/services/system/capabilities';
import { MasterProfile } from '@/lib/schemas/profile';
import { resolveContext } from '@/lib/platform/identity';
import {
  normalizeRolePreferences,
  parseCommaSeparated,
} from '@/lib/services/search-preferences';
import { canonicalizeSkillLabels } from '@/lib/services/skills/taxonomy';
import { getOnboardingGate } from '@/lib/onboarding/gate';
import { DEFAULT_DISCOVERY_SOURCE_IDS } from '@/lib/services/scraping/source-universe';
import { logger } from '@/lib/logger';

function safeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function rowToProfile(row: typeof masterProfiles.$inferSelect | undefined | null): MasterProfile | null {
  if (!row) return null;
  return {
    fullName: row.fullName || '',
    headline: row.headline || '',
    yearsOfExperience: row.yearsOfExperience || 0,
    targetSeniority: row.targetSeniority || '',
    skills: {
      explicit: safeJson<string[]>(row.skillsExplicit, []),
      inferred: safeJson<string[]>(row.skillsInferred, []),
    },
    tools: safeJson<string[]>(row.tools, []),
    domains: safeJson<string[]>(row.domains, []),
    experience: safeJson<any[]>(row.experience, []),
    projects: safeJson<any[]>(row.projects, []),
    achievements: safeJson<string[]>(row.achievements, []),
    education: safeJson<any[]>(row.education, []),
    certifications: safeJson<string[]>(row.certifications, []),
    strengths: safeJson<string[]>(row.strengths, []),
    gaps: safeJson<string[]>(row.gaps, []),
    rawSummary: row.rawSummary || '',
    metadata: {},
  };
}

function persistProfileRow(profile: MasterProfile, profileId: number) {
  return {
    profileId,
    fullName: profile.fullName,
    headline: profile.headline,
    yearsOfExperience: profile.yearsOfExperience,
    targetSeniority: profile.targetSeniority,
    skillsExplicit: JSON.stringify(canonicalizeSkillLabels(profile.skills?.explicit || [])),
    skillsInferred: JSON.stringify(canonicalizeSkillLabels(profile.skills?.inferred || [])),
    tools: JSON.stringify(profile.tools || []),
    domains: JSON.stringify(profile.domains || []),
    experience: JSON.stringify(profile.experience || []),
    projects: JSON.stringify(profile.projects || []),
    achievements: JSON.stringify(profile.achievements || []),
    education: JSON.stringify(profile.education || []),
    certifications: JSON.stringify(profile.certifications || []),
    strengths: JSON.stringify(profile.strengths || []),
    gaps: JSON.stringify(profile.gaps || []),
    rawSummary: profile.rawSummary,
    updatedAt: new Date(),
  };
}

const MAX_RESUME_UPLOAD_BYTES = 12 * 1024 * 1024;

function hasValidResumeSignature(buffer: Buffer, ext: string, mimeType: string) {
  if (mimeType === 'application/pdf' || ext === '.pdf') {
    return buffer.subarray(0, 4).toString('utf8') === '%PDF';
  }
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === '.docx'
  ) {
    return buffer[0] === 0x50 && buffer[1] === 0x4b;
  }
  return false;
}

function deterministicallyApplyClarifications(profile: MasterProfile, answers: Record<string, string>): MasterProfile {
  const answerText = Object.values(answers).map((answer) => answer.trim()).filter(Boolean).join(' ');
  if (!answerText) return profile;

  const next: MasterProfile = {
    ...profile,
    rawSummary: [profile.rawSummary, `User clarification: ${answerText}`].filter(Boolean).join('\n'),
    strengths: Array.from(new Set([...(profile.strengths || []), 'Clarified by user before job matching'])),
    metadata: {
      ...(profile.metadata || {}),
      confidenceNotes: `${profile.metadata?.confidenceNotes || ''} Clarification answers were applied before review.`.trim(),
    },
  };

  const yearsMatch = answerText.match(/\b(\d{1,2})(?:\+)?\s*(?:years|yrs|yoe)\b/i);
  if (yearsMatch) next.yearsOfExperience = Number(yearsMatch[1]);

  return next;
}

function normalizeProviderInput(provider: string | undefined): AIProviderName {
  if (isAIProviderName(provider)) return provider;
  return 'gemini';
}

function hasConfiguredRefinementProvider(config: ReturnType<typeof getAppConfig>) {
  const runtimeEnv = getAIRuntimeEnv(config);
  const selectedSettings = config.aiProvider ? config.aiProviders?.[config.aiProvider] : undefined;

  return Boolean(
    runtimeEnv.GEMINI_API_KEY ||
    runtimeEnv.GOOGLE_GENERATIVE_AI_API_KEY ||
    runtimeEnv.OPENAI_API_KEY ||
    runtimeEnv.ANTHROPIC_API_KEY ||
    runtimeEnv.GROQ_API_KEY ||
    runtimeEnv.DEEPSEEK_API_KEY ||
    runtimeEnv.OPENAI_COMPATIBLE_API_KEY ||
    runtimeEnv.OPENAI_COMPATIBLE_BASE_URL ||
    selectedSettings?.apiKey ||
    selectedSettings?.baseUrl ||
    (config.aiProvider === 'ollama' && selectedSettings?.enabled)
  );
}

function classifyProviderValidationError(provider: AIProviderName, error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? 'Unknown provider error');
  const safeMessage = message.toLowerCase();
  const label = AI_PROVIDER_CATALOG[provider].label;

  if (safeMessage.includes('missing an api key')) {
    return {
      success: false,
      category: 'missing',
      message: `${label} needs an API key before it can be used.`,
      action: provider === 'ollama' ? 'Switch to another provider or start Ollama locally.' : 'Paste a valid key and try again.',
    };
  }

  if (safeMessage.includes('401') || safeMessage.includes('403') || safeMessage.includes('unauthorized') || safeMessage.includes('forbidden')) {
    return {
      success: false,
      category: 'invalid',
      message: `${label} rejected that credential or endpoint.`,
      action: 'Re-check the key, model, and base URL, then try again.',
    };
  }

  if (safeMessage.includes('429') || safeMessage.includes('quota') || safeMessage.includes('rate')) {
    return {
      success: false,
      category: 'quota',
      message: `${label} is currently rate-limited or out of quota.`,
      action: 'Wait a little, check your usage limits, or switch to another configured provider.',
    };
  }

  if (safeMessage.includes('timeout')) {
    return {
      success: false,
      category: 'timeout',
      message: `${label} did not respond in time.`,
      action: provider === 'ollama' ? 'Make sure the local model is running, then try again.' : 'Retry, or switch to another configured provider.',
    };
  }

  if (
    safeMessage.includes('fetch failed') ||
    safeMessage.includes('network') ||
    safeMessage.includes('econn') ||
    safeMessage.includes('enotfound') ||
    safeMessage.includes('connection')
  ) {
    return {
      success: false,
      category: 'connectivity',
      message: `This machine could not reach ${label}.`,
      action: provider === 'ollama'
        ? 'Start Ollama locally and confirm the base URL is correct.'
        : 'Check internet access, VPN/proxy settings, and the base URL.',
    };
  }

  return {
    success: false,
    category: 'unknown',
    message: `${label} validation failed unexpectedly.`,
    action: 'Retry once, then switch providers or re-check the endpoint details if it still fails.',
  };
}

function buildProviderPatch(
  provider: AIProviderName,
  input: { apiKey?: string; model?: string; baseUrl?: string },
) {
  const current = getAppConfig();
  const currentSettings = current.aiProviders?.[provider] || {};
  const nextProviderSettings = {
    ...currentSettings,
    enabled: true,
    apiKey: input.apiKey?.trim() || currentSettings.apiKey,
    model: input.model?.trim() || currentSettings.model || AI_PROVIDER_CATALOG[provider].defaultModel,
    baseUrl: input.baseUrl?.trim() || currentSettings.baseUrl || AI_PROVIDER_CATALOG[provider].baseUrl,
  };

  const aiProviders = {
    ...(current.aiProviders || {}),
    [provider]: nextProviderSettings,
  };

  return {
    current,
    next: {
      ...current,
      geminiApiKey:
        provider === 'gemini'
          ? nextProviderSettings.apiKey || current.geminiApiKey
          : current.geminiApiKey,
      aiProvider: provider,
      aiModel: nextProviderSettings.model,
      aiBaseUrl: nextProviderSettings.baseUrl,
      aiProviders,
    },
  };
}

export async function getOnboardingState() {
  const db = getDb();
  const { profileId } = resolveContext();
  const config = getAppConfig();

  const latestResume = db
    .select()
    .from(uploadedResumes)
    .where(eq(uploadedResumes.profileId, profileId))
    .orderBy(desc(uploadedResumes.uploadedAt))
    .get();

  const latestProfile = db
    .select()
    .from(masterProfiles)
    .where(eq(masterProfiles.profileId, profileId))
    .orderBy(desc(masterProfiles.updatedAt))
    .get();

  const activeSearch = db
    .select()
    .from(searchProfiles)
    .where(and(eq(searchProfiles.profileId, profileId), eq(searchProfiles.isActive, true)))
    .orderBy(desc(searchProfiles.id))
    .get();

  const metadata = safeJson<any>(latestResume?.parseMetadata, {});

  return {
    success: true,
    config,
    onboardingGate: getOnboardingGate(),
    resume: latestResume
      ? {
          id: latestResume.id,
          filename: latestResume.filename,
          uploadedAt: latestResume.uploadedAt,
          parseMetadata: metadata,
        }
      : null,
    profile: rowToProfile(latestProfile),
    profileId: latestProfile?.id || null,
    searchProfile: activeSearch
      ? {
          id: activeSearch.id,
          title: activeSearch.title,
          locations: safeJson<string[]>(activeSearch.locations, []),
          workModel: activeSearch.workModel,
          expectedSalary: activeSearch.expectedSalary,
          experienceBand: activeSearch.experienceBand,
          companyTypes: safeJson<string[]>(activeSearch.companyTypes, []),
          avoidKeywords: safeJson<string[]>(activeSearch.avoidKeywords, []),
          mustHaveKeywords: safeJson<string[]>(activeSearch.mustHaveKeywords, []),
        }
      : null,
    analysis: metadata.analysis as ResumeAnalysisResult | undefined,
    clarificationAnswers: metadata.clarificationAnswers || {},
  };
}

export async function getSystemCapabilitiesState() {
  return getSystemCapabilities();
}

export async function checkAIProviderConnection(input: {
  provider: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}) {
  const provider = normalizeProviderInput(input.provider);
  const providerMeta = AI_PROVIDER_CATALOG[provider];
  const patch = buildProviderPatch(provider, input);
  const effectiveProviderSettings = patch.next.aiProviders?.[provider];

  if (providerMeta.requiresApiKey && !effectiveProviderSettings?.apiKey?.trim()) {
    return {
      success: false,
      category: 'missing',
      message: `${providerMeta.label} needs an API key.`,
      action: 'Paste a key or choose Ollama / another local endpoint.',
    };
  }

  if (provider === 'openai-compatible' && !effectiveProviderSettings?.baseUrl?.trim()) {
    return {
      success: false,
      category: 'missing',
      message: 'An OpenAI-compatible endpoint needs a base URL.',
      action: 'Add a base URL such as LM Studio, Together, Fireworks, or another compatible server.',
    };
  }

  try {
    const manager = getAIManager({ env: getAIRuntimeEnv(patch.next) });
    const result = await manager.generate({
      provider,
      model: patch.next.aiModel,
      userPrompt: 'Reply with only READY.',
      temperature: 0,
      maxTokens: 256,
      metadata: {
        task: 'provider_validation',
      },
    });

    const ok = result.text.trim().length > 0 || ['stop', 'length', 'end_turn', 'max_tokens'].includes(result.finishReason || '');
    if (!ok) {
      return {
        success: false,
        category: 'unknown',
        message: `${providerMeta.label} responded, but the test output was empty.`,
        action: 'Try again or switch providers.',
      };
    }

    saveAppConfig({
      ...patch.next,
      isConfigured: false,
      onboardingVersion: ONBOARDING_FLOW_VERSION,
      onboardingStage: 'resume',
      onboardingStep: 1,
      lastKeyValidationAt: new Date().toISOString(),
    });

    return {
      success: true,
      category: 'valid',
      message: `${providerMeta.label} is ready.`,
      action: 'Continue to resume upload.',
      provider,
      model: patch.next.aiModel,
    };
  } catch (error) {
    return classifyProviderValidationError(provider, error);
  }
}

export async function checkApiKey(apiKey: string) {
  return checkAIProviderConnection({ provider: 'gemini', apiKey });
}

export async function updateGeminiKeyFromSettings(apiKey: string) {
  return updateAIProviderFromSettings({ provider: 'gemini', apiKey });
}

export async function updateAIProviderFromSettings(input: {
  provider: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}) {
  const provider = normalizeProviderInput(input.provider);
  const result = await checkAIProviderConnection({
    provider,
    apiKey: input.apiKey,
    model: input.model,
    baseUrl: input.baseUrl,
  });

  if (!result.success) {
    return result;
  }

  const patch = buildProviderPatch(provider, input);
  saveAppConfig({
    ...patch.next,
    isConfigured: patch.current.isConfigured,
    onboardingVersion: patch.current.onboardingVersion || ONBOARDING_FLOW_VERSION,
    onboardingStage: patch.current.onboardingStage,
    onboardingStep: patch.current.onboardingStep,
    lastKeyValidationAt: new Date().toISOString(),
  });

  return result;
}

export async function saveStep(step: number) {
  saveAppConfig({ onboardingStep: step });
  return { success: true };
}

export async function continueWithLimitedAISetup(provider?: string) {
  const current = getAppConfig();
  saveAppConfig({
    ...current,
    aiProvider: provider && isAIProviderName(provider) ? provider : current.aiProvider,
    isConfigured: false,
    onboardingVersion: ONBOARDING_FLOW_VERSION,
    onboardingStage: 'resume',
    onboardingStep: 1,
  });
  return { success: true };
}

export async function finishOnboarding() {
  saveAppConfig({
    isConfigured: true,
    onboardingVersion: ONBOARDING_FLOW_VERSION,
    onboardingStage: 'dashboard',
    onboardingStep: 7,
    dashboardUnlockedAt: new Date().toISOString(),
  });
  return { success: true };
}

export async function uploadAndParseResume(formData: FormData) {
  const file = formData.get('resume') as File;
  if (!file) return { success: false, error: 'No file provided' };

  if (file.size <= 0) {
    return { success: false, error: 'The uploaded resume is empty.' };
  }

  if (file.size > MAX_RESUME_UPLOAD_BYTES) {
    return {
      success: false,
      error: 'Resume file is too large. Please upload a PDF/DOCX under 12 MB.',
    };
  }

  const ext = path.extname(file.name || '').toLowerCase();
  const supported =
    ext === '.pdf' ||
    ext === '.docx' ||
    file.type === 'application/pdf' ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  if (!supported) {
    return {
      success: false,
      error: 'Please upload a PDF or DOCX resume. Images and plain text files are not supported yet.',
    };
  }

  try {
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    if (!hasValidResumeSignature(buffer, ext, file.type)) {
      return {
        success: false,
        error: 'The file extension does not match a valid PDF/DOCX resume. Please export a fresh file and upload again.',
      };
    }

    const uploadsDir = getAppSubDir('uploads');
    const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const filePath = path.join(uploadsDir, safeName);
    fs.writeFileSync(filePath, buffer);

    let pipelineRun;
    try {
      pipelineRun = await runLocalResumePipeline({
        resumeId: safeName,
        filename: file.name,
        filePath,
        mimeType: file.type,
      });
    } catch (error) {
      fs.rmSync(filePath, { force: true });
      throw error;
    }
    const pipelineMetadata = buildResumePipelineMetadata(pipelineRun);
    const parserMetadata = (pipelineRun.parsed.metadata.original || pipelineRun.parsed.metadata) as any;
    const metadata = {
      parser: parserMetadata,
      pipeline: pipelineMetadata,
      clarification: pipelineMetadata.clarification,
      profileBuilder: pipelineMetadata.profileBuilder,
      analysis: null,
      clarificationAnswers: {},
    };

    const db = getDb();
    const { profileId } = resolveContext();
    const result = db.insert(uploadedResumes).values({
      profileId,
      filename: file.name,
      originalPath: filePath,
      mimeType: file.type || ext.replace('.', ''),
      parsedText: pipelineRun.parsed.text,
      parseMetadata: JSON.stringify(metadata),
      uploadedAt: new Date(),
    }).returning({ id: uploadedResumes.id }).get();

    saveAppConfig({
      resumeUploadId: result.id,
      onboardingStage: 'analysis',
      onboardingStep: 2,
    });

    return { success: true, id: result.id, text: pipelineRun.parsed.text, metadata: parserMetadata };
  } catch (error: any) {
    logger.error({ err: error }, 'Resume parse error');
    return { success: false, error: error.message || 'Failed to process resume' };
  }
}

export async function saveManualResumeText(resumeId: number, text: string) {
  const db = getDb();
  const { profileId } = resolveContext();
  const cleanText = text.trim();

  if (cleanText.length < 500) {
    return {
      success: false,
      error: 'Please paste more resume text. We need at least about 500 characters to build a trustworthy profile.',
    };
  }

  const resume = db.select().from(uploadedResumes).where(
    and(eq(uploadedResumes.id, resumeId), eq(uploadedResumes.profileId, profileId))
  ).get();

  if (!resume) return { success: false, error: 'Resume upload was not found.' };

  const metadata = safeJson<any>(resume.parseMetadata, {});
  db.update(uploadedResumes).set({
    parsedText: cleanText,
    parseMetadata: JSON.stringify({
      ...metadata,
      parser: {
        ...(metadata.parser || {}),
        confidence: Math.max(70, metadata.parser?.confidence || 0),
        needsManualRecovery: false,
        manualTextProvided: true,
        manualTextProvidedAt: new Date().toISOString(),
        warnings: [
          ...(metadata.parser?.warnings || []),
          'User provided manual resume text after weak extraction.',
        ],
      },
    }),
  }).where(and(eq(uploadedResumes.id, resumeId), eq(uploadedResumes.profileId, profileId))).run();

  saveAppConfig({
    resumeUploadId: resumeId,
    onboardingStage: 'analysis',
    onboardingStep: 2,
  });

  return { success: true, text: cleanText };
}

export async function generateMasterProfile(apiKey?: string, resumeText?: string, resumeId?: number) {
  try {
    const db = getDb();
    const { profileId } = resolveContext();
    const config = getAppConfig();

    let text = resumeText;
    let targetResumeId = resumeId || config.resumeUploadId;

    if (!text && targetResumeId) {
      const resume = db.select().from(uploadedResumes).where(
        and(eq(uploadedResumes.id, targetResumeId), eq(uploadedResumes.profileId, profileId))
      ).get();
      text = resume?.parsedText || '';
    }

    if (!text?.trim()) {
      return {
        success: false,
        error: 'No extracted resume text was found. Please upload the resume again.',
      };
    }

    if (targetResumeId) {
      const resume = db.select().from(uploadedResumes).where(
        and(eq(uploadedResumes.id, targetResumeId), eq(uploadedResumes.profileId, profileId))
      ).get();
      const metadata = safeJson<any>(resume?.parseMetadata, {});
      if (metadata.parser?.needsManualRecovery) {
        return {
          success: false,
          error: 'Resume extraction is too weak to trust. Please paste resume text or upload a clearer PDF/DOCX before AI analysis.',
        };
      }
    }

    const runtimeEnv = getAIRuntimeEnv({
      ...config,
      geminiApiKey: apiKey?.trim() || config.geminiApiKey,
      aiProviders: apiKey?.trim() && config.aiProvider === 'gemini'
        ? {
            ...(config.aiProviders || {}),
            gemini: {
              ...(config.aiProviders?.gemini || {}),
              apiKey: apiKey.trim(),
              model: config.aiProviders?.gemini?.model || config.aiModel,
              baseUrl: config.aiProviders?.gemini?.baseUrl,
              enabled: true,
            },
          }
        : config.aiProviders,
    });
    const pipelineRun = await runLocalResumePipeline({
      resumeId: targetResumeId || 'onboarding-resume',
      text,
    });
    const extraction = await extractProfileWithGateway(
      pipelineRun.parsed.text,
      runtimeEnv,
      { pipeline: pipelineRun },
    );
    const result = db.insert(masterProfiles).values(
      persistProfileRow(extraction.profile, profileId)
    ).returning({ id: masterProfiles.id }).get();

    if (targetResumeId) {
      const resume = db.select().from(uploadedResumes).where(eq(uploadedResumes.id, targetResumeId)).get();
      const existingMetadata = safeJson<any>(resume?.parseMetadata, {});
      const pipelineMetadata = buildResumePipelineMetadata(pipelineRun, {
        analysis: extraction.analysis,
        extractionMetadata: extraction.extractionMetadata,
      });
      db.update(uploadedResumes).set({
        parseMetadata: JSON.stringify({
          ...existingMetadata,
          pipeline: pipelineMetadata,
          clarification: pipelineMetadata.clarification,
          profileBuilder: pipelineMetadata.profileBuilder,
          analysis: extraction.analysis,
        }),
      }).where(and(eq(uploadedResumes.id, targetResumeId), eq(uploadedResumes.profileId, profileId))).run();
    }

    saveAppConfig({
      masterProfileId: result.id,
      onboardingStage: extraction.analysis.needsClarification ? 'clarification' : 'review',
      onboardingStep: extraction.analysis.needsClarification ? 3 : 4,
    });

    return {
      success: true,
      profile: extraction.profile,
      analysis: extraction.analysis,
      id: result.id,
    };
  } catch (error: any) {
    logger.error({ err: error }, 'Resume extraction error');
    return { success: false, error: error.message || 'Failed to extract profile' };
  }
}

export async function saveClarificationAnswers(resumeId: number, answers: Record<string, string>) {
  const db = getDb();
  const { profileId } = resolveContext();
  const resume = db.select().from(uploadedResumes).where(
    and(eq(uploadedResumes.id, resumeId), eq(uploadedResumes.profileId, profileId))
  ).get();

  if (!resume) return { success: false, error: 'Resume not found' };

  const metadata = safeJson<any>(resume.parseMetadata, {});

  const latestProfile = db
    .select()
    .from(masterProfiles)
    .where(eq(masterProfiles.profileId, profileId))
    .orderBy(desc(masterProfiles.updatedAt))
    .get();

  let refinedProfileId: number | null = latestProfile?.id || null;
  let refinementStatus = 'not_attempted';
  if (latestProfile) {
    const currentProfile = rowToProfile(latestProfile);
    if (currentProfile) {
      const config = getAppConfig();
      let refined = deterministicallyApplyClarifications(currentProfile, answers);
      refinementStatus = 'deterministic';
      if (hasConfiguredRefinementProvider(config)) {
        try {
          refined = await refineProfileWithClarifications({
            resumeText: resume.parsedText || '',
            currentProfile,
            answers,
            questions: metadata.analysis?.clarificationQuestions || [],
            apiKey: config.geminiApiKey,
          });
          refinementStatus = `provider:${config.aiProvider || 'configured'}`;
        } catch (error) {
          console.warn('AI clarification refinement failed; applied deterministic profile patch.', error);
        }
      }

      db.update(masterProfiles)
        .set(persistProfileRow(refined, profileId))
        .where(and(eq(masterProfiles.id, latestProfile.id), eq(masterProfiles.profileId, profileId)))
        .run();
    }
  }

  db.update(uploadedResumes).set({
    parseMetadata: JSON.stringify({
      ...metadata,
      clarificationAnswers: answers,
      clarificationAnsweredAt: new Date().toISOString(),
      clarificationAppliedToProfileId: refinedProfileId,
      clarificationRefinementStatus: refinementStatus,
    }),
  }).where(and(eq(uploadedResumes.id, resumeId), eq(uploadedResumes.profileId, profileId))).run();

  saveAppConfig({ onboardingStage: 'review', onboardingStep: 4 });
  return { success: true };
}

export async function updateMasterProfile(id: number, profile: MasterProfile) {
  const db = getDb();
  const { profileId } = resolveContext();

  db.update(masterProfiles).set(
    persistProfileRow(profile, profileId)
  ).where(and(eq(masterProfiles.id, id), eq(masterProfiles.profileId, profileId))).run();

  saveAppConfig({ masterProfileId: id, onboardingStage: 'preferences', onboardingStep: 5 });
  return { success: true };
}

export async function saveSearchProfile(data: any) {
  const db = getDb();
  const { profileId } = resolveContext();
  const normalizedRoles = normalizeRolePreferences({
    selectedRoles: data.selectedRoles,
    customRoles: data.customRoles,
    title: data.title,
  });
  const locations = parseCommaSeparated(data.locations || data.preferredLocations);
  const excludedCities = parseCommaSeparated(data.excludedCities);
  const excludedCompanies = parseCommaSeparated(data.excludedCompanies);
  const excludedTitles = parseCommaSeparated(data.excludedTitles);
  const excludedIndustries = parseCommaSeparated(data.excludedIndustries);
  const targetCompanies = parseCommaSeparated(data.targetCompanies);
  const avoidKeywords = [
    ...parseCommaSeparated(data.avoidKeywords),
    ...excludedCities,
    ...excludedCompanies,
    ...excludedTitles,
    ...excludedIndustries,
  ];
  const mustHaveKeywords = [
    ...parseCommaSeparated(data.mustHaveKeywords),
    ...normalizedRoles.keywordHints.slice(0, 10),
  ];

  db.update(searchProfiles)
    .set({ isActive: false })
    .where(eq(searchProfiles.profileId, profileId))
    .run();

  const result = db.insert(searchProfiles).values({
    profileId,
    title: normalizedRoles.title,
    locations: JSON.stringify(locations),
    workModel: data.workModel || data.workArrangement || 'hybrid',
    expectedSalary: data.expectedSalary || data.targetSalary || '',
    experienceBand: data.experienceBand || data.experienceLevel || '',
    companyTypes: JSON.stringify([
      ...(data.companyTypes || []),
      ...targetCompanies.map((company) => `target_company:${company}`),
    ]),
    preferredPortals: JSON.stringify(data.preferredPortals || (
      process.env.JOBHUNT_ENABLE_VALIDATION_SOURCE === '1'
        ? ['validation_seed', 'validation_fail']
        : DEFAULT_DISCOVERY_SOURCE_IDS
    )),
    mustHaveKeywords: JSON.stringify(mustHaveKeywords),
    avoidKeywords: JSON.stringify(avoidKeywords),
    noticePeriod: data.noticePeriod || '',
    relocationWillingness: Boolean(data.relocationWillingness),
    isActive: true,
  }).returning({ id: searchProfiles.id }).get();

  saveAppConfig({ searchProfileId: result.id, onboardingStage: 'scan', onboardingStep: 6 });
  return {
    success: true,
    id: result.id,
    normalizedRoles,
    expansionHints: data.expansionHints || [],
  };
}

export async function startInitialScan() {
  const db = getDb();
  const { userId, profileId } = resolveContext();
  const profile = db
    .select()
    .from(searchProfiles)
    .where(and(eq(searchProfiles.profileId, profileId), eq(searchProfiles.isActive, true)))
    .orderBy(desc(searchProfiles.id))
    .get();

  if (!profile) {
    return { success: false, error: 'Search preferences are missing. Please complete preferences first.' };
  }

  const { withMandatoryCompanySources } = await import('@/lib/services/scraping/source-universe');
  const preferredPortals = safeJson<string[]>(profile.preferredPortals, []);
  const selectedPortals = preferredPortals.length
    ? withMandatoryCompanySources(preferredPortals)
    : withMandatoryCompanySources(DEFAULT_DISCOVERY_SOURCE_IDS);

  const { enqueueScrapeJob } = await import('@/lib/queue/enqueue');
  const job = await enqueueScrapeJob({
    searchProfileId: profile.id,
    selectedPortals,
    bypassCache: true,
    userId,
    profileId,
  }, { userId, profileId, priority: 10, maxAttempts: 4 });

  saveAppConfig({
    isConfigured: true,
    onboardingVersion: ONBOARDING_FLOW_VERSION,
    onboardingStage: 'dashboard',
    onboardingStep: 7,
    searchProfileId: profile.id,
    lastInitialScanAt: new Date().toISOString(),
    dashboardUnlockedAt: new Date().toISOString(),
  });

  return { success: true, searchProfileId: profile.id, selectedPortals, queued: true, jobId: job.id, scoredCount: 0 };
}

// ─── Profile management ─────────────────────────────────────────────────────────

export async function getProfiles() {
  try {
    const db = getDb();
    const ctx = resolveContext();
    const profiles = db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, ctx.userId))
      .all();
    return { success: true, profiles, activeProfileId: ctx.profileId };
  } catch (e: any) {
    return { success: false, error: e.message, profiles: [], activeProfileId: null };
  }
}

export async function createProfile(name: string) {
  try {
    const db = getDb();
    const ctx = resolveContext();
    const trimmedName = name.trim() || 'New Profile';
    const now = new Date();
    const profile = db
      .insert(userProfiles)
      .values({ userId: ctx.userId, name: trimmedName, isDefault: false, createdAt: now, updatedAt: now })
      .returning()
      .get();
    return { success: true, profile };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function switchProfile(profileId: number) {
  try {
    const db = getDb();
    const ctx = resolveContext();
    const profile = db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.id, profileId))
      .get();
    if (!profile || profile.userId !== ctx.userId) {
      return { success: false, error: 'Profile not found' };
    }
    const cookieStore = await cookies();
    cookieStore.set('profileId', String(profileId), {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
    });
    return { success: true, profileId };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function deleteProfile(profileId: number) {
  try {
    const db = getDb();
    const ctx = resolveContext();
    const profile = db.select().from(userProfiles).where(eq(userProfiles.id, profileId)).get();
    if (!profile || profile.userId !== ctx.userId) {
      return { success: false, error: 'Profile not found' };
    }
    if (profile.isDefault) {
      return { success: false, error: 'Cannot delete the default profile' };
    }
    db.delete(userProfiles).where(eq(userProfiles.id, profileId)).run();
    // If we just deleted the active profile, clear the cookie so it falls back to default
    const cookieStore = await cookies();
    if (ctx.profileId === profileId) {
      cookieStore.delete('profileId');
    }
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
