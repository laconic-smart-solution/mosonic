import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiProviderBillingSettingsService } from '../api-usage/api-provider-billing-settings.service';
import type { ApiProviderBillingSummaryDto } from '../api-usage/api-provider.types';
import {
  groupCostEntriesByDay,
  spendRangeFromDays,
  sumCostEntriesUsd,
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

  async getSummary(spendDays = DEFAULT_SPEND_DAYS): Promise<ApiProviderBillingSummaryDto> {
    const settings = await this.settings.ensureSettings('heygen');
    const apiKey = this.config.get<string>('HEYGEN_API_KEY')?.trim() ?? '';

    let totalSpentUsd: number | null = null;
    let walletBalanceUsd: number | null = null;
    let billingType: string | null = null;
    let liveBalanceFromApi = false;
    let syncError: string | null = null;

    const { from, to } = spendRangeFromDays(spendDays);
    const costRows = await this.costEntries.findInCreatedAtRangeByProvider(
      'heygen',
      from,
      to,
    );
    const dailySpend = groupCostEntriesByDay(costRows);
    const internalSpendUsd = sumCostEntriesUsd(costRows);

    if (apiKey) {
      try {
        const wallet = await fetchHeygenWalletSummary(apiKey);
        billingType = wallet.billingType;
        walletBalanceUsd = wallet.walletBalanceUsd;
        if (wallet.spendingCurrentUsd != null) {
          totalSpentUsd = wallet.spendingCurrentUsd;
        }
        if (walletBalanceUsd != null) {
          liveBalanceFromApi = true;
        }
      } catch (err) {
        syncError =
          err instanceof Error ? err.message : 'Failed to fetch HeyGen billing';
      }
    }

    if (totalSpentUsd == null && costRows.length > 0) {
      totalSpentUsd = internalSpendUsd;
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
      spendDays,
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
