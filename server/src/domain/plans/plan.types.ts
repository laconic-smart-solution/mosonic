import type {
  Plan as PrismaPlan,
  UserPlan as PrismaUserPlan,
  UserPlanStatus,
} from '@prisma/client';

export { UserPlanStatus };

export type PlanRecord = PrismaPlan;
export type UserPlanRecord = PrismaUserPlan;
