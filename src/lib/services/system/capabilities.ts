import fs from 'fs';
import path from 'path';
import { getAIRuntimeEnv, getAppConfig } from '@/lib/config';
import { discoverAIProviderConfigs, getDefaultProvider } from '@/lib/ai/providers';
import { getAppSubDir } from '@/lib/local-paths';

export interface CapabilityMatrix {
  schemaVersion: string;
  generatedAt?: string;
  source: 'doctor' | 'runtime_fallback';
  baseDir?: string;
  has_browser: boolean;
  has_ocr: boolean;
  has_gemini_key: boolean;
  has_ai_provider?: boolean;
  selected_ai_provider?: string;
  has_cloud_ai_key?: boolean;
  has_local_ollama?: boolean;
  safe_modes: {
    browser_scraping_disabled: boolean;
    ocr_manual_recovery_likely: boolean;
    ai_generation_limited: boolean;
    local_model_unavailable?: boolean;
  };
  tool_status?: Record<string, boolean>;
  warnings: string[];
}

function getProviderSnapshot() {
  const runtimeEnv = getAIRuntimeEnv(getAppConfig());
  const providers = discoverAIProviderConfigs(runtimeEnv);
  const hasGeminiKey = Boolean(runtimeEnv.GEMINI_API_KEY?.trim() || runtimeEnv.GOOGLE_GENERATIVE_AI_API_KEY?.trim());
  const hasCloudKey = providers.some((provider) => provider.enabled && provider.providerKind !== 'local');
  const hasOllama = providers.some((provider) => provider.provider === 'ollama' && provider.enabled);
  const selectedProvider = getDefaultProvider(runtimeEnv, providers);

  return {
    providers,
    hasGeminiKey,
    hasCloudKey,
    hasOllama,
    hasAIProvider: hasCloudKey || hasOllama,
    selectedProvider,
  };
}

function fallbackCapabilities(): CapabilityMatrix {
  const snapshot = getProviderSnapshot();
  return {
    schemaVersion: '1.0.0',
    source: 'runtime_fallback',
    has_browser: true,
    has_ocr: true,
    has_gemini_key: snapshot.hasGeminiKey,
    has_ai_provider: snapshot.hasAIProvider,
    selected_ai_provider: snapshot.selectedProvider,
    has_cloud_ai_key: snapshot.hasCloudKey,
    has_local_ollama: snapshot.hasOllama,
    safe_modes: {
      browser_scraping_disabled: false,
      ocr_manual_recovery_likely: false,
      ai_generation_limited: !snapshot.hasAIProvider,
      local_model_unavailable: !snapshot.hasOllama,
    },
    warnings: [
      'Capability file was not found. Run npm run doctor for verified browser/OCR safe modes.',
    ],
  };
}

function normalizeCapabilities(parsed: any): CapabilityMatrix {
  const snapshot = getProviderSnapshot();
  const hasGeminiKey = Boolean(parsed?.has_gemini_key) || snapshot.hasGeminiKey;
  const hasBrowser = typeof parsed?.has_browser === 'boolean' ? parsed.has_browser : true;
  const hasOcr = typeof parsed?.has_ocr === 'boolean' ? parsed.has_ocr : true;
  const hasAIProvider = Boolean(parsed?.has_ai_provider) || snapshot.hasAIProvider;
  const hasCloudAIKey = Boolean(parsed?.has_cloud_ai_key) || snapshot.hasCloudKey;
  const hasLocalOllama = Boolean(parsed?.has_local_ollama) || snapshot.hasOllama;
  return {
    schemaVersion: String(parsed?.schemaVersion || parsed?.schema_version || '1.0.0'),
    generatedAt: parsed?.generatedAt || parsed?.generated_at,
    source: 'doctor',
    baseDir: parsed?.baseDir || parsed?.base_dir,
    has_browser: hasBrowser,
    has_ocr: hasOcr,
    has_gemini_key: hasGeminiKey,
    has_ai_provider: hasAIProvider,
    selected_ai_provider: parsed?.selected_ai_provider || snapshot.selectedProvider,
    has_cloud_ai_key: hasCloudAIKey,
    has_local_ollama: hasLocalOllama,
    safe_modes: {
      browser_scraping_disabled: parsed?.safe_modes?.browser_scraping_disabled ?? !hasBrowser,
      ocr_manual_recovery_likely: parsed?.safe_modes?.ocr_manual_recovery_likely ?? !hasOcr,
      ai_generation_limited: parsed?.safe_modes?.ai_generation_limited ?? !hasAIProvider,
      local_model_unavailable: parsed?.safe_modes?.local_model_unavailable ?? !hasLocalOllama,
    },
    tool_status: parsed?.tool_status,
    warnings: Array.isArray(parsed?.warnings) ? parsed.warnings.map(String) : [],
  };
}

export function getSystemCapabilities(): CapabilityMatrix {
  const capabilityPath = path.join(getAppSubDir('config'), 'capabilities.json');
  if (!fs.existsSync(capabilityPath)) {
    return fallbackCapabilities();
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(capabilityPath, 'utf8'));
    return normalizeCapabilities(parsed);
  } catch {
    return {
      ...fallbackCapabilities(),
      warnings: [
        'Capability file could not be parsed. Run npm run doctor to regenerate it.',
      ],
    };
  }
}
