import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { ViberConnectionRecord } from '../domain/users/viber-metadata.types';

/**
 * Contact-only Viber identity mapping (not a publish SocialAccount).
 */
@Injectable()
export class ViberConnectionService {
  constructor(private readonly prisma: PrismaService) {}

  findByUserId(userId: string): Promise<ViberConnectionRecord | null> {
    return this.prisma.viberConnection.findUnique({
      where: { userId: userId.trim() },
    });
  }

  findByViberUserId(
    viberUserId: string,
  ): Promise<ViberConnectionRecord | null> {
    const id = viberUserId.trim();
    if (!id) return Promise.resolve(null);
    return this.prisma.viberConnection.findUnique({
      where: { viberUserId: id },
    });
  }

  async upsert(
    userId: string,
    viberUserId: string,
  ): Promise<ViberConnectionRecord> {
    const uid = userId.trim();
    const tid = viberUserId.trim();
    const now = new Date();

    const byChat = await this.findByViberUserId(tid);
    if (byChat && byChat.userId !== uid) {
      await this.prisma.viberConnection.delete({ where: { id: byChat.id } });
    }

    return this.prisma.viberConnection.upsert({
      where: { userId: uid },
      create: {
        userId: uid,
        viberUserId: tid,
        connectedAt: now,
      },
      update: {
        viberUserId: tid,
        connectedAt: now,
      },
    });
  }

  async disconnectByUserId(userId: string): Promise<void> {
    await this.prisma.viberConnection
      .delete({ where: { userId: userId.trim() } })
      .catch(() => undefined);
  }

  async disconnectByViberUserId(viberUserId: string): Promise<void> {
    const id = viberUserId.trim();
    if (!id) return;
    await this.prisma.viberConnection
      .delete({ where: { viberUserId: id } })
      .catch(() => undefined);
  }

  async listAllViberUserIds(): Promise<string[]> {
    const rows = await this.prisma.viberConnection.findMany({
      select: { viberUserId: true },
      orderBy: { connectedAt: 'asc' },
    });
    return rows.map((row) => row.viberUserId);
  }

  async listForAdmin(args: {
    page: number;
    limit: number;
    search?: string;
  }): Promise<{
    rows: Array<{
      id: string;
      userId: string;
      viberUserId: string;
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
              viberUserId: { contains: q, mode: 'insensitive' as const },
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
      this.prisma.viberConnection.findMany({
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
      this.prisma.viberConnection.count({ where }),
    ]);

    return {
      total,
      rows: rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        viberUserId: row.viberUserId,
        connectedAt: row.connectedAt,
        email: row.user.email,
        username: row.user.username,
        firstName: row.user.firstName,
        lastName: row.user.lastName,
      })),
    };
  }
}
