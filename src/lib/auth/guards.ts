/**
 * K-6 Authorization Guards
 *
 * Ownership checks for service/repository boundaries.
 * Import these in services that handle multi-user data.
 *
 * Pattern: call assertOwnsProfile(ctx.profileId, record.profileId) before
 * returning or mutating sensitive records.
 */

import { getSessionIds } from './session';

// ─── Error ─────────────────────────────────────────────────────────────────────

export class AuthorizationError extends Error {
  readonly code = 'AUTHORIZATION_ERROR';
  constructor(message = 'Access denied') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

// ─── Guards ────────────────────────────────────────────────────────────────────

/**
 * Throws AuthorizationError if the record's userId does not match the session.
 * Pass null/undefined to skip the check (for records not yet backfilled).
 */
export function assertOwnsUser(recordOwnerId: number | null | undefined): void {
  if (recordOwnerId == null) return; // nullable — skip check
  const { userId } = getSessionIds();
  if (recordOwnerId !== userId) {
    throw new AuthorizationError(`User ${userId} does not own this record`);
  }
}

/**
 * Throws AuthorizationError if the record's profileId does not match the session.
 */
export function assertOwnsProfile(recordProfileId: number | null | undefined): void {
  if (recordProfileId == null) return;
  const { profileId } = getSessionIds();
  if (recordProfileId !== profileId) {
    throw new AuthorizationError(`Profile ${profileId} does not own this record`);
  }
}

/**
 * Throws if the request is not from an internal/system caller.
 * In bootstrap mode always passes. Real mode checks a header or token.
 */
export function assertSystemCall(callerSecret?: string): void {
  const expected = process.env.INTERNAL_SECRET;
  if (!expected) return; // no secret configured → allow all (dev mode)
  if (callerSecret !== expected) {
    throw new AuthorizationError('Invalid internal caller secret');
  }
}

/**
 * Convenience: wraps a function and injects the session context as first arg.
 * Useful for service functions that need userId/profileId.
 */
export function withSessionContext<TArgs extends unknown[], TReturn>(
  fn: (ids: { userId: number; profileId: number }, ...args: TArgs) => TReturn,
): (...args: TArgs) => TReturn {
  return (...args: TArgs): TReturn => {
    const ids = getSessionIds();
    return fn(ids, ...args);
  };
}
