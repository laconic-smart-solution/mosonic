import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EventsService } from '../events/events.service';
import { userRoom } from '../events/notification.util';
import { UserPlan, type UserPlanDocument } from '../plan/schemas/user-plan.schema';
import { CreditCalculationService } from './credit-calculation.service';
import type { DeductCreditsDto } from './dto/deduct-credits.dto';
import { NodeCreditPriceService } from './node-credit-price.service';
import {
  CreditLedger,
  type CreditLedgerDocument,
} from './schemas/credit-ledger.schema';

@Injectable()
export class CreditService {
  private readonly logger = new Logger(CreditService.name);

  constructor(
    @InjectModel(CreditLedger.name)
    private readonly ledgerModel: Model<CreditLedgerDocument>,
    @InjectModel(UserPlan.name)
    private readonly userPlanModel: Model<UserPlanDocument>,
    private readonly calculation: CreditCalculationService,
    private readonly nodeCreditPriceService: NodeCreditPriceService,
    private readonly events: EventsService,
  ) {}

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
