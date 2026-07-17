import { Injectable } from '@nestjs/common';
import type { AnnouncementLevel, AnnouncementStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { AnnouncementRecord } from '../../domain/announcements/announcement.types';
import type { IAnnouncementRepository } from '../interfaces/announcement.repository.interface';

@Injectable()
export class PrismaAnnouncementRepository implements IAnnouncementRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: {
    title: string;
    message: string;
    level: AnnouncementLevel;
    sendInApp: boolean;
    sendLine: boolean;
    createdBy: string;
  }): Promise<AnnouncementRecord> {
    return this.prisma.announcement.create({ data });
  }

  updateDelivery(
    id: string,
    data: {
      status?: AnnouncementStatus;
      inAppRecipientCount?: number;
      lineTotal?: number;
      lineSent?: number;
      lineFailed?: number;
      lineFailedIds?: string[];
    },
  ): Promise<AnnouncementRecord> {
    return this.prisma.announcement.update({ where: { id }, data });
  }

  findById(id: string): Promise<AnnouncementRecord | null> {
    return this.prisma.announcement.findUnique({ where: { id } });
  }

  async list(
    page: number,
    limit: number,
  ): Promise<{ rows: AnnouncementRecord[]; total: number }> {
    const [rows, total] = await Promise.all([
      this.prisma.announcement.findMany({
        orderBy: { publishedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.announcement.count(),
    ]);
    return { rows, total };
  }

  async listPublished(
    page: number,
    limit: number,
  ): Promise<{ rows: AnnouncementRecord[]; total: number }> {
    const where = { status: 'published' as const };
    const [rows, total] = await Promise.all([
      this.prisma.announcement.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.announcement.count({ where }),
    ]);
    return { rows, total };
  }

  findLatestPublished(): Promise<AnnouncementRecord | null> {
    return this.prisma.announcement.findFirst({
      where: { status: 'published' },
      orderBy: { publishedAt: 'desc' },
    });
  }
}
