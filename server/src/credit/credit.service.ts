import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { UserPlanRecord } from '../domain/plans/plan.types';
import { EventsService } from '../events/events.service';
import { userRoom } from '../events/notification.util';
import { LineNotifyService } from '../line/line-notify.service';
import { TelegramNotifyService } from '../telegram/telegram-notify.service';
import { ViberNotifyService } from '../viber/viber-notify.service';
import { WhatsAppNotifyService } from '../whatsapp/whatsapp-notify.service';
import { PayniService } from '../payni/payni.service';
import type { ICreditLedgerRepository } from '../repositories/interfaces/credit-ledger.repository.interface';
import type { ICreditTopupPurchaseRepository } from '../repositories/interfaces/credit-topup-purchase.repository.interface';
import type { ICreditTopupRepository } from '../repositories/interfaces/credit-topup.repository.interface';
import type { IUserPlanRepository } from '../repositories/interfaces/user-plan.repository.interface';
import {
  CREDIT_LEDGER_REPOSITORY,
  CREDIT_TOPUP_PURCHASE_REPOSITORY,
  CREDIT_TOPUP_REPOSITORY,
  USER_PLAN_REPOSITORY,
} from '../repositories/tokens';
import { CreditCalculationService } from './credit-calculation.service';
import type { DeductCreditsDto } from './dto/deduct-credits.dto';
import { currentBillingPeriod } from './lib/billing-period.util';
import { periodCreditBudget } from './lib/period-credit-budget.util';
import { PaymentService, type CreditPackage } from '../payment/payment.service';
import { NodeCreditPriceService } from './node-credit-price.service';
import { InsufficientCreditsException } from './insufficient-credits.exception';
import {
  RULE_GENERATION_NODE_TYPE,
  SOCIAL_ACCOUNT_CONNECT_NODE_TYPE,
  WORKFLOW_GENERATION_NODE_TYPE,
} from './lib/billable-node-credit-types';
import type { PaymentStatusDto } from './dto/payment-status.dto';

export type InitiateTopupResult = {
  topupPurchaseId?: string;
  payniResponse?: { redirectUrl: string; transactionId: string };
  instant?: { creditsRemaining: number; creditsAdded: number };
};

/** Default: notify when remaining credits fall below 10% of monthly allotment. */
const DEFAULT_LOW_BALANCE_THRESHOLD_PCT = 10;

@Injectable()
export class CreditService {
  private readonly logger = new Logger(CreditService.name);
  private readonly lowBalanceThresholdPct: number;

  constructor(
    config: ConfigService,
    @Inject(CREDIT_LEDGER_REPOSITORY)
    private readonly ledger: ICreditLedgerRepository,
    @Inject(CREDIT_TOPUP_REPOSITORY)
    private readonly topups: ICreditTopupRepository,
    @Inject(CREDIT_TOPUP_PURCHASE_REPOSITORY)
    private readonly topupPurchases: ICreditTopupPurchaseRepository,
    @Inject(USER_PLAN_REPOSITORY)
    private readonly userPlans: IUserPlanRepository,
    private readonly calculation: CreditCalculationService,
    private readonly nodeCreditPriceService: NodeCreditPriceService,
    private readonly events: EventsService,
    private readonly payniService: PayniService,
    private readonly paymentService: PaymentService,
    private readonly lineNotify: LineNotifyService,
    private readonly telegramNotify: TelegramNotifyService,
    private readonly viberNotify: ViberNotifyService,
    private readonly whatsappNotify: WhatsAppNotifyService,
  ) {
    const raw = Number(
      config.get(
        'CREDIT_LOW_BALANCE_THRESHOLD_PCT',
        DEFAULT_LOW_BALANCE_THRESHOLD_PCT,
      ),
    );
    const pct = Number.isFinite(raw) ? raw : DEFAULT_LOW_BALANCE_THRESHOLD_PCT;
    this.lowBalanceThresholdPct = Math.min(100, Math.max(0, pct)) / 100;
  }

  async getPackages(): Promise<CreditPackage[]> {
    const plans = await this.paymentService.listTopupPlans({
      activeOnly: true,
    });
    return plans.map((plan) => this.paymentService.toCreditPackage(plan));
  }

