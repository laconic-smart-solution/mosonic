export type PublicPlan = {
  planId: string
  name: string
  priceThb: number
  priceUsd: number
  creditsPerMonth: number
  description: string | null
  features: string[]
}
