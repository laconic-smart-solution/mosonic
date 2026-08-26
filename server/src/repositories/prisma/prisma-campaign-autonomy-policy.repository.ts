import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { TenancyAuth } from '../../auth/tenancy.types';
import { PrismaService } from '../../database/prisma.service';
import type {
  CampaignAutonomyPolicyRecord,
  ICampaignAutonomyPolicyRepository,
} from '../interfaces/campaign-autonomy-policy.repository.interface';
import { mergeTenancyWhere } from './prisma.util';

@Injectable()
export class PrismaCampaignAutonomyPolicyRepository implements ICampaignAutonomyPolicyRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByRuleRef(ruleRef: string): Promise<CampaignAutonomyPolicyRecord | null> {
    return this.prisma.campaignAutonomyPolicy.findUnique({
      where: { ruleRef },
    });
  }

  findByRuleRefScoped(
    ruleRef: string,
    auth: TenancyAuth,
  ): Promise<CampaignAutonomyPolicyRecord | null> {
    return this.prisma.campaignAutonomyPolicy.findFirst({
      where: mergeTenancyWhere({ ruleRef }, auth),
    });
  }

  upsert(
    ruleRef: string,
    userId: string,
    data: Omit<Prisma.CampaignAutonomyPolicyCreateInput, 'ruleRef' | 'userId'>,
  ): Promise<CampaignAutonomyPolicyRecord> {
    return this.prisma.campaignAutonomyPolicy.upsert({
      where: { ruleRef },
      create: { ruleRef, userId, ...data },
      update: data,
    });
  }
}
