/**
 * K-6 Auth-Ready Session Layer
 *
 * Provides current-user resolution with a clean swap point for real auth.
 * In bootstrap/dev mode: always returns the single bootstrap user/profile.
 * In future auth mode: reads from the Next.js session/cookie.
 *
 * SWAP POINT: Replace the body of `getSessionContext()` when K-6+ auth
 * is implemented (Better Auth, NextAuth, Clerk, etc.).
 */

import {
  resolveContext,
  getBootstrapContext,
  type PlatformContext,
} from '@/lib/platform/identity';

// ─── Auth mode ─────────────────────────────────────────────────────────────────

const AUTH_MODE = (process.env.AUTH_MODE ?? 'bootstrap') as 'bootstrap' | 'real';

// ─── Session context ───────────────────────────────────────────────────────────

/**
 * Returns the PlatformContext for the current request.
 *
 * bootstrap mode: always userId=1, profileId=1 (the bootstrap user).
 * real mode: reads from session — NOT YET IMPLEMENTED; falls back to bootstrap.
 *
 * Call this at the start of server actions and API route handlers.
 */
export function getSessionContext(): PlatformContext {
  if (AUTH_MODE === 'real') {
    // TODO(K-6): read session cookie / JWT / provider session here
    // e.g. const session = await getServerSession(authOptions);
    // For now fall through to bootstrap until real auth is wired.
  }
  return resolveContext();
}

/**
 * Lightweight variant for code that only needs the numeric IDs.
 * Does NOT load full user/profile objects from DB.
 */
export function getSessionIds(): { userId: number; profileId: number } {
  if (AUTH_MODE === 'bootstrap') {
    return getBootstrapContext();
  }
  // TODO(K-6): decode JWT or session for IDs
  return getBootstrapContext();
}

/**
 * Returns true if the current session owns the given userId.
 * In bootstrap mode always returns true (single user).
 */
export function sessionOwnsUser(ownerId: number | null | undefined): boolean {
  if (AUTH_MODE === 'bootstrap') return true;
  const { userId } = getSessionIds();
  return ownerId === userId;
}

/**
 * Returns true if the current session owns the given profileId.
 */
export function sessionOwnsProfile(ownerId: number | null | undefined): boolean {
  if (AUTH_MODE === 'bootstrap') return true;
  const { profileId } = getSessionIds();
  return ownerId === profileId;
}
