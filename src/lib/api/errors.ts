import { NextResponse } from 'next/server';

export interface ApiErrorPayload {
  ok: false;
  error: {
    code: string;
    message: string;
    action?: string;
  };
}

export function safeApiMessage(error: unknown, fallback = 'Something went wrong while handling this request.') {
  const raw = error instanceof Error ? error.message : String(error || fallback);
  return raw
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, '[redacted-api-key]')
    .replace(/sk-[0-9A-Za-z_-]{20,}/g, '[redacted-api-key]')
    .replace(/([?&](?:key|api_key)=)[^&\s]+/gi, '$1[redacted]')
    .slice(0, 500);
}

export function apiError(
  code: string,
  message: string,
  status = 500,
  action?: string,
) {
  return NextResponse.json<ApiErrorPayload>({
    ok: false,
    error: {
      code,
      message,
      action,
    },
  }, { status });
}

export function apiException(
  error: unknown,
  code = 'internal_error',
  status = 500,
  action = 'Try again. If this repeats, open System Status and follow the suggested repair step.',
) {
  return apiError(code, safeApiMessage(error), status, action);
}
