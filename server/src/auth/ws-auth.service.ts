import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { type SsoTokenClaims } from './auth.types';
import { UsersService } from '../users/users.service';
import { tenancyFromLocalUser } from './tenancy.util';

function envFlagTrue(raw: string | undefined): boolean {
  if (raw === undefined || raw === null) return false;
  const s = raw.trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
}

export type WsAuthResult = {
  userId: string;
};

@Injectable()
export class WsAuthService {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet> | null;

  constructor(
    private readonly config: ConfigService,
    private readonly users: UsersService,
  ) {
    if (envFlagTrue(this.config.get<string>('SSO_AUTH_DISABLED'))) {
      this.jwks = null;
      return;
    }

    const jwksUrl = this.config.get<string>('SSO_JWKS_URL')?.trim();
    const baseUrl = this.config
      .get<string>('SSO_BASE_URL')
      ?.trim()
      ?.replace(/\/$/, '');
    const url =
      jwksUrl || (baseUrl ? `${baseUrl}/v1/lcn-sso/auth/jwks.json` : '');
    if (!url) {
      throw new Error('SSO_JWKS_URL (or SSO_BASE_URL) is not set');
    }
    this.jwks = createRemoteJWKSet(new URL(url));
  }

  async authenticateSocketToken(
    token: string | undefined,
  ): Promise<WsAuthResult> {
    const trimmed = token?.trim();
    if (!trimmed) {
      throw new UnauthorizedException('Missing socket auth token');
    }

    if (this.jwks === null) {
      const authServerUserId = this.config
        .get<string>('DEV_IMPERSONATE_AUTH_SERVER_USER_ID')
        ?.trim();
      if (!authServerUserId) {
        throw new UnauthorizedException(
          'SSO_AUTH_DISABLED requires DEV_IMPERSONATE_AUTH_SERVER_USER_ID',
        );
      }
      const localUser =
        await this.users.findByAuthServerUserId(authServerUserId);
      if (!localUser) {
        throw new UnauthorizedException(
          `No local user for authServerUserId ${authServerUserId}`,
        );
      }
      return { userId: tenancyFromLocalUser(localUser).userId };
    }

    try {
      const { payload } = await jwtVerify(trimmed, this.jwks);
      const claims = payload as unknown as SsoTokenClaims;
      const rawId = claims.userid ?? claims.sub;
      const authServerUserIdRaw =
        rawId != null && rawId !== '' ? String(rawId).trim() : '';
      if (!authServerUserIdRaw) {
        throw new UnauthorizedException('Token missing userid/sub');
      }

      const localUser = await this.users.upsertFromSsoClaims({
        authServerUserId: authServerUserIdRaw,
        claims,
      });
      return { userId: tenancyFromLocalUser(localUser).userId };
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
