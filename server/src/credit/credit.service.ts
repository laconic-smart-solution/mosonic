import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EventsService } from '../events/events.service';
import { userRoom } from '../events/notification.util';
import { UserPlan, type UserPlanDocument } from '../plan/schemas/user-plan.schema';
import { CreditCalculationService } from './credit-calculation.service';
import type { DeductCreditsDto } from './dto/deduct-credits.dto';
import { currentBillingPeriod } from './lib/billing-period.util';
import {
  CREDIT_PACKAGES,
  type CreditPackage,
  findCreditPackage,
} from './lib/credit-packages';
import { NodeCreditPriceService } from './node-credit-price.service';
import {
  CreditLedger,
  type CreditLedgerDocument,
} from './schemas/credit-ledger.schema';
import {
  CreditTopup,
  type CreditTopupDocument,
} from './schemas/credit-topup.schema';

@Injectable()
export class CreditService {
  private readonly logger = new Logger(CreditService.name);

  constructor(
    @InjectModel(CreditLedger.name)
    private readonly ledgerModel: Model<CreditLedgerDocument>,
    @InjectModel(CreditTopup.name)
    private readonly topupModel: Model<CreditTopupDocument>,
    @InjectModel(UserPlan.name)
    private readonly userPlanModel: Model<UserPlanDocument>,
    private readonly calculation: CreditCalculationService,
    private readonly nodeCreditPriceService: NodeCreditPriceService,
    private readonly events: EventsService,
  ) {}

  getPackages(): ReadonlyArray<CreditPackage> {
    return CREDIT_PACKAGES;
  }

  /**
   * Mock self-serve topup: instantly grants the package's credits to the user's
   * active plan. No real payment is processed.
   */
  async topup(
    userId: string,
    packageId: string,
  ): Promise<{ creditsRemaining: number; creditsAdded: number }> {
    const pkg = findCreditPackage(packageId);
    if (!pkg) {
      throw new BadRequestException(`Unknown credit package: ${packageId}`);
    }

    const updated = await this.userPlanModel
      .findOneAndUpdate(
        { userId, status: 'active' },
        {
          $inc: { creditsRemaining: pkg.credits },
          $set: { lowBalanceNotifiedAt: null },
        },
        { new: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('No active plan found for user');
    }

    await new this.topupModel({
      userId,
      packageId: pkg.id,
      credits: pkg.credits,
      priceUsd: pkg.priceUsd,
    }).save();

    return {
      creditsRemaining: updated.creditsRemaining,
      creditsAdded: pkg.credits,
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

    try {
      await this.ledgerModel.insertMany(
        rows.map((row) => ({
          userId: args.userId,
          pipelineRef: args.pipelineId,
          nodeId: `${args.pipelineId}:${row.nodeType}`,
          nodeType: row.nodeType,
          provider: 'system',
          model: '',
          rawCostUsd: 0,
          overheadUsd: 0,
          marginAppliedUsd: 0,
          creditPriceUsdSnapshot: args.creditPriceUsd,
          creditsCharged: row.credits,
          billingPeriod: currentBillingPeriod(),
        })),
      );

      const updated = await this.userPlanModel
        .findOneAndUpdate(
          { userId: args.userId, status: 'active' },
          {
            $inc: {
              creditsUsed: total,
              creditsRemaining: -total,
            },
          },
          { new: true },
        )
        .exec();

      if (!updated) {
        this.logger.warn(
          `No active user_plan for userId=${args.userId}; pipeline charge logged without balance update`,
        );
        return;
      }

      await this.maybeEmitLowBalance(updated);
    } catch (err) {
      this.logger.warn(
        `Pipeline credit charge failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
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
      await this.ledgerModel.insertMany(
        rows.map((row) => ({
          userId: args.userId,
          pipelineRef: args.pipelineId,
          nodeId: `${args.pipelineId}:${row.nodeType}:refund`,
          nodeType: row.nodeType,
          provider: 'system',
          model: '',
          rawCostUsd: 0,
          overheadUsd: 0,
          marginAppliedUsd: 0,
          creditPriceUsdSnapshot: args.creditPriceUsd,
          creditsCharged: -row.credits,
          billingPeriod: currentBillingPeriod(),
        })),
      );

      await this.userPlanModel
        .findOneAndUpdate(
          { userId: args.userId, status: 'active' },
          {
            $inc: {
              creditsUsed: -total,
              creditsRemaining: total,
            },
            $set: { lowBalanceNotifiedAt: null },
          },
        )
        .exec();
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

      await new this.ledgerModel({
        userId: dto.userId,
        pipelineRef: dto.pipelineRef,
        campaignRef: dto.campaignRef,
        contentRef: dto.contentRef,
        nodeId: dto.nodeId,
        nodeType: dto.nodeType,
        provider: dto.provider,
        model: dto.model ?? '',
        rawCostUsd,
        overheadUsd,
        marginAppliedUsd,
        creditPriceUsdSnapshot,
        creditsCharged,
        billingPeriod: dto.billingPeriod,
      }).save();

      const updated = await this.userPlanModel
        .findOneAndUpdate(
          { userId: dto.userId, status: 'active' },
          {
            $inc: {
              creditsUsed: creditsCharged,
              creditsRemaining: -creditsCharged,
            },
          },
          { new: true },
        )
        .exec();

      if (!updated) {
        this.logger.warn(
          `No active user_plan for userId=${dto.userId}; ledger written without balance update`,
        );
        return;
      }

      await this.maybeEmitLowBalance(updated);
    } catch (err) {
      this.logger.warn(
        `Credit deduction failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async maybeEmitLowBalance(userPlan: UserPlanDocument): Promise<void> {
    if (userPlan.creditsPerMonth <= 0) return;
    const pctRemaining =
      userPlan.creditsRemaining / userPlan.creditsPerMonth;
    if (pctRemaining >= 0.1) return;
    if (userPlan.lowBalanceNotifiedAt != null) return;

    try {
      this.events.emitToRoom(userRoom(userPlan.userId), 'credit:low_balance', {
        userId: userPlan.userId,
        creditsRemaining: userPlan.creditsRemaining,
        creditsPerMonth: userPlan.creditsPerMonth,
        percentRemaining: pctRemaining * 100,
      });
      await this.userPlanModel
        .updateOne(
          { _id: userPlan._id },
          { $set: { lowBalanceNotifiedAt: new Date() } },
        )
        .exec();
    } catch {
      // noop — credit layer must not break pipelines
    }
  }
}
