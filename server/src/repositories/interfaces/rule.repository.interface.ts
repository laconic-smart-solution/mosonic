import type { Prisma, RuleStatus } from '@prisma/client';
import type { TenancyAuth } from '../../auth/tenancy.types';

export type RuleRecord = {
  ruleId: string;
  userId: string | null;
  name: string;
  brand: unknown;
  audience: unknown;
  campaign: unknown;
  channels: unknown;
  contentGuidelines: unknown;
  originalInput: unknown;
  intake: unknown;
  status: RuleStatus;
  versions: unknown;
  approvalPolicy: unknown;
  autonomyPolicy: unknown;
  newsTrigger: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export interface IRuleRepository {
  findById(ruleId: string, auth?: TenancyAuth): Promise<RuleRecord | null>;
  findByIds(ruleIds: string[]): Promise<RuleRecord[]>;
  findPage(
    filter: Prisma.RuleWhereInput,
    page: number,
    limit: number,
    sortBy: string,
    sortOrder: 'asc' | 'desc',
  ): Promise<{ rows: RuleRecord[]; total: number }>;
  count(where: Prisma.RuleWhereInput): Promise<number>;
  create(data: Prisma.RuleCreateInput): Promise<RuleRecord>;
  updateById(
    ruleId: string,
    data: Prisma.RuleUpdateInput,
    auth?: TenancyAuth,
  ): Promise<RuleRecord | null>;
  updateNewsTrigger(
    ruleId: string,
    newsTrigger: Prisma.InputJsonValue,
    auth?: TenancyAuth,
  ): Promise<RuleRecord | null>;
  appendVersion(
    ruleId: string,
    data: Prisma.RuleUpdateInput,
    versionEntry: unknown,
    auth?: TenancyAuth,
  ): Promise<RuleRecord | null>;
  findNewsTriggerEligible(isMorning: boolean): Promise<RuleRecord[]>;
  findNewsTriggerGroupEligible(
    country: string,
    language: string,
    category: string,
  ): Promise<RuleRecord[]>;
}
