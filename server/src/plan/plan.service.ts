import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CreditCalculationService } from '../credit/credit-calculation.service';
import { currentBillingPeriod } from '../credit/lib/billing-period.util';
import type { PlanRecord, UserPlanRecord } from '../domain/plans/plan.types';
import type { IPlanPurchaseRepository } from '../repositories/interfaces/plan-purchase.repository.interface';
import type { IPlanRepository } from '../repositories/interfaces/plan.repository.interface';
import type { IUserPlanRepository } from '../repositories/interfaces/user-plan.repository.interface';
import type { IUserRepository } from '../repositories/interfaces/user.repository.interface';
import {
  PLAN_PURCHASE_REPOSITORY,
  PLAN_REPOSITORY,
  USER_PLAN_REPOSITORY,
  USER_REPOSITORY,
} from '../repositories/tokens';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { PlanChannelAccessService } from './plan-channel-access.service';
import { DEFAULT_PLANS } from './plan-defaults';

@Injectable()
export class PlanService implements OnModuleInit {
  private readonly logger = new Logger(PlanService.name);

  constructor(
    @Inject(PLAN_REPOSITORY) private readonly plans: IPlanRepository,
    @Inject(USER_PLAN_REPOSITORY)
    private readonly userPlans: IUserPlanRepository,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(PLAN_PURCHASE_REPOSITORY)
    private readonly planPurchases: IPlanPurchaseRepository,
    private readonly calculation: CreditCalculationService,
    private readonly channelAccess: PlanChannelAccessService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.bootstrapDefaultPlans();
    await this.bootstrapExistingUsers();
  }

  async getCreditsForPlan(
    plan: Pick<PlanRecord, 'priceUsd' | 'creditsOverride'>,
  ): Promise<number> {
    if (plan.creditsOverride != null && plan.creditsOverride >= 0) {
      return Math.floor(plan.creditsOverride);
    }
    const config = await this.calculation.getConfig();
    if (config.creditPriceUsd <= 0) return 0;
    return Math.floor(plan.priceUsd / config.creditPriceUsd);
  }

  async bootstrapDefaultPlans(): Promise<void> {
    for (const seed of DEFAULT_PLANS) {
      const existing = await this.plans.findByName(seed.name);
      if (existing) continue;
      await this.plans.create({ ...seed, isActive: true });
      this.logger.log(`Seeded plan: ${seed.name}`);
    }
  }

  async bootstrapExistingUsers(): Promise<void> {
    const userIds = await this.users.listAllUserIds();
    for (const userId of userIds) {
      if (!userId) continue;
      const hasPlan = await this.userPlans.existsActiveForUser(userId);
      if (!hasPlan) {
        await this.assignDefaultPlan(userId);
      }
    }
  }

  async listPlans() {
    const plans = await this.plans.findAllSortedByPrice();
    const countMap = await this.plans.countActiveUsersByPlan();
    const withCredits = await Promise.all(
      plans.map(async (p) => ({
        ...p,
        creditsPerMonth: await this.getCreditsForPlan(p),
        activeUsers: countMap.get(p.planId) ?? 0,
      })),
    );
    return withCredits;
  }

  async listPublicPlans() {
    const plans = await this.plans.findAllSortedByPrice();
    const activePlans = plans.filter((plan) => plan.isActive);

    return Promise.all(
      activePlans.map(async (plan) => ({
        planId: plan.planId,
        name: plan.name,
        priceThb: plan.priceThb,
        priceUsd: plan.priceUsd,
        creditsPerMonth: await this.getCreditsForPlan(plan),
        description: plan.description ?? null,
        features: plan.features ?? [],
      })),
    );
  }

  async createPlan(dto: CreatePlanDto) {
    return this.plans.create({
      ...dto,
      isActive: dto.isActive ?? true,
      features: dto.features ?? [],
    });
  }

  async updatePlan(planId: string, dto: UpdatePlanDto) {
    const plan = await this.plans.update(planId, dto);
    if (!plan) {
      throw new NotFoundException(`Plan ${planId} not found`);
    }
    return plan;
  }

  async softDeletePlan(planId: string) {
    const plan = await this.plans.update(planId, { isActive: false });
    if (!plan) {
      throw new NotFoundException(`Plan ${planId} not found`);
    }
    return plan;
  }

