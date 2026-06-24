import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { TenancyAuth } from '../../auth/tenancy.types';
import { PrismaService } from '../../database/prisma.service';
import type {
  CampaignScheduleRecord,
  ICampaignScheduleRepository,
} from '../interfaces/campaign-schedule.repository.interface';
import { mergeTenancyWhere } from './prisma.util';

@Injectable()
export class PrismaCampaignScheduleRepository
  implements ICampaignScheduleRepository
{
  constructor(private readonly prisma: PrismaService) {}

  findByRule(
    ruleRef: string,
    auth?: TenancyAuth,
  ): Promise<CampaignScheduleRecord | null> {
    const where = auth
      ? mergeTenancyWhere({ ruleRef }, auth)
      : { ruleRef };
    return this.prisma.campaignSchedule.findFirst({ where });
  }

  create(
    data: Prisma.CampaignScheduleCreateInput,
  ): Promise<CampaignScheduleRecord> {
    return this.prisma.campaignSchedule.create({ data });
  }

  save(schedule: CampaignScheduleRecord): Promise<CampaignScheduleRecord> {
    return this.prisma.campaignSchedule.update({
      where: { scheduleId: schedule.scheduleId },
      data: {
        enabled: schedule.enabled,
        workflowTemplateId: schedule.workflowTemplateId,
        workflowRef: schedule.workflowRef,
        contentPromptStrategy: schedule.contentPromptStrategy,
        contentPrompts: schedule.contentPrompts,
        timezone: schedule.timezone,
        nextRunAt: schedule.nextRunAt,
        lastRunAt: schedule.lastRunAt,
        lastPipelineId: schedule.lastPipelineId,
        failureCount: schedule.failureCount,
      },
    });
  }

  listUpcoming(
    auth: TenancyAuth,
    limit: number,
  ): Promise<CampaignScheduleRecord[]> {
    return this.prisma.campaignSchedule.findMany({
      where: mergeTenancyWhere(
        { enabled: true, nextRunAt: { gte: new Date() } },
        auth,
      ),
      orderBy: { nextRunAt: 'asc' },
      take: limit,
    });
  }

  findDue(now: Date, limit: number): Promise<CampaignScheduleRecord[]> {
    return this.prisma.campaignSchedule.findMany({
      where: { enabled: true, nextRunAt: { lte: now } },
      orderBy: { nextRunAt: 'asc' },
      take: limit,
    });
  }
}
