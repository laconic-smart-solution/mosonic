import { Check } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { buttonVariants } from "@/lib/button-variants"
import { cn } from "@/lib/utils"
import {
  previousPlanName,
  pricingTierFromPlanName,
} from "@/features/marketing/lib/pricing-comparison-data"
import type { PublicPlan } from "@/shared/types/plan.type"

type PricingPlanCardProps = {
  plan: PublicPlan
  featured?: boolean
}

function formatThb(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

export function PricingPlanCard({ plan, featured = false }: PricingPlanCardProps) {
  const { t } = useTranslation("marketing")
  const isFree = plan.priceThb <= 0 && plan.priceUsd <= 0
  const isEnterprise = plan.name === "Enterprise"
  const tier = pricingTierFromPlanName(plan.name)
  const previousName = tier ? previousPlanName(tier) : null

  return (
    <article
      className={cn(
        "relative flex h-full flex-col rounded-2xl border p-7 sm:p-8",
        "bg-card/85 backdrop-blur-sm",
        featured
          ? "z-[1] border-primary shadow-lg shadow-primary/10 ring-1 ring-primary"
          : "border-border",
      )}
    >
      {featured ? (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3.5 py-1 text-[11px] font-semibold tracking-wide text-primary-foreground">
          {t("pricing.mostPopular")}
        </span>
      ) : null}

      <div className="space-y-1.5">
        <h3 className="text-xl font-semibold text-foreground">{plan.name}</h3>
        {plan.description ? (
          <p className="text-sm leading-relaxed text-muted-foreground">{plan.description}</p>
        ) : null}
      </div>

      <div className="mt-7 border-b border-border pb-7">
        {isFree ? (
          <p className="font-heading text-4xl font-bold tracking-tight text-foreground sm:text-[2.75rem]">
            {t("pricing.free")}
          </p>
        ) : (
          <p className="font-heading text-4xl font-bold tracking-tight text-foreground tabular-nums sm:text-[2.75rem]">
            ฿{formatThb(plan.priceThb)}
            <span className="text-base font-medium text-muted-foreground">
              {t("pricing.perMonth")}
            </span>
          </p>
        )}
        {!isFree ? (
          <p className="mt-1 text-sm text-muted-foreground tabular-nums">
            ${plan.priceUsd.toLocaleString()}
            {t("pricing.perMonth")}
          </p>
        ) : null}
        <p className="mt-3 text-sm font-medium text-teal-600 dark:text-teal-400">
          {t("pricing.creditsPerMonth", {
            count: plan.creditsPerMonth.toLocaleString(),
          })}
        </p>
      </div>

      <div className="mt-6 flex flex-1 flex-col">
        {previousName ? (
          <p className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {t("pricing.includesPrevious", { plan: previousName })}
          </p>
        ) : null}

        <ul className="flex flex-1 flex-col gap-3">
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

      <Link
        to={isEnterprise ? "/#about" : "/signup"}
        className={cn(
          buttonVariants({ variant: featured ? "default" : "outline", size: "lg" }),
          "mt-8 w-full",
          !featured && !isEnterprise && "bg-muted/40 hover:bg-muted/60",
        )}
      >
        {isFree
          ? t("pricing.startFree")
          : isEnterprise
            ? t("pricing.contactSales")
            : featured
              ? t("pricing.upgradeTo", { plan: plan.name })
              : t("pricing.getStarted")}
      </Link>
    </article>
  )
}
