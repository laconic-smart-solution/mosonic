import type { Prisma, SocialAccountStatus, SocialProvider } from '@prisma/client';
import type { SocialAccountRecord } from '../../domain/users/social-account.types';

export type UpsertSocialAccountInput = {
  userId: string;
  provider: SocialProvider;
  channel: string;
  externalAccountId: string;
  displayName?: string | null;
  username?: string | null;
  avatarUrl?: string | null;
  metadata?: Prisma.InputJsonValue | null;
  connectedAt?: Date;
  lastSyncedAt?: Date | null;
};

export interface ISocialAccountRepository {
  findActiveByUserId(userId: string): Promise<SocialAccountRecord[]>;

  findActiveByUserAndProvider(
    userId: string,
    provider: SocialProvider,
  ): Promise<SocialAccountRecord[]>;

  findActiveByUserProviderChannel(
    userId: string,
    provider: SocialProvider,
    channel: string,
  ): Promise<SocialAccountRecord | null>;

  upsertActive(input: UpsertSocialAccountInput): Promise<SocialAccountRecord>;

  /**
   * Replace the active set for a user+provider: upsert listed channels as ACTIVE,
   * mark any previously ACTIVE channels not in the list as DISCONNECTED.
   */
  syncActiveForProvider(
    userId: string,
    provider: SocialProvider,
    accounts: Array<{
      channel: string;
      externalAccountId: string;
      connectedAt?: Date;
      displayName?: string | null;
      username?: string | null;
    }>,
  ): Promise<SocialAccountRecord[]>;

  markDisconnected(
    userId: string,
    provider: SocialProvider,
    channel: string,
  ): Promise<SocialAccountRecord | null>;

  markAllDisconnectedForProvider(
    userId: string,
    provider: SocialProvider,
  ): Promise<number>;

  countActiveByUserGrouped(): Promise<
    Array<{ userId: string; accountCount: number }>
  >;

  countActive(where?: {
    userId?: string;
    provider?: SocialProvider;
    status?: SocialAccountStatus;
  }): Promise<number>;

  /** True if the user has any social_accounts row (any status). */
  hasAnyForUser(userId: string): Promise<boolean>;

  /** True if the social_accounts table has any rows at all. */
  hasAnyRows(): Promise<boolean>;

  findByUserProviderChannel(
    userId: string,
    provider: SocialProvider,
    channel: string,
  ): Promise<SocialAccountRecord | null>;

  findAllActiveByProvider(
    provider: SocialProvider,
  ): Promise<SocialAccountRecord[]>;

  updateStatusAndMetadata(
    userId: string,
    provider: SocialProvider,
    channel: string,
    data: {
      status: SocialAccountStatus;
      metadata?: Prisma.InputJsonValue;
      username?: string | null;
      disconnectedAt?: Date | null;
      lastSyncedAt?: Date | null;
    },
  ): Promise<SocialAccountRecord | null>;
}
