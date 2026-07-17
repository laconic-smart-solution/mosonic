import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { ArrowUpCircle, Sparkles } from "lucide-react"

import { buttonVariants } from "@/lib/button-variants"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { periodCreditBudget } from "@/shared/lib/period-credit-budget"
import { useUsageSummaryQuery, useCurrentPlanQuery } from "@/shared/queries/usage.query"
import { usePublicPlansQuery } from "@/shared/queries/plan.query"

export const usagePanelClass =
  "overflow-hidden rounded-2xl border border-border bg-card"

function formatCredits(value: number): string {
  return Math.round(value).toLocaleString()
}

type UsagePlanBannerProps = {
  lowBalance?: boolean
  className?: string
}

export function UsagePlanBanner({ lowBalance = false, className }: UsagePlanBannerProps) {
  const { t } = useTranslation("usage")
  const summary = useUsageSummaryQuery()
  const currentPlanQuery = useCurrentPlanQuery()
  const plansQuery = usePublicPlansQuery()

  const data = summary.data
  const creditsPerMonth = data?.creditsPerMonth ?? 0
  const creditsUsed = data?.creditsUsed ?? 0
  const creditsRemaining = Math.max(0, data?.creditsRemaining ?? 0)
  const creditsBudget =
    data?.creditsBudget ??
    periodCreditBudget({
      creditsPerMonth,
      creditsUsed,
      creditsRemaining,
    })
  const percentUsed =
    creditsBudget > 0
      ? Math.min(100, Math.round((creditsUsed / creditsBudget) * 100))
      : 0

  const resetDate = data?.billingPeriod
    ? new Date(data.billingPeriod)
    : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)

  const currentPlanName = data?.plan?.name ?? ""
  const currentPlanId = currentPlanQuery.data?.plan?.planId
  const plans = plansQuery.data ?? []
  const sortedPlans = [...plans].sort((a, b) => a.priceThb - b.priceThb)
  const currentPlan = sortedPlans.find((p) => p.planId === currentPlanId)
  const highestPaidPlan = [...sortedPlans]
    .filter((p) => p.name !== "Enterprise" && p.priceThb > 0)
    .sort((a, b) => b.priceThb - a.priceThb)[0]
  const showUpgrade =
    currentPlan &&
    highestPaidPlan &&
    currentPlan.planId !== highestPaidPlan.planId &&
    currentPlan.priceThb < highestPaidPlan.priceThb

  const isLow =
    lowBalance ||
    (creditsBudget > 0 && creditsRemaining / creditsBudget < 0.1)

  return (
    <section className={cn(usagePanelClass, className)}>
      <div className="space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("planBanner.plan")}
            </div>
            <div className="text-lg font-semibold text-foreground">
              {currentPlanName || "—"}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/usage/topup"
              className={cn(
                buttonVariants({
                  size: "sm",
                  variant: isLow ? "default" : "outline",
                }),
                "gap-1.5",
              )}
            >
              <Sparkles className="size-3.5" aria-hidden />
              {t("planBanner.topUp")}
            </Link>
            {showUpgrade ? (
              <Link
                to="/usage/plans"
                className={cn(buttonVariants({ size: "sm", variant: "outline" }), "gap-1.5")}
              >
                <ArrowUpCircle className="size-3.5" aria-hidden />
                {t("planBanner.upgrade")}
              </Link>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap justify-between gap-2 text-sm text-muted-foreground">
          <span>
            {t("planBanner.resetDate", {
              date: resetDate.toLocaleDateString(),
            })}
          </span>
        </div>

        <Progress value={Math.min(percentUsed, 100)} className="h-2.5" aria-hidden />
        <div className="flex flex-wrap justify-between gap-2 text-sm text-foreground">
          <span>
            {t("planBanner.creditsUsed", {
              used: formatCredits(creditsUsed),
              total: formatCredits(creditsBudget),
            })}
          </span>
          <span className="text-muted-foreground">
            {t("planBanner.remaining", {
              count: formatCredits(creditsRemaining),
            })}
          </span>
        </div>
        {isLow ? (
          <p
            className="text-sm font-medium text-amber-600 dark:text-amber-400"
            role="status"
          >
            {t("planBanner.lowBalance")}
          </p>
        ) : null}
      </div>
    </section>
  )
}
