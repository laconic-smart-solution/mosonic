export const PRICING_TIER_KEYS = ["free", "basic", "pro", "enterprise"] as const

export type PricingTierKey = (typeof PRICING_TIER_KEYS)[number]

const PLAN_NAME_TO_TIER: Record<string, PricingTierKey> = {
  Free: "free",
  Basic: "basic",
  Professional: "pro",
  Enterprise: "enterprise",
}

export function pricingTierFromPlanName(name: string): PricingTierKey | null {
  return PLAN_NAME_TO_TIER[name] ?? null
}

const PREVIOUS_PLAN_NAME: Partial<Record<PricingTierKey, string>> = {
  basic: "Free",
  pro: "Basic",
  enterprise: "Professional",
}

export function previousPlanName(tier: PricingTierKey): string | null {
  return PREVIOUS_PLAN_NAME[tier] ?? null
}
