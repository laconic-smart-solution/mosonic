import type { Prisma } from '@prisma/client';
import type { PlanRecord } from '../../domain/plans/plan.types';

export interface IPlanRepository {
  findByPlanId(planId: string): Promise<PlanRecord | null>;
  findByName(name: string): Promise<PlanRecord | null>;
  findActiveByLowestPrice(): Promise<PlanRecord | null>;
  findAllSortedByPrice(): Promise<PlanRecord[]>;
  findManyByPlanIds(planIds: string[]): Promise<PlanRecord[]>;
  create(data: Prisma.PlanCreateInput): Promise<PlanRecord>;
  update(planId: string, data: Prisma.PlanUpdateInput): Promise<PlanRecord | null>;
  countActiveUsersByPlan(): Promise<Map<string, number>>;
}
