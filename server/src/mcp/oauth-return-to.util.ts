/** Allowed frontend paths after Zernio OAuth (blocks open redirects). */
export const OAUTH_RETURN_TO_ALLOWLIST = new Set([
  '/home',
  '/settings/accounts',
]);

export const DEFAULT_OAUTH_RETURN_TO = '/settings/accounts';

/**
 * Normalize a relative path from OAuth state. Unknown or absolute URLs fall
 * back to settings accounts.
 */
export function sanitizeOAuthReturnTo(raw: unknown): string {
  if (typeof raw !== 'string') return DEFAULT_OAUTH_RETURN_TO;
  const path = raw.trim();
  if (!path.startsWith('/') || path.startsWith('//')) {
    return DEFAULT_OAUTH_RETURN_TO;
  }
  const noQuery = path.split('?')[0]?.split('#')[0] ?? path;
  if (OAUTH_RETURN_TO_ALLOWLIST.has(noQuery)) return noQuery;
  return DEFAULT_OAUTH_RETURN_TO;
}
