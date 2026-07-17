import { Injectable } from '@nestjs/common';
import type { Prisma, UserStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { UserRecord } from '../../domain/users/user.types';
import type { IUserRepository } from '../interfaces/user.repository.interface';

@Injectable()
export class PrismaUserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUserId(userId: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({ where: { userId } });
  }

  findByAuthServerUserId(authServerUserId: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({ where: { authServerUserId } });
  }

  findByZernioProfileId(profileId: string): Promise<UserRecord | null> {
    const id = profileId.trim();
    if (!id) return Promise.resolve(null);
    return this.prisma.user.findFirst({ where: { zernioProfileId: id } });
  }

  findOtherUserByZernioProfileId(
    profileId: string,
    excludeUserId: string,
  ): Promise<UserRecord | null> {
    const id = profileId.trim();
    if (!id) return Promise.resolve(null);
    return this.prisma.user.findFirst({
      where: { zernioProfileId: id, userId: { not: excludeUserId } },
    });
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
    const rows = await this.prisma.user.findMany({
      where: { zernioProfileId: { not: null } },
      select: {
        userId: true,
        zernioProfileId: true,
        createdAt: true,
        email: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const groups = new Map<
      string,
      Array<{ userId: string; createdAt: Date; email: string | null }>
    >();

    for (const row of rows) {
      const profileId = row.zernioProfileId?.trim();
      if (!profileId) continue;
      const bucket = groups.get(profileId) ?? [];
      bucket.push({
        userId: row.userId,
        createdAt: row.createdAt,
        email: row.email,
      });
      groups.set(profileId, bucket);
    }

    return Array.from(groups.entries())
      .filter(([, users]) => users.length > 1)
      .map(([profileId, users]) => ({ profileId, users }));
  }

  async findByEmailOrUsernameInsensitive(
    email?: string,
    username?: string,
  ): Promise<UserRecord | null> {
    const or: Prisma.UserWhereInput[] = [];
    if (email?.trim()) {
      or.push({ email: { equals: email.trim(), mode: 'insensitive' } });
    }
    if (username?.trim()) {
      or.push({
        username: { equals: username.trim(), mode: 'insensitive' },
      });
    }
    if (or.length === 0) return null;
    return this.prisma.user.findFirst({
      where: { OR: or },
      orderBy: { createdAt: 'asc' },
    });
  }

  create(data: Prisma.UserCreateInput): Promise<UserRecord> {
    return this.prisma.user.create({ data });
  }

  async update(
    userId: string,
    data: Prisma.UserUpdateInput,
  ): Promise<UserRecord | null> {
    try {
      return await this.prisma.user.update({ where: { userId }, data });
    } catch {
      return null;
    }
  }

  updateManyByAuthServerUserIds(
    authServerUserIds: string[],
    data: Prisma.UserUpdateManyMutationInput,
  ): Promise<number> {
    return this.prisma.user
      .updateMany({
        where: { authServerUserId: { in: authServerUserIds } },
        data,
      })
      .then((r) => r.count);
  }

  async deleteByUserId(userId: string): Promise<boolean> {
    try {
      await this.prisma.user.delete({ where: { userId } });
      return true;
    } catch {
      return false;
    }
  }

  async listAllUserIds(): Promise<string[]> {
    const rows = await this.prisma.user.findMany({ select: { userId: true } });
    return rows.map((r) => r.userId);
  }

  async listActiveUserIds(): Promise<string[]> {
    const rows = await this.prisma.user.findMany({
      where: { status: 'ACTIVE' },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }

  listWithZernioAccounts(): Promise<
    Array<Pick<UserRecord, 'userId' | 'zernioConnectedAccounts'>>
  > {
    return this.prisma.user.findMany({
      select: { userId: true, zernioConnectedAccounts: true },
    });
  }

  listForEmailDedupe(): Promise<
    Array<Pick<UserRecord, 'userId' | 'email' | 'createdAt'>>
  > {
    return this.prisma.user.findMany({
      where: { email: { not: null } },
      select: { userId: true, email: true, createdAt: true },
      orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }],
    });
  }

  findManyByUserIds(
    userIds: string[],
    select?: Prisma.UserSelect,
  ): Promise<UserRecord[]> {
    return this.prisma.user.findMany({
      where: { userId: { in: userIds } },
      ...(select ? { select } : {}),
    }) as Promise<UserRecord[]>;
  }

  async searchAdmin(
    query: string,
    page: number,
    limit: number,
  ): Promise<{ rows: UserRecord[]; total: number }> {
    const q = query.trim();
    const where: Prisma.UserWhereInput = q
      ? {
          OR: [
            { email: { contains: q, mode: 'insensitive' } },
            { username: { contains: q, mode: 'insensitive' } },
            { firstName: { contains: q, mode: 'insensitive' } },
            { lastName: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {};
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { rows, total };
  }

  async listAdmin(
    filter: { search?: string; status?: UserStatus },
    page: number,
    limit: number,
  ): Promise<{ rows: UserRecord[]; total: number }> {
    const where: Prisma.UserWhereInput = {};
    const q = filter.search?.trim();
    if (q) {
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { username: { contains: q, mode: 'insensitive' } },
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (filter.status) {
      where.status = filter.status;
    }
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { rows, total };
  }

  count(where: Prisma.UserWhereInput = {}): Promise<number> {
    return this.prisma.user.count({ where });
  }

  findCreatedSince(since: Date): Promise<Array<Pick<UserRecord, 'createdAt'>>> {
    return this.prisma.user.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true },
    });
  }
}