  private async resolvePackage(packageId: string): Promise<CreditPackage> {
    const plan = await this.paymentService.getTopupPlan(packageId);
    if (!plan || !plan.active) {
      throw new BadRequestException(`Unknown credit package: ${packageId}`);
    }
    return this.paymentService.toCreditPackage(plan);
  }

  /**
   * Start self-serve top-up: Payni redirect when enabled, otherwise instant mock grant.
   */
  async initiateTopup(
    userId: string,
    packageId: string,
  ): Promise<InitiateTopupResult> {
    if (!this.payniService.isTopupEnabled()) {
      const instant = await this.grantPackageCredits(userId, packageId);
      return { instant };
    }

    const pkg = await this.resolvePackage(packageId);
    if (pkg.priceThb <= 0) {
      throw new BadRequestException('Credit package has no price configured');
    }

    const payniResponse = await this.payniService.createPayment({
      amount: pkg.priceThb,
    });

    const purchase = await this.topupPurchases.create({
      userId,
      packageId: pkg.id,
      credits: pkg.credits,
      amount: pkg.priceThb,
      currencyCode: this.payniService.getCurrencyCode(),
      transactionId: payniResponse.transactionId,
      status: 'pending',
      purchaseDate: new Date(),
    });

    return {
      topupPurchaseId: purchase.topupPurchaseId,
      payniResponse,
    };
  }

  /** Payni webhook: credit balance when payment succeeds (idempotent). Returns true if handled. */
  async handlePaymentWebhook(dto: PaymentStatusDto): Promise<boolean> {
    const transactionId = dto.transactionId?.trim();
    const rawStatus = dto.status?.trim().toUpperCase();
    if (!transactionId || !rawStatus) {
      this.logger.error('Invalid payment webhook payload');
      return false;
    }

    const purchase =
      await this.topupPurchases.findByTransactionId(transactionId);

    if (!purchase) {
      return false;
    }

    if (rawStatus === 'SUCCESS') {
      if (purchase.status === 'active') {
        this.logger.warn(
          `Payment webhook: transaction ${transactionId} already credited; skipping`,
        );
        return true;
      }
      if (purchase.status !== 'pending') {
        this.logger.warn(
          `Payment webhook: transaction ${transactionId} status=${purchase.status}; skipping credit`,
        );
        return true;
      }

      await this.topupPurchases.updateStatus(
        purchase.topupPurchaseId,
        'active',
      );

      const updated = await this.userPlans.adjustActiveCredits(
        purchase.userId,
        {
          creditsRemaining: purchase.credits,
          clearLowBalanceNotified: true,
        },
      );

      if (!updated) {
        this.logger.error(
          `Payment webhook: no active plan for user ${purchase.userId}`,
        );
        return true;
      }

      const pkg = await this.paymentService.getTopupPlan(purchase.packageId);
      await this.topups.create({
        userId: purchase.userId,
        packageId: purchase.packageId,
        credits: purchase.credits,
        priceUsd: pkg ? Number(pkg.priceUsd) : 0,
        source: 'self_serve',
      });

      this.emitBalanceUpdated(updated);
      this.events.emitUserNotification({
        userId: purchase.userId,
        sector: 'billing',
        type: 'success',
        title: 'Credits added',
        message: `${purchase.credits.toLocaleString()} credits were added to your balance.`,
      });
      return true;
    }

    if (rawStatus === 'CANCELLED' && purchase.status === 'pending') {
      await this.topupPurchases.updateStatus(
        purchase.topupPurchaseId,
        'cancelled',
      );
      return true;
    }

    return true;
  }

  /** Instant grant for dev mock mode or internal use. */
  async grantPackageCredits(
    userId: string,
    packageId: string,
  ): Promise<{ creditsRemaining: number; creditsAdded: number }> {
    const pkg = await this.resolvePackage(packageId);

    const updated = await this.userPlans.adjustActiveCredits(userId, {
      creditsRemaining: pkg.credits,
      clearLowBalanceNotified: true,
    });

    if (!updated) {
      throw new NotFoundException('No active plan found for user');
    }

    await this.topups.create({
      userId,
      packageId: pkg.id,
      credits: pkg.credits,
      priceUsd: pkg.priceUsd,
      source: 'self_serve',
    });

    this.emitBalanceUpdated(updated);

    return {
      creditsRemaining: updated.creditsRemaining,
      creditsAdded: pkg.credits,
    };
  }

