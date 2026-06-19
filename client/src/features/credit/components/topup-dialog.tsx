import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Check, ExternalLink, Loader2, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import {
  useCreditPackagesQuery,
  useCreditTopupMutation,
} from "@/shared/queries/credit.query"
import { onCreditBalanceUpdated } from "@/shared/socket/credit-events"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onToppedUp?: (creditsRemaining: number) => void
}

function formatThb(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

export function TopupDialog({ open, onOpenChange, onToppedUp }: Props) {
  const { t } = useTranslation("credit")
  const packagesQuery = useCreditPackagesQuery(open)
  const topupMutation = useCreditTopupMutation()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [awaitingPayment, setAwaitingPayment] = useState(false)
  const [pendingCredits, setPendingCredits] = useState<number | null>(null)

  const packages = packagesQuery.data ?? []

  useEffect(() => {
    if (open && selectedId === null && packages.length > 0) {
      setSelectedId(packages[0].id)
    }
    if (!open) {
      setSelectedId(null)
      setAwaitingPayment(false)
      setPendingCredits(null)
    }
  }, [open, packages, selectedId])

  useEffect(() => {
    if (!awaitingPayment) return
    return onCreditBalanceUpdated((payload) => {
      toast.success(
        t("topup.success", {
          credits: (pendingCredits ?? payload.creditsRemaining).toLocaleString(),
        }),
      )
      onToppedUp?.(payload.creditsRemaining)
      setAwaitingPayment(false)
      setPendingCredits(null)
      onOpenChange(false)
    })
  }, [awaitingPayment, onOpenChange, onToppedUp, pendingCredits, t])

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
            onToppedUp?.(data.instant.creditsRemaining)
            onOpenChange(false)
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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (topupMutation.isPending) return
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" aria-hidden />
            {t("topup.title")}
          </DialogTitle>
          <DialogDescription>
            {awaitingPayment ? t("topup.awaitingPayment") : t("topup.description")}
          </DialogDescription>
        </DialogHeader>

        {awaitingPayment ? (
          <div
            className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-muted/30 px-4 py-8 text-center"
            role="status"
            aria-live="polite"
          >
            <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
            <p className="text-sm font-medium text-foreground">{t("topup.paymentWindowHint")}</p>
            <p className="text-xs text-muted-foreground">{t("topup.balanceUpdatesAutomatically")}</p>
          </div>
        ) : packagesQuery.isLoading ? (
          <div
            className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"
            role="status"
          >
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t("topup.loading")}
          </div>
        ) : packagesQuery.isError ? (
          <p className="py-6 text-center text-sm text-destructive" role="alert">
            {t("topup.loadError")}
          </p>
        ) : (
          <div
            role="radiogroup"
            aria-label={t("topup.title")}
            className="grid gap-3 sm:grid-cols-3"
          >
            {packages.map((pkg) => {
              const selected = pkg.id === selectedId
              return (
                <button
                  key={pkg.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setSelectedId(pkg.id)}
                  className={cn(
                    "relative flex flex-col items-start gap-1 rounded-2xl border p-4 text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    selected
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40 hover:bg-muted/50",
                  )}
                >
                  {selected && (
                    <span className="absolute top-3 right-3 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-3" aria-hidden />
                    </span>
                  )}
                  <span className="text-xs font-medium text-muted-foreground">{pkg.label}</span>
                  <span className="font-heading text-xl font-semibold tabular-nums">
                    {pkg.credits.toLocaleString()}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t("topup.credits")} · ฿{formatThb(pkg.priceThb)}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        <DialogFooter>
          {awaitingPayment ? (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("topup.close")}
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={topupMutation.isPending}
              >
                {t("topup.cancel")}
              </Button>
              <Button onClick={handleConfirm} disabled={!selectedId || topupMutation.isPending}>
                {topupMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <ExternalLink className="size-4" aria-hidden />
                )}
                {topupMutation.isPending ? t("topup.processing") : t("topup.confirm")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
