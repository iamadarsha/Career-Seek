import type { AIProviderConfig, AIProviderName, AIResponseFormat } from './types';

type EnvLike = Record<string, string | undefined>;

export interface AIModelOption {
  id: string;
  label: string;
  note?: string;
}

export const AI_PROVIDER_CATALOG: Record<
  AIProviderName,
  {
    label: string;
    kind: 'cloud' | 'local' | 'compatible';
    requiresApiKey: boolean;
    defaultModel: string;
    models?: AIModelOption[];
    docsUrl?: string;
    baseUrl?: string;
    baseUrlPlaceholder?: string;
    helpText: string;
  }
> = {
  gemini: {
    label: 'Google Gemini',
    kind: 'cloud',
    requiresApiKey: true,
    defaultModel: 'gemini-2.5-flash',
    docsUrl: 'https://aistudio.google.com/app/apikey',
    helpText: 'Fast resume reading and strong structured extraction.',
    models: [
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', note: 'Recommended · best value' },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', note: 'Most capable' },
      { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', note: 'Fastest · lowest cost' },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', note: 'Stable' },
      { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite', note: 'Stable · cheapest' },
    ],
  },
  openai: {
    label: 'OpenAI',
    kind: 'cloud',
    requiresApiKey: true,
    defaultModel: 'gpt-4.1-mini',
    docsUrl: 'https://platform.openai.com/api-keys',
    baseUrl: 'https://api.openai.com/v1',
    baseUrlPlaceholder: 'https://api.openai.com/v1',
    helpText: 'Balanced default for analysis, drafting, and chat.',
    models: [
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini', note: 'Recommended · fast & affordable' },
      { id: 'gpt-4.1', label: 'GPT-4.1', note: 'Most capable' },
      { id: 'gpt-4.1-nano', label: 'GPT-4.1 Nano', note: 'Fastest · lowest cost' },
      { id: 'o4-mini', label: 'o4-mini', note: 'Reasoning · efficient' },
      { id: 'o3', label: 'o3', note: 'Reasoning · most powerful' },
      { id: 'gpt-4o', label: 'GPT-4o', note: 'Multimodal · stable' },
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini', note: 'Stable · budget' },
    ],
  },
  anthropic: {
    label: 'Anthropic Claude',
    kind: 'cloud',
    requiresApiKey: true,
    defaultModel: 'claude-sonnet-4-6',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    baseUrl: 'https://api.anthropic.com/v1',
    baseUrlPlaceholder: 'https://api.anthropic.com/v1',
    helpText: 'Strong long-form reasoning for cover letters and coaching.',
    models: [
      { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', note: 'Recommended · balanced' },
      { id: 'claude-opus-4-7', label: 'Claude Opus 4.7', note: 'Most capable' },
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', note: 'Fastest · lowest cost' },
      { id: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet', note: 'Feb 2025' },
    ],
  },
  groq: {
    label: 'Groq',
    kind: 'compatible',
    requiresApiKey: true,
    defaultModel: 'meta-llama/llama-4-scout-17b-16e-instruct',
    docsUrl: 'https://console.groq.com/keys',
    baseUrl: 'https://api.groq.com/openai/v1',
    baseUrlPlaceholder: 'https://api.groq.com/openai/v1',
    helpText: 'Very fast inference on open-source models.',
    models: [
      { id: 'meta-llama/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout', note: 'Recommended · 2025' },
      { id: 'meta-llama/llama-4-maverick-17b-128e-instruct', label: 'Llama 4 Maverick', note: 'More capable · 2025' },
      { id: 'deepseek-r1-distill-llama-70b', label: 'DeepSeek R1 (Llama 70B)', note: 'Reasoning · 2025' },
      { id: 'qwen-qwq-32b', label: 'Qwen QwQ 32B', note: 'Reasoning · 2025' },
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', note: 'Versatile' },
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B', note: 'Fastest' },
    ],
  },
  deepseek: {
    label: 'DeepSeek',
    kind: 'compatible',
    requiresApiKey: true,
    defaultModel: 'deepseek-chat',
    docsUrl: 'https://platform.deepseek.com/api_keys',
    baseUrl: 'https://api.deepseek.com/v1',
    baseUrlPlaceholder: 'https://api.deepseek.com/v1',
    helpText: 'Cost-efficient reasoning and drafting through an OpenAI-style API.',
    models: [
      { id: 'deepseek-chat', label: 'DeepSeek V3', note: 'Recommended · latest chat' },
      { id: 'deepseek-reasoner', label: 'DeepSeek R1', note: 'Reasoning · slow but deep' },
    ],
  },
  'openai-compatible': {
    label: 'OpenAI-compatible',
    kind: 'compatible',
    requiresApiKey: false,
    defaultModel: 'gpt-4o-mini',
    baseUrlPlaceholder: 'http://localhost:1234/v1 or your provider URL',
    helpText: 'Use LM Studio, Together, Fireworks, OpenRouter-style proxies, or a custom endpoint.',
  },
  ollama: {
    label: 'Ollama (local)',
    kind: 'local',
    requiresApiKey: false,
    defaultModel: 'llama3.2:3b-instruct-q4_K_M',
    docsUrl: 'https://ollama.com/download',
    baseUrl: 'http://127.0.0.1:11434/v1',
    baseUrlPlaceholder: 'http://127.0.0.1:11434/v1',
    helpText: 'Runs entirely on your own machine with no cloud key required.',
  },
};

const PROVIDERS = Object.keys(AI_PROVIDER_CATALOG) as AIProviderName[];

function readEnv(env: EnvLike, keys: string[]) {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) return { key, value };
  }
  return { key: undefined, value: undefined };
}

