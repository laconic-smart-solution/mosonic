import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { BillingPlanCard } from "@/features/usage/components/billing-plan-card"
import { TopupAwaitingPayment } from "@/features/credit/components/topup-package-picker"
import { usagePanelClass } from "@/features/usage/components/usage-plan-banner"
import { pricingTierFromPlanName } from "@/features/marketing/lib/pricing-comparison-data"
import { usePublicPlansQuery, usePlanUpgradeMutation } from "@/shared/queries/plan.query"
import { useCurrentPlanQuery } from "@/shared/queries/usage.query"
import { onPlanUpdated } from "@/shared/socket/credit-events"

const FEATURED_PLAN_NAME = "Professional"

export default function UsagePlansPage() {
  const { t } = useTranslation("usage")
  const plansQuery = usePublicPlansQuery()
  const currentPlanQuery = useCurrentPlanQuery()
  const upgradeMutation = usePlanUpgradeMutation()
  const [awaitingPayment, setAwaitingPayment] = useState(false)
  const [pendingPlanName, setPendingPlanName] = useState<string | null>(null)
  const [processingPlanId, setProcessingPlanId] = useState<string | null>(null)

  const plans = [...(plansQuery.data ?? [])].sort((a, b) => a.priceThb - b.priceThb)
  const currentPlanId = currentPlanQuery.data?.plan?.planId
  const currentPrice = currentPlanQuery.data?.plan?.priceThb ?? 0

  useEffect(() => {
    if (!awaitingPayment) return
    return onPlanUpdated(() => {
      toast.success(
        t("upgrade.success", {
          plan: pendingPlanName ?? "",
        }),
      )
      setAwaitingPayment(false)
      setPendingPlanName(null)
      setProcessingPlanId(null)
    })
  }, [awaitingPayment, pendingPlanName, t])

  function handleCheckout(planId: string, planName: string) {
    setProcessingPlanId(planId)
    upgradeMutation.mutate(planId, {
      onSuccess: (data) => {
        if (data.instant) {
          toast.success(t("upgrade.success", { plan: data.instant.planName }))
          setProcessingPlanId(null)
          return
        }

        const redirectUrl = data.payniResponse?.redirectUrl
        if (redirectUrl) {
          window.open(redirectUrl, "_blank", "noopener,noreferrer")
          setPendingPlanName(planName)
          setAwaitingPayment(true)
          return
        }

        toast.error(t("upgrade.error"))
        setProcessingPlanId(null)
      },
      onError: () => {
        toast.error(t("upgrade.error"))
        setProcessingPlanId(null)
      },
    })
  }

  return (
    <div className="flex flex-col gap-6" role="tabpanel" aria-label={t("tabs.plans")}>
      <div>
        <h2 className="font-heading text-lg font-semibold text-foreground">
          {t("plansPage.title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("plansPage.description")}</p>
      </div>

      {awaitingPayment ? (
        <section className={`${usagePanelClass} p-5`}>
          <TopupAwaitingPayment />
          <p className="mt-3 text-center text-sm text-muted-foreground">
            {t("upgrade.awaitingPayment")}
          </p>
        </section>
      ) : null}

      {plansQuery.isLoading ? (
        <div
          className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"
          role="status"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t("plansPage.loading")}
        </div>
      ) : plansQuery.isError ? (
        <p className="py-8 text-center text-sm text-destructive" role="alert">
          {t("plansPage.loadError")}
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => {
            const isCurrent = plan.planId === currentPlanId
            const isEnterprise = plan.name === "Enterprise"
            const isFree = plan.priceThb <= 0
            const canUpgrade =
              !isCurrent &&
              !isEnterprise &&
              !isFree &&
              plan.priceThb > currentPrice
            const canRenew =
              isCurrent && plan.priceThb > 0 && !isEnterprise
            const featured =
              plan.name === FEATURED_PLAN_NAME ||
              pricingTierFromPlanName(plan.name) === "pro"

            return (
              <BillingPlanCard
                key={plan.planId}
                plan={plan}
                featured={featured && !isCurrent}
                isCurrent={isCurrent}
                canUpgrade={canUpgrade}
                canRenew={canRenew}
                isProcessing={processingPlanId === plan.planId}
                onCheckout={() => handleCheckout(plan.planId, plan.name)}
              />
            )
          })}
        </div>
      )}

      <p className="text-sm text-muted-foreground">{t("plansPage.renewNote")}</p>
    </div>
  )
}
