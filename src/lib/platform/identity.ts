/**
 * K-1 Platform Identity
 *
 * Provides ownership resolution for the single-user bootstrap mode.
 * When real auth is added (K-6+), swap getDefaultUser/getDefaultProfile
 * for session-aware implementations without touching call sites.
 *
 * All DB operations are synchronous (better-sqlite3).
 */

import { getDb } from '@/db';
import { users, userProfiles } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { cookies } from 'next/headers';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type UserProfile = typeof userProfiles.$inferSelect;

export interface PlatformContext {
  userId: number;
  profileId: number;
  user: User;
  profile: UserProfile;
}

// ─── Bootstrap constants ───────────────────────────────────────────────────────

export const BOOTSTRAP_USER_ID = 1;
export const BOOTSTRAP_PROFILE_ID = 1;

// ─── Resolution ────────────────────────────────────────────────────────────────

/**
 * Returns the user by ID or the bootstrap user.
 */
export function getUser(userId?: number): User {
  const db = getDb();
  const uid = userId ?? BOOTSTRAP_USER_ID;

  const user = db
    .select()
    .from(users)
    .where(userId ? eq(users.id, uid) : eq(users.isBootstrap, true))
    .get();

  if (!user) {
    throw new Error(
      `User ${uid} not found. Run: node scripts/k1-bootstrap-migration.mjs`,
    );
  }
  return user;
}

/**
 * Returns the profile by ID or the default profile for the user.
 */
export function getProfile(profileId?: number, userId?: number): UserProfile {
  const db = getDb();
  const uid = userId ?? BOOTSTRAP_USER_ID;

  const profile = profileId 
    ? db.select().from(userProfiles).where(eq(userProfiles.id, profileId)).get()
    : db.select().from(userProfiles).where(and(eq(userProfiles.userId, uid), eq(userProfiles.isDefault, true))).get();

  if (!profile) {
    throw new Error(
      `Profile not found (id=${profileId}, userId=${uid}). Run: node scripts/k1-bootstrap-migration.mjs`,
    );
  }
  return profile;
}

/**
 * Legacy aliases for bootstrap mode
 */
export const getDefaultUser = () => getUser();
export const getDefaultProfile = (userId?: number) => getProfile(undefined, userId);

/**
 * Resolves the full platform context for the current request.
 *
 * In bootstrap/dev mode this defaults to the single bootstrap user+profile.
 * Now supports reading userId/profileId from cookies for multi-tenant readiness.
 */
export function resolveContext(): PlatformContext {
  let userId: number | undefined;
  let profileId: number | undefined;

  try {
    const cookieStore = cookies();
    const uId = cookieStore.get('userId')?.value;
    const pId = cookieStore.get('profileId')?.value;
    if (uId) userId = parseInt(uId);
    if (pId) profileId = parseInt(pId);
  } catch (e) {
    // Fallback to bootstrap if not in request context
  }

  const user = getUser(userId);
  const profile = getProfile(profileId, user.id);

  return { 
    userId: user.id, 
    profileId: profile.id, 
    user, 
    profile 
  };
}

/**
 * Returns the bootstrap context without throwing if tables are missing —
 * useful in migration scripts and health checks.
 */
export function tryResolveContext(): PlatformContext | null {
  try {
    return resolveContext();
  } catch {
    return null;
  }
}

/**
 * Returns userId=1, profileId=1 as a static fallback for server actions that
 * have not yet been updated to call resolveContext().  Prefer resolveContext().
 */
export function getBootstrapContext(): Pick<PlatformContext, 'userId' | 'profileId'> {
  return { userId: BOOTSTRAP_USER_ID, profileId: BOOTSTRAP_PROFILE_ID };
}
