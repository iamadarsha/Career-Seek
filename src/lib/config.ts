import fs from 'fs';
import path from 'path';
import { getAppSubDir } from './local-paths';
import type { AIProviderName } from './ai/types';

export const ONBOARDING_FLOW_VERSION = 2;

export interface StoredAIProviderSettings {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  enabled?: boolean;
}

export interface AppConfig {
  geminiApiKey?: string;
  aiProvider?: AIProviderName;
  aiModel?: string;
  aiBaseUrl?: string;
  aiProviders?: Partial<Record<AIProviderName, StoredAIProviderSettings>>;
  isConfigured: boolean;
  onboardingStep?: number;
  onboardingVersion?: number;
  onboardingStage?:
    | 'welcome'
    | 'api_key'
    | 'resume'
    | 'analysis'
    | 'clarification'
    | 'review'
    | 'preferences'
    | 'scan'
    | 'dashboard';
  resumeUploadId?: number;
  masterProfileId?: number;
  searchProfileId?: number;
  lastKeyValidationAt?: string;
  lastInitialScanAt?: string;
  dashboardUnlockedAt?: string;
}

export function getAppConfig(): AppConfig {
  const configDir = getAppSubDir('config');
  const configPath = path.join(configDir, 'settings.json');
  
  if (!fs.existsSync(configPath)) {
    return {
      isConfigured: false,
      onboardingStep: 0,
      onboardingStage: 'welcome',
      onboardingVersion: ONBOARDING_FLOW_VERSION,
    };
  }
  
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      geminiApiKey: parsed.geminiApiKey,
      aiProvider: parsed.aiProvider,
      aiModel: parsed.aiModel,
      aiBaseUrl: parsed.aiBaseUrl,
      aiProviders: parsed.aiProviders,
      isConfigured: !!parsed.isConfigured,
      onboardingStep: parsed.onboardingStep || 0,
      onboardingVersion: parsed.onboardingVersion,
      onboardingStage: parsed.onboardingStage || (parsed.isConfigured ? 'dashboard' : 'welcome'),
      resumeUploadId: parsed.resumeUploadId,
      masterProfileId: parsed.masterProfileId,
      searchProfileId: parsed.searchProfileId,
      lastKeyValidationAt: parsed.lastKeyValidationAt,
      lastInitialScanAt: parsed.lastInitialScanAt,
      dashboardUnlockedAt: parsed.dashboardUnlockedAt,
    };
  } catch (e) {
    return {
      isConfigured: false,
      onboardingStep: 0,
      onboardingStage: 'welcome',
      onboardingVersion: ONBOARDING_FLOW_VERSION,
    };
  }
}

export function saveAppConfig(updates: Partial<AppConfig>) {
  const configDir = getAppSubDir('config');
  const configPath = path.join(configDir, 'settings.json');
  
  const current = getAppConfig();
  const next = { ...current, ...updates };
  
  fs.writeFileSync(configPath, JSON.stringify(next, null, 2));
  return next;
}

export function getProviderSettings(
  config: AppConfig = getAppConfig(),
  provider?: AIProviderName,
): StoredAIProviderSettings | undefined {
  if (!provider) return undefined;
  return config.aiProviders?.[provider];
}

/**
 * FIX #2: getAIRuntimeEnv now reads .env.local live at call-time via readEnvKeys()
 * so keys written by saveSetupCredentials / syncProviderToEnvFile after startup
 * are immediately picked up without a server restart.
 *
 * Priority: settings.json values > .env.local live values > stale process.env
 */
