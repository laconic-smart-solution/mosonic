import type { Prisma } from '@prisma/client';
import type { CreditLedgerRecord } from '../../domain/credit/credit.types';

export type LedgerDateFilter = {
  createdAt?: { gte?: Date; lte?: Date };
};

export interface ICreditLedgerRepository {
  create(data: Prisma.CreditLedgerCreateInput): Promise<CreditLedgerRecord>;
  insertMany(data: Prisma.CreditLedgerCreateManyInput[]): Promise<void>;
  findByUserAndBillingPeriod(
    userId: string,
    billingPeriod: Date,
  ): Promise<CreditLedgerRecord[]>;
  findForContentUsage(
    userId: string,
    contentIds: string[],
    pipelineRefs: string[],
  ): Promise<
    Array<
      Pick<
        CreditLedgerRecord,
        'contentRef' | 'pipelineRef' | 'creditsCharged' | 'nodeId' | 'nodeType'
      >
    >
  >;
  findUserHistory(
    userId: string,
    filter: LedgerDateFilter & { nodeType?: string },
    page: number,
    limit: number,
  ): Promise<{ rows: CreditLedgerRecord[]; total: number }>;
  findAdminHistory(
    filter: LedgerDateFilter & {
      userId?: string;
      nodeType?: string;
      provider?: string;
    },
    page: number,
    limit: number,
  ): Promise<{ rows: CreditLedgerRecord[]; total: number }>;
  findAdminSummary(
    filter: LedgerDateFilter & { userId?: string },
  ): Promise<CreditLedgerRecord[]>;
}
