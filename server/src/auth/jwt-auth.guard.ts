import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { type Request } from 'express';
import { type SsoTokenClaims } from './auth.types';
import { UsersService } from '../users/users.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    private readonly config: ConfigService,
    private readonly users: UsersService,
  ) {
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

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();

    const header = req.headers['authorization'];
    const token = this.extractBearer(header);
    if (!token) {
      throw new UnauthorizedException('Missing Bearer token');
    }

    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        // NOTE: authorize-server sets iss/aud to null in LCNSsoTokenService today.
        // If that changes, we can add issuer/audience checks via env.
      });
      const claims = payload as unknown as SsoTokenClaims;

      const authServerUserIdRaw =
        (typeof claims.userid === 'string' && claims.userid) ||
        (typeof claims.sub === 'string' && claims.sub);
      if (!authServerUserIdRaw) {
        throw new UnauthorizedException('Token missing userid/sub');
      }

      req.auth = {
        claims,
        authServerUserId: authServerUserIdRaw,
      };

      const localUser = await this.users.upsertFromSsoClaims({
        authServerUserId: authServerUserIdRaw,
        claims,
      });
      req.auth.localUser = localUser;

      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private extractBearer(header: unknown): string | null {
    if (typeof header !== 'string') return null;
    const m = header.match(/^Bearer\s+(.+)$/i);
    return m?.[1]?.trim() || null;
  }
}
