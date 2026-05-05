import https from 'https';
import http from 'http';
import { logger } from '@/lib/logger';

export type AntiBotVendor = 'cloudflare' | 'datadome' | 'perimeterx' | 'akamai' | 'imperva' | 'none' | 'unknown';
export type RateLimitSignal = 'strict' | 'moderate' | 'relaxed' | 'unknown';

export interface DomainReconResult {
  domain: string;
  antiBotVendor: AntiBotVendor;
  rateLimitSignal: RateLimitSignal;
  responseTimeMs: number;
  checkedAt: string;
  blocked: boolean;
}

const RECON_CACHE_TTL_MS = 5 * 60 * 1000;
const RECON_FAILURE_TTL_MS = 60 * 1000;

const reconCache = new Map<string, { result: DomainReconResult; expiresAt: number }>();

type HeaderMap = Record<string, string | string[] | undefined>;

function headerValue(headers: HeaderMap, name: string): string {
  const val = headers[name.toLowerCase()];
  return Array.isArray(val) ? val.join(', ') : (val || '');
}

function detectVendor(headers: HeaderMap, statusCode: number): AntiBotVendor {
  const names = new Set(Object.keys(headers).map((h) => h.toLowerCase()));
  const cookie = headerValue(headers, 'set-cookie');
  const server = headerValue(headers, 'server').toLowerCase();

  if (names.has('cf-ray') || names.has('cf-cache-status') || names.has('cf-request-id') || names.has('cf-mitigated')) {
    return 'cloudflare';
  }
  if (cookie.includes('datadome') || [...names].some((h) => h.startsWith('x-datadome'))) {
    return 'datadome';
  }
  if (cookie.includes('_px') || cookie.includes('_pxd') || [...names].some((h) => h.startsWith('x-px-'))) {
    return 'perimeterx';
  }
  if ([...names].some((h) => h.startsWith('x-akamai') || h === 'akamai-origin-hop') || server.includes('akamaighost')) {
    return 'akamai';
  }
  if (names.has('x-iinfo') || cookie.includes('visid_incap') || cookie.includes('incap_ses')) {
    return 'imperva';
  }
  if (statusCode === 200) return 'none';
  return 'unknown';
}

function detectRateLimit(statusCode: number, responseTimeMs: number, headers: HeaderMap): RateLimitSignal {
  if (statusCode === 429) return 'strict';
  if (headerValue(headers, 'retry-after') || headerValue(headers, 'x-ratelimit-reset')) return 'strict';
  if (statusCode === 403 || statusCode === 503) return 'moderate';
  if (responseTimeMs > 3_000) return 'moderate';
  if (statusCode === 200 || statusCode === 301 || statusCode === 302) return 'relaxed';
  return 'unknown';
}

interface HeadResponse {
  statusCode: number;
  headers: HeaderMap;
  responseTimeMs: number;
}

function headRequest(url: string, timeoutMs = 6_000): Promise<HeadResponse> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const lib = url.startsWith('https') ? https : http;
    const req = lib.request(
      url,
      {
        method: 'HEAD',
        timeout: timeoutMs,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      },
      (res) => {
        res.resume();
        resolve({
          statusCode: res.statusCode || 0,
          headers: res.headers as HeaderMap,
          responseTimeMs: Date.now() - start,
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('recon: HEAD request timed out'));
    });
    req.end();
  });
}

export class DomainReconService {
  async recon(domain: string): Promise<DomainReconResult> {
    const cached = reconCache.get(domain);
    if (cached && cached.expiresAt > Date.now()) return cached.result;

    try {
      const { statusCode, headers, responseTimeMs } = await headRequest(`https://${domain}`);
      const result: DomainReconResult = {
        domain,
        antiBotVendor: detectVendor(headers, statusCode),
        rateLimitSignal: detectRateLimit(statusCode, responseTimeMs, headers),
        responseTimeMs,
        checkedAt: new Date().toISOString(),
        blocked: statusCode === 403 || statusCode === 503 || statusCode === 429,
      };
      logger.debug({ domain, vendor: result.antiBotVendor, rateLimit: result.rateLimitSignal }, '[recon] domain scan');
      reconCache.set(domain, { result, expiresAt: Date.now() + RECON_CACHE_TTL_MS });
      return result;
    } catch (err) {
      logger.debug({ err, domain }, '[recon] HEAD request failed');
      const result: DomainReconResult = {
        domain,
        antiBotVendor: 'unknown',
        rateLimitSignal: 'unknown',
        responseTimeMs: 0,
        checkedAt: new Date().toISOString(),
        blocked: false,
      };
      reconCache.set(domain, { result, expiresAt: Date.now() + RECON_FAILURE_TTL_MS });
      return result;
    }
  }
}