function csv(value: string | undefined) {
  return (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeBaseUrl(value: string | undefined, fallback?: string) {
  const resolved = (value || fallback || '').trim();
  if (!resolved) return undefined;
  return resolved.replace(/\/+$/, '');
}

function configForProvider(input: {
  provider: AIProviderName;
  apiKey?: string;
  apiKeyEnvVar?: string;
  defaultModel?: string;
  fallbackModels?: string[];
  baseUrl?: string;
  enabled?: boolean;
  disabledReason?: string;
}): AIProviderConfig {
  const metadata = AI_PROVIDER_CATALOG[input.provider];
  const enabled =
    typeof input.enabled === 'boolean'
      ? input.enabled
      : metadata.requiresApiKey
        ? Boolean(input.apiKey)
        : Boolean(input.baseUrl || input.defaultModel);

  return {
    provider: input.provider,
    displayName: metadata.label,
    apiKey: input.apiKey,
    apiKeyEnvVar: input.apiKeyEnvVar,
    defaultModel: input.defaultModel || metadata.defaultModel,
    fallbackModels: input.fallbackModels || [],
    enabled,
    disabledReason:
      input.disabledReason || (enabled ? undefined : metadata.requiresApiKey ? 'missing_api_key' : 'disabled'),
    baseUrl: normalizeBaseUrl(input.baseUrl, metadata.baseUrl),
    requiresApiKey: metadata.requiresApiKey,
    providerKind: metadata.kind,
  };
}

export function isAIProviderName(value: unknown): value is AIProviderName {
  return typeof value === 'string' && PROVIDERS.includes(value as AIProviderName);
}

export function normalizeResponseFormat(format: AIResponseFormat | undefined): {
  type: 'text' | 'json';
  mimeType?: string;
  schema?: unknown;
} {
  if (!format) return { type: 'text' };
  if (format === 'json') return { type: 'json', mimeType: 'application/json' };
  if (format === 'text') return { type: 'text' };

  return {
    type: format.type,
    mimeType: format.mimeType || (format.type === 'json' ? 'application/json' : undefined),
    schema: format.schema,
  };
}

export function discoverAIProviderConfigs(env: EnvLike = process.env): AIProviderConfig[] {
  const geminiKey = readEnv(env, ['GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'GOOGLE_AI_API_KEY']);
  const openAIKey = readEnv(env, ['OPENAI_API_KEY']);
  const anthropicKey = readEnv(env, ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY']);
  const groqKey = readEnv(env, ['GROQ_API_KEY']);
  const deepSeekKey = readEnv(env, ['DEEPSEEK_API_KEY']);
  const compatibleKey = readEnv(env, ['OPENAI_COMPATIBLE_API_KEY']);
  const ollamaKey = readEnv(env, ['OLLAMA_API_KEY']);

  return [
    configForProvider({
      provider: 'gemini',
      apiKey: geminiKey.value,
      apiKeyEnvVar: geminiKey.key,
      defaultModel: env.CAREER_SEEK_GEMINI_MODEL || env.GEMINI_MODEL || env.CAREER_SEEK_AI_MODEL || AI_PROVIDER_CATALOG.gemini.defaultModel,
      fallbackModels: csv(env.CAREER_SEEK_GEMINI_FALLBACK_MODELS || env.GEMINI_FALLBACK_MODELS || 'gemini-2.5-flash-lite'),
    }),
    configForProvider({
      provider: 'openai',
      apiKey: openAIKey.value,
      apiKeyEnvVar: openAIKey.key,
      defaultModel: env.CAREER_SEEK_OPENAI_MODEL || env.OPENAI_MODEL || AI_PROVIDER_CATALOG.openai.defaultModel,
      fallbackModels: csv(env.CAREER_SEEK_OPENAI_FALLBACK_MODELS || env.OPENAI_FALLBACK_MODELS || 'gpt-4o,gpt-4o-mini'),
      baseUrl: env.OPENAI_BASE_URL,
    }),
    configForProvider({
      provider: 'anthropic',
      apiKey: anthropicKey.value,
      apiKeyEnvVar: anthropicKey.key,
      defaultModel: env.CAREER_SEEK_ANTHROPIC_MODEL || env.ANTHROPIC_MODEL || AI_PROVIDER_CATALOG.anthropic.defaultModel,
      fallbackModels: csv(env.CAREER_SEEK_ANTHROPIC_FALLBACK_MODELS || env.ANTHROPIC_FALLBACK_MODELS || 'claude-haiku-4-5-20251001'),
      baseUrl: env.ANTHROPIC_BASE_URL,
    }),
    configForProvider({
      provider: 'groq',
      apiKey: groqKey.value,
      apiKeyEnvVar: groqKey.key,
      defaultModel: env.CAREER_SEEK_GROQ_MODEL || env.GROQ_MODEL || AI_PROVIDER_CATALOG.groq.defaultModel,
      fallbackModels: csv(env.CAREER_SEEK_GROQ_FALLBACK_MODELS || env.GROQ_FALLBACK_MODELS || 'mixtral-8x7b-32768,gemma2-9b-it'),
      baseUrl: env.GROQ_BASE_URL,
    }),
    configForProvider({
      provider: 'deepseek',
      apiKey: deepSeekKey.value,
      apiKeyEnvVar: deepSeekKey.key,
      defaultModel: env.CAREER_SEEK_DEEPSEEK_MODEL || env.DEEPSEEK_MODEL || AI_PROVIDER_CATALOG.deepseek.defaultModel,
      fallbackModels: csv(env.CAREER_SEEK_DEEPSEEK_FALLBACK_MODELS || env.DEEPSEEK_FALLBACK_MODELS || 'deepseek-reasoner'),
      baseUrl: env.DEEPSEEK_BASE_URL,
    }),
    configForProvider({
      provider: 'openai-compatible',
      apiKey: compatibleKey.value,
      apiKeyEnvVar: compatibleKey.key,
      defaultModel:
        env.CAREER_SEEK_OPENAI_COMPATIBLE_MODEL ||
        env.OPENAI_COMPATIBLE_MODEL ||
        env.CAREER_SEEK_AI_MODEL ||
        AI_PROVIDER_CATALOG['openai-compatible'].defaultModel,
      fallbackModels: csv(env.CAREER_SEEK_OPENAI_COMPATIBLE_FALLBACK_MODELS || env.OPENAI_COMPATIBLE_FALLBACK_MODELS),
      baseUrl: env.OPENAI_COMPATIBLE_BASE_URL,
      enabled: Boolean(env.OPENAI_COMPATIBLE_BASE_URL?.trim()),
      disabledReason: env.OPENAI_COMPATIBLE_BASE_URL?.trim() ? undefined : 'missing_base_url',
    }),
    configForProvider({
      provider: 'ollama',
      apiKey: ollamaKey.value,
      apiKeyEnvVar: ollamaKey.key,
      defaultModel: env.CAREER_SEEK_OLLAMA_MODEL || env.OLLAMA_MODEL || AI_PROVIDER_CATALOG.ollama.defaultModel,
      fallbackModels: csv(env.CAREER_SEEK_OLLAMA_FALLBACK_MODELS || env.OLLAMA_FALLBACK_MODELS || 'mistral:latest,phi3:latest'),
      baseUrl: env.OLLAMA_BASE_URL,
      enabled: env.CAREER_SEEK_ENABLE_OLLAMA !== '0',
      disabledReason: env.CAREER_SEEK_ENABLE_OLLAMA === '0' ? 'disabled' : undefined,
    }),
  ];
}

export function getDefaultProvider(env: EnvLike, configs: AIProviderConfig[]): AIProviderName | undefined {
  const preferred = env.CAREER_SEEK_AI_PROVIDER?.trim().toLowerCase();
  if (isAIProviderName(preferred)) return preferred;

  const firstConfiguredCloud = configs.find(
    (config) => config.enabled && config.providerKind !== 'local',
  )?.provider;
  if (firstConfiguredCloud) return firstConfiguredCloud;

  return configs.find((config) => config.enabled)?.provider;
}

export function redactProviderConfig(config: AIProviderConfig): AIProviderConfig {
  return {
    ...config,
    apiKey: config.apiKey ? '[redacted]' : undefined,
  };
}
