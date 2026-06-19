export type ApiProviderId = 'openai' | 'heygen' | 'zernio';

export const API_PROVIDERS: readonly ApiProviderId[] = [
  'openai',
  'heygen',
  'zernio',
] as const;

export type DailySpendRow = {
  date: string;
  amountUsd: number;
};

export type ApiProviderBillingSummaryDto = {
  provider: ApiProviderId;
  prepaidCreditUsd: number;
  totalSpentUsd: number | null;
  totalAvailableUsd: number | null;
  spendDays: number;
  dailySpend: DailySpendRow[];
  apiKeyConfigured: boolean;
  syncError: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  liveBalanceFromApi?: boolean;
  billingType?: string | null;
  walletBalanceUsd?: number | null;
  connectedAccountsCount?: number | null;
  adminKeyConfigured?: boolean;
  projectKeyConfigured?: boolean;
};

export type ApiUsageSummaryDto = {
  openai: ApiProviderBillingSummaryDto;
  heygen: ApiProviderBillingSummaryDto;
  zernio: ApiProviderBillingSummaryDto;
};
