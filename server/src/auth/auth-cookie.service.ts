import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

export type AuthCookieTokens = {
  accessToken: string;
  refreshToken?: string;
  /** Access token lifetime in seconds (SSO expires_in). */
  expiresIn?: number | null;
  /** Refresh token lifetime in seconds (SSO refresh_expires_in). */
  refreshExpiresIn?: number | null;
};

function envFlagTrue(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw === undefined || raw === null || raw.trim() === '') {
    return defaultValue;
  }
  const s = raw.trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes';
}

@Injectable()
export class AuthCookieService {
  constructor(private readonly config: ConfigService) {}

  accessName(): string {
    return (
      this.config.get<string>('AUTH_COOKIE_ACCESS_NAME')?.trim() ||
      'neutral_tex_access_token'
    );
  }

  refreshName(): string {
    return (
      this.config.get<string>('AUTH_COOKIE_REFRESH_NAME')?.trim() ||
      'neutral_tex_refresh_token'
    );
  }

  private accessPath(): string {
    return this.config.get<string>('AUTH_COOKIE_PATH')?.trim() || '/';
  }

  private refreshPath(): string {
    return this.config.get<string>('AUTH_COOKIE_REFRESH_PATH')?.trim() || '/auth';
  }

  private sameSite(): boolean | "lax" | "strict" | "none" {
    const raw =
      this.config.get<string>('AUTH_COOKIE_SAME_SITE')?.trim().toLowerCase() ||
      'lax';
    if (raw === 'strict' || raw === 'none' || raw === 'lax') return raw;
    return 'lax';
  }

  private secure(): boolean {
    // Default false for local HTTP; set AUTH_COOKIE_SECURE=true in production.
    return envFlagTrue(this.config.get<string>('AUTH_COOKIE_SECURE'), false);
  }

  writeTokens(res: Response, tokens: AuthCookieTokens): void {
    if (!tokens.accessToken?.trim()) return;

    this.setCookie(res, {
      name: this.accessName(),
      value: tokens.accessToken.trim(),
      path: this.accessPath(),
      maxAgeSeconds: tokens.expiresIn,
    });

    if (tokens.refreshToken?.trim()) {
      this.setCookie(res, {
        name: this.refreshName(),
        value: tokens.refreshToken.trim(),
        path: this.refreshPath(),
        maxAgeSeconds: tokens.refreshExpiresIn,
      });
    }
  }

  clearTokens(res: Response): void {
    this.expireCookie(res, this.accessName(), this.accessPath());
    this.expireCookie(res, this.refreshName(), this.refreshPath());
  }

  readAccessToken(req: Request): string | null {
    return this.readCookie(req, this.accessName());
  }

  readRefreshToken(req: Request): string | null {
    return this.readCookie(req, this.refreshName());
  }

  /** Parse access token from a raw Cookie header (e.g. Socket.IO handshake). */
  readAccessTokenFromCookieHeader(cookieHeader: string | undefined): string | null {
    if (!cookieHeader?.trim()) return null;
    const name = this.accessName();
    for (const part of cookieHeader.split(';')) {
      const idx = part.indexOf('=');
      if (idx <= 0) continue;
      const key = part.slice(0, idx).trim();
      if (key !== name) continue;
      const value = decodeURIComponent(part.slice(idx + 1).trim());
      return value || null;
    }
    return null;
  }

  private readCookie(req: Request, name: string): string | null {
    const cookies = req.cookies as Record<string, string> | undefined;
    const value = cookies?.[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
    return null;
  }

  private setCookie(
    res: Response,
    args: {
      name: string;
      value: string;
      path: string;
      maxAgeSeconds?: number | null;
    },
  ): void {
    const opts: {
      httpOnly: boolean;
      secure: boolean;
      sameSite: boolean | 'lax' | 'strict' | 'none';
      path: string;
      maxAge?: number;
    } = {
      httpOnly: true,
      secure: this.secure(),
      sameSite: this.sameSite(),
      path: args.path,
    };
    if (
      args.maxAgeSeconds != null &&
      Number.isFinite(args.maxAgeSeconds) &&
      args.maxAgeSeconds > 0
    ) {
      // Express maxAge is milliseconds.
      opts.maxAge = Math.floor(args.maxAgeSeconds) * 1000;
    }
    res.cookie(args.name, args.value, opts);
  }

  private expireCookie(res: Response, name: string, path: string): void {
    res.cookie(name, '', {
      httpOnly: true,
      secure: this.secure(),
      sameSite: this.sameSite(),
      path,
      maxAge: 0,
    });
  }
}
