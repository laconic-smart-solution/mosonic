import { PrismaClient } from '@prisma/client';
import { currentBillingPeriod } from '../src/credit/lib/billing-period.util';
import { DEFAULT_PLANS } from '../src/plan/plan-defaults';
import type { PlanRecord } from '../src/domain/plans/plan.types';

const prisma = new PrismaClient();

function creditsForPlan(plan: Pick<PlanRecord, 'priceUsd' | 'creditsOverride'>): number {
  if (plan.creditsOverride != null && plan.creditsOverride >= 0) {
    return Math.floor(plan.creditsOverride);
  }
  const creditPriceUsd = 0.01;
  return Math.floor(plan.priceUsd / creditPriceUsd);
}

async function seedDefaultPlans(): Promise<void> {
  for (const seed of DEFAULT_PLANS) {
    const existing = await prisma.plan.findFirst({ where: { name: seed.name } });
    if (existing) continue;
    await prisma.plan.create({ data: { ...seed, isActive: true } });
    console.log(`Seeded plan: ${seed.name}`);
  }
}

async function assignFreePlans(): Promise<void> {
  const freePlan = await prisma.plan.findFirst({
    where: { name: 'Free', isActive: true },
    orderBy: { priceThb: 'asc' },
  });
  if (!freePlan) {
    console.warn('Free plan missing — skip user plan backfill');
    return;
  }

  const credits = creditsForPlan(freePlan);
  const billingPeriod = currentBillingPeriod();
  const users = await prisma.user.findMany({ select: { userId: true } });

  for (const { userId } of users) {
    const hasActive = await prisma.userPlan.findFirst({
      where: { userId, status: 'active' },
      select: { id: true },
    });
    if (hasActive) continue;

    await prisma.userPlan.create({
      data: {
        userId,
        planId: freePlan.planId,
        creditsPerMonth: credits,
        billingPeriod,
        creditsUsed: 0,
        creditsRemaining: credits,
        status: 'active',
      },
    });
  }
}

async function main(): Promise<void> {
  await seedDefaultPlans();
  await assignFreePlans();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
