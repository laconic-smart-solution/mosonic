import type { Prisma, UserPlanStatus } from '@prisma/client';
import type { UserPlanRecord } from '../../domain/plans/plan.types';

export interface IUserPlanRepository {
  findActiveByUserId(userId: string): Promise<UserPlanRecord | null>;
  existsActiveForUser(userId: string): Promise<boolean>;
  findActiveByPlanId(
    planId: string,
    page: number,
    limit: number,
  ): Promise<{ rows: UserPlanRecord[]; total: number }>;
  findAllActive(): Promise<UserPlanRecord[]>;
  findActiveByUserIds(userIds: string[]): Promise<UserPlanRecord[]>;
  suspendOtherActivePlans(userId: string, keepPlanId: string): Promise<void>;
  upsertActivePlan(data: {
    userId: string;
    planId: string;
    creditsPerMonth: number;
    billingPeriod: Date;
    creditsRemaining: number;
  }): Promise<UserPlanRecord>;
  updateManyActive(
    updates: Array<{
      id: string;
      creditsPerMonth: number;
      creditsRemaining: number;
      billingPeriod: Date;
    }>,
  ): Promise<void>;
  deleteByUserId(userId: string): Promise<void>;
  reassignUserId(fromUserId: string, toUserId: string): Promise<void>;
  updateStatus(userId: string, status: UserPlanStatus): Promise<void>;
  create(data: Prisma.UserPlanCreateInput): Promise<UserPlanRecord>;
  adjustActiveCredits(
    userId: string,
    delta: {
      creditsUsed?: number;
      creditsRemaining?: number;
      clearLowBalanceNotified?: boolean;
    },
  ): Promise<UserPlanRecord | null>;
  markLowBalanceNotified(userPlanId: string): Promise<void>;
}
