import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { SOCIAL_ACCOUNT_CONNECT_NODE_TYPE } from '../../credit/lib/billable-node-credit-types';
import { PrismaService } from '../../database/prisma.service';
import type { CreditLedgerRecord } from '../../domain/credit/credit.types';
import type {
  ICreditLedgerRepository,
  LedgerDateFilter,
} from '../interfaces/credit-ledger.repository.interface';

@Injectable()
export class PrismaCreditLedgerRepository implements ICreditLedgerRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.CreditLedgerCreateInput): Promise<CreditLedgerRecord> {
    return this.prisma.creditLedger.create({ data });
  }

  insertMany(data: Prisma.CreditLedgerCreateManyInput[]): Promise<void> {
    return this.prisma.creditLedger.createMany({ data }).then(() => undefined);
  }

  findByUserAndBillingPeriod(
    userId: string,
    billingPeriod: Date,
  ): Promise<CreditLedgerRecord[]> {
    return this.prisma.creditLedger.findMany({
      where: { userId, billingPeriod },
    });
  }

  findForContentUsage(
    userId: string,
    contentIds: string[],
    pipelineRefs: string[],
  ) {
    return this.prisma.creditLedger.findMany({
      where: {
        userId,
        OR: [
          { contentRef: { in: contentIds } },
          { pipelineRef: { in: pipelineRefs } },
        ],
      },
      select: {
        contentRef: true,
        pipelineRef: true,
        creditsCharged: true,
        nodeId: true,
        nodeType: true,
      },
    });
  }

  async findUserHistory(
    userId: string,
    filter: LedgerDateFilter & { nodeType?: string },
    page: number,
    limit: number,
  ): Promise<{ rows: CreditLedgerRecord[]; total: number }> {
    const where: Prisma.CreditLedgerWhereInput = {
      userId,
      ...filter,
      ...(filter.nodeType ? { nodeType: filter.nodeType } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.creditLedger.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.creditLedger.count({ where }),
    ]);
    return { rows, total };
  }

  async findAdminHistory(
    filter: LedgerDateFilter & {
      userId?: string;
      nodeType?: string;
      provider?: string;
    },
    page: number,
    limit: number,
  ): Promise<{ rows: CreditLedgerRecord[]; total: number }> {
    const where: Prisma.CreditLedgerWhereInput = { ...filter };
    const [rows, total] = await Promise.all([
      this.prisma.creditLedger.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.creditLedger.count({ where }),
    ]);
    return { rows, total };
  }

  findAdminSummary(
    filter: LedgerDateFilter & { userId?: string },
  ): Promise<CreditLedgerRecord[]> {
    return this.prisma.creditLedger.findMany({ where: filter });
  }

  async hasUserSocialChannelUnlock(
    userId: string,
    nodeIds: string[],
  ): Promise<boolean> {
    if (nodeIds.length === 0) return false;
    const count = await this.prisma.creditLedger.count({
      where: {
        userId,
        nodeType: SOCIAL_ACCOUNT_CONNECT_NODE_TYPE,
        nodeId: { in: nodeIds },
      },
    });
    return count > 0;
  }

  async listUserSocialChannelUnlocks(userId: string): Promise<string[]> {
    const rows = await this.prisma.creditLedger.findMany({
      where: {
        userId,
        nodeType: SOCIAL_ACCOUNT_CONNECT_NODE_TYPE,
        nodeId: { startsWith: 'social:' },
      },
      select: { nodeId: true },
      distinct: ['nodeId'],
    });
    return rows
      .map((row) =>
        row.nodeId
          .replace(/^social:/, '')
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean);
  }
}
