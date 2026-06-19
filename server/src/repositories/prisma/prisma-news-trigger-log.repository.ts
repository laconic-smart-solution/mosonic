import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type {
  INewsTriggerLogRepository,
  NewsTriggerLogRecord,
} from '../interfaces/news-trigger-log.repository.interface';

@Injectable()
export class PrismaNewsTriggerLogRepository implements INewsTriggerLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    data: Prisma.NewsTriggerLogCreateInput,
  ): Promise<NewsTriggerLogRecord> {
    return this.prisma.newsTriggerLog.create({ data });
  }

  findByRunId(runId: string): Promise<NewsTriggerLogRecord | null> {
    return this.prisma.newsTriggerLog.findFirst({ where: { runId } });
  }

  findLatestByGroup(group: string): Promise<NewsTriggerLogRecord | null> {
    return this.prisma.newsTriggerLog.findFirst({
      where: { group },
      orderBy: { ranAt: 'desc' },
    });
  }

  async updateByRunId(
    runId: string,
    data: Prisma.NewsTriggerLogUpdateInput,
  ): Promise<NewsTriggerLogRecord | null> {
    const existing = await this.findByRunId(runId);
    if (!existing) return null;
    return this.prisma.newsTriggerLog.update({
      where: { id: existing.id },
      data,
    });
  }
}
