import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type {
  AnalyticsRecord,
  IAnalyticsRepository,
} from '../interfaces/analytics.repository.interface';

@Injectable()
export class PrismaAnalyticsRepository implements IAnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByRuleRef(ruleRef: string): Promise<AnalyticsRecord | null> {
    return this.prisma.analytics.findUnique({ where: { ruleRef } });
  }

  upsert(
    ruleRef: string,
    data: Prisma.AnalyticsCreateInput,
  ): Promise<AnalyticsRecord> {
    return this.prisma.analytics.upsert({
      where: { ruleRef },
      create: data,
      update: {
        period: data.period,
        pulledAt: data.pulledAt,
        contentPerformance: data.contentPerformance,
        campaignSummary: data.campaignSummary,
        feedbackSignal: data.feedbackSignal,
      },
    });
  }
}
