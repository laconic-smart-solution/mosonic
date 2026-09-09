import { PrismaClient } from '@prisma/client';
import { currentBillingPeriod } from '../src/credit/lib/billing-period.util';
import { DEFAULT_PLANS } from '../src/plan/plan-defaults';
import type { PlanRecord } from '../src/domain/plans/plan.types';
import { IMAGE_TEMPLATE_SEEDS } from './seed-data/image-templates.seed-data';
import { IMAGE_DESIGN_STYLE_SEEDS } from './seed-data/image-design-styles.seed-data';
import { SYSTEM_RULE_SEEDS } from './seed-data/system-rules.seed-data';

const prisma = new PrismaClient();

function creditsForPlan(
  plan: Pick<PlanRecord, 'priceUsd' | 'creditsOverride'>,
): number {
  if (plan.creditsOverride != null && plan.creditsOverride >= 0) {
    return Math.floor(plan.creditsOverride);
  }
  const creditPriceUsd = 0.01;
  return Math.floor(plan.priceUsd / creditPriceUsd);
}

async function seedDefaultPlans(): Promise<void> {
  for (const seed of DEFAULT_PLANS) {
    const existing = await prisma.plan.findFirst({
      where: { name: seed.name },
    });
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

async function seedImageTemplates(): Promise<void> {
  for (const seed of IMAGE_TEMPLATE_SEEDS) {
    await prisma.imageTemplate.upsert({
      where: { key: seed.key },
      create: seed,
      update: seed,
    });
  }
  console.log(`Seeded ${IMAGE_TEMPLATE_SEEDS.length} image templates`);
}

async function seedImageDesignStyles(): Promise<void> {
  for (const seed of IMAGE_DESIGN_STYLE_SEEDS) {
    await prisma.imageDesignStyle.upsert({
      where: { key: seed.key },
      create: seed,
      update: seed,
    });
  }
  console.log(`Seeded ${IMAGE_DESIGN_STYLE_SEEDS.length} image design styles`);
}

async function seedSystemRules(): Promise<void> {
  for (const seed of SYSTEM_RULE_SEEDS) {
    const { ruleId, name, isSystem, isTemplate, templateCategory, brand, audience, campaign, channels, contentGuidelines } = seed;
    const existing = await prisma.rule.findUnique({ where: { ruleId } });
    if (existing) {
      await prisma.rule.update({
        where: { ruleId },
        data: {
          name,
          isSystem,
          isTemplate,
          templateCategory,
          brand,
          audience,
          campaign: {
            ...campaign,
            duration: {
              startDate: new Date(campaign.duration.startDate),
              endDate: new Date(campaign.duration.endDate),
            },
          },
          channels,
          contentGuidelines,
        },
      });
    } else {
      await prisma.rule.create({
        data: {
          ruleId,
          userId: null,
          name,
          isSystem,
          isTemplate,
          templateCategory,
          brand,
          audience,
          campaign: {
            ...campaign,
            duration: {
              startDate: new Date(campaign.duration.startDate),
              endDate: new Date(campaign.duration.endDate),
            },
          },
          channels,
          contentGuidelines,
          originalInput: { type: 'seed' },
          status: 'active',
        },
      });
    }
  }
  console.log(`Seeded ${SYSTEM_RULE_SEEDS.length} system rule templates`);
}

async function main(): Promise<void> {
  await seedDefaultPlans();
  await assignFreePlans();
  await seedImageTemplates();
  await seedImageDesignStyles();
  await seedSystemRules();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
