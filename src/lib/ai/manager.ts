import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText, streamText } from 'ai';
import { createFallback } from 'ai-fallback';
import { discoverAIProviderConfigs, getDefaultProvider, normalizeResponseFormat, redactProviderConfig } from './providers';
import { buildJsonReliabilityInstruction, isJsonReliabilityError, validateJsonAgainstSchema } from './json-resilience';
import { withRetry } from './retry';
import { createFileUsageLedger, noopUsageLedger, recordAIUsage } from './usage-ledger';
import type {
  AIGenerateRequest,
  AIManagerOptions,
  AIProviderConfig,
  AIProviderName,
  AIResponse,
  AIResponseAttempt,
  AIUsage,
  AIUsageLedgerHook,
} from './types';

interface ProviderResult {
  text: string;
  parsed?: unknown;
  usage: AIUsage;
  finishReason?: string;
  activeModel: string;
}

interface Candidate {
  provider: AIProviderName;
  /** Primary model ID — used for circuit-breaker keying and initial logging. */
  model: string;
  config: AIProviderConfig;
  /** Ready-to-use LanguageModelV3, wrapping a createFallback chain when > 1 model. */
  languageModel: any;
  /** Returns the model ID actually used after ai-fallback may have switched. */
  getActiveModelId: () => string;
}

interface CircuitState {
  provider: AIProviderName;
  consecutiveFailures: number;
  failureWindowStartedAt: number;
  openedUntil?: number;
  lastError?: string;
  lastFailureAt?: number;
  lastOpenedAt?: number;
}

const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_ATTEMPTS = 2;
const DEFAULT_CIRCUIT_FAILURES = 3;
const DEFAULT_CIRCUIT_WINDOW_MS = 120_000;
const DEFAULT_CIRCUIT_COOLDOWN_MS = 300_000;
/** ai-fallback: retry primary model after this cooldown (matches circuit cooldown). */
const MODEL_RESET_INTERVAL_MS = 300_000;

const defaultUsageLedger = createFileUsageLedger().record;

function boundedEnvInt(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(Math.trunc(parsed), max));
}

