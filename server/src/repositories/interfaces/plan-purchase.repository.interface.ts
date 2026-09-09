import type { PlanPurchaseStatus, Prisma } from '@prisma/client';
import type { PlanPurchaseRecord } from '../../domain/plans/plan-purchase.types';

export interface IPlanPurchaseRepository {
  create(data: Prisma.PlanPurchaseCreateInput): Promise<PlanPurchaseRecord>;
  findByTransactionId(
    transactionId: string,
  ): Promise<PlanPurchaseRecord | null>;
  findPendingByUserId(userId: string): Promise<PlanPurchaseRecord | null>;
  /** All purchases for a user, newest first — small per-user volume, no pagination needed at this layer. */
  findByUserId(userId: string): Promise<PlanPurchaseRecord[]>;
  findActiveForUserAndPeriod(
    userId: string,
    billingPeriod: Date,
  ): Promise<PlanPurchaseRecord | null>;
  hasPurchaseHistory(userId: string): Promise<boolean>;
  updateStatus(
    planPurchaseId: string,
    status: PlanPurchaseStatus,
  ): Promise<PlanPurchaseRecord | null>;
}
