export type CostDashboardMonthly = {
  totalUsd: number
  limitUsd: number | null
  usedPct: number | null
  warningPct: number
}

export type CostDashboard = {
  totalUsd: number
  byProvider: Record<string, number>
  byEntryType: Record<string, number>
  byNodeType: Record<string, number>
  byCampaign: Record<string, number>
  byModel: Record<string, number>
  byDay: Record<string, number>
  monthly: CostDashboardMonthly
}

export type CostMonthly = {
  totalUsd: number
  limitUsd: number | null
  usedPct: number | null
  billingPeriod: string
}

export type CostBudgetSettings = {
  userId?: string
  monthlyLimitUsd?: number
  warningThresholdPct?: number
  onMonthlyLimitHit?: "warn" | "stop"
  perRunLimitUsd?: number
  onRunLimitHit?: "warn" | "stop"
  emailAlerts?: boolean
  inAppAlerts?: boolean
}

export type CostBudgetUpdate = {
  monthlyLimitUsd?: number
  warningThresholdPct?: number
  onMonthlyLimitHit?: "warn" | "stop"
  perRunLimitUsd?: number
  onRunLimitHit?: "warn" | "stop"
  emailAlerts?: boolean
  inAppAlerts?: boolean
}

export type PipelineCostEntry = {
  nodeType?: string
  model?: string
  costUsd: number
  createdAt?: string
}

export type PipelineCostBreakdown = {
  totalUsd: number
  byNodeType: Record<string, number>
  byEntryType: Record<string, number>
  entries: PipelineCostEntry[]
}
