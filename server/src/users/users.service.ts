import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { type SsoTokenClaims } from '../auth/auth.types';
import { PlanService } from '../plan/plan.service';
import {
  User,
  type UserDocument,
  UserRole,
  UserStatus,
} from './schemas/user.schema';

export type ConnectedAccountRecord = {
  channel: string;
  accountId: string;
  connectedAt: Date;
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-insensitive exact match for a string field. */
function caseInsensitiveExact(value: string): RegExp {
  return new RegExp(`^${escapeRegex(value)}$`, 'i');
}

function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: number }).code === 11000
  );
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
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
  }): Promise<User> {
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

    // 1) Primary lookup by the SSO id.
    let existing = await this.userModel.findOne({ authServerUserId }).exec();

    // 2) Fallback: the SSO id can rotate between logins, so match an existing
    //    account by email/username to avoid creating a duplicate user.
    if (!existing) {
      const or: Array<Record<string, unknown>> = [];
      if (email) or.push({ email: caseInsensitiveExact(email) });
      if (username) or.push({ username: caseInsensitiveExact(username) });
      if (or.length > 0) {
        existing = await this.userModel
          .findOne({ $or: or })
          .sort({ createdAt: 1 })
          .exec();
      }
    }

    if (existing) {
      // Adopt the current SSO id (it may have changed since last login).
      existing.authServerUserId = authServerUserId;
      // Do not overwrite role/status from SSO.
      existing.email = email ?? existing.email;
      existing.username = username ?? existing.username;
      existing.firstName = firstName ?? existing.firstName;
      existing.lastName = lastName ?? existing.lastName;
      existing.lastLoginAt = now;
      try {
        return await existing.save();
      } catch (err) {
        // Another concurrent request may already own this authServerUserId.
        if (isDuplicateKeyError(err)) {
          const winner = await this.userModel
            .findOne({ authServerUserId })
            .exec();
          if (winner) return winner;
        }
        throw err;
      }
    }

    try {
      const user = await this.userModel.create({
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
      // Concurrent first-request race: re-read the row that won.
      if (isDuplicateKeyError(err)) {
        const winner = await this.userModel
          .findOne({ authServerUserId })
          .exec();
        if (winner) return winner;
      }
      throw err;
    }
  }

  async findByUserId(userId: string): Promise<User | null> {
    return this.userModel.findOne({ userId }).exec();
  }

  /**
   * Users with at least one Zernio-connected social account (for monthly cost allocation).
   */
  async listUserIdsWithZernioConnectedAccounts(): Promise<
    Array<{ userId: string; accountCount: number }>
  > {
    const users = await this.userModel
      .find({})
      .select({ userId: 1, zernioConnectedAccounts: 1 })
      .lean()
      .exec();

    const out: Array<{ userId: string; accountCount: number }> = [];
    for (const row of users) {
      const userId = typeof row.userId === 'string' ? row.userId : '';
      if (!userId) continue;
      const count = this.normalizeConnectedAccounts(
        row.zernioConnectedAccounts,
      ).length;
      if (count > 0) {
        out.push({ userId, accountCount: count });
      }
    }
    return out;
  }

  async findByZernioProfileId(profileId: string): Promise<User | null> {
    const id = profileId.trim();
    if (!id) {
      return null;
    }
    return this.userModel.findOne({ zernioProfileId: id }).exec();
  }

  async findByAuthServerUserId(authServerUserId: string): Promise<User | null> {
    return this.userModel.findOne({ authServerUserId }).exec();
  }

  async setZernioProfileId(userId: string, profileId: string): Promise<void> {
    const result = await this.userModel
      .updateOne({ userId }, { $set: { zernioProfileId: profileId } })
      .exec();
    if (result.matchedCount === 0) {
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
    );
    const next = accounts.filter((acc) => acc.channel !== key);
    next.push({
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
    for (const item of this.normalizeConnectedAccounts(user.zernioConnectedAccounts)) {
      byChannel.set(item.channel, item);
    }
    for (const item of accounts) {
      const channel = this.normalizeChannel(item.channel);
      const accountId = item.accountId?.trim();
      if (!channel || !accountId) continue;
      byChannel.set(channel, {
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
    return this.normalizeConnectedAccounts(user.zernioConnectedAccounts);
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
    const result = await this.userModel
      .updateOne(
        { userId },
        {
          $set: {
            zernioConnectedAccounts: accounts,
          },
        },
      )
      .exec();
    if (result.matchedCount === 0) {
      throw new NotFoundException(`User ${userId} not found`);
    }
  }

  private normalizeConnectedAccounts(raw: unknown): ConnectedAccountRecord[] {
    if (Array.isArray(raw)) {
      const normalized: ConnectedAccountRecord[] = [];
      for (const item of raw) {
        if (!item || typeof item !== 'object') continue;
        const rec = item as {
          channel?: string;
          accountId?: string;
          connectedAt?: Date | string;
        };
        const channel = this.normalizeChannel(rec.channel ?? '');
        const accountId = rec.accountId?.trim();
        if (!channel || !accountId) continue;
        normalized.push({
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
