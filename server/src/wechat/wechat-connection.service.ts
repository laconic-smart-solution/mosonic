import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { WechatConnectionRecord } from '../domain/users/wechat-metadata.types';

/**
 * Contact-only WeChat Official Account identity mapping (not a publish SocialAccount).
 */
@Injectable()
export class WechatConnectionService {
  constructor(private readonly prisma: PrismaService) {}

  findByUserId(userId: string): Promise<WechatConnectionRecord | null> {
    return this.prisma.wechatConnection.findUnique({
      where: { userId: userId.trim() },
    });
  }

  findByWechatOpenId(
    wechatOpenId: string,
  ): Promise<WechatConnectionRecord | null> {
    const id = wechatOpenId.trim();
    if (!id) return Promise.resolve(null);
    return this.prisma.wechatConnection.findUnique({
      where: { wechatOpenId: id },
    });
  }

  async upsert(
    userId: string,
    wechatOpenId: string,
  ): Promise<WechatConnectionRecord> {
    const uid = userId.trim();
    const oid = wechatOpenId.trim();
    const now = new Date();

    const byOpenId = await this.findByWechatOpenId(oid);
    if (byOpenId && byOpenId.userId !== uid) {
      await this.prisma.wechatConnection.delete({ where: { id: byOpenId.id } });
    }

    return this.prisma.wechatConnection.upsert({
      where: { userId: uid },
      create: {
        userId: uid,
        wechatOpenId: oid,
        connectedAt: now,
      },
      update: {
        wechatOpenId: oid,
        connectedAt: now,
      },
    });
  }

  async disconnectByUserId(userId: string): Promise<void> {
    await this.prisma.wechatConnection
      .delete({ where: { userId: userId.trim() } })
      .catch(() => undefined);
  }

  async disconnectByWechatOpenId(wechatOpenId: string): Promise<void> {
    const id = wechatOpenId.trim();
    if (!id) return;
    await this.prisma.wechatConnection
      .delete({ where: { wechatOpenId: id } })
      .catch(() => undefined);
  }

  async listAllWechatOpenIds(): Promise<string[]> {
    const rows = await this.prisma.wechatConnection.findMany({
      select: { wechatOpenId: true },
      orderBy: { connectedAt: 'asc' },
    });
    return rows.map((row) => row.wechatOpenId);
  }

  async listForAdmin(args: {
    page: number;
    limit: number;
    search?: string;
  }): Promise<{
    rows: Array<{
      id: string;
      userId: string;
      wechatOpenId: string;
      connectedAt: Date;
      email: string | null;
      username: string | null;
      firstName: string | null;
      lastName: string | null;
    }>;
    total: number;
  }> {
    const page = Math.max(1, args.page);
    const limit = Math.min(100, Math.max(1, args.limit));
    const q = args.search?.trim();

    const where = q
      ? {
          OR: [
            {
              wechatOpenId: { contains: q, mode: 'insensitive' as const },
            },
            { user: { email: { contains: q, mode: 'insensitive' as const } } },
            {
              user: { username: { contains: q, mode: 'insensitive' as const } },
            },
            {
              user: {
                firstName: { contains: q, mode: 'insensitive' as const },
              },
            },
            {
              user: { lastName: { contains: q, mode: 'insensitive' as const } },
            },
          ],
        }
      : {};

    const [rows, total] = await Promise.all([
      this.prisma.wechatConnection.findMany({
        where,
        include: {
          user: {
            select: {
              email: true,
              username: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { connectedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.wechatConnection.count({ where }),
    ]);

    return {
      total,
      rows: rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        wechatOpenId: row.wechatOpenId,
        connectedAt: row.connectedAt,
        email: row.user.email,
        username: row.user.username,
        firstName: row.user.firstName,
        lastName: row.user.lastName,
      })),
    };
  }
}
