import { useMemo } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Loader2 } from "lucide-react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import { landingStaggerContainer } from "@/features/marketing/lib/landing-motion"
import { PricingPlanCard } from "@/features/marketing/components/pricing/pricing-plan-card"
import { usePublicPlansQuery } from "@/shared/queries/plan.query"

const FEATURED_PLAN_NAME = "Professional"

export function PricingPlansSection() {
  const { t } = useTranslation("marketing")
  const reduceMotion = useReducedMotion()
  const plansQuery = usePublicPlansQuery()

  const plans = useMemo(
    () => [...(plansQuery.data ?? [])].sort((a, b) => a.priceThb - b.priceThb),
    [plansQuery.data],
  )

  return (
    <motion.section
      className="bg-background/78 px-7 pb-8 pt-4 backdrop-blur-[2px] sm:pb-12"
      variants={landingStaggerContainer}
      initial={reduceMotion ? false : "hidden"}
      animate={reduceMotion ? undefined : "show"}
    >
      <div className="mx-auto max-w-[1180px]">
        {plansQuery.isLoading ? (
          <div
            className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"
            role="status"
          >
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t("pricing.loading")}
          </div>
        ) : plansQuery.isError ? (
          <p className="py-16 text-center text-sm text-destructive" role="alert">
            {t("pricing.loadError")}
          </p>
        ) : plans.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">{t("pricing.empty")}</p>
        ) : (
          <div className="grid items-stretch gap-6 md:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan) => {
              const featured = plan.name === FEATURED_PLAN_NAME
              return (
                <div
                  key={plan.planId}
                  className={cn(featured && "xl:-mt-3 xl:mb-3")}
                >
                  <PricingPlanCard plan={plan} featured={featured} />
                </div>
              )
            })}
          </div>
        )}

        <p className="mx-auto mt-10 max-w-2xl text-center text-sm leading-relaxed text-muted-foreground">
          {t("pricing.checkoutNote")}
        </p>
      </div>
    </motion.section>
  )
}
