export type AIProviderName =
  | 'gemini'
  | 'openai'
  | 'anthropic'
  | 'groq'
  | 'deepseek'
  | 'openai-compatible'
  | 'ollama';

export type AIResponseFormat =
  | 'text'
  | 'json'
  | {
      type: 'text' | 'json';
      schema?: unknown;
      mimeType?: string;
    };

export interface AIProviderConfig {
  provider: AIProviderName;
  displayName?: string;
  apiKey?: string;
  apiKeyEnvVar?: string;
  defaultModel?: string;
  fallbackModels: string[];
  enabled: boolean;
  disabledReason?: string;
  baseUrl?: string;
  requiresApiKey?: boolean;
  providerKind?: 'cloud' | 'local' | 'compatible';
}

export interface AIGenerateRequest {
  provider?: AIProviderName;
  model?: string;
  systemPrompt?: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  onToken?: (token: string) => void | Promise<void>;
  responseFormat?: AIResponseFormat;
  metadata?: Record<string, unknown>;
}

export interface AIUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface AIResponseAttempt {
  provider: AIProviderName;
  model?: string;
  attempt: number;
  success: boolean;
  latencyMs: number;
  errorMessage?: string;
}

export interface AIResponse<TParsed = unknown> {
  id: string;
  provider: AIProviderName;
  model: string;
  text: string;
  parsed?: TParsed;
  responseFormat: 'text' | 'json';
  usage: AIUsage;
  finishReason?: string;
  latencyMs: number;
  attempts: AIResponseAttempt[];
  fallbackChain: Array<{
    provider: AIProviderName;
    model: string;
  }>;
  metadata?: Record<string, unknown>;
}

export interface AIUsageLedgerRecord {
  id: string;
  timestamp: string;
  provider?: AIProviderName;
  model?: string;
  responseFormat: 'text' | 'json';
  success: boolean;
  latencyMs: number;
  usage?: AIUsage;
  attempts: AIResponseAttempt[];
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export type AIUsageLedgerHook = (record: AIUsageLedgerRecord) => void | Promise<void>;

export interface AIManagerOptions {
  env?: Record<string, string | undefined>;
  usageLedger?: AIUsageLedgerHook;
}