export function getAIRuntimeEnv(config: AppConfig = getAppConfig()): Record<string, string | undefined> {
  const selectedProvider = config.aiProvider;
  const selectedProviderSettings = selectedProvider ? config.aiProviders?.[selectedProvider] : undefined;
  const geminiSettings = config.aiProviders?.gemini;
  const openAISettings = config.aiProviders?.openai;
  const anthropicSettings = config.aiProviders?.anthropic;
  const groqSettings = config.aiProviders?.groq;
  const deepSeekSettings = config.aiProviders?.deepseek;
  const compatibleSettings = config.aiProviders?.['openai-compatible'];
  const ollamaSettings = config.aiProviders?.ollama;

  // FIX #2: read .env.local live — bypasses the stale process.env frozen at startup
  let liveEnv: Record<string, string> = {};
  try {
    const { readEnvKeys } = require('./env-writer') as typeof import('./env-writer');
    liveEnv = readEnvKeys([
      'GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'GOOGLE_AI_API_KEY',
      'OPENAI_API_KEY', 'OPENAI_BASE_URL',
      'ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL',
      'GROQ_API_KEY', 'GROQ_BASE_URL',
      'DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL',
      'OPENAI_COMPATIBLE_API_KEY', 'OPENAI_COMPATIBLE_BASE_URL',
      'OLLAMA_API_KEY', 'OLLAMA_BASE_URL',
      'CAREER_SEEK_AI_PROVIDER', 'CAREER_SEEK_AI_MODEL',
      'SERPAPI_API_KEY', 'SERP_API_KEY',
      'QDRANT_URL', 'JOBS_QDRANT_URL', 'MEILI_HOST', 'MEILISEARCH_URL', 'REDIS_URL',
      'LINKEDIN_EMAIL', 'LINKEDIN_PASSWORD',
      'NAUKRI_EMAIL', 'NAUKRI_PASSWORD',
    ]);
  } catch {
    // non-fatal — fall through to process.env
  }

  return {
    ...process.env,
    ...liveEnv, // FIX #2: live .env.local overrides stale process.env
    CAREER_SEEK_AI_PROVIDER: selectedProvider || liveEnv.CAREER_SEEK_AI_PROVIDER || process.env.CAREER_SEEK_AI_PROVIDER,
    CAREER_SEEK_AI_MODEL: config.aiModel || selectedProviderSettings?.model || liveEnv.CAREER_SEEK_AI_MODEL || process.env.CAREER_SEEK_AI_MODEL,
    GEMINI_API_KEY: geminiSettings?.apiKey || config.geminiApiKey || liveEnv.GEMINI_API_KEY || process.env.GEMINI_API_KEY,
    GOOGLE_GENERATIVE_AI_API_KEY:
      geminiSettings?.apiKey || config.geminiApiKey || liveEnv.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    CAREER_SEEK_GEMINI_MODEL: geminiSettings?.model || process.env.CAREER_SEEK_GEMINI_MODEL,
    OPENAI_API_KEY: openAISettings?.apiKey || liveEnv.OPENAI_API_KEY || process.env.OPENAI_API_KEY,
    OPENAI_BASE_URL: openAISettings?.baseUrl || liveEnv.OPENAI_BASE_URL || process.env.OPENAI_BASE_URL,
    CAREER_SEEK_OPENAI_MODEL: openAISettings?.model || process.env.CAREER_SEEK_OPENAI_MODEL,
    ANTHROPIC_API_KEY: anthropicSettings?.apiKey || liveEnv.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_BASE_URL: anthropicSettings?.baseUrl || liveEnv.ANTHROPIC_BASE_URL || process.env.ANTHROPIC_BASE_URL,
    CAREER_SEEK_ANTHROPIC_MODEL: anthropicSettings?.model || process.env.CAREER_SEEK_ANTHROPIC_MODEL,
    GROQ_API_KEY: groqSettings?.apiKey || liveEnv.GROQ_API_KEY || process.env.GROQ_API_KEY,
    GROQ_BASE_URL: groqSettings?.baseUrl || liveEnv.GROQ_BASE_URL || process.env.GROQ_BASE_URL,
    CAREER_SEEK_GROQ_MODEL: groqSettings?.model || process.env.CAREER_SEEK_GROQ_MODEL,
    DEEPSEEK_API_KEY: deepSeekSettings?.apiKey || liveEnv.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY,
    DEEPSEEK_BASE_URL: deepSeekSettings?.baseUrl || liveEnv.DEEPSEEK_BASE_URL || process.env.DEEPSEEK_BASE_URL,
    CAREER_SEEK_DEEPSEEK_MODEL: deepSeekSettings?.model || process.env.CAREER_SEEK_DEEPSEEK_MODEL,
    OPENAI_COMPATIBLE_API_KEY: compatibleSettings?.apiKey || liveEnv.OPENAI_COMPATIBLE_API_KEY || process.env.OPENAI_COMPATIBLE_API_KEY,
    OPENAI_COMPATIBLE_BASE_URL: compatibleSettings?.baseUrl || liveEnv.OPENAI_COMPATIBLE_BASE_URL || process.env.OPENAI_COMPATIBLE_BASE_URL,
    CAREER_SEEK_OPENAI_COMPATIBLE_MODEL:
      compatibleSettings?.model || process.env.CAREER_SEEK_OPENAI_COMPATIBLE_MODEL,
    OLLAMA_API_KEY: ollamaSettings?.apiKey || liveEnv.OLLAMA_API_KEY || process.env.OLLAMA_API_KEY,
    OLLAMA_BASE_URL: ollamaSettings?.baseUrl || liveEnv.OLLAMA_BASE_URL || process.env.OLLAMA_BASE_URL,
    CAREER_SEEK_OLLAMA_MODEL: ollamaSettings?.model || process.env.CAREER_SEEK_OLLAMA_MODEL,
    // FIX #2: SerpAPI key also surfaced through live env so google-jobs provider sees it
    SERPAPI_API_KEY: liveEnv.SERPAPI_API_KEY || process.env.SERPAPI_API_KEY,
    SERP_API_KEY: liveEnv.SERP_API_KEY || process.env.SERP_API_KEY,
  };
}
