import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { WhatsAppConnectionRecord } from '../domain/users/whatsapp-metadata.types';

/**
 * Contact-only WhatsApp identity mapping (not a publish SocialAccount).
 */
@Injectable()
export class WhatsAppConnectionService {
  constructor(private readonly prisma: PrismaService) {}

  findByUserId(userId: string): Promise<WhatsAppConnectionRecord | null> {
    return this.prisma.whatsAppConnection.findUnique({
      where: { userId: userId.trim() },
    });
  }

  findByWhatsappWaId(
    whatsappWaId: string,
  ): Promise<WhatsAppConnectionRecord | null> {
    const id = whatsappWaId.trim();
    if (!id) return Promise.resolve(null);
    return this.prisma.whatsAppConnection.findUnique({
      where: { whatsappWaId: id },
    });
  }

  async upsert(
    userId: string,
    whatsappWaId: string,
  ): Promise<WhatsAppConnectionRecord> {
    const uid = userId.trim();
    const tid = whatsappWaId.trim();
    const now = new Date();

    const byWa = await this.findByWhatsappWaId(tid);
    if (byWa && byWa.userId !== uid) {
      await this.prisma.whatsAppConnection.delete({ where: { id: byWa.id } });
    }

    return this.prisma.whatsAppConnection.upsert({
      where: { userId: uid },
      create: {
        userId: uid,
        whatsappWaId: tid,
        connectedAt: now,
      },
      update: {
        whatsappWaId: tid,
        connectedAt: now,
      },
    });
  }

  async disconnectByUserId(userId: string): Promise<void> {
    await this.prisma.whatsAppConnection
      .delete({ where: { userId: userId.trim() } })
      .catch(() => undefined);
  }

  async disconnectByWhatsappWaId(whatsappWaId: string): Promise<void> {
    const id = whatsappWaId.trim();
    if (!id) return;
    await this.prisma.whatsAppConnection
      .delete({ where: { whatsappWaId: id } })
      .catch(() => undefined);
  }

  async listAllWhatsappWaIds(): Promise<string[]> {
    const rows = await this.prisma.whatsAppConnection.findMany({
      select: { whatsappWaId: true },
      orderBy: { connectedAt: 'asc' },
    });
    return rows.map((row) => row.whatsappWaId);
  }

  async listForAdmin(args: {
    page: number;
    limit: number;
    search?: string;
  }): Promise<{
    rows: Array<{
      id: string;
      userId: string;
      whatsappWaId: string;
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
              whatsappWaId: { contains: q, mode: 'insensitive' as const },
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
      this.prisma.whatsAppConnection.findMany({
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
      this.prisma.whatsAppConnection.count({ where }),
    ]);

    return {
      total,
      rows: rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        whatsappWaId: row.whatsappWaId,
        connectedAt: row.connectedAt,
        email: row.user.email,
        username: row.user.username,
        firstName: row.user.firstName,
        lastName: row.user.lastName,
      })),
    };
  }
}
