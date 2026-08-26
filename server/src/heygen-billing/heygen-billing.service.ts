import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiProviderBillingSettingsService } from '../api-usage/api-provider-billing-settings.service';
import type { ApiProviderBillingSummaryDto } from '../api-usage/api-provider.types';
import type { SpendDateRange } from '../api-usage/cost-spend.util';
import {
  groupCostEntriesByDay,
  parseSpendDateRange,
  spendDaysInRange,
  sumCostEntriesUsd,
  toLocalIsoDate,
} from '../api-usage/cost-spend.util';
import type { ICostEntryRepository } from '../repositories/interfaces/cost-entry.repository.interface';
import { COST_ENTRY_REPOSITORY } from '../repositories/tokens';
import { fetchHeygenWalletSummary } from './heygen-billing.util';

const DEFAULT_SPEND_DAYS = 180;

@Injectable()
export class HeygenBillingService {
  constructor(
    private readonly settings: ApiProviderBillingSettingsService,
    private readonly config: ConfigService,
    @Inject(COST_ENTRY_REPOSITORY)
    private readonly costEntries: ICostEntryRepository,
  ) {}

  async getSummary(
    range: SpendDateRange = parseSpendDateRange(
      undefined,
      undefined,
      DEFAULT_SPEND_DAYS,
    ),
  ): Promise<ApiProviderBillingSummaryDto> {
    const settings = await this.settings.ensureSettings('heygen');
    const apiKey = this.config.get<string>('HEYGEN_API_KEY')?.trim() ?? '';

    let walletBalanceUsd: number | null = null;
    let billingType: string | null = null;
    let liveBalanceFromApi = false;
    let syncError: string | null = null;

    const costRows = await this.costEntries.findInCreatedAtRangeByProvider(
      'heygen',
      range.from,
      range.to,
    );
    const dailySpend = groupCostEntriesByDay(costRows);
    const internalSpendUsd = sumCostEntriesUsd(costRows);
    const totalSpentUsd: number | null =
      costRows.length > 0 ? internalSpendUsd : null;

    if (apiKey) {
      try {
        const wallet = await fetchHeygenWalletSummary(apiKey);
        billingType = wallet.billingType;
        walletBalanceUsd = wallet.walletBalanceUsd;
        if (walletBalanceUsd != null) {
          liveBalanceFromApi = true;
        }
      } catch (err) {
        syncError =
          err instanceof Error ? err.message : 'Failed to fetch HeyGen billing';
      }
    }

    const prepaidCreditUsd = settings.prepaidCreditUsd;
    const totalAvailableUsd = liveBalanceFromApi
      ? walletBalanceUsd
      : totalSpentUsd != null
        ? Math.max(0, prepaidCreditUsd - totalSpentUsd)
        : null;

    return {
      provider: 'heygen',
      prepaidCreditUsd,
      totalSpentUsd,
      totalAvailableUsd,
      spendDays: spendDaysInRange(range),
      spendFrom: toLocalIsoDate(range.from),
      spendTo: toLocalIsoDate(range.to),
      dailySpend,
      apiKeyConfigured: Boolean(apiKey),
      syncError,
      updatedAt: settings.updatedAt.toISOString(),
      updatedBy: settings.updatedBy,
      liveBalanceFromApi,
      billingType,
      walletBalanceUsd,
    };
  }

  async updatePrepaidCreditUsd(
    prepaidCreditUsd: number,
    updatedBy: string,
  ): Promise<ApiProviderBillingSummaryDto> {
    await this.settings.updatePrepaidCreditUsd(
      'heygen',
      prepaidCreditUsd,
      updatedBy,
    );
    return this.getSummary();
  }
}
