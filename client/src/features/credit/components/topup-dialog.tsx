import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { ExternalLink, Loader2, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  TopupAwaitingPayment,
  TopupPackagePicker,
} from "@/features/credit/components/topup-package-picker"
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
          <TopupAwaitingPayment />
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
        ) : packages.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground" role="status">
            {t("topup.empty")}
          </p>
        ) : (
          <TopupPackagePicker
            packages={packages}
            selectedId={selectedId}
            onSelect={setSelectedId}
            layout="compact"
            disabled={topupMutation.isPending}
          />
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