  /**
   * @deprecated Use initiateTopup. Kept for backward compatibility in tests.
   */
  async topup(
    userId: string,
    packageId: string,
  ): Promise<{ creditsRemaining: number; creditsAdded: number }> {
    return this.grantPackageCredits(userId, packageId);
  }

  /**
   * Admin manual top-up: grants a custom credit amount with an audit reason.
   * No real payment is processed.
   */
  async adminManualTopup(
    userId: string,
    credits: number,
    adminUserId: string,
    reason: string,
  ): Promise<{ creditsRemaining: number; creditsAdded: number }> {
    if (!Number.isInteger(credits) || credits < 1 || credits > 100_000) {
      throw new BadRequestException(
        'Credits must be an integer between 1 and 100000',
      );
    }

    const trimmedReason = reason.trim();
    if (trimmedReason.length < 3 || trimmedReason.length > 500) {
      throw new BadRequestException(
        'Reason must be between 3 and 500 characters',
      );
    }

    const updated = await this.userPlans.adjustActiveCredits(userId, {
      creditsRemaining: credits,
      clearLowBalanceNotified: true,
    });

    if (!updated) {
      throw new NotFoundException('No active plan found for user');
    }

    await this.topups.create({
      userId,
      credits,
      priceUsd: 0,
      source: 'admin',
      adminUserId,
      reason: trimmedReason,
    });

    this.emitBalanceUpdated(updated);

    return {
      creditsRemaining: updated.creditsRemaining,
      creditsAdded: credits,
    };
  }

  /**
   * Charge credits up-front for a workflow run. Writes one ledger row per
   * billable node type (so the ledger/activity log shows each type), then a
   * single atomic decrement of the active plan for the summed total.
   */
  async chargePipelineRun(args: {
    userId: string;
    pipelineId: string;
    creditPriceUsd: number;
    items: Array<{ nodeType: string; count: number; creditsEach: number }>;
  }): Promise<void> {
    const rows = args.items
      .map((item) => ({
        nodeType: item.nodeType,
        credits: Math.max(0, item.creditsEach * item.count),
      }))
      .filter((row) => row.credits > 0);
    const total = rows.reduce((sum, row) => sum + row.credits, 0);
    if (total <= 0) return;

    await this.ledger.insertMany(
      rows.map((row) => ({
        userId: args.userId,
        pipelineRef: args.pipelineId,
        nodeId: `${args.pipelineId}:${row.nodeType}`,
        nodeType: row.nodeType,
        provider: 'system',
        model: 'system',
        rawCostUsd: 0,
        overheadUsd: 0,
        marginAppliedUsd: 0,
        creditPriceUsdSnapshot: args.creditPriceUsd,
        creditsCharged: row.credits,
        billingPeriod: currentBillingPeriod(),
      })),
    );

    const updated = await this.debitOrThrow(args.userId, total);

    await this.maybeEmitLowBalance(updated);
    this.emitBalanceUpdated(updated);
  }

  /** Charge credits for a single content node rerun or generate-more execution. */
  async chargeSingleNodeRun(args: {
    userId: string;
    pipelineRef: string;
    contentRef: string;
    nodeId: string;
    nodeType: string;
    credits: number;
    creditPriceUsd: number;
  }): Promise<void> {
    if (args.credits <= 0) return;

    await this.ledger.create({
      userId: args.userId,
      pipelineRef: args.pipelineRef,
      contentRef: args.contentRef,
      nodeId: args.nodeId,
      nodeType: args.nodeType,
      provider: 'system',
      model: 'system',
      rawCostUsd: 0,
      overheadUsd: 0,
      marginAppliedUsd: 0,
      creditPriceUsdSnapshot: args.creditPriceUsd,
      creditsCharged: args.credits,
      billingPeriod: currentBillingPeriod(),
    });

    const updated = await this.debitOrThrow(args.userId, args.credits);

    await this.maybeEmitLowBalance(updated);
    this.emitBalanceUpdated(updated);
  }

