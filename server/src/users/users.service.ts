import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { SocialProvider } from '@prisma/client';
import { type SsoTokenClaims } from '../auth/auth.types';
import {
  toConnectedAccountRecord,
  type ConnectedAccountRecord,
} from '../domain/users/social-account.types';
import {
  UserRole,
  UserStatus,
  type UserRecord,
} from '../domain/users/user.types';
import { PlanService } from '../plan/plan.service';
import type { ISocialAccountRepository } from '../repositories/interfaces/social-account.repository.interface';
import type { IUserRepository } from '../repositories/interfaces/user.repository.interface';
import { isUniqueViolation } from '../repositories/prisma/prisma.util';
import {
  SOCIAL_ACCOUNT_REPOSITORY,
  USER_REPOSITORY,
} from '../repositories/tokens';
import {
  normalizeChannelKey,
  normalizeZernioConnectedAccountsJson,
} from './social-account-json.util';

export type { ConnectedAccountRecord };

@Injectable()
export class UsersService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(SOCIAL_ACCOUNT_REPOSITORY)
    private readonly socialAccounts: ISocialAccountRepository,
    private readonly moduleRef: ModuleRef,
  ) {}

  private async assignDefaultPlanForUser(userId: string): Promise<void> {
    try {
      const planService = this.moduleRef.get(PlanService, { strict: false });
      await planService.assignDefaultPlan(userId);
    } catch {
      // PlanModule may not be initialized during early bootstrap
    }
  }

  async upsertFromSsoClaims(args: {
    authServerUserId: string;
    claims: SsoTokenClaims;
  }): Promise<UserRecord> {
    const { authServerUserId, claims } = args;

    const email = typeof claims.email === 'string' ? claims.email : undefined;
    const username =
      typeof claims.preferred_username === 'string'
        ? claims.preferred_username
        : undefined;
    const firstName =
      typeof claims.given_name === 'string' ? claims.given_name : undefined;
    const lastName =
      typeof claims.family_name === 'string' ? claims.family_name : undefined;

    const now = new Date();

    let existing = await this.users.findByAuthServerUserId(authServerUserId);

    if (!existing) {
      existing = await this.users.findByEmailOrUsernameInsensitive(
        email,
        username,
      );
    }

    if (existing) {
      const updated = await this.users.update(existing.userId, {
        authServerUserId,
        email: email ?? existing.email,
        username: username ?? existing.username,
        firstName: firstName ?? existing.firstName,
        lastName: lastName ?? existing.lastName,
        lastLoginAt: now,
      });
      if (updated) return updated;

      const winner = await this.users.findByAuthServerUserId(authServerUserId);
      if (winner) return winner;

      throw new Error(
        `Failed to update user ${existing.userId} during SSO upsert`,
      );
    }

    try {
      const user = await this.users.create({
        authServerUserId,
        email,
        username,
        firstName,
        lastName,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        lastLoginAt: now,
      });
      await this.assignDefaultPlanForUser(user.userId);
      return user;
    } catch (err) {
      if (isUniqueViolation(err)) {
        const winner = await this.users.findByAuthServerUserId(authServerUserId);
        if (winner) return winner;
      }
      throw err;
    }
  }

  async findByUserId(userId: string): Promise<UserRecord | null> {
    return this.users.findByUserId(userId);
  }

  /**
   * Users with at least one active social account (for monthly cost allocation).
   * Prefers social_accounts table; falls back to legacy JSON only when the
   * table has no rows at all (pre-migration).
   */
  async listUserIdsWithZernioConnectedAccounts(): Promise<
    Array<{ userId: string; accountCount: number }>
  > {
    const fromTable = await this.socialAccounts.countActiveByUserGrouped();
    if (await this.socialAccounts.hasAnyRows()) {
      return fromTable;
    }

    const rows = await this.users.listWithZernioAccounts();
    const out: Array<{ userId: string; accountCount: number }> = [];
    for (const row of rows) {
      const userId = typeof row.userId === 'string' ? row.userId : '';
      if (!userId) continue;
      const count = normalizeZernioConnectedAccountsJson(
        row.zernioConnectedAccounts,
        userId,
      ).length;
      if (count > 0) {
        out.push({ userId, accountCount: count });
      }
    }
    return out;
  }

  async findByZernioProfileId(profileId: string): Promise<UserRecord | null> {
    return this.users.findByZernioProfileId(profileId);
  }

  async findOtherUserByZernioProfileId(
    profileId: string,
    excludeUserId: string,
  ): Promise<UserRecord | null> {
    return this.users.findOtherUserByZernioProfileId(profileId, excludeUserId);
  }

  async listDuplicateZernioProfileGroups(): Promise<
    Array<{
      profileId: string;
      users: Array<{
        userId: string;
        createdAt: Date;
        email: string | null;
      }>;
    }>
  > {
    return this.users.listDuplicateZernioProfileGroups();
  }

  async clearZernioConnectedAccounts(userId: string): Promise<void> {
    await this.socialAccounts.markAllDisconnectedForProvider(
      userId,
      SocialProvider.ZERNIO,
    );
    await this.replaceLegacyJsonAccounts(userId, []);
  }

  async findByAuthServerUserId(
    authServerUserId: string,
  ): Promise<UserRecord | null> {
    return this.users.findByAuthServerUserId(authServerUserId);
  }

  async setZernioProfileId(userId: string, profileId: string): Promise<void> {
    const updated = await this.users.update(userId, {
      zernioProfileId: profileId,
    });
    if (!updated) {
      throw new NotFoundException(`User ${userId} not found`);
    }
  }

  async setZernioConnectedAccount(
    userId: string,
    platform: string,
    accountId: string,
  ): Promise<void> {
    const key = normalizeChannelKey(platform);
    const normalizedAccountId = accountId.trim();
    if (!key) {
      throw new BadRequestException('platform is required');
    }
    if (!normalizedAccountId) {
      throw new BadRequestException('accountId is required');
    }

    const user = await this.findByUserId(userId);
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    const now = new Date();
    await this.socialAccounts.upsertActive({
      userId,
      provider: SocialProvider.ZERNIO,
      channel: key,
      externalAccountId: normalizedAccountId,
      connectedAt: now,
      lastSyncedAt: now,
    });

    const accounts = await this.getZernioConnectedAccounts(userId);
    await this.replaceLegacyJsonAccounts(userId, accounts);
  }

  async syncZernioConnectedAccounts(
    userId: string,
    accounts: Array<{
      channel: string;
      accountId: string;
      connectedAt?: Date;
    }>,
  ): Promise<void> {
    const user = await this.findByUserId(userId);
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    // Merge semantics (same as legacy JSON sync): upsert returned accounts,
    // do not disconnect channels absent from this payload.
    const now = new Date();
    for (const item of accounts) {
      const channel = normalizeChannelKey(item.channel);
      const externalAccountId = item.accountId?.trim() ?? '';
      if (!channel || !externalAccountId) continue;
      await this.socialAccounts.upsertActive({
        userId,
        provider: SocialProvider.ZERNIO,
        channel,
        externalAccountId,
        connectedAt: item.connectedAt ?? now,
        lastSyncedAt: now,
      });
    }

    const rows = await this.socialAccounts.findActiveByUserAndProvider(
      userId,
      SocialProvider.ZERNIO,
    );
    const connected =
      rows.length > 0
        ? rows.map(toConnectedAccountRecord)
        : normalizeZernioConnectedAccountsJson(
            user.zernioConnectedAccounts,
            userId,
          );
    await this.replaceLegacyJsonAccounts(userId, connected);
  }

  async getZernioConnectedAccounts(
    userId: string,
  ): Promise<ConnectedAccountRecord[]> {
    const user = await this.findByUserId(userId);
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    const rows = await this.socialAccounts.findActiveByUserAndProvider(
      userId,
      SocialProvider.ZERNIO,
    );
    if (rows.length > 0) {
      return rows.map(toConnectedAccountRecord);
    }

    // If the table already has rows for this user (e.g. all disconnected),
    // do not resurrect stale JSON. Only fall back when never migrated.
    if (await this.socialAccounts.hasAnyForUser(userId)) {
      return [];
    }

    return normalizeZernioConnectedAccountsJson(
      user.zernioConnectedAccounts,
      userId,
    );
  }

  async disconnectZernioConnectedAccount(
    userId: string,
    channel: string,
  ): Promise<void> {
    const key = normalizeChannelKey(channel);
    if (!key) {
      throw new BadRequestException('channel is required');
    }
    const user = await this.findByUserId(userId);
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    await this.socialAccounts.markDisconnected(
      userId,
      SocialProvider.ZERNIO,
      key,
    );

    const remaining = await this.getZernioConnectedAccounts(userId);
    await this.replaceLegacyJsonAccounts(userId, remaining);
  }

  async getZernioPublishContext(userId: string): Promise<{
    profileId: string;
    accounts: Record<string, string>;
  }> {
    const user = await this.findByUserId(userId);
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
    const profileId = user.zernioProfileId?.trim();
    if (!profileId) {
      throw new BadRequestException(
        'Zernio profile missing; connect a social account first',
      );
    }

    const normalized = await this.getZernioConnectedAccounts(userId);
    const accounts = normalized.reduce<Record<string, string>>((acc, item) => {
      acc[item.channel] = item.accountId;
      return acc;
    }, {});

    return {
      profileId,
      accounts,
    };
  }

  /** Dual-write: keep legacy JSON in sync for rollback / admin tools. */
  private async replaceLegacyJsonAccounts(
    userId: string,
    accounts: ConnectedAccountRecord[],
  ): Promise<void> {
    const updated = await this.users.update(userId, {
      zernioConnectedAccounts: accounts.map(
        ({ channel, accountId, connectedAt }) => ({
          channel,
          accountId,
          connectedAt,
        }),
      ),
    });
    if (!updated) {
      throw new NotFoundException(`User ${userId} not found`);
    }
  }
}
