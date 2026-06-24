import type { CreditTopupPurchaseStatus, Prisma } from '@prisma/client';
import type { CreditTopupPurchaseRecord } from '../../domain/credit/credit.types';

export interface ICreditTopupPurchaseRepository {
  create(
    data: Prisma.CreditTopupPurchaseCreateInput,
  ): Promise<CreditTopupPurchaseRecord>;
  findByTransactionId(
    transactionId: string,
  ): Promise<CreditTopupPurchaseRecord | null>;
  updateStatus(
    topupPurchaseId: string,
    status: CreditTopupPurchaseStatus,
  ): Promise<CreditTopupPurchaseRecord | null>;
}
