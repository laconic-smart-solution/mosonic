import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ApiProviderBillingSummaryDto,
  ZernioProfileSummaryDto,
} from '../api-usage/api-provider.types';
import type { SpendDateRange } from '../api-usage/cost-spend.util';
import {
  groupCostEntriesByDay,
  parseSpendDateRange,
  spendDaysInRange,
  sumCostEntriesUsd,
  toLocalIsoDate,
} from '../api-usage/cost-spend.util';
import { ZernioClient } from '../mcp/zernio/zernio.client';
import type { ICostEntryRepository } from '../repositories/interfaces/cost-entry.repository.interface';
import { COST_ENTRY_REPOSITORY } from '../repositories/tokens';
import { UsersService } from '../users/users.service';

const DEFAULT_SPEND_DAYS = 180;

function countAccountsPayload(accounts: unknown): number {
  return Array.isArray(accounts) ? accounts.length : 0;
}

@Injectable()
export class ZernioBillingService {
  constructor(
    private readonly config: ConfigService,
    private readonly zernioClient: ZernioClient,
    private readonly usersService: UsersService,
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
    const apiKey = this.config.get<string>('ZERNIO_API_KEY')?.trim() ?? '';

    const costRows = await this.costEntries.findInCreatedAtRangeByProvider(
      'zernio',
      range.from,
      range.to,
    );
    const dailySpend = groupCostEntriesByDay(costRows);
    const totalSpentUsd = costRows.length > 0 ? sumCostEntriesUsd(costRows) : 0;

    const zernioUsers =
      await this.usersService.listUserIdsWithZernioConnectedAccounts();
    const connectedAccountsCount = zernioUsers.reduce(
      (acc, row) => acc + row.accountCount,
      0,
    );

    let zernioProfiles: ZernioProfileSummaryDto[] = [];
    let zernioConnectedAccountsTotal: number | null = null;
    let syncError: string | null = null;

    if (apiKey) {
      try {
        const profiles = await this.zernioClient.listProfiles(true);
        const profileSummaries = await Promise.all(
          profiles.map(async (profile) => {
            let accountCount: number | null = null;
            try {
              const accounts = await this.zernioClient.listAccounts(
                profile._id,
              );
              accountCount = countAccountsPayload(accounts);
            } catch {
              accountCount = null;
            }
            return {
              id: profile._id,
              name: profile.name,
              isDefault: profile.isDefault === true,
              overLimit: profile.overLimit === true,
              accountCount,
            } satisfies ZernioProfileSummaryDto;
          }),
        );
        zernioProfiles = profileSummaries;
        const counted = profileSummaries
          .map((profile) => profile.accountCount)
          .filter((count): count is number => count != null);
        zernioConnectedAccountsTotal =
          counted.length > 0
            ? counted.reduce((acc, count) => acc + count, 0)
            : null;
      } catch (err) {
        syncError =
          err instanceof Error
            ? err.message
            : 'Failed to fetch Zernio profiles';
      }
    }

    const zernioProfilesTotal = zernioProfiles.length;
    const zernioDefaultProfiles = zernioProfiles.filter(
      (profile) => profile.isDefault,
    ).length;
    const zernioOverLimitProfiles = zernioProfiles.filter(
      (profile) => profile.overLimit,
    ).length;

    return {
      provider: 'zernio',
      prepaidCreditUsd: 0,
      totalSpentUsd,
      totalAvailableUsd: null,
      spendDays: spendDaysInRange(range),
      spendFrom: toLocalIsoDate(range.from),
      spendTo: toLocalIsoDate(range.to),
      dailySpend,
      apiKeyConfigured: Boolean(apiKey),
      syncError,
      updatedAt: null,
      updatedBy: null,
      connectedAccountsCount,
      zernioProfiles,
      zernioProfilesTotal: apiKey ? zernioProfilesTotal : null,
      zernioDefaultProfiles: apiKey ? zernioDefaultProfiles : null,
      zernioOverLimitProfiles: apiKey ? zernioOverLimitProfiles : null,
      zernioConnectedAccountsTotal,
    };
  }

  async updatePrepaidCreditUsd(
    _prepaidCreditUsd: number,
    _updatedBy: string,
  ): Promise<ApiProviderBillingSummaryDto> {
    return this.getSummary();
  }
}
