import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentService } from '../payment/payment.service';

export type PayniPaymentResult = {
  transactionId: string;
  redirectUrl: string;
};

@Injectable()
export class PayniService {
  private readonly logger = new Logger(PayniService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly payment: PaymentService,
  ) {}

  isTopupEnabled(): boolean {
    return (
      this.config.get<string>('PAYNI_TOPUP_ENABLED', 'false').toLowerCase() ===
      'true'
    );
  }

  /** Alias — Payni is used for both credit topups and plan checkout. */
  isPayniEnabled(): boolean {
    return this.isTopupEnabled();
  }

  async createPayment(args: {
    amount: number;
    currencyCode?: string;
  }): Promise<PayniPaymentResult> {
    if (!Number.isFinite(args.amount) || args.amount <= 0) {
      throw new BadRequestException('Payment amount must be positive');
    }

    try {
      return await this.payment.createRedirectPayment({
        amount: args.amount,
        currencyCode: args.currencyCode,
      });
    } catch (err) {
      if (err instanceof BadRequestException) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Payni createPayment via payment service failed: ${message}`,
      );
      throw err;
    }
  }
}
