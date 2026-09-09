import { Injectable } from '@nestjs/common';
import type { PlanPurchaseStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { PlanPurchaseRecord } from '../../domain/plans/plan-purchase.types';
import type { IPlanPurchaseRepository } from '../interfaces/plan-purchase.repository.interface';

@Injectable()
export class PrismaPlanPurchaseRepository implements IPlanPurchaseRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.PlanPurchaseCreateInput): Promise<PlanPurchaseRecord> {
    return this.prisma.planPurchase.create({ data });
  }

  findByTransactionId(
    transactionId: string,
  ): Promise<PlanPurchaseRecord | null> {
    return this.prisma.planPurchase.findUnique({
      where: { transactionId },
    });
  }

  findPendingByUserId(userId: string): Promise<PlanPurchaseRecord | null> {
    return this.prisma.planPurchase.findFirst({
      where: { userId, status: 'pending' },
      orderBy: { purchaseDate: 'desc' },
    });
  }

  findByUserId(userId: string): Promise<PlanPurchaseRecord[]> {
    return this.prisma.planPurchase.findMany({
      where: { userId },
      orderBy: { purchaseDate: 'desc' },
    });
  }

  findActiveForUserAndPeriod(
    userId: string,
    billingPeriod: Date,
  ): Promise<PlanPurchaseRecord | null> {
    return this.prisma.planPurchase.findFirst({
      where: {
        userId,
        status: 'active',
        billingPeriod,
      },
      orderBy: { purchaseDate: 'desc' },
    });
  }

  async hasPurchaseHistory(userId: string): Promise<boolean> {
    const count = await this.prisma.planPurchase.count({
      where: { userId, status: 'active' },
    });
    return count > 0;
  }

  async updateStatus(
    planPurchaseId: string,
    status: PlanPurchaseStatus,
  ): Promise<PlanPurchaseRecord | null> {
    try {
      return await this.prisma.planPurchase.update({
        where: { planPurchaseId },
        data: { status },
      });
    } catch {
      return null;
    }
  }
}
