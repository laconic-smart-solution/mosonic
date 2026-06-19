/**
 * Bootstrap PostgreSQL: seed default plans and assign the Free plan to users
 * without an active subscription.
 *
 * Run from `server/`:
 *   yarn migrate:bootstrap-db
 *   yarn migrate:bootstrap-db -- --dry-run
 *   yarn migrate:bootstrap-db -- --plans-only
 *
 * Requires DATABASE_URL in `.env` or the environment.
 * Apply schema first with `npx prisma migrate deploy` (or `prisma db push` in dev).
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { currentBillingPeriod } from '../src/credit/lib/billing-period.util';
import { DEFAULT_PLANS } from '../src/plan/plan-defaults';
import type { PlanRecord } from '../src/domain/plans/plan.types';

type BootstrapOptions = {
  dryRun: boolean;
  plansOnly: boolean;
};

function parseArgs(): BootstrapOptions {
  const argv = process.argv.slice(2);
  return {
    dryRun: argv.includes('--dry-run'),
    plansOnly: argv.includes('--plans-only'),
  };
}

function creditsForPlan(plan: Pick<PlanRecord, 'priceUsd' | 'creditsOverride'>): number {
  if (plan.creditsOverride != null && plan.creditsOverride >= 0) {
    return Math.floor(plan.creditsOverride);
  }
  const creditPriceUsd = 0.01;
  if (creditPriceUsd <= 0) return 0;
  return Math.floor(plan.priceUsd / creditPriceUsd);
}

async function seedDefaultPlans(
  prisma: PrismaClient,
  dryRun: boolean,
): Promise<number> {
  let created = 0;
  for (const seed of DEFAULT_PLANS) {
    const existing = await prisma.plan.findFirst({ where: { name: seed.name } });
    if (existing) continue;

    if (dryRun) {
      console.log(`[dry-run] would seed plan: ${seed.name}`);
      created += 1;
      continue;
    }

    await prisma.plan.create({ data: { ...seed, isActive: true } });
    console.log(`Seeded plan: ${seed.name}`);
    created += 1;
  }
  return created;
}

async function assignFreePlanToUsers(
  prisma: PrismaClient,
  dryRun: boolean,
): Promise<number> {
  const freePlan = await prisma.plan.findFirst({
    where: { name: 'Free', isActive: true },
    orderBy: { priceThb: 'asc' },
  });

  if (!freePlan) {
    if (dryRun) {
      const users = await prisma.user.findMany({ select: { userId: true } });
      let assigned = 0;
      for (const row of users) {
        const userId = row.userId.trim();
        if (!userId) continue;
        const hasActivePlan = await prisma.userPlan.findFirst({
          where: { userId, status: 'active' },
          select: { id: true },
        });
        if (hasActivePlan) continue;
        console.log(`[dry-run] would assign Free plan to userId=${userId}`);
        assigned += 1;
      }
      return assigned;
    }
    throw new Error('Free plan not found after seeding — check plans table');
  }

  const credits = creditsForPlan(freePlan);
  const billingPeriod = currentBillingPeriod();
  const users = await prisma.user.findMany({ select: { userId: true } });

  let assigned = 0;
  for (const row of users) {
    const userId = row.userId.trim();
    if (!userId) continue;

    const hasActivePlan = await prisma.userPlan.findFirst({
      where: { userId, status: 'active' },
      select: { id: true },
    });
    if (hasActivePlan) continue;

    if (dryRun) {
      console.log(`[dry-run] would assign Free plan to userId=${userId}`);
      assigned += 1;
      continue;
    }

    await prisma.userPlan.updateMany({
      where: {
        userId,
        status: 'active',
        planId: { not: freePlan.planId },
      },
      data: { status: 'suspended' },
    });

    const existing = await prisma.userPlan.findFirst({
      where: { userId, status: 'active' },
    });

    if (existing) {
      await prisma.userPlan.update({
        where: { id: existing.id },
        data: {
          planId: freePlan.planId,
          creditsPerMonth: credits,
          billingPeriod,
          creditsUsed: 0,
          creditsRemaining: credits,
          status: 'active',
          lowBalanceNotifiedAt: null,
        },
      });
    } else {
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

    console.log(`Assigned Free plan to userId=${userId} (${credits} credits)`);
    assigned += 1;
  }

  return assigned;
}

async function main(): Promise<void> {
  const options = parseArgs();
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }

  console.log('Connecting to PostgreSQL');
  if (options.dryRun) {
    console.log('Dry run — no writes will be performed');
  }

  const prisma = new PrismaClient();
  try {
    console.log('\n--- Default plans ---');
    const seededPlans = await seedDefaultPlans(prisma, options.dryRun);
    console.log(
      seededPlans === 0
        ? 'All default plans already exist'
        : `Created ${seededPlans} plan(s)`,
    );

    if (!options.plansOnly) {
      console.log('\n--- Free plan assignment ---');
      const assigned = await assignFreePlanToUsers(prisma, options.dryRun);
      console.log(
        assigned === 0
          ? 'Every user already has an active plan'
          : `Assigned Free plan to ${assigned} user(s)`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log('\nDone');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
