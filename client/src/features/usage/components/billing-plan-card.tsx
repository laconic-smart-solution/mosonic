import { Check, Loader2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { buttonVariants } from "@/lib/button-variants"
import { cn } from "@/lib/utils"
import {
  previousPlanName,
  pricingTierFromPlanName,
} from "@/features/marketing/lib/pricing-comparison-data"
import type { PublicPlan } from "@/shared/types/plan.type"

type BillingPlanCardProps = {
  plan: PublicPlan
  featured?: boolean
  isCurrent?: boolean
  canUpgrade?: boolean
  canRenew?: boolean
  isProcessing?: boolean
  onCheckout?: () => void
}

function formatThb(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

export function BillingPlanCard({
  plan,
  featured = false,
  isCurrent = false,
  canUpgrade = false,
  canRenew = false,
  isProcessing = false,
  onCheckout,
}: BillingPlanCardProps) {
  const { t } = useTranslation("usage")
  const { t: tm } = useTranslation("marketing")
  const isFree = plan.priceThb <= 0 && plan.priceUsd <= 0
  const isEnterprise = plan.name === "Enterprise"
  const tier = pricingTierFromPlanName(plan.name)
  const previousName = tier ? previousPlanName(tier) : null

  let actionLabel = tm("pricing.getStarted")
  if (isFree) actionLabel = tm("pricing.free")
  else if (isEnterprise) actionLabel = tm("pricing.contactSales")
  else if (isCurrent && canRenew) actionLabel = t("upgrade.renew")
  else if (canUpgrade) actionLabel = t("upgrade.upgradeTo", { plan: plan.name })
  else if (isCurrent) actionLabel = t("upgrade.currentPlan")

  return (
    <article
      className={cn(
        "relative flex h-full flex-col rounded-2xl border p-6 sm:p-7",
        isCurrent
          ? "border-primary ring-2 ring-primary/20"
          : featured
            ? "border-primary shadow-lg shadow-primary/10 ring-1 ring-primary"
            : "border-border bg-card",
      )}
      aria-labelledby={`plan-${plan.planId}-name`}
    >
      {isCurrent ? (
        <span className="absolute -top-3 left-4 rounded-full bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground">
          {t("upgrade.currentPlanBadge")}
        </span>
      ) : featured ? (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3.5 py-1 text-[11px] font-semibold tracking-wide text-primary-foreground">
          {tm("pricing.mostPopular")}
        </span>
      ) : null}

      <div className="space-y-1.5">
        <h3
          id={`plan-${plan.planId}-name`}
          className="text-xl font-semibold text-foreground"
        >
          {plan.name}
        </h3>
        {plan.description ? (
          <p className="text-sm leading-relaxed text-muted-foreground">{plan.description}</p>
        ) : null}
      </div>

      <div className="mt-6 border-b border-border pb-6">
        {isFree ? (
          <p className="font-heading text-3xl font-bold tracking-tight text-foreground">
            {tm("pricing.free")}
          </p>
        ) : (
          <p className="font-heading text-3xl font-bold tracking-tight text-foreground tabular-nums">
            ฿{formatThb(plan.priceThb)}
            <span className="text-base font-medium text-muted-foreground">
              {tm("pricing.perMonth")}
            </span>
          </p>
        )}
        {!isFree ? (
          <p className="mt-1 text-sm text-muted-foreground tabular-nums">
            ${plan.priceUsd.toLocaleString()}
            {tm("pricing.perMonth")}
          </p>
        ) : null}
        <p className="mt-3 text-sm font-medium text-teal-600 dark:text-teal-400">
          {tm("pricing.creditsPerMonth", {
            count: plan.creditsPerMonth.toLocaleString(),
          })}
        </p>
      </div>

      <div className="mt-5 flex flex-1 flex-col">
        {previousName ? (
          <p className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {tm("pricing.includesPrevious", { plan: previousName })}
          </p>
        ) : null}
        <ul className="flex flex-1 flex-col gap-2.5">
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2.5 text-sm text-foreground">
              <Check
                className="mt-0.5 size-4 shrink-0 text-teal-600 dark:text-teal-400"
                aria-hidden
              />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </div>

      {isEnterprise ? (
        <Link
          to="/#about"
          className={cn(buttonVariants({ variant: "outline", size: "lg" }), "mt-6 w-full")}
        >
          {actionLabel}
        </Link>
      ) : isCurrent && !canRenew ? (
        <Button variant="outline" size="lg" className="mt-6 w-full" disabled>
          {actionLabel}
        </Button>
      ) : isFree || (!canUpgrade && !canRenew) ? (
        <Button variant="outline" size="lg" className="mt-6 w-full" disabled={isCurrent}>
          {isCurrent ? t("upgrade.currentPlan") : actionLabel}
        </Button>
      ) : (
        <Button
          variant={featured || canUpgrade ? "default" : "outline"}
          size="lg"
          className="mt-6 w-full gap-2"
          disabled={isProcessing}
          onClick={onCheckout}
        >
          {isProcessing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {actionLabel}
        </Button>
      )}
    </article>
  )
}
