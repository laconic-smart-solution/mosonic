import type { AuthCookieTokens } from './auth-cookie.service';

/**
 * Makes login and refresh responses easier to parse by ensuring
 * tokens live under `data.token` when the Authorize Server returns flat fields.
 */
export function normalizeAuthorizeServerAuthBody(raw: unknown): unknown {
  if (raw === null || typeof raw !== 'object') {
    return raw;
  }

  const root = raw as Record<string, unknown>;

  if (
    typeof root.access_token === 'string' ||
    typeof root.accessToken === 'string'
  ) {
    return {
      data: {
        token: {
          access_token: root.access_token ?? root.accessToken,
          refresh_token: root.refresh_token ?? root.refreshToken,
          expires_in: root.expires_in ?? root.expiresIn,
          refresh_expires_in: root.refresh_expires_in ?? root.refreshExpiresIn,
        },
      },
    };
  }

  const data = root.data;
  if (data !== null && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if (d.token !== null && typeof d.token === 'object') {
      return raw;
    }
    if (
      typeof d.access_token === 'string' ||
      typeof d.accessToken === 'string'
    ) {
      return {
        ...root,
        data: {
          ...d,
          token: {
            access_token: d.access_token ?? d.accessToken,
            refresh_token: d.refresh_token ?? d.refreshToken,
            expires_in: d.expires_in ?? d.expiresIn,
            refresh_expires_in: d.refresh_expires_in ?? d.refreshExpiresIn,
          },
        },
      };
    }
  }

  return raw;
}

function pick(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

/** Extract access/refresh tokens (+ TTLs) from a normalized SSO auth body. */
export function extractAuthCookieTokens(raw: unknown): AuthCookieTokens | null {
  const normalized = normalizeAuthorizeServerAuthBody(raw);
  const accessToken =
    asString(pick(normalized, ['data', 'token', 'access_token'])) ??
    asString(pick(normalized, ['data', 'token', 'accessToken'])) ??
    asString(pick(normalized, ['data', 'access_token'])) ??
    asString(pick(normalized, ['data', 'accessToken'])) ??
    asString(pick(normalized, ['access_token'])) ??
    asString(pick(normalized, ['accessToken']));

  if (!accessToken) return null;

  const refreshToken =
    asString(pick(normalized, ['data', 'token', 'refresh_token'])) ??
    asString(pick(normalized, ['data', 'token', 'refreshToken'])) ??
    asString(pick(normalized, ['data', 'refresh_token'])) ??
    asString(pick(normalized, ['data', 'refreshToken'])) ??
    asString(pick(normalized, ['refresh_token'])) ??
    asString(pick(normalized, ['refreshToken']));

  const expiresIn =
    asNumber(pick(normalized, ['data', 'token', 'expires_in'])) ??
    asNumber(pick(normalized, ['data', 'token', 'expiresIn'])) ??
    asNumber(pick(normalized, ['data', 'expires_in'])) ??
    asNumber(pick(normalized, ['data', 'expiresIn']));

  const refreshExpiresIn =
    asNumber(pick(normalized, ['data', 'token', 'refresh_expires_in'])) ??
    asNumber(pick(normalized, ['data', 'token', 'refreshExpiresIn'])) ??
    asNumber(pick(normalized, ['data', 'refresh_expires_in'])) ??
    asNumber(pick(normalized, ['data', 'refreshExpiresIn']));

  return {
    accessToken,
    refreshToken,
    expiresIn: expiresIn ?? null,
    refreshExpiresIn: refreshExpiresIn ?? null,
  };
}

export type AuthSessionDto = {
  email: string | null;
  userId: string | null;
  otpVerified: boolean;
};

/** Session payload for the SPA — never includes tokens. */
export function toAuthSessionDto(raw: unknown): AuthSessionDto {
  const normalized = normalizeAuthorizeServerAuthBody(raw);
  const email =
    asString(pick(normalized, ['data', 'data', 'email'])) ??
    asString(pick(normalized, ['data', 'email'])) ??
    asString(pick(normalized, ['email'])) ??
    null;

  const userIdRaw =
    pick(normalized, ['data', 'data', 'userId']) ??
    pick(normalized, ['data', 'userId']) ??
    pick(normalized, ['userId']);
  const userId =
    userIdRaw != null && String(userIdRaw).trim()
      ? String(userIdRaw).trim()
      : null;

  const otpVerified =
    asBoolean(pick(normalized, ['data', 'data', 'otpVerified'])) ??
    asBoolean(pick(normalized, ['data', 'otpVerified'])) ??
    asBoolean(pick(normalized, ['otpVerified']));

  return {
    email,
    userId,
    // If SSO omits the flag, treat as verified (tokens were issued).
    otpVerified: otpVerified !== false,
  };
}
