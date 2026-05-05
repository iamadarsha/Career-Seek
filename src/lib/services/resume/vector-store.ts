import crypto from 'crypto';
import type {
  ResumeEmbeddedChunk,
  ResumeVectorPoint,
  ResumeVectorSearchRequest,
  ResumeVectorSearchResult,
  ResumeVectorStoreClient,
  ResumeVectorWriteResult,
} from './types';

export interface QdrantResumeClientOptions {
  baseUrl: string;
  collectionName: string;
  apiKey?: string;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function qdrantPointId(value: string) {
  const hex = crypto.createHash('sha256').update(value).digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

async function parseResponse(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export class DisabledResumeVectorStoreClient implements ResumeVectorStoreClient {
  readonly id = 'disabled-resume-vector-store';
  readonly kind = 'disabled';

  constructor(private readonly reason: string) {}

  isEnabled() {
    return false;
  }

  async ensureCollection(): Promise<ResumeVectorWriteResult> {
    return { ok: true, count: 0, skipped: true, error: this.reason };
  }

  async upsert(): Promise<ResumeVectorWriteResult> {
    return { ok: true, count: 0, skipped: true, error: this.reason };
  }

  async search(): Promise<ResumeVectorSearchResult[]> {
    return [];
  }

  async deleteByFilter(): Promise<ResumeVectorWriteResult> {
    return { ok: true, count: 0, skipped: true, error: this.reason };
  }
}

export class QdrantResumeVectorStoreClient implements ResumeVectorStoreClient {
  readonly id: string;
  readonly kind = 'qdrant';
  private readonly baseUrl: string;
  private readonly collectionName: string;
  private readonly apiKey?: string;

  constructor(options: QdrantResumeClientOptions) {
    this.baseUrl = trimTrailingSlash(options.baseUrl);
    this.collectionName = options.collectionName;
    this.apiKey = options.apiKey;
    this.id = `qdrant:${options.collectionName}`;
  }

  isEnabled() {
    return Boolean(this.baseUrl && this.collectionName);
  }

  private headers() {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (this.apiKey) headers['api-key'] = this.apiKey;
    return headers;
  }

  private collectionUrl(pathname = '') {
    return `${this.baseUrl}/collections/${encodeURIComponent(this.collectionName)}${pathname}`;
  }

  async ensureCollection(dimensions: number): Promise<ResumeVectorWriteResult> {
    if (!this.isEnabled()) {
      return { ok: false, count: 0, skipped: true, error: 'Qdrant client is not configured.' };
    }

    const response = await fetch(this.collectionUrl(), {
      method: 'PUT',
      headers: this.headers(),
      body: JSON.stringify({
        vectors: {
          size: dimensions,
          distance: 'Cosine',
        },
      }),
    });

    if (!response.ok) {
      const body = await parseResponse(response);
      return { ok: false, count: 0, error: `Qdrant collection setup failed: ${JSON.stringify(body)}` };
    }

    return { ok: true, count: 0 };
  }

  async upsert(points: ResumeVectorPoint[]): Promise<ResumeVectorWriteResult> {
    if (!points.length) return { ok: true, count: 0 };
    if (!this.isEnabled()) {
      return { ok: false, count: 0, skipped: true, error: 'Qdrant client is not configured.' };
    }

    const response = await fetch(this.collectionUrl('/points?wait=true'), {
      method: 'PUT',
      headers: this.headers(),
      body: JSON.stringify({
        points: points.map((point) => ({
          id: qdrantPointId(point.id),
          vector: point.vector,
          payload: {
            ...point.payload,
            sourcePointId: point.id,
          },
        })),
      }),
    });

    if (!response.ok) {
      const body = await parseResponse(response);
      return { ok: false, count: 0, error: `Qdrant upsert failed: ${JSON.stringify(body)}` };
    }

    return { ok: true, count: points.length };
  }

  async search(request: ResumeVectorSearchRequest): Promise<ResumeVectorSearchResult[]> {
    if (!this.isEnabled()) return [];

    const response = await fetch(this.collectionUrl('/points/search'), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        vector: request.vector,
        limit: request.limit,
        filter: request.filter,
        score_threshold: request.scoreThreshold,
        with_payload: true,
      }),
    });

    if (!response.ok) return [];

    const body = await parseResponse(response) as {
      result?: Array<{ id: string; score: number; payload?: Record<string, unknown> }>;
    } | null;

    return (body?.result || []).map((item) => ({
      id: String(item.payload?.sourcePointId || item.id),
      score: item.score,
      payload: item.payload || {},
    }));
  }

  async deleteByFilter(filter: Record<string, unknown>): Promise<ResumeVectorWriteResult> {
    if (!this.isEnabled()) {
      return { ok: false, count: 0, skipped: true, error: 'Qdrant client is not configured.' };
    }

    const response = await fetch(this.collectionUrl('/points/delete?wait=true'), {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ filter }),
    });

    if (!response.ok) {
      const body = await parseResponse(response);
      return { ok: false, count: 0, error: `Qdrant delete failed: ${JSON.stringify(body)}` };
    }

    return { ok: true, count: 0 };
  }
}

export function createResumeVectorStoreFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ResumeVectorStoreClient {
  const baseUrl = env.QDRANT_URL || env.RESUME_QDRANT_URL;
  const collectionName = env.QDRANT_RESUME_COLLECTION || env.RESUME_VECTOR_COLLECTION || 'career_seek_resumes';

  if (!baseUrl) {
    return new DisabledResumeVectorStoreClient('QDRANT_URL is not configured; resume vectors stay local/in-memory.');
  }

  return new QdrantResumeVectorStoreClient({
    baseUrl,
    collectionName,
    apiKey: env.QDRANT_API_KEY || env.RESUME_QDRANT_API_KEY,
  });
}

export function resumeChunkToVectorPoint(chunk: ResumeEmbeddedChunk): ResumeVectorPoint {
  return {
    id: chunk.id,
    vector: chunk.embedding.vector,
    payload: {
      resumeId: chunk.resumeId,
      chunkId: chunk.id,
      sectionId: chunk.sectionId,
      sectionKind: chunk.sectionKind,
      sectionTitle: chunk.sectionTitle,
      ordinal: chunk.ordinal,
      text: chunk.text,
      tokenEstimate: chunk.tokenEstimate,
      embeddingModel: chunk.embedding.model,
      embeddingMode: chunk.embedding.mode,
      ...chunk.metadata,
    },
  };
}