  /** Refund a single-node content charge when execution fails. */
  async refundSingleNodeRun(args: {
    userId: string;
    pipelineRef: string;
    contentRef: string;
    nodeId: string;
    nodeType: string;
    credits: number;
    creditPriceUsd: number;
  }): Promise<void> {
    if (args.credits <= 0) return;

    await this.ledger.create({
      userId: args.userId,
      pipelineRef: args.pipelineRef,
      contentRef: args.contentRef,
      nodeId: `${args.nodeId}:refund`,
      nodeType: args.nodeType,
      provider: 'system',
      model: 'system',
      rawCostUsd: 0,
      overheadUsd: 0,
      marginAppliedUsd: 0,
      creditPriceUsdSnapshot: args.creditPriceUsd,
      creditsCharged: -args.credits,
      billingPeriod: currentBillingPeriod(),
    });

    const updated = await this.userPlans.adjustActiveCredits(args.userId, {
      creditsUsed: -args.credits,
      creditsRemaining: args.credits,
      clearLowBalanceNotified: true,
    });

    if (updated) {
      this.emitBalanceUpdated(updated);
      const operation = args.nodeType.replace(/_/g, ' ');
      this.emitCreditRefundNotification({
        userId: args.userId,
        credits: args.credits,
        message: `${args.credits.toLocaleString()} credits were refunded after ${operation} did not complete.`,
        data: {
          pipelineId: args.pipelineRef,
          contentId: args.contentRef,
          nodeId: args.nodeId,
          nodeType: args.nodeType,
          credits: args.credits,
        },
      });
    }
  }

  async getCreditsRemaining(userId: string): Promise<number> {
    const userPlan = await this.userPlans.findActiveByUserId(userId);
    return userPlan?.creditsRemaining ?? 0;
  }

  async assertCreditsForNodeType(
    userId: string,
    nodeType: string,
  ): Promise<{ creditsEach: number; creditsRemaining: number }> {
    const creditsEach =
      (await this.nodeCreditPriceService.getActiveCostCredit(nodeType)) ?? 0;
    const creditsRemaining = await this.getCreditsRemaining(userId);
    if (creditsEach > 0 && creditsRemaining < creditsEach) {
      throw new InsufficientCreditsException({
        requiredCredits: creditsEach,
        creditsRemaining,
      });
    }
    return { creditsEach, creditsRemaining };
  }

  async getGenerationCreditCosts(): Promise<{
    ruleGeneration: number;
    workflowGeneration: number;
  }> {
    const [ruleGeneration, workflowGeneration] = await Promise.all([
      this.nodeCreditPriceService.getActiveCostCredit(
        RULE_GENERATION_NODE_TYPE,
      ),
      this.nodeCreditPriceService.getActiveCostCredit(
        WORKFLOW_GENERATION_NODE_TYPE,
      ),
    ]);
    return {
      ruleGeneration: ruleGeneration ?? 0,
      workflowGeneration: workflowGeneration ?? 0,
    };
  }

  socialUnlockNodeIds(channel: string): string[] {
    const key = channel.trim().toLowerCase();
    return [`social:${key}`];
  }

  async hasSocialChannelUnlock(
    userId: string,
    channel: string,
  ): Promise<boolean> {
    return await this.ledger.hasUserSocialChannelUnlock(
      userId,
      this.socialUnlockNodeIds(channel),
    );
  }

  async listUnlockedSocialChannels(userId: string): Promise<string[]> {
    return await this.ledger.listUserSocialChannelUnlocks(userId);
  }

