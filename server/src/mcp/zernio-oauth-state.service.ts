import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SignJWT, jwtVerify } from 'jose';
import {
  DEFAULT_OAUTH_RETURN_TO,
  sanitizeOAuthReturnTo,
} from './oauth-return-to.util';

const STATE_ALG = 'HS256';
const STATE_MAX_AGE = '15m';

@Injectable()
export class ZernioOauthStateService implements OnModuleInit {
  private secret!: Uint8Array;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const raw = this.config.get<string>('ZERNIO_OAUTH_STATE_SECRET')?.trim();
    if (!raw) {
      throw new Error('ZERNIO_OAUTH_STATE_SECRET is not set');
    }
    this.secret = new TextEncoder().encode(raw);
  }

  async signState(
    userId: string,
    options?: { returnTo?: string },
  ): Promise<string> {
    const returnTo = sanitizeOAuthReturnTo(
      options?.returnTo ?? DEFAULT_OAUTH_RETURN_TO,
    );
    return await new SignJWT({ returnTo })
      .setProtectedHeader({ alg: STATE_ALG })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(STATE_MAX_AGE)
      .sign(this.secret);
  }

  async verifyState(
    token: string,
  ): Promise<{ userId: string; returnTo: string }> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        algorithms: [STATE_ALG],
      });
      const sub = payload.sub;
      if (!sub) {
        throw new BadRequestException('Invalid OAuth state');
      }
      return {
        userId: sub,
        returnTo: sanitizeOAuthReturnTo(payload.returnTo),
      };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException('Invalid or expired OAuth state');
    }
  }

  /** Append signed state to the configured callback URL for Zernio redirect_url. */
  buildCallbackUrlWithState(baseCallbackUrl: string, stateJwt: string): string {
    const url = new URL(baseCallbackUrl);
    url.searchParams.set('state', stateJwt);
    return url.toString();
  }
}
