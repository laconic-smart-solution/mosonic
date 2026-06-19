export type ApiProviderId = "openai" | "heygen" | "zernio"

export type DailySpendRow = {
  date: string
  amountUsd: number
}

export type ApiProviderBillingSummary = {
  provider: ApiProviderId
  prepaidCreditUsd: number
  totalSpentUsd: number | null
  totalAvailableUsd: number | null
  spendDays: number
  dailySpend: DailySpendRow[]
  apiKeyConfigured: boolean
  syncError: string | null
  updatedAt: string | null
  updatedBy: string | null
  liveBalanceFromApi?: boolean
  billingType?: string | null
  walletBalanceUsd?: number | null
  connectedAccountsCount?: number | null
  adminKeyConfigured?: boolean
  projectKeyConfigured?: boolean
  zernioProfiles?: ZernioProfileSummary[]
  zernioProfilesTotal?: number | null
  zernioDefaultProfiles?: number | null
  zernioOverLimitProfiles?: number | null
  zernioConnectedAccountsTotal?: number | null
}

export type ZernioProfileSummary = {
  id: string
  name: string
  isDefault: boolean
  overLimit: boolean
  accountCount: number | null
}

export type ApiUsageSummary = {
  openai: ApiProviderBillingSummary
  heygen: ApiProviderBillingSummary
  zernio: ApiProviderBillingSummary
}

export type ApiUsageI18nPrefix = "openai" | "heygen" | "zernio"

export const API_USAGE_PROVIDER_CONFIG: Record<
  ApiProviderId,
  {
    i18nPrefix: ApiUsageI18nPrefix
    brandColor: string
    billingUrl: string
  }
> = {
  openai: {
    i18nPrefix: "openai",
    brandColor: "#10A37F",
    billingUrl: "https://platform.openai.com/settings/organization/billing",
  },
  heygen: {
    i18nPrefix: "heygen",
    brandColor: "#8755FF",
    billingUrl: "https://app.heygen.com/settings/billing",
  },
  zernio: {
    i18nPrefix: "zernio",
    brandColor: "#2563EB",
    billingUrl: "https://app.zernio.com/settings/billing",
  },
}
