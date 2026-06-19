import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { type SsoTokenClaims } from '../auth/auth.types';
import {
  UserRole,
  UserStatus,
  type UserRecord,
} from '../domain/users/user.types';
import { PlanService } from '../plan/plan.service';
import type { IUserRepository } from '../repositories/interfaces/user.repository.interface';
import { isUniqueViolation } from '../repositories/prisma/prisma.util';
import { USER_REPOSITORY } from '../repositories/tokens';

export type ConnectedAccountRecord = {
  userId: string;
  channel: string;
  accountId: string;
  connectedAt: Date;
};

@Injectable()
export class UsersService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
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
   * Users with at least one Zernio-connected social account (for monthly cost allocation).
   */
  async listUserIdsWithZernioConnectedAccounts(): Promise<
    Array<{ userId: string; accountCount: number }>
  > {
    const rows = await this.users.listWithZernioAccounts();

    const out: Array<{ userId: string; accountCount: number }> = [];
    for (const row of rows) {
      const userId = typeof row.userId === 'string' ? row.userId : '';
      if (!userId) continue;
      const count = this.normalizeConnectedAccounts(
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
    const key = this.normalizeChannel(platform);
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
    const accounts = this.normalizeConnectedAccounts(
      user.zernioConnectedAccounts,
      userId,
    );
    const next = accounts.filter((acc) => acc.channel !== key);
    next.push({
      userId,
      channel: key,
      accountId: normalizedAccountId,
      connectedAt: now,
    });
    await this.replaceZernioConnectedAccounts(userId, next);
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
    const byChannel = new Map<string, ConnectedAccountRecord>();
    for (const item of this.normalizeConnectedAccounts(
      user.zernioConnectedAccounts,
      userId,
    )) {
      byChannel.set(item.channel, item);
    }
    for (const item of accounts) {
      const channel = this.normalizeChannel(item.channel);
      const accountId = item.accountId?.trim();
      if (!channel || !accountId) continue;
      byChannel.set(channel, {
        userId,
        channel,
        accountId,
        connectedAt: item.connectedAt ?? new Date(),
      });
    }
    await this.replaceZernioConnectedAccounts(
      userId,
      Array.from(byChannel.values()),
    );
  }

  async getZernioConnectedAccounts(
    userId: string,
  ): Promise<ConnectedAccountRecord[]> {
    const user = await this.findByUserId(userId);
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
    return this.normalizeConnectedAccounts(user.zernioConnectedAccounts, userId);
  }

  async disconnectZernioConnectedAccount(
    userId: string,
    channel: string,
  ): Promise<void> {
    const key = this.normalizeChannel(channel);
    if (!key) {
      throw new BadRequestException('channel is required');
    }
    const user = await this.findByUserId(userId);
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
    const next = this.normalizeConnectedAccounts(
      user.zernioConnectedAccounts,
      userId,
    ).filter((acc) => acc.channel !== key);
    await this.replaceZernioConnectedAccounts(userId, next);
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
    const normalized = this.normalizeConnectedAccounts(
      user.zernioConnectedAccounts,
      userId,
    );
    const accounts = normalized.reduce<Record<string, string>>((acc, item) => {
      acc[item.channel] = item.accountId;
      return acc;
    }, {});

    return {
      profileId,
      accounts,
    };
  }

  private async replaceZernioConnectedAccounts(
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

  private normalizeConnectedAccounts(
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
        const channel = this.normalizeChannel(rec.channel ?? '');
        const accountId = rec.accountId?.trim();
        if (!channel || !accountId) continue;
        normalized.push({
          userId: rec.userId?.trim() || userId,
          channel,
          accountId,
          connectedAt: this.toDate(rec.connectedAt),
        });
      }
      return normalized;
    }

    if (raw && typeof raw === 'object') {
      return Object.entries(raw as Record<string, unknown>)
        .map(([channel, accountId]) => ({
          userId,
          channel: this.normalizeChannel(channel),
          accountId:
            typeof accountId === 'string' ? accountId.trim() : '',
          connectedAt: new Date(),
        }))
        .filter((item) => Boolean(item.channel && item.accountId));
    }

    return [];
  }

  private normalizeChannel(input: string): string {
    return input.trim().toLowerCase();
  }

  private toDate(value: Date | string | undefined): Date {
    if (value instanceof Date) return value;
    if (typeof value === 'string') {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return new Date();
  }
}
