export const PRICING_TIER_KEYS = ["free", "basic", "pro", "enterprise"] as const

export type PricingTierKey = (typeof PRICING_TIER_KEYS)[number]

export type ComparisonCell = boolean | "limited" | string

export type ComparisonRowDef = {
  id: string
  values: Record<PricingTierKey, ComparisonCell>
}

export type ComparisonCategoryDef = {
  id: string
  rows: ComparisonRowDef[]
}

export const PRICING_COMPARISON_CATEGORIES: ComparisonCategoryDef[] = [
  {
    id: "generation",
    rows: [
      {
        id: "monthlyCredits",
        values: { free: "", basic: "", pro: "", enterprise: "" },
      },
      {
        id: "textGeneration",
        values: { free: true, basic: true, pro: true, enterprise: true },
      },
      {
        id: "imageGeneration",
        values: { free: "limited", basic: true, pro: true, enterprise: true },
      },
      {
        id: "videoGeneration",
        values: { free: false, basic: "limited", pro: true, enterprise: true },
      },
      {
        id: "translation",
        values: { free: true, basic: true, pro: true, enterprise: true },
      },
      {
        id: "versionHistory",
        values: { free: false, basic: true, pro: true, enterprise: true },
      },
    ],
  },
  {
    id: "workflow",
    rows: [
      {
        id: "workflowTemplates",
        values: { free: "limited", basic: true, pro: true, enterprise: true },
      },
      {
        id: "multiNodePipelines",
        values: { free: false, basic: true, pro: true, enterprise: true },
      },
      {
        id: "nodeRerun",
        values: { free: false, basic: false, pro: true, enterprise: true },
      },
      {
        id: "liveGenerationLogs",
        values: { free: true, basic: true, pro: true, enterprise: true },
      },
    ],
  },
  {
    id: "publishing",
    rows: [
      {
        id: "socialChannels",
        values: {
          free: "limited",
          basic: true,
          pro: true,
          enterprise: true,
        },
      },
      {
        id: "scheduledPublishing",
        values: { free: false, basic: true, pro: true, enterprise: true },
      },
      {
        id: "channelPreviews",
        values: { free: false, basic: true, pro: true, enterprise: true },
      },
      {
        id: "multiChannelUpload",
        values: { free: false, basic: false, pro: true, enterprise: true },
      },
    ],
  },
  {
    id: "analytics",
    rows: [
      {
        id: "usageDashboard",
        values: { free: true, basic: true, pro: true, enterprise: true },
      },
      {
        id: "campaignAnalytics",
        values: { free: false, basic: true, pro: true, enterprise: true },
      },
      {
        id: "ruleFeedback",
        values: { free: false, basic: false, pro: true, enterprise: true },
      },
      {
        id: "prioritySupport",
        values: { free: false, basic: false, pro: true, enterprise: true },
      },
    ],
  },
]

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
