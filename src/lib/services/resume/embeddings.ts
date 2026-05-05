import crypto from 'crypto';
import type {
  ResumeChunk,
  ResumeEmbeddedChunk,
  ResumeEmbedding,
  ResumeEmbeddingProvider,
} from './types';

export const DEFAULT_LOCAL_RESUME_EMBEDDING_DIMENSIONS = 384;
export const DEFAULT_XENOVA_RESUME_EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';

export interface LocalKeywordEmbeddingOptions {
  dimensions?: number;
  modelId?: string;
}

export interface XenovaEmbeddingOptions {
  modelId?: string;
  dimensions?: number;
  allowRemoteModels?: boolean;
}

function normalizeToken(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .trim();
}

function tokenize(text: string) {
  return normalizeToken(text)
    .split(/\s+/)
    .filter((token) => token.length > 1 && token.length < 48);
}

function hashIndex(token: string, dimensions: number) {
  const digest = crypto.createHash('sha256').update(token).digest();
  return digest.readUInt32BE(0) % dimensions;
}

function hashSign(token: string) {
  const digest = crypto.createHash('sha256').update(`sign:${token}`).digest();
  return digest[0] % 2 === 0 ? 1 : -1;
}

function l2Normalize(vector: number[]) {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) return vector;
  return vector.map((value) => Number((value / magnitude).toFixed(8)));
}

function embedText(text: string, dimensions: number) {
  const vector = new Array<number>(dimensions).fill(0);
  const tokens = tokenize(text);

  for (const token of tokens) {
    const index = hashIndex(token, dimensions);
    vector[index] += hashSign(token);
  }

  return l2Normalize(vector);
}

export function createLocalKeywordEmbeddingProvider(
  options: LocalKeywordEmbeddingOptions = {},
): ResumeEmbeddingProvider {
  const dimensions = options.dimensions || DEFAULT_LOCAL_RESUME_EMBEDDING_DIMENSIONS;
  const model = options.modelId || `local-keyword-hash-${dimensions}`;

  return {
    id: model,
    mode: 'local_keyword_hash',
    dimensions,
    requiresApiKey: false,
    async embed(texts: string[]): Promise<ResumeEmbedding[]> {
      return texts.map((text, index) => ({
        chunkId: String(index),
        vector: embedText(text, dimensions),
        dimensions,
        model,
        mode: 'local_keyword_hash',
      }));
    },
  };
}

function tensorToVectors(tensor: any, expectedCount: number, expectedDimensions: number) {
  const data = Array.from((tensor?.data || []) as ArrayLike<number>, Number);
  const dims = Array.isArray(tensor?.dims) ? tensor.dims.map(Number) : [];
  const dimensions = dims[dims.length - 1] || expectedDimensions;
  const rowCount = expectedCount || Math.max(1, Math.floor(data.length / Math.max(1, dimensions)));

  if (!data.length || dimensions <= 0 || data.length < rowCount * dimensions) {
    throw new Error('Xenova embedding output was empty or had an unexpected shape.');
  }

  return Array.from({ length: rowCount }, (_, index) =>
    data.slice(index * dimensions, index * dimensions + dimensions).map((value) => Number(value.toFixed(8))),
  );
}

export function createXenovaEmbeddingProvider(
  options: XenovaEmbeddingOptions = {},
): ResumeEmbeddingProvider {
  const modelId = options.modelId || process.env.RESUME_EMBEDDING_MODEL || DEFAULT_XENOVA_RESUME_EMBEDDING_MODEL;
  const dimensions = options.dimensions || Number(process.env.RESUME_EMBEDDING_DIMENSIONS || '') || DEFAULT_LOCAL_RESUME_EMBEDDING_DIMENSIONS;
  const allowRemoteModels = options.allowRemoteModels ?? process.env.CAREER_SEEK_ALLOW_MODEL_DOWNLOADS === '1';
  const keywordFallback = createLocalKeywordEmbeddingProvider({ dimensions });
  let extractorPromise: Promise<any> | null = null;
  let fallbackReason: string | undefined;

  async function getExtractor() {
    if (!extractorPromise) {
      extractorPromise = import('@xenova/transformers').then(async (transformers: any) => {
        transformers.env.allowRemoteModels = allowRemoteModels;
        return transformers.pipeline('feature-extraction', modelId);
      });
    }
    return extractorPromise;
  }

  return {
    id: `xenova:${modelId}`,
    mode: 'local_transformers',
    dimensions,
    requiresApiKey: false,
    get fallbackReason() {
      return fallbackReason;
    },
    async embed(texts: string[]): Promise<ResumeEmbedding[]> {
      if (!texts.length) return [];

      try {
        const extractor = await getExtractor();
        const tensor = await extractor(texts, { pooling: 'mean', normalize: true });
        const vectors = tensorToVectors(tensor, texts.length, dimensions);
        return vectors.map((vector, index) => ({
          chunkId: String(index),
          vector,
          dimensions: vector.length,
          model: modelId,
          mode: 'local_transformers',
        }));
      } catch (error) {
        fallbackReason = error instanceof Error ? error.message : String(error ?? 'Xenova embedding model failed to load.');
        const fallbackEmbeddings = await keywordFallback.embed(texts);
        return fallbackEmbeddings.map((embedding) => ({
          ...embedding,
          model: `${keywordFallback.id} (fallback for ${modelId})`,
          mode: 'local_keyword_hash',
        }));
      }
    },
  };
}

export function createDefaultLocalResumeEmbeddingProvider(
  env: Record<string, string | undefined> = process.env,
): ResumeEmbeddingProvider {
  if (env.RESUME_EMBEDDING_PROVIDER === 'keyword-hash') {
    return createLocalKeywordEmbeddingProvider();
  }

  return createXenovaEmbeddingProvider({
    modelId: env.RESUME_EMBEDDING_MODEL,
    dimensions: Number(env.RESUME_EMBEDDING_DIMENSIONS || '') || undefined,
    allowRemoteModels: env.CAREER_SEEK_ALLOW_MODEL_DOWNLOADS === '1',
  });
}

export function createDisabledEmbeddingProvider(reason: string): ResumeEmbeddingProvider {
  return {
    id: 'disabled-resume-embedding-provider',
    mode: 'disabled',
    dimensions: 0,
    requiresApiKey: false,
    async embed(texts: string[]): Promise<ResumeEmbedding[]> {
      return texts.map((_, index) => ({
        chunkId: String(index),
        vector: [],
        dimensions: 0,
        model: reason,
        mode: 'disabled',
      }));
    },
  };
}

export async function embedResumeChunks(
  chunks: ResumeChunk[],
  provider: ResumeEmbeddingProvider = createLocalKeywordEmbeddingProvider(),
): Promise<ResumeEmbeddedChunk[]> {
  const embeddings = await provider.embed(chunks.map((chunk) => chunk.text));

  return chunks.map((chunk, index) => ({
    ...chunk,
    embedding: {
      ...embeddings[index],
      chunkId: chunk.id,
    },
  }));
}
