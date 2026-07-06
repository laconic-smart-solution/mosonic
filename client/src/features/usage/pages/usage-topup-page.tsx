import { useEffect, useState } from "react"
import { ExternalLink, Loader2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { usagePanelClass } from "@/features/usage/components/usage-plan-banner"
import {
  TopupAwaitingPayment,
  TopupPackagePicker,
} from "@/features/credit/components/topup-package-picker"
import { Button } from "@/components/ui/button"
import {
  useCreditPackagesQuery,
  useCreditTopupMutation,
} from "@/shared/queries/credit.query"
import { onCreditBalanceUpdated } from "@/shared/socket/credit-events"

export default function UsageTopupPage() {
  const { t } = useTranslation("credit")
  const { t: tu } = useTranslation("usage")
  const packagesQuery = useCreditPackagesQuery(true)
  const topupMutation = useCreditTopupMutation()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [awaitingPayment, setAwaitingPayment] = useState(false)
  const [pendingCredits, setPendingCredits] = useState<number | null>(null)

  const packages = packagesQuery.data ?? []

  useEffect(() => {
    if (selectedId === null && packages.length > 0) {
      setSelectedId(packages[0].id)
    }
  }, [packages, selectedId])

  useEffect(() => {
    if (!awaitingPayment) return
    return onCreditBalanceUpdated((payload) => {
      toast.success(
        t("topup.success", {
          credits: (pendingCredits ?? payload.creditsRemaining).toLocaleString(),
        }),
      )
      setAwaitingPayment(false)
      setPendingCredits(null)
    })
  }, [awaitingPayment, pendingCredits, t])

  function handleConfirm() {
    if (!selectedId) return
    const pkg = packages.find((p) => p.id === selectedId)
    topupMutation.mutate(
      { packageId: selectedId },
      {
        onSuccess: (data) => {
          if (data.instant) {
            toast.success(
              t("topup.success", {
                credits: (pkg?.credits ?? data.instant.creditsAdded).toLocaleString(),
              }),
            )
            return
          }

          const redirectUrl = data.payniResponse?.redirectUrl
          if (redirectUrl) {
            window.open(redirectUrl, "_blank", "noopener,noreferrer")
            setPendingCredits(pkg?.credits ?? null)
            setAwaitingPayment(true)
            return
          }

          toast.error(t("topup.error"))
        },
        onError: () => toast.error(t("topup.error")),
      },
    )
  }

  return (
    <div className="flex flex-col gap-4" role="tabpanel" aria-label={tu("tabs.topup")}>
      <div>
        <h2 className="font-heading text-lg font-semibold text-foreground">
          {tu("topupPage.title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{tu("topupPage.description")}</p>
      </div>

      <section className={`${usagePanelClass} p-5`}>
        {awaitingPayment ? (
          <TopupAwaitingPayment />
        ) : packagesQuery.isLoading ? (
          <div
            className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"
            role="status"
          >
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t("topup.loading")}
          </div>
        ) : packagesQuery.isError ? (
          <p className="py-8 text-center text-sm text-destructive" role="alert">
            {t("topup.loadError")}
          </p>
        ) : packages.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground" role="status">
            {t("topup.empty")}
          </p>
        ) : (
          <TopupPackagePicker
            packages={packages}
            selectedId={selectedId}
            onSelect={setSelectedId}
            disabled={topupMutation.isPending}
          />
        )}

        {!awaitingPayment && packages.length > 0 ? (
          <div className="mt-6 flex justify-end">
            <Button
              onClick={handleConfirm}
              disabled={!selectedId || topupMutation.isPending}
              className="gap-2"
            >
              {topupMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <ExternalLink className="size-4" aria-hidden />
              )}
              {topupMutation.isPending ? t("topup.processing") : t("topup.confirm")}
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  )
}
