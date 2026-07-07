export type PublicPlan = {
  planId: string
  name: string
  priceThb: number
  priceUsd: number
  creditsPerMonth: number
  description: string | null
  features: string[]
}

export type InitiatePlanUpgradeResponse = {
  planPurchaseId?: string
  payniResponse?: {
    redirectUrl: string
    transactionId: string
  }
  instant?: {
    planName: string
    creditsRemaining: number
  }
}
