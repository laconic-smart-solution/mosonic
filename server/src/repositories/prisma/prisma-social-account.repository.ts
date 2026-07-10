import { Injectable } from '@nestjs/common';
import {
  SocialAccountStatus,
  SocialProvider,
  type Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { SocialAccountRecord } from '../../domain/users/social-account.types';
import type {
  ISocialAccountRepository,
  UpsertSocialAccountInput,
} from '../interfaces/social-account.repository.interface';

@Injectable()
export class PrismaSocialAccountRepository implements ISocialAccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveByUserId(userId: string): Promise<SocialAccountRecord[]> {
    return this.prisma.socialAccount.findMany({
      where: { userId, status: SocialAccountStatus.ACTIVE },
      orderBy: [{ channel: 'asc' }, { connectedAt: 'asc' }],
    });
  }

  findActiveByUserAndProvider(
    userId: string,
    provider: SocialProvider,
  ): Promise<SocialAccountRecord[]> {
    return this.prisma.socialAccount.findMany({
      where: { userId, provider, status: SocialAccountStatus.ACTIVE },
      orderBy: [{ channel: 'asc' }, { connectedAt: 'asc' }],
    });
  }

  findActiveByUserProviderChannel(
    userId: string,
    provider: SocialProvider,
    channel: string,
  ): Promise<SocialAccountRecord | null> {
    return this.prisma.socialAccount.findUnique({
      where: {
        userId_provider_channel: { userId, provider, channel },
      },
    }).then((row) =>
      row && row.status === SocialAccountStatus.ACTIVE ? row : null,
    );
  }

  upsertActive(input: UpsertSocialAccountInput): Promise<SocialAccountRecord> {
    const now = new Date();
    const connectedAt = input.connectedAt ?? now;
    return this.prisma.socialAccount.upsert({
      where: {
        userId_provider_channel: {
          userId: input.userId,
          provider: input.provider,
          channel: input.channel,
        },
      },
      create: {
        userId: input.userId,
        provider: input.provider,
        channel: input.channel,
        externalAccountId: input.externalAccountId,
        displayName: input.displayName ?? null,
        username: input.username ?? null,
        avatarUrl: input.avatarUrl ?? null,
        metadata: input.metadata ?? undefined,
        status: SocialAccountStatus.ACTIVE,
        connectedAt,
        disconnectedAt: null,
        lastSyncedAt: input.lastSyncedAt ?? now,
      },
      update: {
        externalAccountId: input.externalAccountId,
        displayName: input.displayName ?? null,
        username: input.username ?? null,
        avatarUrl: input.avatarUrl ?? null,
        metadata: input.metadata ?? undefined,
        status: SocialAccountStatus.ACTIVE,
        disconnectedAt: null,
        connectedAt,
        lastSyncedAt: input.lastSyncedAt ?? now,
      },
    });
  }

  async syncActiveForProvider(
    userId: string,
    provider: SocialProvider,
    accounts: Array<{
      channel: string;
      externalAccountId: string;
      connectedAt?: Date;
      displayName?: string | null;
      username?: string | null;
    }>,
  ): Promise<SocialAccountRecord[]> {
    const now = new Date();
    const channels = accounts.map((a) => a.channel);

    return this.prisma.$transaction(async (tx) => {
      for (const account of accounts) {
        await tx.socialAccount.upsert({
          where: {
            userId_provider_channel: {
              userId,
              provider,
              channel: account.channel,
            },
          },
          create: {
            userId,
            provider,
            channel: account.channel,
            externalAccountId: account.externalAccountId,
            displayName: account.displayName ?? null,
            username: account.username ?? null,
            status: SocialAccountStatus.ACTIVE,
            connectedAt: account.connectedAt ?? now,
            disconnectedAt: null,
            lastSyncedAt: now,
          },
          update: {
            externalAccountId: account.externalAccountId,
            displayName: account.displayName ?? null,
            username: account.username ?? null,
            status: SocialAccountStatus.ACTIVE,
            disconnectedAt: null,
            connectedAt: account.connectedAt ?? now,
            lastSyncedAt: now,
          },
        });
      }

      if (channels.length === 0) {
        await tx.socialAccount.updateMany({
          where: {
            userId,
            provider,
            status: SocialAccountStatus.ACTIVE,
          },
          data: {
            status: SocialAccountStatus.DISCONNECTED,
            disconnectedAt: now,
            lastSyncedAt: now,
          },
        });
      } else {
        await tx.socialAccount.updateMany({
          where: {
            userId,
            provider,
            status: SocialAccountStatus.ACTIVE,
            channel: { notIn: channels },
          },
          data: {
            status: SocialAccountStatus.DISCONNECTED,
            disconnectedAt: now,
            lastSyncedAt: now,
          },
        });
      }

      return tx.socialAccount.findMany({
        where: { userId, provider, status: SocialAccountStatus.ACTIVE },
        orderBy: [{ channel: 'asc' }, { connectedAt: 'asc' }],
      });
    });
  }

  async markDisconnected(
    userId: string,
    provider: SocialProvider,
    channel: string,
  ): Promise<SocialAccountRecord | null> {
    const existing = await this.prisma.socialAccount.findUnique({
      where: {
        userId_provider_channel: { userId, provider, channel },
      },
    });
    if (!existing) return null;
    const now = new Date();
    return this.prisma.socialAccount.update({
      where: { id: existing.id },
      data: {
        status: SocialAccountStatus.DISCONNECTED,
        disconnectedAt: now,
        lastSyncedAt: now,
      },
    });
  }

  async markAllDisconnectedForProvider(
    userId: string,
    provider: SocialProvider,
  ): Promise<number> {
    const now = new Date();
    const result = await this.prisma.socialAccount.updateMany({
      where: {
        userId,
        provider,
        status: SocialAccountStatus.ACTIVE,
      },
      data: {
        status: SocialAccountStatus.DISCONNECTED,
        disconnectedAt: now,
        lastSyncedAt: now,
      },
    });
    return result.count;
  }

  async countActiveByUserGrouped(): Promise<
    Array<{ userId: string; accountCount: number }>
  > {
    const rows = await this.prisma.socialAccount.groupBy({
      by: ['userId'],
      where: { status: SocialAccountStatus.ACTIVE },
      _count: { _all: true },
    });
    return rows.map((row) => ({
      userId: row.userId,
      accountCount: row._count._all,
    }));
  }

  countActive(where?: {
    userId?: string;
    provider?: SocialProvider;
    status?: SocialAccountStatus;
  }): Promise<number> {
    const filter: Prisma.SocialAccountWhereInput = {
      status: where?.status ?? SocialAccountStatus.ACTIVE,
    };
    if (where?.userId) filter.userId = where.userId;
    if (where?.provider) filter.provider = where.provider;
    return this.prisma.socialAccount.count({ where: filter });
  }

  async hasAnyForUser(userId: string): Promise<boolean> {
    const row = await this.prisma.socialAccount.findFirst({
      where: { userId },
      select: { id: true },
    });
    return row != null;
  }

  async hasAnyRows(): Promise<boolean> {
    const row = await this.prisma.socialAccount.findFirst({
      select: { id: true },
    });
    return row != null;
  }

  findByUserProviderChannel(
    userId: string,
    provider: SocialProvider,
    channel: string,
  ): Promise<SocialAccountRecord | null> {
    return this.prisma.socialAccount.findUnique({
      where: {
        userId_provider_channel: { userId, provider, channel },
      },
    });
  }

  findAllActiveByProvider(
    provider: SocialProvider,
  ): Promise<SocialAccountRecord[]> {
    return this.prisma.socialAccount.findMany({
      where: { provider, status: SocialAccountStatus.ACTIVE },
      orderBy: { updatedAt: 'asc' },
    });
  }

  async updateStatusAndMetadata(
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
  ): Promise<SocialAccountRecord | null> {
    const existing = await this.findByUserProviderChannel(
      userId,
      provider,
      channel,
    );
    if (!existing) return null;
    return this.prisma.socialAccount.update({
      where: { id: existing.id },
      data: {
        status: data.status,
        ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
        ...(data.username !== undefined ? { username: data.username } : {}),
        disconnectedAt:
          data.disconnectedAt !== undefined
            ? data.disconnectedAt
            : data.status === SocialAccountStatus.ACTIVE
              ? null
              : new Date(),
        lastSyncedAt: data.lastSyncedAt ?? new Date(),
      },
    });
  }
}
