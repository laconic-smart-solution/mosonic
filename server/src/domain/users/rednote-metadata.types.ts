import type { SocialAccountRecord } from './social-account.types';
import { SocialProvider } from './social-account.types';

export type RedNoteSessionStatus = 'active' | 'expired' | 'needs_reauth';

export type RedNoteSessionMetadata = {
  /** Opaque id for the encrypted cookie blob (same as ciphertext key in metadata). */
  sessionCookiesRef: string;
  /** AES-256-GCM ciphertext (base64) — never log. */
  encryptedCookies: string;
  sessionStatus: RedNoteSessionStatus;
  lastVerifiedAt: string | null;
  lastQrScanAt: string | null;
  rednoteUserHandle?: string;
};

export const REDNOTE_CHANNEL = 'rednote' as const;

export function rednoteExternalAccountId(userId: string): string {
  return `rednote:${userId.trim()}`;
}

export function parseRedNoteMetadata(
  raw: unknown,
): RedNoteSessionMetadata | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  const sessionCookiesRef =
    typeof m.sessionCookiesRef === 'string' ? m.sessionCookiesRef.trim() : '';
  const encryptedCookies =
    typeof m.encryptedCookies === 'string' ? m.encryptedCookies : '';
  const sessionStatus = m.sessionStatus;
  if (
    !sessionCookiesRef ||
    !encryptedCookies ||
    (sessionStatus !== 'active' &&
      sessionStatus !== 'expired' &&
      sessionStatus !== 'needs_reauth')
  ) {
    return null;
  }
  return {
    sessionCookiesRef,
    encryptedCookies,
    sessionStatus,
    lastVerifiedAt:
      typeof m.lastVerifiedAt === 'string' ? m.lastVerifiedAt : null,
    lastQrScanAt: typeof m.lastQrScanAt === 'string' ? m.lastQrScanAt : null,
    rednoteUserHandle:
      typeof m.rednoteUserHandle === 'string' ? m.rednoteUserHandle : undefined,
  };
}

export function isRedNoteAccount(
  row: SocialAccountRecord,
): row is SocialAccountRecord & { provider: typeof SocialProvider.REDNOTE } {
  return row.provider === SocialProvider.REDNOTE;
}
