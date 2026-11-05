import type { Prisma, RuleMemoryType } from '@prisma/client';
import type { TenancyAuth } from '../../auth/tenancy.types';

export type RuleMemoryRecord = {
  ruleMemoryId: string;
  ruleId: string;
  userId: string | null;
  type: RuleMemoryType;
  body: string;
  embedding: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export interface IRuleMemoryRepository {
  findById(
    ruleMemoryId: string,
    auth?: TenancyAuth,
  ): Promise<RuleMemoryRecord | null>;
  findByRuleId(
    ruleId: string,
    auth?: TenancyAuth,
    limit?: number,
  ): Promise<RuleMemoryRecord[]>;
  create(data: Prisma.RuleMemoryCreateInput): Promise<RuleMemoryRecord>;
  deleteById(ruleMemoryId: string, auth?: TenancyAuth): Promise<boolean>;
}
