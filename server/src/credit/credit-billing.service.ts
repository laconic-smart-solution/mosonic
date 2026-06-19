import { Injectable, Logger } from '@nestjs/common';
import { CostService } from '../cost/cost.service';
import type { RecordCostDto } from '../cost/dto/record-cost.dto';
import { currentBillingPeriod } from './lib/billing-period.util';
import { CreditService } from './credit.service';

@Injectable()
export class CreditBillingService {
  private readonly logger = new Logger(CreditBillingService.name);

  constructor(
    private readonly costService: CostService,
    private readonly creditService: CreditService,
  ) {}

  /** Record raw API cost and deduct credits (warn-only on credit failure). */
  async recordAndDeduct(dto: RecordCostDto): Promise<void> {
    try {
      const { costUsd } = await this.costService.recordNodeCost(dto);
      await this.creditService.deductCredits({
        userId: dto.userId,
        pipelineRef: dto.pipelineRef,
        campaignRef: dto.campaignRef,
        contentRef: dto.contentRef,
        nodeId: dto.nodeId ?? 'unknown',
        nodeType: dto.nodeType ?? 'unknown',
        provider: dto.provider,
        model: dto.providerModel,
        rawCostUsd: costUsd,
        billingPeriod: currentBillingPeriod(),
      });
    } catch (err) {
      this.logger.warn(
        `Credit billing failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
