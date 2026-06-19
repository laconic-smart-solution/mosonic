import type { Prisma } from '@prisma/client';
import type { CampaignAutonomyPolicy } from '@prisma/client';
import type { TenancyAuth } from '../../auth/tenancy.types';

export type CampaignAutonomyPolicyRecord = CampaignAutonomyPolicy;

export interface ICampaignAutonomyPolicyRepository {
  findByRuleRef(ruleRef: string): Promise<CampaignAutonomyPolicyRecord | null>;
  findByRuleRefScoped(
    ruleRef: string,
    auth: TenancyAuth,
  ): Promise<CampaignAutonomyPolicyRecord | null>;
  upsert(
    ruleRef: string,
    userId: string,
    data: Omit<Prisma.CampaignAutonomyPolicyCreateInput, 'ruleRef' | 'userId'>,
  ): Promise<CampaignAutonomyPolicyRecord>;
}
