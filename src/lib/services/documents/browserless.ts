import { logger } from '@/lib/logger';

export function getBrowserlessEndpoint() {
  return process.env.BROWSERLESS_URL || process.env.BROWSERLESS_WS_ENDPOINT || '';
}

function httpUrlFromBrowserless(endpoint: string) {
  if (!endpoint) return '';
  if (endpoint.startsWith('ws://')) return endpoint.replace(/^ws:\/\//, 'http://');
  if (endpoint.startsWith('wss://')) return endpoint.replace(/^wss:\/\//, 'https://');
  return endpoint;
}

export async function checkBrowserlessReadiness(required = false) {
  const endpoint = getBrowserlessEndpoint();
  if (!endpoint) {
    if (required) throw new Error('BROWSERLESS_URL or BROWSERLESS_WS_ENDPOINT is not configured.');
    return { available: false, endpoint: '', reason: 'not_configured' };
  }

  const base = httpUrlFromBrowserless(endpoint).replace(/\/+$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_000);
  try {
    const response = await fetch(`${base}/json/version`, { signal: controller.signal });
    if (!response.ok) throw new Error(`Browserless returned HTTP ${response.status}`);
    return { available: true, endpoint };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (required) {
      throw new Error(`Browserless is not reachable at ${endpoint}: ${message}`);
    }
    logger.warn({ err: error, endpoint }, 'Browserless readiness check failed; local PDF fallback will be used');
    return { available: false, endpoint, reason: message };
  } finally {
    clearTimeout(timeout);
  }
}
