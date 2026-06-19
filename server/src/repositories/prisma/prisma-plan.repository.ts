import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { PlanRecord } from '../../domain/plans/plan.types';
import type { IPlanRepository } from '../interfaces/plan.repository.interface';

@Injectable()
export class PrismaPlanRepository implements IPlanRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByPlanId(planId: string): Promise<PlanRecord | null> {
    return this.prisma.plan.findUnique({ where: { planId } });
  }

  findByName(name: string): Promise<PlanRecord | null> {
    return this.prisma.plan.findFirst({ where: { name } });
  }

  findActiveByLowestPrice(): Promise<PlanRecord | null> {
    return this.prisma.plan.findFirst({
      where: { isActive: true },
      orderBy: { priceThb: 'asc' },
    });
  }

  findAllSortedByPrice(): Promise<PlanRecord[]> {
    return this.prisma.plan.findMany({ orderBy: { priceThb: 'asc' } });
  }

  findManyByPlanIds(planIds: string[]): Promise<PlanRecord[]> {
    return this.prisma.plan.findMany({
      where: { planId: { in: planIds } },
    });
  }

  create(data: Prisma.PlanCreateInput): Promise<PlanRecord> {
    return this.prisma.plan.create({ data });
  }

  async update(
    planId: string,
    data: Prisma.PlanUpdateInput,
  ): Promise<PlanRecord | null> {
    try {
      return await this.prisma.plan.update({ where: { planId }, data });
    } catch {
      return null;
    }
  }

  async countActiveUsersByPlan(): Promise<Map<string, number>> {
    const rows = await this.prisma.userPlan.groupBy({
      by: ['planId'],
      where: { status: 'active' },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.planId, r._count._all]));
  }
}
