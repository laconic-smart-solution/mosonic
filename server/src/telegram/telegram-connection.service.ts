import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { TelegramConnectionRecord } from '../domain/users/telegram-metadata.types';

/**
 * Contact-only Telegram identity mapping (not a publish SocialAccount).
 */
@Injectable()
export class TelegramConnectionService {
  constructor(private readonly prisma: PrismaService) {}

  findByUserId(userId: string): Promise<TelegramConnectionRecord | null> {
    return this.prisma.telegramConnection.findUnique({
      where: { userId: userId.trim() },
    });
  }

  findByTelegramChatId(
    telegramChatId: string,
  ): Promise<TelegramConnectionRecord | null> {
    const id = telegramChatId.trim();
    if (!id) return Promise.resolve(null);
    return this.prisma.telegramConnection.findUnique({
      where: { telegramChatId: id },
    });
  }

  async upsert(
    userId: string,
    telegramChatId: string,
  ): Promise<TelegramConnectionRecord> {
    const uid = userId.trim();
    const tid = telegramChatId.trim();
    const now = new Date();

    const byChat = await this.findByTelegramChatId(tid);
    if (byChat && byChat.userId !== uid) {
      await this.prisma.telegramConnection.delete({ where: { id: byChat.id } });
    }

    return this.prisma.telegramConnection.upsert({
      where: { userId: uid },
      create: {
        userId: uid,
        telegramChatId: tid,
        connectedAt: now,
      },
      update: {
        telegramChatId: tid,
        connectedAt: now,
      },
    });
  }

  async disconnectByUserId(userId: string): Promise<void> {
    await this.prisma.telegramConnection
      .delete({ where: { userId: userId.trim() } })
      .catch(() => undefined);
  }

  async disconnectByTelegramChatId(telegramChatId: string): Promise<void> {
    const id = telegramChatId.trim();
    if (!id) return;
    await this.prisma.telegramConnection
      .delete({ where: { telegramChatId: id } })
      .catch(() => undefined);
  }

  async listAllTelegramChatIds(): Promise<string[]> {
    const rows = await this.prisma.telegramConnection.findMany({
      select: { telegramChatId: true },
      orderBy: { connectedAt: 'asc' },
    });
    return rows.map((row) => row.telegramChatId);
  }

  async listForAdmin(args: {
    page: number;
    limit: number;
    search?: string;
  }): Promise<{
    rows: Array<{
      id: string;
      userId: string;
      telegramChatId: string;
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
              telegramChatId: { contains: q, mode: 'insensitive' as const },
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
      this.prisma.telegramConnection.findMany({
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
      this.prisma.telegramConnection.count({ where }),
    ]);

    return {
      total,
      rows: rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        telegramChatId: row.telegramChatId,
        connectedAt: row.connectedAt,
        email: row.user.email,
        username: row.user.username,
        firstName: row.user.firstName,
        lastName: row.user.lastName,
      })),
    };
  }
}
