import type { ConnectedAccountRecord } from '../domain/users/social-account.types';

export function normalizeChannelKey(input: string): string {
  return input.trim().toLowerCase();
}

export function toConnectedAtDate(value: Date | string | undefined): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

/**
 * Normalize legacy `users.zernioConnectedAccounts` JSON (array or map) into
 * ConnectedAccountRecord[]. Used for dual-read fallback and migration.
 */
export function normalizeZernioConnectedAccountsJson(
  raw: unknown,
  userId: string,
): ConnectedAccountRecord[] {
  if (Array.isArray(raw)) {
    const normalized: ConnectedAccountRecord[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as {
        userId?: string;
        channel?: string;
        accountId?: string;
        connectedAt?: Date | string;
      };
      const channel = normalizeChannelKey(rec.channel ?? '');
      const accountId = rec.accountId?.trim();
      if (!channel || !accountId) continue;
      normalized.push({
        userId: rec.userId?.trim() || userId,
        channel,
        accountId,
        connectedAt: toConnectedAtDate(rec.connectedAt),
      });
    }
    return normalized;
  }

  if (raw && typeof raw === 'object') {
    return Object.entries(raw as Record<string, unknown>)
      .map(([channel, accountId]) => ({
        userId,
        channel: normalizeChannelKey(channel),
        accountId: typeof accountId === 'string' ? accountId.trim() : '',
        connectedAt: new Date(),
      }))
      .filter((item) => Boolean(item.channel && item.accountId));
  }

  return [];
}