  /**
   * Unlock a publishing channel slot (idempotent). Charges credits on first
   * unlock; persists via ledger so disconnect does not require re-unlock.
   */
  async unlockSocialChannel(args: {
    userId: string;
    channel: string;
    credits: number;
    creditPriceUsd: number;
  }): Promise<{ alreadyUnlocked: boolean }> {
    const channel = args.channel.trim().toLowerCase();
    const nodeIds = this.socialUnlockNodeIds(channel);
    const alreadyUnlocked = await this.ledger.hasUserSocialChannelUnlock(
      args.userId,
      nodeIds,
    );
    if (alreadyUnlocked) {
      return { alreadyUnlocked: true };
    }

    if (args.credits > 0) {
      await this.assertCreditsForNodeType(
        args.userId,
        SOCIAL_ACCOUNT_CONNECT_NODE_TYPE,
      );
    }

    await this.ledger.create({
      userId: args.userId,
      pipelineRef: 'social-connect',
      nodeId: `social:${channel}`,
      nodeType: SOCIAL_ACCOUNT_CONNECT_NODE_TYPE,
      provider: 'system',
      model: 'system',
      rawCostUsd: 0,
      overheadUsd: 0,
      marginAppliedUsd: 0,
      creditPriceUsdSnapshot: args.creditPriceUsd,
      creditsCharged: Math.max(0, args.credits),
      billingPeriod: currentBillingPeriod(),
    });

    if (args.credits > 0) {
      const updated = await this.debitOrThrow(args.userId, args.credits);

      await this.maybeEmitLowBalance(updated);
      this.emitBalanceUpdated(updated);
    }

    return { alreadyUnlocked: false };
  }

  /** @deprecated Use `unlockSocialChannel` */
  async chargeSocialAccountConnect(args: {
    userId: string;
    channel: string;
    credits: number;
    creditPriceUsd: number;
  }): Promise<void> {
    await this.unlockSocialChannel(args);
  }

