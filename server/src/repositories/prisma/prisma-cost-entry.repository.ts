import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type {
  CostEntryRecord,
  ICostEntryRepository,
} from '../interfaces/cost-entry.repository.interface';

@Injectable()
export class PrismaCostEntryRepository implements ICostEntryRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.CostEntryCreateInput): Promise<CostEntryRecord> {
    return this.prisma.costEntry.create({ data });
  }

  findByUser(
    userId: string,
    filter?: { createdAt?: { gte?: Date; lte?: Date }; campaignRef?: string },
  ): Promise<CostEntryRecord[]> {
    return this.prisma.costEntry.findMany({
      where: {
        userId,
        ...(filter?.createdAt ? { createdAt: filter.createdAt } : {}),
        ...(filter?.campaignRef ? { campaignRef: filter.campaignRef } : {}),
      },
    });
  }

  findByPipeline(pipelineRef: string): Promise<CostEntryRecord[]> {
    return this.prisma.costEntry.findMany({ where: { pipelineRef } });
  }

  async existsMonthlyZernioRow(
    userId: string,
    pipelineRef: string,
    billingPeriod: Date,
  ): Promise<boolean> {
    const row = await this.prisma.costEntry.findFirst({
      where: { userId, pipelineRef, billingPeriod },
      select: { id: true },
    });
    return Boolean(row);
  }

  aggregateSummary(
    match: Prisma.CostEntryWhereInput,
  ): Promise<CostEntryRecord[]> {
    return this.prisma.costEntry.findMany({ where: match });
  }

  async sumForPipeline(pipelineRef: string): Promise<number> {
    const result = await this.prisma.costEntry.aggregate({
      where: { pipelineRef },
      _sum: { costUsd: true },
    });
    return result._sum.costUsd ?? 0;
  }

  async sumMonthlyForUser(
    userId: string,
    billingPeriod: Date,
  ): Promise<number> {
    const result = await this.prisma.costEntry.aggregate({
      where: { userId, billingPeriod },
      _sum: { costUsd: true },
    });
    return result._sum.costUsd ?? 0;
  }

  findInCreatedAtRange(from: Date, to: Date): Promise<CostEntryRecord[]> {
    return this.prisma.costEntry.findMany({
      where: { createdAt: { gte: from, lte: to } },
    });
  }

  findInCreatedAtRangeByProvider(
    provider: string,
    from: Date,
    to: Date,
  ): Promise<CostEntryRecord[]> {
    return this.prisma.costEntry.findMany({
      where: { provider, createdAt: { gte: from, lte: to } },
    });
  }

  async sumForBillingPeriod(billingPeriod: Date): Promise<number> {
    const result = await this.prisma.costEntry.aggregate({
      where: { billingPeriod },
      _sum: { costUsd: true },
    });
    return result._sum.costUsd ?? 0;
  }

  async sumForUsersInBillingPeriod(
    userIds: string[],
    billingPeriod: Date,
  ): Promise<Map<string, number>> {
    const rows = await this.prisma.costEntry.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds }, billingPeriod },
      _sum: { costUsd: true },
    });
    const out = new Map<string, number>();
    for (const row of rows) {
      out.set(row.userId, row._sum.costUsd ?? 0);
    }
    return out;
  }

  async sumForPipelines(
    pipelineRefs: string[],
  ): Promise<Map<string, number>> {
    const rows = await this.prisma.costEntry.groupBy({
      by: ['pipelineRef'],
      where: { pipelineRef: { in: pipelineRefs } },
      _sum: { costUsd: true },
    });
    const out = new Map<string, number>();
    for (const row of rows) {
      if (row.pipelineRef) {
        out.set(row.pipelineRef, row._sum.costUsd ?? 0);
      }
    }
    return out;
  }
}
