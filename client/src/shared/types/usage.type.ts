export type UsagePlanSummary = {
  name: string
  creditsPerMonth: number
  priceThb: number
} | null

export type UsageSummary = {
  creditPriceUsd: number
  plan: UsagePlanSummary
  creditsUsed: number
  creditsRemaining: number
  creditsPerMonth: number
  percentUsed: number
  billingPeriod: string
  byNodeType: Array<{ nodeType: string; creditsCharged: number; count: number }>
  dailyTrend: Array<{ date: string; creditsCharged: number }>
  totalGenerations: number
}

export type UsageLedgerEntry = {
  _id?: string
  pipelineRef: string
  nodeType: string
  provider: string
  model?: string
  creditsCharged: number
  creditPriceUsdSnapshot?: number
  rawCostUsd?: number
  createdAt: string
}

export type UsageHistoryResponse = {
  entries: UsageLedgerEntry[]
  total: number
  page: number
  totalPages: number
}

export type CurrentPlanResponse = {
  creditPriceUsd: number
  plan: {
    planId: string
    name: string
    creditsPerMonth: number
    priceThb: number
    priceUsd: number
  } | null
  creditsUsed: number
  creditsRemaining: number
  billingPeriod: string
}
