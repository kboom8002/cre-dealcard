/**
 * @module public-projection/access
 * @description P0-SEC (SEC-3/SEC-5) — pure access-decision helpers for pages that can be
 * reached without login (social-bot OG allowlist in proxy.ts) or that serve owner-only
 * previews on public routes (/dc/[id]?preview=1, /im-lite/[id]?doc=...).
 *
 * Kept free of Next.js / Supabase imports so they can be unit-tested directly.
 */

export interface Viewer {
  /** Authenticated Supabase user id, or null when anonymous. */
  userId: string | null;
  /** profiles.role === 'admin' */
  isAdmin: boolean;
}

export const ANONYMOUS_VIEWER: Viewer = Object.freeze({ userId: null, isAdmin: false });

/**
 * True when the viewer is authenticated AND (admin OR equal to one of the given owner ids).
 * Null/empty owner ids never match (an un-owned row is visible to admins only).
 */
export function isOwnerOrAdmin(
  viewer: Viewer | null | undefined,
  ...ownerIds: Array<string | null | undefined>
): boolean {
  if (!viewer?.userId) return false;
  if (viewer.isAdmin) return true;
  return ownerIds.some((o) => typeof o === 'string' && o.length > 0 && o === viewer.userId);
}

/**
 * Decision for owner-only broker pages that proxy.ts lets social bots reach
 * (/broker/deal-card/[id], /broker/leasing/[spaceId]).
 *
 * - `allow`      : render the full private page (owner/admin, or non-prod E2E bypass).
 * - `bot_shell`  : anonymous social-bot request for an existing resource → render a minimal
 *                  public-safe shell (OG tags come from generateMetadata). NO private data.
 * - `login`      : anonymous human → redirect to /login.
 * - `not_found`  : authenticated non-owner, or the resource does not exist.
 */
export type OwnerPageDecision = 'allow' | 'bot_shell' | 'login' | 'not_found';

export interface OwnerPageAccessInput {
  viewer: Viewer;
  /** Owner id read directly from the source-of-truth table (null when unknown/un-owned). */
  ownerId: string | null | undefined;
  /** Whether the resource exists (and is not soft-deleted for anonymous viewers). */
  exists: boolean;
  /** Request UA matched a social crawler pattern (spoofable — only ever reduces output). */
  isBot: boolean;
  /**
   * Mirrors proxy.ts' non-production Playwright bypass (NODE_ENV !== 'production' AND
   * x-playwright-test: true). Callers MUST compute this as false in production.
   */
  isNonProdE2EBypass?: boolean;
}

export function decideOwnerPageAccess(input: OwnerPageAccessInput): OwnerPageDecision {
  const { viewer, ownerId, exists, isBot, isNonProdE2EBypass } = input;

  if (viewer.userId) {
    if (!exists) return 'not_found';
    return isOwnerOrAdmin(viewer, ownerId) ? 'allow' : 'not_found';
  }

  // Anonymous from here on.
  if (isNonProdE2EBypass && exists) return 'allow';
  if (isBot) return exists ? 'bot_shell' : 'not_found';
  return 'login';
}
