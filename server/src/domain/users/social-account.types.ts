import type { SocialAccount as PrismaSocialAccount } from '@prisma/client';
import {
  SocialAccountStatus,
  SocialProvider,
} from '@prisma/client';

export { SocialAccountStatus, SocialProvider };

export type SocialAccountRecord = PrismaSocialAccount;

/** API / publish-facing connected account (provider-agnostic shape). */
export type ConnectedAccountRecord = {
  userId: string;
  channel: string;
  accountId: string;
  connectedAt: Date;
  provider?: SocialProvider;
  status?: SocialAccountStatus;
  displayName?: string | null;
  username?: string | null;
};

export function toConnectedAccountRecord(
  row: SocialAccountRecord,
): ConnectedAccountRecord {
  return {
    userId: row.userId,
    channel: row.channel,
    accountId: row.externalAccountId,
    connectedAt: row.connectedAt,
    provider: row.provider,
    status: row.status,
    displayName: row.displayName,
    username: row.username,
  };
}
