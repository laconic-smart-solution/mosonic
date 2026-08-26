import type { Prisma } from '@prisma/client';
import type { NodeCreditPriceRecord } from '../../domain/credit/credit.types';

export interface INodeCreditPriceRepository {
  findLegacyMissingCostUsd(): Promise<NodeCreditPriceRecord[]>;
  findByNodeType(nodeType: string): Promise<NodeCreditPriceRecord | null>;
  findActiveByNodeType(nodeType: string): Promise<NodeCreditPriceRecord | null>;
  listByNodeTypes(nodeTypes: string[]): Promise<NodeCreditPriceRecord[]>;
  create(
    data: Prisma.NodeCreditPriceCreateInput,
  ): Promise<NodeCreditPriceRecord>;
  upsertByNodeType(
    nodeType: string,
    costUsd: number,
  ): Promise<NodeCreditPriceRecord>;
  updateSocialUnlockLegacy(
    nodeType: string,
    legacyCostUsd: number,
    nextCostUsd: number,
  ): Promise<void>;
  setActiveByNodeType(nodeType: string, isActive: boolean): Promise<void>;
  migrateLegacyRow(nodeType: string, costUsd: number): Promise<void>;
}
