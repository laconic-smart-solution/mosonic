import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  ApiProviderBillingSummaryDto,
  ApiProviderId,
  ApiUsageSummaryDto,
} from './api-provider.types';
import type { SpendDateRange } from './cost-spend.util';
import { parseSpendDateRange } from './cost-spend.util';
import { HeygenBillingService } from '../heygen-billing/heygen-billing.service';
import { OpenAiBillingService } from '../openai-billing/openai-billing.service';
import { ZernioBillingService } from '../zernio-billing/zernio-billing.service';

@Injectable()
export class ApiUsageService {
  constructor(
    private readonly openai: OpenAiBillingService,
    private readonly heygen: HeygenBillingService,
    private readonly zernio: ZernioBillingService,
  ) {}

  async getAllSummaries(
    range: SpendDateRange = parseSpendDateRange(),
  ): Promise<ApiUsageSummaryDto> {
    const [openai, heygen, zernio] = await Promise.all([
      this.openai.getSummary(range),
      this.heygen.getSummary(range),
      this.zernio.getSummary(range),
    ]);
    return { openai, heygen, zernio };
  }

  async updatePrepaid(
    provider: ApiProviderId,
    prepaidCreditUsd: number,
    updatedBy: string,
  ): Promise<ApiProviderBillingSummaryDto> {
    switch (provider) {
      case 'openai':
        return this.openai.updatePrepaidCreditUsd(prepaidCreditUsd, updatedBy);
      case 'heygen':
        return this.heygen.updatePrepaidCreditUsd(prepaidCreditUsd, updatedBy);
      case 'zernio':
        return this.zernio.updatePrepaidCreditUsd(prepaidCreditUsd, updatedBy);
      default:
        throw new BadRequestException(`Unknown provider: ${provider}`);
    }
  }
}
