import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EventsService } from '../events/events.service';
import { userRoom } from '../events/notification.util';
import { PayniService } from '../payni/payni.service';
import type { IPlanPurchaseRepository } from '../repositories/interfaces/plan-purchase.repository.interface';
import type { IPlanRepository } from '../repositories/interfaces/plan.repository.interface';
import {
  PLAN_PURCHASE_REPOSITORY,
  PLAN_REPOSITORY,
} from '../repositories/tokens';
import { currentBillingPeriod } from '../credit/lib/billing-period.util';
import { PlanService } from './plan.service';

const ENTERPRISE_PLAN_NAME = 'Enterprise';

export type InitiatePlanUpgradeResult = {
  planPurchaseId?: string;
  payniResponse?: { redirectUrl: string; transactionId: string };
  instant?: { planName: string; creditsRemaining: number };
};

export type PlanUpgradePreview = {
  planId: string;
  planName: string;
  priceThb: number;
  priceUsd: number;
  creditsPerMonth: number;
  isRenewal: boolean;
  isCurrentPlan: boolean;
};

@Injectable()
export class PlanUpgradeService {
  private readonly logger = new Logger(PlanUpgradeService.name);

  constructor(
    @Inject(PLAN_REPOSITORY) private readonly plans: IPlanRepository,
    @Inject(PLAN_PURCHASE_REPOSITORY)
    private readonly planPurchases: IPlanPurchaseRepository,
    private readonly planService: PlanService,
    private readonly payniService: PayniService,
    private readonly events: EventsService,
  ) {}

  async getUpgradePreview(
    userId: string,
    planId: string,
  ): Promise<PlanUpgradePreview> {
    const target = await this.resolveTargetPlan(planId);
    const current = await this.planService.getUserPlan(userId);
    const currentPlan = current?.plan;
    const creditsPerMonth = await this.planService.getCreditsForPlan(target);
    const isCurrentPlan = currentPlan?.planId === target.planId;

    return {
      planId: target.planId,
      planName: target.name,
      priceThb: target.priceThb,
      priceUsd: target.priceUsd,
      creditsPerMonth,
      isRenewal: isCurrentPlan,
      isCurrentPlan,
    };
  }

  async initiateUpgrade(
    userId: string,
    planId: string,
  ): Promise<InitiatePlanUpgradeResult> {
    const target = await this.resolveTargetPlan(planId);
    await this.validateUpgradeRequest(userId, target);

    if (!this.payniService.isPayniEnabled()) {
      const userPlan = await this.planService.assignUserToPlan(
        target.planId,
        userId,
      );
      const billingPeriod = currentBillingPeriod();
      await this.planPurchases.create({
        userId,
        planId: target.planId,
        amount: target.priceThb,
        currencyCode: this.payniService.getCurrencyCode(),
        billingPeriod,
        transactionId: `mock-${randomUUID()}`,
        status: 'active',
        purchaseDate: new Date(),
      });
      const plan = await this.plans.findByPlanId(target.planId);
      return {
        instant: {
          planName: plan?.name ?? target.name,
          creditsRemaining: userPlan.creditsRemaining,
        },
      };
    }

    if (target.priceThb <= 0) {
      throw new BadRequestException('This plan does not require payment');
    }

    const pending = await this.planPurchases.findPendingByUserId(userId);
    if (pending) {
      throw new BadRequestException(
        'You already have a pending plan payment. Complete or cancel it before starting another.',
      );
    }

    const payniResponse = await this.payniService.createPayment({
      amount: target.priceThb,
    });

    const billingPeriod = currentBillingPeriod();
    const purchase = await this.planPurchases.create({
      userId,
      planId: target.planId,
      amount: target.priceThb,
      currencyCode: this.payniService.getCurrencyCode(),
      billingPeriod,
      transactionId: payniResponse.transactionId,
      status: 'pending',
      purchaseDate: new Date(),
    });

    return {
      planPurchaseId: purchase.planPurchaseId,
      payniResponse,
    };
  }

  async handlePlanPurchaseWebhook(
    transactionId: string,
    rawStatus: string,
  ): Promise<boolean> {
    const purchase =
      await this.planPurchases.findByTransactionId(transactionId);

    if (!purchase) {
      return false;
    }

    if (rawStatus === 'SUCCESS') {
      if (purchase.status === 'active') {
        this.logger.warn(
          `Plan webhook: transaction ${transactionId} already fulfilled; skipping`,
        );
        return true;
      }
      if (purchase.status !== 'pending') {
        this.logger.warn(
          `Plan webhook: transaction ${transactionId} status=${purchase.status}; skipping`,
        );
        return true;
      }

      await this.planPurchases.updateStatus(purchase.planPurchaseId, 'active');

      const userPlan = await this.planService.assignUserToPlan(
        purchase.planId,
        purchase.userId,
      );

      const plan = await this.plans.findByPlanId(purchase.planId);
      this.emitPlanUpdated(userPlan.userId, {
        planId: purchase.planId,
        planName: plan?.name ?? '',
        creditsRemaining: userPlan.creditsRemaining,
        creditsPerMonth: userPlan.creditsPerMonth,
      });

      this.events.emitUserNotification({
        userId: purchase.userId,
        sector: 'billing',
        type: 'success',
        title: 'Plan updated',
        message: `Your subscription is now on the ${plan?.name ?? 'selected'} plan.`,
      });

      return true;
    }

    if (rawStatus === 'CANCELLED' && purchase.status === 'pending') {
      await this.planPurchases.updateStatus(purchase.planPurchaseId, 'cancelled');
      return true;
    }

    return true;
  }

  async hasActivePaymentForPeriod(
    userId: string,
    billingPeriod: Date,
  ): Promise<boolean> {
    const purchase = await this.planPurchases.findActiveForUserAndPeriod(
      userId,
      billingPeriod,
    );
    return purchase != null;
  }

  private async resolveTargetPlan(planId: string) {
    const plan = await this.plans.findByPlanId(planId);
    if (!plan?.isActive) {
      throw new NotFoundException(`Active plan ${planId} not found`);
    }
    if (plan.name === ENTERPRISE_PLAN_NAME) {
      throw new BadRequestException(
        'Enterprise plans require contacting sales. Please reach out to our team.',
      );
    }
    return plan;
  }

  private async validateUpgradeRequest(
    userId: string,
    target: { planId: string; name: string; priceThb: number },
  ): Promise<void> {
    const current = await this.planService.getUserPlan(userId);
    const currentPlan = current?.plan;

    if (!currentPlan) {
      if (target.priceThb <= 0) {
        throw new BadRequestException('You are already eligible for the free plan');
      }
      return;
    }

    const isSamePlan = currentPlan.planId === target.planId;

    if (isSamePlan) {
      if (target.priceThb <= 0) {
        throw new BadRequestException('The free plan does not require renewal');
      }
      return;
    }

    if (target.priceThb <= currentPlan.priceThb) {
      throw new BadRequestException(
        'Self-serve plan changes are limited to upgrades. Contact support to change to a lower tier.',
      );
    }
  }

  private emitPlanUpdated(
    userId: string,
    payload: {
      planId: string;
      planName: string;
      creditsRemaining: number;
      creditsPerMonth: number;
    },
  ): void {
    try {
      this.events.emitToRoom(userRoom(userId), 'plan:updated', {
        userId,
        ...payload,
      });
      this.events.emitToRoom(userRoom(userId), 'credit:balance_updated', {
        userId,
        creditsRemaining: payload.creditsRemaining,
        creditsUsed: 0,
        creditsPerMonth: payload.creditsPerMonth,
      });
    } catch {
      // noop
    }
  }
}