  async getPlanUsers(planId: string, page = 1, limit = 20) {
    const plan = await this.plans.findByPlanId(planId);
    if (!plan) {
      throw new NotFoundException(`Plan ${planId} not found`);
    }
    const { rows: users, total } = await this.userPlans.findActiveByPlanId(
      planId,
      page,
      limit,
    );

    const userIds = users.map((u) => u.userId);
    const userDocs = await this.users.findManyByUserIds(userIds, {
      userId: true,
      email: true,
      firstName: true,
      lastName: true,
    });
    const userMap = new Map(userDocs.map((u) => [u.userId, u]));

    return {
      plan: {
        ...plan,
        creditsPerMonth: await this.getCreditsForPlan(plan),
      },
      users: users.map((up) => {
        const u = userMap.get(up.userId);
        return {
          userId: up.userId,
          email: u?.email,
          displayName:
            [u?.firstName, u?.lastName].filter(Boolean).join(' ') || undefined,
          creditsUsed: up.creditsUsed,
          creditsRemaining: up.creditsRemaining,
        };
      }),
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async assignUserToPlan(
    planId: string,
    userId: string,
  ): Promise<UserPlanRecord> {
    const plan = await this.plans.findByPlanId(planId);
    if (!plan?.isActive) {
      throw new NotFoundException(`Active plan ${planId} not found`);
    }

    const credits = await this.getCreditsForPlan(plan);
    const billingPeriod = currentBillingPeriod();

    const previousUserPlan = await this.userPlans.findActiveByUserId(userId);
    const isPlanChange = previousUserPlan?.planId !== planId;

    await this.userPlans.suspendOtherActivePlans(userId, planId);

    const result = await this.userPlans.upsertActivePlan({
      userId,
      planId,
      creditsPerMonth: credits,
      billingPeriod,
      creditsRemaining: credits,
    });

    // A real plan change (not a same-plan renewal) may drop channels the
    // user's current connections rely on — disconnect them immediately.
    if (isPlanChange) {
      await this.channelAccess
        .enforceChannelAccessForNewPlan(userId, planId)
        .catch((err: unknown) => {
          this.logger.warn(
            `Channel access enforcement failed for user ${userId} on plan change to ${planId}: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
    }

    return result;
  }

  async assignDefaultPlan(userId: string): Promise<UserPlanRecord | null> {
    const plan = await this.plans.findActiveByLowestPrice();
    if (!plan) {
      this.logger.warn('No active plan for assignDefaultPlan');
      return null;
    }
    return this.assignUserToPlan(plan.planId, userId);
  }

  async getUserPlan(userId: string) {
    const userPlan = await this.userPlans.findActiveByUserId(userId);
    if (!userPlan) return null;
    const plan = await this.plans.findByPlanId(userPlan.planId);
    const creditsPerMonth = plan
      ? await this.getCreditsForPlan(plan)
      : userPlan.creditsPerMonth;
    return {
      userPlan,
      plan: plan ? { ...plan, creditsPerMonth } : null,
    };
  }

  @Cron('0 0 1 * *')
  async resetMonthlyCredits(): Promise<void> {
    const billingPeriod = currentBillingPeriod();
    const activePlans = await this.userPlans.findAllActive();

    const planIds = [...new Set(activePlans.map((up) => up.planId))];
    const plans = await this.plans.findManyByPlanIds(planIds);
    const planMap = new Map(plans.map((p) => [p.planId, p]));

    const updates: Array<{
      id: string;
      creditsPerMonth: number;
      creditsRemaining: number;
      billingPeriod: Date;
    }> = [];

    for (const up of activePlans) {
      const plan = planMap.get(up.planId);
      if (!plan) continue;

      if (plan.priceThb > 0) {
        const selfServe = await this.planPurchases.hasPurchaseHistory(
          up.userId,
        );
        if (selfServe) {
          const paid = await this.planPurchases.findActiveForUserAndPeriod(
            up.userId,
            billingPeriod,
          );
          if (!paid) {
            await this.assignDefaultPlan(up.userId);
            this.logger.log(
              `Downgraded user ${up.userId} — no payment for billing period`,
            );
            continue;
          }
        }
      }

      const credits = await this.getCreditsForPlan(plan);
      updates.push({
        id: up.id,
        creditsPerMonth: credits,
        creditsRemaining: credits,
        billingPeriod,
      });
    }

    if (updates.length > 0) {
      await this.userPlans.updateManyActive(updates);
    }

    this.logger.log(`Monthly credit reset for ${updates.length} user plans`);
  }
}
