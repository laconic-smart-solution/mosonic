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
import { UsersService } from '../users/users.service';

const DEFAULT_SPEND_DAYS = 180;

@Injectable()
export class ZernioBillingService {
  constructor(
    private readonly settings: ApiProviderBillingSettingsService,
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
    @Inject(COST_ENTRY_REPOSITORY)
    private readonly costEntries: ICostEntryRepository,
  ) {}

  async getSummary(spendDays = DEFAULT_SPEND_DAYS): Promise<ApiProviderBillingSummaryDto> {
    const settings = await this.settings.ensureSettings('zernio');
    const apiKey = this.config.get<string>('ZERNIO_API_KEY')?.trim() ?? '';

    const { from, to } = spendRangeFromDays(spendDays);
    const costRows = await this.costEntries.findInCreatedAtRangeByProvider(
      'zernio',
      from,
      to,
    );
    const dailySpend = groupCostEntriesByDay(costRows);
    const totalSpentUsd = costRows.length > 0 ? sumCostEntriesUsd(costRows) : 0;

    const zernioUsers =
      await this.usersService.listUserIdsWithZernioConnectedAccounts();
    const connectedAccountsCount = zernioUsers.reduce(
      (acc, row) => acc + row.accountCount,
      0,
    );

    const prepaidCreditUsd = settings.prepaidCreditUsd;
    const totalAvailableUsd = Math.max(0, prepaidCreditUsd - totalSpentUsd);

    return {
      provider: 'zernio',
      prepaidCreditUsd,
      totalSpentUsd,
      totalAvailableUsd,
      spendDays,
      dailySpend,
      apiKeyConfigured: Boolean(apiKey),
      syncError: null,
      updatedAt: settings.updatedAt.toISOString(),
      updatedBy: settings.updatedBy,
      connectedAccountsCount,
    };
  }

  async updatePrepaidCreditUsd(
    prepaidCreditUsd: number,
    updatedBy: string,
  ): Promise<ApiProviderBillingSummaryDto> {
    await this.settings.updatePrepaidCreditUsd(
      'zernio',
      prepaidCreditUsd,
      updatedBy,
    );
    return this.getSummary();
  }
}
