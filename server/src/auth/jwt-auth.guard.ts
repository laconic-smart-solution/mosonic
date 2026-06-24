import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { type Request } from 'express';
import { type SsoTokenClaims } from './auth.types';
import { UsersService } from '../users/users.service';

function envFlagTrue(raw: string | undefined): boolean {
  if (raw === undefined || raw === null) return false;
  const s = raw.trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);
  private readonly jwks: ReturnType<typeof createRemoteJWKSet> | null;

  constructor(
    private readonly config: ConfigService,
    private readonly users: UsersService,
  ) {
    if (envFlagTrue(this.config.get<string>('SSO_AUTH_DISABLED'))) {
      this.jwks = null;
      this.logger.warn(
        'SSO_AUTH_DISABLED=true — JWT verification skipped; dev impersonation only',
      );
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
    this.logger.log(`JWKS configured: ${url}`);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const route = `${req.method} ${req.originalUrl ?? req.url}`;

    if (this.jwks === null) {
      const authServerUserId = this.config
        .get<string>('DEV_IMPERSONATE_AUTH_SERVER_USER_ID')
        ?.trim();
      if (!authServerUserId) {
        this.logger.warn(
          `[${route}] SSO_AUTH_DISABLED but DEV_IMPERSONATE_AUTH_SERVER_USER_ID is unset`,
        );
        throw new UnauthorizedException(
          'SSO_AUTH_DISABLED requires DEV_IMPERSONATE_AUTH_SERVER_USER_ID',
        );
      }
      const localUser =
        await this.users.findByAuthServerUserId(authServerUserId);
      if (!localUser) {
        this.logger.warn(
          `[${route}] No local user for impersonated authServerUserId=${authServerUserId}`,
        );
        throw new UnauthorizedException(
          `No local user for authServerUserId ${authServerUserId}`,
        );
      }
      this.logger.debug(
        `[${route}] Dev impersonation OK authServerUserId=${authServerUserId} localUserId=${localUser.userId}`,
      );
      const claims: SsoTokenClaims = {
        sub: authServerUserId,
        userid: authServerUserId,
        email:
          typeof localUser.email === 'string' ? localUser.email : undefined,
        preferred_username:
          typeof localUser.username === 'string'
            ? localUser.username
            : undefined,
        given_name:
          typeof localUser.firstName === 'string'
            ? localUser.firstName
            : undefined,
        family_name:
          typeof localUser.lastName === 'string'
            ? localUser.lastName
            : undefined,
      };
      req.auth = {
        claims,
        authServerUserId,
        localUser,
      };
      return true;
    }

    const header = req.headers['authorization'];
    const token = this.extractBearer(header);
    if (!token) {
      this.logger.warn(`[${route}] Missing Bearer token`);
      throw new UnauthorizedException('Missing Bearer token');
    }

    let claims: SsoTokenClaims;
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        // NOTE: authorize-server sets iss/aud to null in LCNSsoTokenService today.
        // If that changes, we can add issuer/audience checks via env.
      });
      claims = payload as unknown as SsoTokenClaims;
    } catch (err) {
      this.logger.warn(
        `[${route}] JWT verification failed: ${this.formatError(err)}`,
      );
      throw new UnauthorizedException('Invalid or expired token');
    }

    const rawId = claims.userid ?? claims.sub;
    const authServerUserIdRaw =
      rawId != null && rawId !== '' ? String(rawId).trim() : '';
    if (!authServerUserIdRaw) {
      this.logger.warn(
        `[${route}] Token verified but missing userid/sub (claim keys: ${Object.keys(claims).join(', ')})`,
      );
      throw new UnauthorizedException('Token missing userid/sub');
    }

    this.logger.debug(
      `[${route}] JWT OK authServerUserId=${authServerUserIdRaw} email=${claims.email ?? 'n/a'} username=${claims.preferred_username ?? 'n/a'}`,
    );

    req.auth = {
      claims,
      authServerUserId: authServerUserIdRaw,
      accessToken: token,
    };

    try {
      const localUser = await this.users.upsertFromSsoClaims({
        authServerUserId: authServerUserIdRaw,
        claims,
      });
      req.auth.localUser = localUser;
      this.logger.log(
        `[${route}] User upsert OK authServerUserId=${authServerUserIdRaw} localUserId=${localUser.userId} email=${localUser.email ?? 'n/a'}`,
      );
      return true;
    } catch (err) {
      this.logger.error(
        `[${route}] upsertFromSsoClaims failed for authServerUserId=${authServerUserIdRaw}: ${this.formatError(err)}`,
      );
      throw new ServiceUnavailableException({
        statusCode: 503,
        error: 'InternalError',
        message: 'Failed to provision local user',
      });
    }
  }

  private formatError(err: unknown): string {
    if (err instanceof Error) {
      return err.stack ?? err.message;
    }
    return String(err);
  }

  private extractBearer(header: unknown): string | null {
    if (typeof header !== 'string') return null;
    const m = header.match(/^Bearer\s+(.+)$/i);
    return m?.[1]?.trim() || null;
  }
}