  /**
   * Refund credits for a workflow run (e.g. nodes that never executed). Writes
   * one negative ledger row per node type, then a single atomic increment of the
   * active plan for the summed refund.
   */
  async refundPipelineRun(args: {
    userId: string;
    pipelineId: string;
    creditPriceUsd: number;
    items: Array<{ nodeType: string; credits: number }>;
  }): Promise<void> {
    const rows = args.items.filter((item) => item.credits > 0);
    const total = rows.reduce((sum, row) => sum + row.credits, 0);
    if (total <= 0) return;

    try {
      await this.ledger.insertMany(
        rows.map((row) => ({
          userId: args.userId,
          pipelineRef: args.pipelineId,
          nodeId: `${args.pipelineId}:${row.nodeType}:refund`,
          nodeType: row.nodeType,
          provider: 'system',
          model: 'system',
          rawCostUsd: 0,
          overheadUsd: 0,
          marginAppliedUsd: 0,
          creditPriceUsdSnapshot: args.creditPriceUsd,
          creditsCharged: -row.credits,
          billingPeriod: currentBillingPeriod(),
        })),
      );

      const updated = await this.userPlans.adjustActiveCredits(args.userId, {
        creditsUsed: -total,
        creditsRemaining: total,
        clearLowBalanceNotified: true,
      });
      if (updated) {
        this.emitBalanceUpdated(updated);
        this.emitCreditRefundNotification({
          userId: args.userId,
          credits: total,
          message: `${total.toLocaleString()} credits were refunded for generation steps that did not run.`,
          data: {
            pipelineId: args.pipelineId,
            credits: total,
            itemCount: rows.length,
          },
        });
      }
    } catch (err) {
      this.logger.warn(
        `Pipeline credit refund failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async deductCredits(dto: DeductCreditsDto): Promise<void> {
    try {
      const billableCostUsd =
        await this.nodeCreditPriceService.getActiveCostUsd(dto.nodeType);

      let creditsCharged: number;
      let rawCostUsd: number;
      let overheadUsd: number;
      let marginAppliedUsd: number;
      let creditPriceUsdSnapshot: number;

      if (billableCostUsd != null) {
        const calc = await this.calculation.calculateCredits(billableCostUsd);
        if (calc.creditsCharged <= 0) return;
        creditsCharged = calc.creditsCharged;
        rawCostUsd = calc.rawCostUsd;
        overheadUsd = calc.overheadUsd;
        marginAppliedUsd = calc.marginAppliedUsd;
        creditPriceUsdSnapshot = calc.creditPriceUsdSnapshot;
      } else {
        if (dto.rawCostUsd <= 0) return;
        const calc = await this.calculation.calculateCredits(dto.rawCostUsd);
        if (calc.creditsCharged <= 0) return;
        creditsCharged = calc.creditsCharged;
        rawCostUsd = calc.rawCostUsd;
        overheadUsd = calc.overheadUsd;
        marginAppliedUsd = calc.marginAppliedUsd;
        creditPriceUsdSnapshot = calc.creditPriceUsdSnapshot;
      }

      await this.ledger.create({
        userId: dto.userId,
        pipelineRef: dto.pipelineRef,
        campaignRef: dto.campaignRef,
        contentRef: dto.contentRef,
        nodeId: dto.nodeId,
        nodeType: dto.nodeType,
        provider: dto.provider,
        model: dto.model?.trim() || 'system',
        rawCostUsd,
        overheadUsd,
        marginAppliedUsd,
        creditPriceUsdSnapshot,
        creditsCharged,
        billingPeriod: dto.billingPeriod,
      });

      const updated = await this.debitOrThrow(dto.userId, creditsCharged);

      await this.maybeEmitLowBalance(updated);
      this.emitBalanceUpdated(updated);
    } catch (err) {
      this.logger.warn(
        `Credit deduction failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  }

  /** Atomic debit — never drives creditsRemaining below zero. */
  private async debitOrThrow(
    userId: string,
    amount: number,
  ): Promise<UserPlanRecord> {
    const updated = await this.userPlans.debitActiveCreditsIfSufficient(
      userId,
      amount,
    );
    if (updated) return updated;

    const plan = await this.userPlans.findActiveByUserId(userId);
    if (!plan) {
      throw new NotFoundException(`No active plan found for userId=${userId}`);
    }
    throw new InsufficientCreditsException({
      requiredCredits: amount,
      creditsRemaining: plan.creditsRemaining,
    });
  }

  private emitBalanceUpdated(userPlan: UserPlanRecord): void {
    try {
      this.events.emitToRoom(
        userRoom(userPlan.userId),
        'credit:balance_updated',
        {
          userId: userPlan.userId,
          creditsRemaining: userPlan.creditsRemaining,
          creditsUsed: userPlan.creditsUsed,
          creditsPerMonth: userPlan.creditsPerMonth,
        },
      );
    } catch {
      // noop — credit layer must not break pipelines
    }
  }

  private emitCreditRefundNotification(args: {
    userId: string;
    credits: number;
    message: string;
    data?: Record<string, unknown>;
  }): void {
    try {
      this.events.emitUserNotification({
        userId: args.userId,
        sector: 'billing',
        type: 'credit.refunded',
        title: 'Credits refunded',
        message: args.message,
        data: args.data,
        action: { label: 'View activity', href: '/usage' },
      });
    } catch {
      // noop — credit layer must not break pipelines
    }
  }

  private async maybeEmitLowBalance(userPlan: UserPlanRecord): Promise<void> {
    const budget = periodCreditBudget({
      creditsPerMonth: userPlan.creditsPerMonth,
      creditsUsed: userPlan.creditsUsed,
      creditsRemaining: userPlan.creditsRemaining,
    });
    if (budget <= 0) return;
    const safeRemaining = Math.max(0, userPlan.creditsRemaining);
    const pctRemaining = safeRemaining / budget;
    if (pctRemaining >= this.lowBalanceThresholdPct) return;
    if (userPlan.lowBalanceNotifiedAt != null) return;

    try {
      const percentRemaining = Math.round(pctRemaining * 100);
      this.events.emitToRoom(userRoom(userPlan.userId), 'credit:low_balance', {
        userId: userPlan.userId,
        creditsRemaining: safeRemaining,
        creditsPerMonth: userPlan.creditsPerMonth,
        percentRemaining,
      });
      const lowCreditMsg = `Low credit alert: ${safeRemaining} of ${budget} credits remaining (${percentRemaining}%). Top up to keep generating.`;
      await this.lineNotify.notifyUser(userPlan.userId, lowCreditMsg);
      await this.telegramNotify.notifyUser(userPlan.userId, lowCreditMsg);
      await this.viberNotify.notifyUser(userPlan.userId, lowCreditMsg);
      await this.whatsappNotify.notifyUser(userPlan.userId, lowCreditMsg);
      await this.userPlans.markLowBalanceNotified(userPlan.id);
    } catch {
      // noop — credit layer must not break pipelines
    }
  }
}
