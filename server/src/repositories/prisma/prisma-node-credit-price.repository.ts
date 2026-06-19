import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { NodeCreditPriceRecord } from '../../domain/credit/credit.types';
import type { INodeCreditPriceRepository } from '../interfaces/node-credit-price.repository.interface';

@Injectable()
export class PrismaNodeCreditPriceRepository implements INodeCreditPriceRepository {
  constructor(private readonly prisma: PrismaService) {}

  findLegacyMissingCostUsd(): Promise<NodeCreditPriceRecord[]> {
    return this.prisma.nodeCreditPrice.findMany({
      where: { OR: [{ costUsd: { equals: 0 } }] },
    });
  }

  findByNodeType(nodeType: string): Promise<NodeCreditPriceRecord | null> {
    return this.prisma.nodeCreditPrice.findUnique({ where: { nodeType } });
  }

  findActiveByNodeType(nodeType: string): Promise<NodeCreditPriceRecord | null> {
    return this.prisma.nodeCreditPrice.findFirst({
      where: { nodeType, isActive: true },
    });
  }

  listByNodeTypes(nodeTypes: string[]): Promise<NodeCreditPriceRecord[]> {
    return this.prisma.nodeCreditPrice.findMany({
      where: { nodeType: { in: nodeTypes } },
      orderBy: { nodeType: 'asc' },
    });
  }

  create(data: Prisma.NodeCreditPriceCreateInput): Promise<NodeCreditPriceRecord> {
    return this.prisma.nodeCreditPrice.create({ data });
  }

  upsertByNodeType(
    nodeType: string,
    costUsd: number,
  ): Promise<NodeCreditPriceRecord> {
    return this.prisma.nodeCreditPrice.upsert({
      where: { nodeType },
      create: { nodeType, costUsd, isActive: true },
      update: { costUsd, isActive: true },
    });
  }

  updateSocialUnlockLegacy(
    nodeType: string,
    legacyCostUsd: number,
    nextCostUsd: number,
  ): Promise<void> {
    return this.prisma.nodeCreditPrice
      .updateMany({
        where: { nodeType, costUsd: legacyCostUsd },
        data: { costUsd: nextCostUsd, isActive: true },
      })
      .then(() => undefined);
  }

  migrateLegacyRow(nodeType: string, costUsd: number): Promise<void> {
    return this.prisma.nodeCreditPrice
      .upsert({
        where: { nodeType },
        create: { nodeType, costUsd, isActive: true },
        update: { costUsd, isActive: true },
      })
      .then(() => undefined);
  }
}
