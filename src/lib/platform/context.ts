/**
 * K-1 Platform Context
 *
 * Re-exports the canonical PlatformContext type and the resolver.
 * Import from here rather than directly from identity.ts when you only
 * need the type or the resolver — keeps coupling shallow.
 */

export type { PlatformContext, User, UserProfile } from './identity';
export {
  resolveContext,
  tryResolveContext,
  getDefaultUser,
  getDefaultProfile,
  getBootstrapContext,
  BOOTSTRAP_USER_ID,
  BOOTSTRAP_PROFILE_ID,
} from './identity';
