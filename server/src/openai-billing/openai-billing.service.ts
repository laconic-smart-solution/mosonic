import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fetchOpenAiSpendSummaryForRange } from './openai-costs.util';
import { ApiProviderBillingSettingsService } from '../api-usage/api-provider-billing-settings.service';
import type { ApiProviderBillingSummaryDto } from '../api-usage/api-provider.types';
import type { SpendDateRange } from '../api-usage/cost-spend.util';
import {
  parseSpendDateRange,
  spendDaysInRange,
  toLocalIsoDate,
} from '../api-usage/cost-spend.util';

export type OpenAiBillingSummaryDto = ApiProviderBillingSummaryDto;

@Injectable()
export class OpenAiBillingService {
  constructor(
    private readonly settings: ApiProviderBillingSettingsService,
    private readonly config: ConfigService,
  ) {}

  async getSummary(
    range: SpendDateRange = parseSpendDateRange(),
  ): Promise<OpenAiBillingSummaryDto> {
    const settings = await this.settings.ensureSettings('openai');
    const adminKey = this.config.get<string>('OPENAI_ADMIN_KEY')?.trim() ?? '';
    const projectKey = this.config.get<string>('OPENAI_API_KEY')?.trim() ?? '';

    let totalSpentUsd: number | null = null;
    let dailySpend: Array<{ date: string; amountUsd: number }> = [];
    let syncError: string | null = null;

    if (adminKey) {
      try {
        const spend = await fetchOpenAiSpendSummaryForRange(
          adminKey,
          range.from,
          range.to,
        );
        totalSpentUsd = spend.totalUsd;
        dailySpend = spend.daily;
      } catch (err) {
        syncError =
          err instanceof Error ? err.message : 'Failed to fetch OpenAI spend';
      }
    }

    const prepaidCreditUsd = settings.prepaidCreditUsd;
    const totalAvailableUsd =
      totalSpentUsd != null
        ? Math.max(0, prepaidCreditUsd - totalSpentUsd)
        : null;

    return {
      provider: 'openai',
      prepaidCreditUsd,
      totalSpentUsd,
      totalAvailableUsd,
      spendDays: spendDaysInRange(range),
      spendFrom: toLocalIsoDate(range.from),
      spendTo: toLocalIsoDate(range.to),
      dailySpend,
      apiKeyConfigured: Boolean(adminKey),
      adminKeyConfigured: Boolean(adminKey),
      projectKeyConfigured: Boolean(projectKey),
      syncError,
      updatedAt: settings.updatedAt.toISOString(),
      updatedBy: settings.updatedBy,
    };
  }

  async updatePrepaidCreditUsd(
    prepaidCreditUsd: number,
    updatedBy: string,
  ): Promise<OpenAiBillingSummaryDto> {
    await this.settings.updatePrepaidCreditUsd(
      'openai',
      prepaidCreditUsd,
      updatedBy,
    );
    return this.getSummary();
  }
}
