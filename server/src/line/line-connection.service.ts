import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { LineConnectionRecord } from '../domain/users/line-metadata.types';

/**
 * Contact-only LINE identity mapping (not a publish SocialAccount).
 */
@Injectable()
export class LineConnectionService {
  constructor(private readonly prisma: PrismaService) {}

  findByUserId(userId: string): Promise<LineConnectionRecord | null> {
    return this.prisma.lineConnection.findUnique({
      where: { userId: userId.trim() },
    });
  }

  findByLineUserId(lineUserId: string): Promise<LineConnectionRecord | null> {
    const id = lineUserId.trim();
    if (!id) return Promise.resolve(null);
    return this.prisma.lineConnection.findUnique({
      where: { lineUserId: id },
    });
  }

  async upsert(
    userId: string,
    lineUserId: string,
  ): Promise<LineConnectionRecord> {
    const uid = userId.trim();
    const lid = lineUserId.trim();
    const now = new Date();

    // If this LINE id was linked to another Mosonic user, clear that row first.
    const byLine = await this.findByLineUserId(lid);
    if (byLine && byLine.userId !== uid) {
      await this.prisma.lineConnection.delete({ where: { id: byLine.id } });
    }

    return this.prisma.lineConnection.upsert({
      where: { userId: uid },
      create: {
        userId: uid,
        lineUserId: lid,
        connectedAt: now,
      },
      update: {
        lineUserId: lid,
        connectedAt: now,
      },
    });
  }

  async disconnectByUserId(userId: string): Promise<void> {
    await this.prisma.lineConnection
      .delete({ where: { userId: userId.trim() } })
      .catch(() => undefined);
  }

  async disconnectByLineUserId(lineUserId: string): Promise<void> {
    const id = lineUserId.trim();
    if (!id) return;
    await this.prisma.lineConnection
      .delete({ where: { lineUserId: id } })
      .catch(() => undefined);
  }

  async listAllLineUserIds(): Promise<string[]> {
    const rows = await this.prisma.lineConnection.findMany({
      select: { lineUserId: true },
      orderBy: { connectedAt: 'asc' },
    });
    return rows.map((row) => row.lineUserId);
  }

  async listForAdmin(args: {
    page: number;
    limit: number;
    search?: string;
  }): Promise<{
    rows: Array<{
      id: string;
      userId: string;
      lineUserId: string;
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
            { lineUserId: { contains: q, mode: 'insensitive' as const } },
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
      this.prisma.lineConnection.findMany({
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
      this.prisma.lineConnection.count({ where }),
    ]);

    return {
      total,
      rows: rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        lineUserId: row.lineUserId,
        connectedAt: row.connectedAt,
        email: row.user.email,
        username: row.user.username,
        firstName: row.user.firstName,
        lastName: row.user.lastName,
      })),
    };
  }
}
