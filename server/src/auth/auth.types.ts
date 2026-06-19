import type { UserRecord } from '../domain/users/user.types';

export type AuthRole = 'ADMIN' | 'CUSTOMER';

export interface SsoTokenClaims {
  sub?: string;
  userid?: string;
  email?: string;
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
  name?: string;
  azp?: string;
  realm_access?: { roles?: string[] };
  resource_access?: Record<string, { roles?: string[] }>;
  [k: string]: unknown;
}

export interface RequestAuthContext {
  claims: SsoTokenClaims;
  authServerUserId: string;
  /** Raw Bearer token when verified via JwtAuthGuard (for SSO proxy calls). */
  accessToken?: string;
  localUser?: UserRecord;
}
