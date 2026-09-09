import type { CreditTopupPurchaseStatus, Prisma } from '@prisma/client';
import type { CreditTopupPurchaseRecord } from '../../domain/credit/credit.types';

export interface ICreditTopupPurchaseRepository {
  create(
    data: Prisma.CreditTopupPurchaseCreateInput,
  ): Promise<CreditTopupPurchaseRecord>;
  findByTransactionId(
    transactionId: string,
  ): Promise<CreditTopupPurchaseRecord | null>;
  /** All purchases for a user, newest first — small per-user volume, no pagination needed at this layer. */
  findByUserId(userId: string): Promise<CreditTopupPurchaseRecord[]>;
  updateStatus(
    topupPurchaseId: string,
    status: CreditTopupPurchaseStatus,
  ): Promise<CreditTopupPurchaseRecord | null>;
}
