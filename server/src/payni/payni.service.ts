import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { isAxiosError } from 'axios';

export type PayniPaymentResult = {
  transactionId: string;
  redirectUrl: string;
};

@Injectable()
export class PayniService {
  private readonly logger = new Logger(PayniService.name);

  constructor(private readonly config: ConfigService) {}

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

  getCurrencyCode(): string {
    return this.config.get<string>('PAYNI_CURRENCY_CODE', 'THB').trim() || 'THB';
  }

  async createPayment(args: {
    amount: number;
    currencyCode?: string;
  }): Promise<PayniPaymentResult> {
    const baseUrl = this.config.get<string>('PAYNI_URL')?.trim();
    const appId = this.config.get<string>('PAYNI_APP_ID')?.trim();
    const secret = this.config.get<string>('PAYNI_SECRET')?.trim();

    if (!baseUrl || !appId || !secret) {
      throw new BadRequestException('Payni payment is not configured');
    }

    if (!Number.isFinite(args.amount) || args.amount <= 0) {
      throw new BadRequestException('Payment amount must be positive');
    }

    const url = `${baseUrl.replace(/\/+$/, '')}/api/external/generate-redirect-url`;
    const currencyCode = args.currencyCode?.trim() || this.getCurrencyCode();

    try {
      const res = await axios.post<Record<string, unknown>>(
        url,
        {
          id: appId,
          apiSecret: secret,
          amount: args.amount,
          currencyCode,
        },
        { headers: { 'Content-Type': 'application/json' }, timeout: 30_000 },
      );

      const body = res.data;
      const transId = typeof body?.transId === 'string' ? body.transId : '';
      const redirectUrl = typeof body?.url === 'string' ? body.url : '';

      if (!transId || !redirectUrl) {
        this.logger.error(`Payni invalid response: ${JSON.stringify(body)}`);
        throw new InternalServerErrorException('Invalid response from Payni');
      }

      return { transactionId: transId, redirectUrl };
    } catch (err) {
      if (err instanceof BadRequestException || err instanceof InternalServerErrorException) {
        throw err;
      }
      const message = isAxiosError(err)
        ? `${err.response?.status ?? 'network'} ${JSON.stringify(err.response?.data ?? err.message)}`
        : err instanceof Error
          ? err.message
          : String(err);
      this.logger.error(`Payni createPayment failed: ${message}`);
      throw new InternalServerErrorException('Could not start Payni payment');
    }
  }
}
