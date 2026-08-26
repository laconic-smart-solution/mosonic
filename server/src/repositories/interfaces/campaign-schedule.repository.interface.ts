import type { Prisma } from '@prisma/client';
import type { TenancyAuth } from '../../auth/tenancy.types';
import type { CampaignSchedule } from '@prisma/client';

export type CampaignScheduleRecord = CampaignSchedule;

export interface ICampaignScheduleRepository {
  findByRule(
    ruleRef: string,
    auth?: TenancyAuth,
  ): Promise<CampaignScheduleRecord | null>;
  create(
    data: Prisma.CampaignScheduleCreateInput,
  ): Promise<CampaignScheduleRecord>;
  save(schedule: CampaignScheduleRecord): Promise<CampaignScheduleRecord>;
  listUpcoming(
    auth: TenancyAuth,
    limit: number,
  ): Promise<CampaignScheduleRecord[]>;
  findDue(now: Date, limit: number): Promise<CampaignScheduleRecord[]>;
}