function createResponseId() {
  return `ai_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function safeErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error ?? 'Unknown AI error');
  return raw
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted-api-key]')
    .replace(/sk-[0-9A-Za-z_-]{20,}/g, '[redacted-api-key]')
    .replace(/([?&](?:key|api_key)=)[^&\s]+/gi, '$1[redacted]')
    .slice(0, 300);
}

function isRetriableError(error: unknown) {
  const message = safeErrorMessage(error).toLowerCase();
  return [
    '408', '409', '425', '429',
    '500', '502', '503', '504',
    'quota', 'rate limit', 'temporarily', 'timeout',
    'abort', 'fetch failed', 'network', 'econnreset',
    'etimedout', 'enotfound', 'overloaded', 'unavailable',
    'connection error',
  ].some((token) => message.includes(token));
}

function stripJsonFences(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function extractJsonCandidate(text: string) {
  const payload = stripJsonFences(text);
  const objectStart = payload.indexOf('{');
  const objectEnd = payload.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) {
    return payload.slice(objectStart, objectEnd + 1);
  }
  const arrayStart = payload.indexOf('[');
  const arrayEnd = payload.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    return payload.slice(arrayStart, arrayEnd + 1);
  }
  return payload;
}

function parseJsonResponse(text: string) {
  const candidate = extractJsonCandidate(text);
  const attempts = [
    candidate,
    candidate.replace(/,\s*([}\]])/g, '$1'),
    candidate.replace(/[""]/g, '"').replace(/['']/g, "'").replace(/,\s*([}\]])/g, '$1'),
    candidate
      .replace(/\bNone\b/g, 'null')
      .replace(/\bTrue\b/g, 'true')
      .replace(/\bFalse\b/g, 'false')
      .replace(/,\s*([}\]])/g, '$1'),
  ];
  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function normalizeBaseUrl(url: string | undefined) {
  return url?.replace(/\/+$/, '');
}

function normalizePrompt(request: AIGenerateRequest) {
  const responseFormat = normalizeResponseFormat(request.responseFormat);
  if (responseFormat.type !== 'json') return request.userPrompt;
  return `${request.userPrompt}\n\n${buildJsonReliabilityInstruction(responseFormat.schema)}`;
}

function normalizeUsage(usage: any): AIUsage {
  if (!usage) return {};
  const inputTokens = usage.inputTokens ?? usage.promptTokens ?? usage.prompt_tokens;
  const outputTokens = usage.outputTokens ?? usage.completionTokens ?? usage.completion_tokens;
  const totalTokens =
    usage.totalTokens ??
    usage.total_tokens ??
    (typeof inputTokens === 'number' && typeof outputTokens === 'number' ? inputTokens + outputTokens : undefined);
  return { inputTokens, outputTokens, totalTokens };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
    promise.catch(() => {});
  }
}

export class AIManager {
  private static instance: AIManager | undefined;
  private static circuitStates = new Map<AIProviderName, CircuitState>();

  private env: Record<string, string | undefined>;
  private providerConfigs: Map<AIProviderName, AIProviderConfig>;
  private usageLedger: AIUsageLedgerHook;

  private constructor(options: AIManagerOptions = {}) {
    this.env = options.env || process.env;
    this.providerConfigs = new Map(discoverAIProviderConfigs(this.env).map((config) => [config.provider, config]));
    this.usageLedger = options.usageLedger || defaultUsageLedger || noopUsageLedger;
  }

  static getInstance(options?: AIManagerOptions) {
    if (!AIManager.instance) {
      AIManager.instance = new AIManager(options);
    } else {
      if (options?.env) AIManager.instance.refreshProviderConfigs(options.env);
      if (options?.usageLedger) AIManager.instance.setUsageLedger(options.usageLedger);
    }
    return AIManager.instance;
  }

  refreshProviderConfigs(env: Record<string, string | undefined> = process.env) {
    this.env = env;
    this.providerConfigs = new Map(discoverAIProviderConfigs(env).map((config) => [config.provider, config]));
  }

  setUsageLedger(usageLedger: AIUsageLedgerHook) {
    this.usageLedger = usageLedger;
  }

  getProviderConfigs(options: { includeSecrets?: boolean } = {}) {
    const configs = Array.from(this.providerConfigs.values());
    return options.includeSecrets ? configs : configs.map(redactProviderConfig);
  }

  getCircuitBreakerSnapshot() {
    const now = Date.now();
    return Array.from(AIManager.circuitStates.values()).map((state) => ({
      provider: state.provider,
      status: state.openedUntil && state.openedUntil > now ? 'cooling_down' : 'closed',
      consecutiveFailures: state.consecutiveFailures,
      openedUntil: state.openedUntil ? new Date(state.openedUntil).toISOString() : null,
      secondsRemaining: state.openedUntil && state.openedUntil > now ? Math.ceil((state.openedUntil - now) / 1000) : 0,
      lastError: state.lastError,
      lastFailureAt: state.lastFailureAt ? new Date(state.lastFailureAt).toISOString() : null,
      lastOpenedAt: state.lastOpenedAt ? new Date(state.lastOpenedAt).toISOString() : null,
    }));
  }

  async generate<TParsed = unknown>(request: AIGenerateRequest): Promise<AIResponse<TParsed>> {
    const startedAt = Date.now();
    const id = createResponseId();
    const responseFormat = normalizeResponseFormat(request.responseFormat);
    const timeoutMs = boundedEnvInt(this.env.CAREER_SEEK_AI_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 5_000, 120_000);
    const configuredMaxAttempts = boundedEnvInt(this.env.CAREER_SEEK_AI_MAX_ATTEMPTS, DEFAULT_MAX_ATTEMPTS, 1, 4);
    const maxAttempts = responseFormat.type === 'json' ? Math.max(2, configuredMaxAttempts) : configuredMaxAttempts;

    // One candidate per provider — model-level fallback handled by ai-fallback inside each candidate.
    const allCandidates = this.buildCandidates(request);
    const candidates = allCandidates.filter((c) => !this.isCircuitOpen(c.provider));
    const attempts: AIResponseAttempt[] = [];
    const fallbackChain = allCandidates.map((c) => ({ provider: c.provider, model: c.model }));

    if (!request.userPrompt?.trim()) {
      throw new Error('AIManager.generate requires a non-empty userPrompt.');
    }
    if (allCandidates.length === 0) {
      throw new Error('No configured AI provider/model is available. Add a key, configure an endpoint, or enable Ollama.');
    }
    if (candidates.length === 0) {
      const cooling = this.getCircuitBreakerSnapshot()
        .filter((s) => s.status === 'cooling_down')
        .map((s) => `${s.provider} (${s.secondsRemaining}s)`)
        .join(', ');
      throw new Error(`AI providers are cooling down after repeated failures${cooling ? `: ${cooling}` : ''}. Try again shortly or switch provider in Settings.`);
    }

    let lastError: unknown;

    for (const candidate of candidates) {
      let retryAttempt = 0;
      const candidateStartedAt = Date.now();

      try {
        const result = await withRetry(
          async () => {
            const generated = await this.generateOnce(candidate, request, timeoutMs);
            if (responseFormat.type !== 'json') return generated;
            const parsed = parseJsonResponse(generated.text);
            return {
              ...generated,
              parsed: validateJsonAgainstSchema(responseFormat.schema, parsed),
            };
          },
          {
            maxAttempts,
            shouldRetry: async (_attempt, error) => isRetriableError(error) || isJsonReliabilityError(error),
            onRetry: async (attempt, error) => {
              retryAttempt = attempt;
              attempts.push({
                provider: candidate.provider,
                model: candidate.getActiveModelId(),
                attempt,
                success: false,
                latencyMs: Date.now() - candidateStartedAt,
                errorMessage: safeErrorMessage(error),
              });
            },
          },
        );

        // Read the actual model that ai-fallback settled on (may differ from primary).
        const activeModel = result.activeModel || candidate.getActiveModelId();

        const response: AIResponse<TParsed> = {
          id,
          provider: candidate.provider,
          model: activeModel,
          text: result.text,
          parsed: result.parsed as TParsed | undefined,
          responseFormat: responseFormat.type,
          usage: result.usage,
          finishReason: result.finishReason,
          latencyMs: Date.now() - startedAt,
          attempts: [
            ...attempts,
            {
              provider: candidate.provider,
              model: activeModel,
              attempt: retryAttempt + 1,
              success: true,
              latencyMs: Date.now() - candidateStartedAt,
            },
          ],
          fallbackChain,
          metadata: request.metadata,
        };

        await recordAIUsage(
          {
            id,
            timestamp: new Date().toISOString(),
            provider: response.provider,
            model: response.model,
            responseFormat: response.responseFormat,
            success: true,
            latencyMs: response.latencyMs,
            usage: response.usage,
            attempts: response.attempts,
            metadata: request.metadata,
          },
          this.usageLedger,
        );

        this.recordProviderSuccess(candidate.provider);
        return response;
      } catch (error) {
        lastError = error;
        this.recordProviderFailure(candidate.provider, error);
        attempts.push({
          provider: candidate.provider,
          model: candidate.getActiveModelId(),
          attempt: retryAttempt + 1,
          success: false,
          latencyMs: Date.now() - candidateStartedAt,
          errorMessage: safeErrorMessage(error),
        });
      }
    }

    await recordAIUsage(
      {
        id,
        timestamp: new Date().toISOString(),
        responseFormat: responseFormat.type,
        success: false,
        latencyMs: Date.now() - startedAt,
        attempts,
        errorMessage: safeErrorMessage(lastError),
        metadata: request.metadata,
      },
      this.usageLedger,
    );

    throw new Error(`AI generation failed after ${attempts.length} attempt(s): ${safeErrorMessage(lastError)}`);
  }

  // ─── Circuit breaker ──────────────────────────────────────────────────────

  private circuitSettings() {
    return {
      failureThreshold: boundedEnvInt(this.env.CAREER_SEEK_AI_CIRCUIT_FAILURES, DEFAULT_CIRCUIT_FAILURES, 1, 20),
      windowMs: boundedEnvInt(this.env.CAREER_SEEK_AI_CIRCUIT_WINDOW_MS, DEFAULT_CIRCUIT_WINDOW_MS, 10_000, 30 * 60_000),
      cooldownMs: boundedEnvInt(this.env.CAREER_SEEK_AI_CIRCUIT_COOLDOWN_MS, DEFAULT_CIRCUIT_COOLDOWN_MS, 30_000, 60 * 60_000),
    };
  }

  private isCircuitOpen(provider: AIProviderName) {
    const state = AIManager.circuitStates.get(provider);
    return Boolean(state?.openedUntil && state.openedUntil > Date.now());
  }

  private recordProviderSuccess(provider: AIProviderName) {
    AIManager.circuitStates.set(provider, {
      provider,
      consecutiveFailures: 0,
      failureWindowStartedAt: Date.now(),
    });
  }

  private recordProviderFailure(provider: AIProviderName, error: unknown) {
    const now = Date.now();
    const settings = this.circuitSettings();
    const current = AIManager.circuitStates.get(provider);
    const inWindow = current && now - current.failureWindowStartedAt <= settings.windowMs;
    const nextFailures = inWindow ? current.consecutiveFailures + 1 : 1;
    const opened = nextFailures >= settings.failureThreshold;

    AIManager.circuitStates.set(provider, {
      provider,
      consecutiveFailures: nextFailures,
      failureWindowStartedAt: inWindow && current ? current.failureWindowStartedAt : now,
      openedUntil: opened ? now + settings.cooldownMs : current?.openedUntil,
      lastError: safeErrorMessage(error),
      lastFailureAt: now,
      lastOpenedAt: opened ? now : current?.lastOpenedAt,
    });
  }

  // ─── Candidate building ───────────────────────────────────────────────────

  /**
   * Returns one Candidate per provider (not per model).
   * Each candidate's `languageModel` is a createFallback chain over all
   * 2025-model IDs for that provider, so ai-fallback handles within-provider
   * switching while the outer loop handles cross-provider switching.
   */
  private buildCandidates(request: AIGenerateRequest): Candidate[] {
    const requestedProvider = request.provider;
    const defaultProvider = getDefaultProvider(this.env, Array.from(this.providerConfigs.values()));
    const providerOrder = [
      requestedProvider,
      defaultProvider,
      ...Array.from(this.providerConfigs.values()).filter((c) => c.enabled).map((c) => c.provider),
    ].filter((p): p is AIProviderName => Boolean(p));

    const seenProviders = new Set<AIProviderName>();
    const candidates: Candidate[] = [];

    for (const provider of providerOrder) {
      if (seenProviders.has(provider)) continue;
      seenProviders.add(provider);

      const config = this.providerConfigs.get(provider);
      if (!config?.enabled) continue;

      // Determine the primary model for this candidate.
      const primaryModel =
        provider === requestedProvider || !requestedProvider
          ? (request.model || config.defaultModel || '')
          : (config.defaultModel || '');

      // Build the full ordered list: [primary, ...fallbacks], deduped.
      const seenModels = new Set<string>();
      const modelIds: string[] = [];
      for (const id of [primaryModel, ...config.fallbackModels]) {
        const trimmed = id?.trim();
        if (!trimmed || seenModels.has(trimmed)) continue;
        seenModels.add(trimmed);
        modelIds.push(trimmed);
      }
      if (!modelIds.length) continue;

      // Build single LanguageModelV3 objects for each model ID.
      const languageModels = modelIds.map((id) => this.buildSingleModel(provider, id, config));

      // Wrap in ai-fallback if there are multiple models; use directly if only one.
      let languageModel: any;
      let fallbackInstance: any = null;

      if (languageModels.length > 1) {
        fallbackInstance = createFallback({
          models: languageModels,
          modelResetInterval: MODEL_RESET_INTERVAL_MS,
          onError: (error: Error, modelId: string) => {
            console.warn(`[ai-fallback] ${provider}/${modelId} → switching: ${safeErrorMessage(error)}`);
          },
        });
        languageModel = fallbackInstance;
      } else {
        languageModel = languageModels[0];
      }

      candidates.push({
        provider,
        model: primaryModel,
        config,
        languageModel,
        // Read the live modelId from FallbackModel so we know which model actually ran.
        getActiveModelId: fallbackInstance
          ? () => fallbackInstance.modelId as string
          : () => primaryModel,
      });
    }

    return candidates;
  }

  // ─── Model construction ───────────────────────────────────────────────────

  /** Builds a single LanguageModelV3 for a given provider + model ID. */
  private buildSingleModel(provider: AIProviderName, modelId: string, config: AIProviderConfig): any {
    if (provider === 'gemini') {
      return createGoogleGenerativeAI({
        apiKey: config.apiKey,
        baseURL: normalizeBaseUrl(config.baseUrl),
      })(modelId);
    }
    if (provider === 'openai') {
      return createOpenAI({
        apiKey: config.apiKey,
        baseURL: normalizeBaseUrl(config.baseUrl),
      })(modelId);
    }
    if (provider === 'anthropic') {
      return createAnthropic({
        apiKey: config.apiKey,
        baseURL: normalizeBaseUrl(config.baseUrl),
      })(modelId);
    }
    // groq / deepseek / openai-compatible / ollama — all OpenAI-compatible.
    return createOpenAICompatible({
      name: provider,
      apiKey: config.apiKey,
      baseURL: normalizeBaseUrl(config.baseUrl || 'http://127.0.0.1:11434/v1') || 'http://127.0.0.1:11434/v1',
      includeUsage: true,
      supportsStructuredOutputs: true,
    })(modelId);
  }

  // ─── Generation ───────────────────────────────────────────────────────────

  private async generateOnce(
    candidate: Candidate,
    request: AIGenerateRequest,
    timeoutMs: number,
  ): Promise<ProviderResult> {
    if (candidate.config.requiresApiKey && !candidate.config.apiKey) {
      throw new Error(`Provider ${candidate.provider} is missing an API key.`);
    }

    const model = candidate.languageModel;
    const responseFormat = normalizeResponseFormat(request.responseFormat);
    const baseRequest = {
      model,
      system: request.systemPrompt,
      prompt: normalizePrompt(request),
      temperature: request.temperature,
      maxOutputTokens: request.maxTokens,
      responseFormat: responseFormat.type === 'json' ? { type: 'json' as const } : undefined,
    };

    if (request.stream) {
      const stream = await withTimeout(
        Promise.resolve(streamText(baseRequest)),
        timeoutMs,
        `timeout while streaming with ${candidate.provider}/${candidate.model}`,
      );

      let text = '';
      for await (const token of stream.textStream) {
        text += token;
        if (request.onToken) await request.onToken(token);
      }

      const [usage, finishReason] = await Promise.all([stream.totalUsage, stream.finishReason]);
      return {
        text,
        usage: normalizeUsage(usage),
        finishReason: typeof finishReason === 'string' ? finishReason : String(finishReason || 'stop'),
        activeModel: candidate.getActiveModelId(),
      };
    }

    const result = await withTimeout(
      generateText(baseRequest),
      timeoutMs,
      `timeout while generating with ${candidate.provider}/${candidate.model}`,
    );

    return {
      text: result.text,
      usage: normalizeUsage(result.totalUsage || result.usage),
      finishReason: result.rawFinishReason || String(result.finishReason || 'stop'),
      // Read after the call — FallbackModel.modelId reflects the model that actually responded.
      activeModel: candidate.getActiveModelId(),
    };
  }
}

export function getAIManager(options?: AIManagerOptions) {
  return AIManager.getInstance(options);
}

export const aiManager = AIManager.getInstance();
