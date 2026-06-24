import { useId, useState } from "react"
import { useTranslation } from "react-i18next"
import { AlertTriangle, Coins, Loader2, LockOpen, Wallet } from "lucide-react"

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
import { TopupDialog } from "@/features/credit/components/topup-dialog"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  channelLabel: string
  creditsEach: number
  creditsRemaining: number
  loading?: boolean
  onConfirm: () => void
  isUnlocking?: boolean
}

function formatCredits(value: number): string {
  return Math.max(0, Math.round(value)).toLocaleString()
}

export function SocialUnlockConfirmDialog({
  open,
  onOpenChange,
  channelLabel,
  creditsEach,
  creditsRemaining,
  loading = false,
  onConfirm,
  isUnlocking = false,
}: Props) {
  const { t } = useTranslation("settings")
  const [topupOpen, setTopupOpen] = useState(false)
  const summaryId = useId()
  const insufficientId = useId()

  const sufficient = creditsEach <= 0 || creditsRemaining >= creditsEach
  const balanceAfter = creditsRemaining - creditsEach
  const confirmDisabled = isUnlocking || loading || !sufficient

  const confirmAriaLabel =
    creditsEach > 0
      ? t("unlockConfirm.confirmAriaWithCost", {
          channel: channelLabel,
          count: formatCredits(creditsEach),
        })
      : t("unlockConfirm.confirmAria", { channel: channelLabel })

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="sm:max-w-md"
          aria-describedby={loading ? undefined : summaryId}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LockOpen className="size-4 text-primary" aria-hidden />
              {t("unlockConfirm.title", { channel: channelLabel })}
            </DialogTitle>
            <DialogDescription>{t("unlockConfirm.description")}</DialogDescription>
          </DialogHeader>

          {loading ? (
            <div
              className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {t("unlockConfirm.loading")}
            </div>
          ) : (
            <div id={summaryId} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3" role="group" aria-label={t("unlockConfirm.costSummaryAria")}>
                <div className="rounded-2xl border border-border bg-muted/30 p-3">
                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Coins className="size-3.5" aria-hidden />
                    {t("unlockConfirm.estimatedCost")}
                  </span>
                  <span className="mt-1 block font-heading text-xl font-semibold tabular-nums">
                    {formatCredits(creditsEach)}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {t("unlockConfirm.credits")}
                  </span>
                </div>
                <div className="rounded-2xl border border-border bg-muted/30 p-3">
                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Wallet className="size-3.5" aria-hidden />
                    {t("unlockConfirm.currentBalance")}
                  </span>
                  <span className="mt-1 block font-heading text-xl font-semibold tabular-nums">
                    {formatCredits(creditsRemaining)}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {t("unlockConfirm.credits")}
                  </span>
                </div>
              </div>

              {creditsEach > 0 ? (
                <div className="flex items-center justify-between px-1 text-sm">
                  <span className="text-muted-foreground">
                    {t("unlockConfirm.balanceAfter")}
                  </span>
                  <span
                    className={cn(
                      "font-medium tabular-nums",
                      balanceAfter < 0 && "text-destructive",
                    )}
                    aria-label={t("unlockConfirm.balanceAfterAria", {
                      count: formatCredits(balanceAfter),
                    })}
                  >
                    {formatCredits(balanceAfter)}
                  </span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("unlockConfirm.noCharge")}</p>
              )}

              <p className="text-xs leading-relaxed text-muted-foreground">
                {t("unlockConfirm.chargeNotice")}
              </p>

              {!sufficient && creditsEach > 0 ? (
                <div
                  id={insufficientId}
                  className="flex flex-col gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-3"
                  role="alert"
                >
                  <span className="flex items-center gap-1.5 text-sm font-medium text-destructive">
                    <AlertTriangle className="size-4" aria-hidden />
                    {t("unlockConfirm.insufficientTitle")}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {t("unlockConfirm.insufficientDescription", {
                      required: formatCredits(creditsEach),
                      remaining: formatCredits(creditsRemaining),
                    })}
                  </p>
                  <Button
                    size="sm"
                    className="self-start"
                    onClick={() => setTopupOpen(true)}
                  >
                    {t("unlockConfirm.refill")}
                  </Button>
                </div>
              ) : null}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isUnlocking}
            >
              {t("unlockConfirm.cancel")}
            </Button>
            <Button
              onClick={onConfirm}
              disabled={confirmDisabled}
              aria-label={confirmAriaLabel}
              aria-describedby={!sufficient && creditsEach > 0 ? insufficientId : undefined}
            >
              {isUnlocking && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {isUnlocking ? t("unlockConfirm.unlocking") : t("unlockConfirm.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TopupDialog open={topupOpen} onOpenChange={setTopupOpen} />
    </>
  )
}
