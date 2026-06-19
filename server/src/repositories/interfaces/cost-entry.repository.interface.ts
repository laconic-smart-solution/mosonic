import type { Prisma } from '@prisma/client';
import type { CostEntry } from '@prisma/client';

export type CostEntryRecord = CostEntry;

export interface ICostEntryRepository {
  create(data: Prisma.CostEntryCreateInput): Promise<CostEntryRecord>;
  findByUser(
    userId: string,
    filter?: { createdAt?: { gte?: Date; lte?: Date }; campaignRef?: string },
  ): Promise<CostEntryRecord[]>;
  findByPipeline(pipelineRef: string): Promise<CostEntryRecord[]>;
  existsMonthlyZernioRow(
    userId: string,
    pipelineRef: string,
    billingPeriod: Date,
  ): Promise<boolean>;
  aggregateSummary(
    match: Prisma.CostEntryWhereInput,
  ): Promise<CostEntryRecord[]>;
  sumForPipeline(pipelineRef: string): Promise<number>;
  sumMonthlyForUser(userId: string, billingPeriod: Date): Promise<number>;
  findInCreatedAtRange(from: Date, to: Date): Promise<CostEntryRecord[]>;
  findInCreatedAtRangeByProvider(
    provider: string,
    from: Date,
    to: Date,
  ): Promise<CostEntryRecord[]>;
  sumForBillingPeriod(billingPeriod: Date): Promise<number>;
  sumForUsersInBillingPeriod(
    userIds: string[],
    billingPeriod: Date,
  ): Promise<Map<string, number>>;
  sumForPipelines(pipelineRefs: string[]): Promise<Map<string, number>>;
}
