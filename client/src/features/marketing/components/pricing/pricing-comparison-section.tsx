import { useMemo, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import {
  BarChart3,
  ChevronDown,
  GitBranch,
  Loader2,
  Share2,
  Sparkles,
  X,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import {
  landingRevealUp,
  landingStaggerContainer,
} from "@/features/marketing/lib/landing-motion"
import {
  PRICING_COMPARISON_CATEGORIES,
  PRICING_TIER_KEYS,
  pricingTierFromPlanName,
  type ComparisonCell,
  type PricingTierKey,
} from "@/features/marketing/lib/pricing-comparison-data"
import { usePublicPlansQuery } from "@/shared/queries/plan.query"
import type { PublicPlan } from "@/shared/types/plan.type"

const FEATURED_PLAN_NAME = "Professional"

const CATEGORY_ICONS = {
  generation: Sparkles,
  workflow: GitBranch,
  publishing: Share2,
  analytics: BarChart3,
} as const

const GRID_CLASS =
  "grid grid-cols-[minmax(180px,1.4fr)_repeat(4,minmax(100px,1fr))] items-center"

function ComparisonCellValue({
  value,
  creditsLabel,
}: {
  value: ComparisonCell | undefined
  creditsLabel?: string
}) {
  const { t } = useTranslation("marketing")

  if (value === true) {
    return (
      <svg viewBox="0 0 16 16" fill="none" className="mx-auto size-4 text-teal-600 dark:text-teal-400" aria-hidden>
        <path
          d="M3.5 8.5L6.5 11.5L12.5 4.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }

  if (value === false) {
    return <X className="mx-auto size-4 text-muted-foreground/50" aria-hidden />
  }

  if (value === "limited") {
    return (
      <span className="text-xs font-medium text-muted-foreground">
        {t("pricing.comparison.limited")}
      </span>
    )
  }

  return (
    <span className="text-xs font-medium text-foreground tabular-nums">
      {creditsLabel ?? value}
    </span>
  )
}

function buildTierCredits(plans: PublicPlan[]): Partial<Record<PricingTierKey, string>> {
  const map: Partial<Record<PricingTierKey, string>> = {}
  for (const plan of plans) {
    const tier = pricingTierFromPlanName(plan.name)
    if (tier) {
      map[tier] = plan.creditsPerMonth.toLocaleString()
    }
  }
  return map
}

export function PricingComparisonSection() {
  const { t } = useTranslation("marketing")
  const reduceMotion = useReducedMotion()
  const plansQuery = usePublicPlansQuery()
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({
    generation: true,
    workflow: true,
    publishing: true,
    analytics: true,
  })

  const plans = useMemo(
    () => [...(plansQuery.data ?? [])].sort((a, b) => a.priceThb - b.priceThb),
    [plansQuery.data],
  )

  const tierCredits = useMemo(() => buildTierCredits(plans), [plans])

  const tierPlans = useMemo(() => {
    const map = new Map<PricingTierKey, PublicPlan>()
    for (const plan of plans) {
      const tier = pricingTierFromPlanName(plan.name)
      if (tier) map.set(tier, plan)
    }
    return map
  }, [plans])

  return (
    <motion.section
      className="border-t border-border bg-background/78 px-7 py-16 backdrop-blur-[2px] sm:py-20"
      variants={landingStaggerContainer}
      initial={reduceMotion ? false : "hidden"}
      animate={reduceMotion ? undefined : "show"}
    >
      <div className="mx-auto max-w-[1180px]">
        <motion.div className="mb-10 text-center sm:mb-12" variants={landingRevealUp}>
          <p
            className={cn(
              "inline-flex items-center gap-2 font-mono text-[12.5px] tracking-[0.14em] text-teal-600 uppercase dark:text-teal-400",
              "before:inline-block before:h-0.5 before:w-3.5 before:bg-amber-400 before:content-['']",
            )}
          >
            {t("pricing.comparison.eyebrow")}
          </p>
          <h2 className="mt-4 font-heading text-3xl leading-tight font-bold tracking-tight text-navy-700 sm:text-[2rem] dark:text-foreground">
            {t("pricing.comparison.title")}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-[17px]">
            {t("pricing.comparison.subtitle")}
          </p>
        </motion.div>

        {plansQuery.isLoading ? (
          <div
            className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"
            role="status"
          >
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t("pricing.loading")}
          </div>
        ) : plansQuery.isError || plans.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            {t("pricing.comparison.unavailable")}
          </p>
        ) : (
          <motion.div
            className="overflow-x-auto rounded-2xl border border-border bg-card/85 backdrop-blur-sm"
            variants={landingRevealUp}
          >
            <div className="min-w-[760px]">
              <div className={cn(GRID_CLASS, "border-b border-border px-4 py-4")}>
                <div />
                {PRICING_TIER_KEYS.map((tier) => {
                  const plan = tierPlans.get(tier)
                  if (!plan) return null
                  const featured = plan.name === FEATURED_PLAN_NAME
                  return (
                    <div
                      key={tier}
                      className={cn(
                        "text-center",
                        featured && "rounded-t-xl border-x border-t border-primary bg-primary/5 px-2",
                      )}
                    >
                      <div className="flex flex-col items-center gap-1">
                        {featured ? (
                          <span className="rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-semibold tracking-wide text-primary-foreground">
                            {t("pricing.mostPopular")}
                          </span>
                        ) : (
                          <span className="h-[18px]" aria-hidden />
                        )}
                        <span className="font-semibold text-foreground">{plan.name}</span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {PRICING_COMPARISON_CATEGORIES.map((category) => {
                const Icon = CATEGORY_ICONS[category.id as keyof typeof CATEGORY_ICONS]
                const isOpen = openCategories[category.id] ?? true

                return (
                  <Collapsible
                    key={category.id}
                    open={isOpen}
                    onOpenChange={(open) =>
                      setOpenCategories((prev) => ({ ...prev, [category.id]: open }))
                    }
                  >
                    <CollapsibleTrigger
                      className="flex w-full items-center justify-between gap-3 border-b border-border bg-muted/30 px-5 py-3.5 text-left hover:bg-muted/50"
                    >
                      <span className="flex items-center gap-2.5 font-medium text-foreground">
                        {Icon ? (
                          <Icon className="size-4 text-teal-600 dark:text-teal-400" />
                        ) : null}
                        {t(`pricing.comparison.categories.${category.id}.title`)}
                      </span>
                      <ChevronDown
                        className={cn(
                          "size-4 shrink-0 text-muted-foreground transition-transform",
                          isOpen && "rotate-180",
                        )}
                        aria-hidden
                      />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      {category.rows.map((row) => (
                        <div
                          key={row.id}
                          className={cn(GRID_CLASS, "border-b border-border/70 px-4 py-3.5 last:border-b-0")}
                        >
                          <div className="pr-4 text-sm text-muted-foreground">
                            {t(`pricing.comparison.categories.${category.id}.rows.${row.id}`)}
                          </div>
                          {PRICING_TIER_KEYS.map((tier) => {
                            const plan = tierPlans.get(tier)
                            const featured = plan?.name === FEATURED_PLAN_NAME
                            const isCredits = row.id === "monthlyCredits"
                            const cellValue = isCredits ? tierCredits[tier] : row.values[tier]

                            return (
                              <div
                                key={tier}
                                className={cn(
                                  "text-center",
                                  featured && "border-x border-primary/20 bg-primary/[0.03]",
                                )}
                              >
                                <ComparisonCellValue
                                  value={
                                    isCredits
                                      ? cellValue || false
                                      : cellValue
                                  }
                                  creditsLabel={
                                    isCredits && cellValue
                                      ? t("pricing.comparison.creditsValue", { count: cellValue })
                                      : undefined
                                  }
                                />
                              </div>
                            )
                          })}
                        </div>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                )
              })}
            </div>
          </motion.div>
        )}
      </div>
    </motion.section>
  )
}
