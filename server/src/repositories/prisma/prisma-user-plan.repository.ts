import { Injectable } from '@nestjs/common';
import type { Prisma, UserPlanStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { UserPlanRecord } from '../../domain/plans/plan.types';
import type { IUserPlanRepository } from '../interfaces/user-plan.repository.interface';

@Injectable()
export class PrismaUserPlanRepository implements IUserPlanRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveByUserId(userId: string): Promise<UserPlanRecord | null> {
    return this.prisma.userPlan.findFirst({
      where: { userId, status: 'active' },
    });
  }

  existsActiveForUser(userId: string): Promise<boolean> {
    return this.prisma.userPlan
      .findFirst({
        where: { userId, status: 'active' },
        select: { id: true },
      })
      .then(Boolean);
  }

  async findActiveByPlanId(
    planId: string,
    page: number,
    limit: number,
  ): Promise<{ rows: UserPlanRecord[]; total: number }> {
    const where = { planId, status: 'active' as const };
    const [rows, total] = await Promise.all([
      this.prisma.userPlan.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.userPlan.count({ where }),
    ]);
    return { rows, total };
  }

  findAllActive(): Promise<UserPlanRecord[]> {
    return this.prisma.userPlan.findMany({ where: { status: 'active' } });
  }

  findActiveByUserIds(userIds: string[]): Promise<UserPlanRecord[]> {
    return this.prisma.userPlan.findMany({
      where: { userId: { in: userIds }, status: 'active' },
    });
  }

  suspendOtherActivePlans(userId: string, keepPlanId: string): Promise<void> {
    return this.prisma.userPlan
      .updateMany({
        where: {
          userId,
          status: 'active',
          planId: { not: keepPlanId },
        },
        data: { status: 'suspended' },
      })
      .then(() => undefined);
  }

  async upsertActivePlan(data: {
    userId: string;
    planId: string;
    creditsPerMonth: number;
    billingPeriod: Date;
    creditsRemaining: number;
  }): Promise<UserPlanRecord> {
    const existing = await this.findActiveByUserId(data.userId);
    if (existing) {
      return this.prisma.userPlan.update({
        where: { id: existing.id },
        data: {
          planId: data.planId,
          creditsPerMonth: data.creditsPerMonth,
          billingPeriod: data.billingPeriod,
          creditsUsed: 0,
          creditsRemaining: data.creditsRemaining,
          status: 'active',
          lowBalanceNotifiedAt: null,
        },
      });
    }
    return this.prisma.userPlan.create({
      data: {
        userId: data.userId,
        planId: data.planId,
        creditsPerMonth: data.creditsPerMonth,
        billingPeriod: data.billingPeriod,
        creditsUsed: 0,
        creditsRemaining: data.creditsRemaining,
        status: 'active',
      },
    });
  }

  async updateManyActive(
    updates: Array<{
      id: string;
      creditsPerMonth: number;
      creditsRemaining: number;
      billingPeriod: Date;
    }>,
  ): Promise<void> {
    await this.prisma.$transaction(
      updates.map((u) =>
        this.prisma.userPlan.update({
          where: { id: u.id },
          data: {
            creditsPerMonth: u.creditsPerMonth,
            creditsUsed: 0,
            creditsRemaining: u.creditsRemaining,
            billingPeriod: u.billingPeriod,
            lowBalanceNotifiedAt: null,
          },
        }),
      ),
    );
  }

  deleteByUserId(userId: string): Promise<void> {
    return this.prisma.userPlan
      .deleteMany({ where: { userId } })
      .then(() => undefined);
  }

  reassignUserId(fromUserId: string, toUserId: string): Promise<void> {
    return this.prisma.userPlan
      .updateMany({ where: { userId: fromUserId }, data: { userId: toUserId } })
      .then(() => undefined);
  }

  updateStatus(userId: string, status: UserPlanStatus): Promise<void> {
    return this.prisma.userPlan
      .updateMany({ where: { userId }, data: { status } })
      .then(() => undefined);
  }

  create(data: Prisma.UserPlanCreateInput): Promise<UserPlanRecord> {
    return this.prisma.userPlan.create({ data });
  }

  async adjustActiveCredits(
    userId: string,
    delta: {
      creditsUsed?: number;
      creditsRemaining?: number;
      clearLowBalanceNotified?: boolean;
    },
  ): Promise<UserPlanRecord | null> {
    const existing = await this.findActiveByUserId(userId);
    if (!existing) return null;
    return this.prisma.userPlan.update({
      where: { id: existing.id },
      data: {
        ...(delta.creditsUsed !== undefined
          ? { creditsUsed: { increment: delta.creditsUsed } }
          : {}),
        ...(delta.creditsRemaining !== undefined
          ? { creditsRemaining: { increment: delta.creditsRemaining } }
          : {}),
        ...(delta.clearLowBalanceNotified
          ? { lowBalanceNotifiedAt: null }
          : {}),
      },
    });
  }

  async debitActiveCreditsIfSufficient(
    userId: string,
    amount: number,
  ): Promise<UserPlanRecord | null> {
    const debit = Math.max(0, Math.floor(amount));
    if (debit <= 0) {
      return this.findActiveByUserId(userId);
    }

    const result = await this.prisma.userPlan.updateMany({
      where: {
        userId: userId.trim(),
        status: 'active',
        creditsRemaining: { gte: debit },
      },
      data: {
        creditsRemaining: { decrement: debit },
        creditsUsed: { increment: debit },
      },
    });

    if (result.count === 0) return null;
    return this.findActiveByUserId(userId);
  }

  markLowBalanceNotified(userPlanId: string): Promise<void> {
    return this.prisma.userPlan
      .update({
        where: { id: userPlanId },
        data: { lowBalanceNotifiedAt: new Date() },
      })
      .then(() => undefined);
  }
}
