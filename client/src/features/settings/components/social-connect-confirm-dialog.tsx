import { useState } from "react"
import { useTranslation } from "react-i18next"
import { AlertTriangle, Coins, Link2, Loader2, Wallet } from "lucide-react"

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
  isConnecting?: boolean
}

function formatCredits(value: number): string {
  return Math.max(0, Math.round(value)).toLocaleString()
}

export function SocialConnectConfirmDialog({
  open,
  onOpenChange,
  channelLabel,
  creditsEach,
  creditsRemaining,
  loading = false,
  onConfirm,
  isConnecting = false,
}: Props) {
  const { t } = useTranslation("settings")
  const [topupOpen, setTopupOpen] = useState(false)

  const sufficient = creditsEach <= 0 || creditsRemaining >= creditsEach
  const balanceAfter = creditsRemaining - creditsEach
  const confirmDisabled = isConnecting || loading || !sufficient

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="size-4 text-primary" aria-hidden />
              {t("connectConfirm.title", { channel: channelLabel })}
            </DialogTitle>
            <DialogDescription>{t("connectConfirm.description")}</DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {t("connectConfirm.loading")}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-border bg-muted/30 p-3">
                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Coins className="size-3.5" aria-hidden />
                    {t("connectConfirm.estimatedCost")}
                  </span>
                  <span className="mt-1 block font-heading text-xl font-semibold tabular-nums">
                    {formatCredits(creditsEach)}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {t("connectConfirm.credits")}
                  </span>
                </div>
                <div className="rounded-2xl border border-border bg-muted/30 p-3">
                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Wallet className="size-3.5" aria-hidden />
                    {t("connectConfirm.currentBalance")}
                  </span>
                  <span className="mt-1 block font-heading text-xl font-semibold tabular-nums">
                    {formatCredits(creditsRemaining)}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {t("connectConfirm.credits")}
                  </span>
                </div>
              </div>

              {creditsEach > 0 ? (
                <div className="flex items-center justify-between px-1 text-sm">
                  <span className="text-muted-foreground">
                    {t("connectConfirm.balanceAfter")}
                  </span>
                  <span
                    className={cn(
                      "font-medium tabular-nums",
                      balanceAfter < 0 && "text-destructive",
                    )}
                  >
                    {formatCredits(balanceAfter)}
                  </span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("connectConfirm.noCharge")}
                </p>
              )}

              {!sufficient && creditsEach > 0 ? (
                <div className="flex flex-col gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-3">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-destructive">
                    <AlertTriangle className="size-4" aria-hidden />
                    {t("connectConfirm.insufficientTitle")}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {t("connectConfirm.insufficientDescription", {
                      required: formatCredits(creditsEach),
                      remaining: formatCredits(creditsRemaining),
                    })}
                  </p>
                  <Button
                    size="sm"
                    className="self-start"
                    onClick={() => setTopupOpen(true)}
                  >
                    {t("connectConfirm.refill")}
                  </Button>
                </div>
              ) : null}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isConnecting}
            >
              {t("connectConfirm.cancel")}
            </Button>
            <Button onClick={onConfirm} disabled={confirmDisabled}>
              {isConnecting && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {isConnecting
                ? t("connectConfirm.connecting")
                : t("connectConfirm.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TopupDialog open={topupOpen} onOpenChange={setTopupOpen} />
    </>
  )
}
