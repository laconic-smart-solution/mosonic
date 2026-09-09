import { Injectable, Logger } from '@nestjs/common';
import { CreditService } from '../credit/credit.service';
import type { PaymentStatusDto } from '../credit/dto/payment-status.dto';
import { PlanUpgradeService } from '../plan/plan-upgrade.service';

@Injectable()
export class PaymentWebhookService {
  private readonly logger = new Logger(PaymentWebhookService.name);

  constructor(
    private readonly creditService: CreditService,
    private readonly planUpgradeService: PlanUpgradeService,
  ) {}

  async handlePaymentStatus(dto: PaymentStatusDto): Promise<void> {
    const transactionId = dto.transactionId?.trim();
    const rawStatus = dto.status?.trim().toUpperCase();
    if (!transactionId || !rawStatus) {
      this.logger.error('Invalid payment webhook payload');
      return;
    }

    const handledByTopup = await this.creditService.handlePaymentWebhook(dto);
    if (handledByTopup) {
      return;
    }

    await this.planUpgradeService.handlePlanPurchaseWebhook(
      transactionId,
      rawStatus,
    );
  }
}
