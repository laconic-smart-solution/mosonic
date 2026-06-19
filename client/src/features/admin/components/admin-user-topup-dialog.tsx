import { useEffect, useId, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

import { useAdminUserActions } from "../hooks/use-admin-users"

const MAX_CREDITS = 100_000
const MIN_REASON_LENGTH = 3

export type AdminUserTopupTarget = {
  userId: string
  email: string
  creditsRemaining: number | null
  creditsPerMonth: number | null
}

type Props = {
  target: AdminUserTopupTarget | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function formatBalance(remaining: number | null, perMonth: number | null) {
  if (remaining == null && perMonth == null) return "—"
  return `${(remaining ?? 0).toLocaleString()}`
}

export function AdminUserTopupDialog({ target, open, onOpenChange }: Props) {
  const { t } = useTranslation("admin")
  const { topup } = useAdminUserActions()
  const creditsId = useId()
  const reasonId = useId()
  const creditsErrorId = useId()
  const reasonErrorId = useId()

  const [creditsInput, setCreditsInput] = useState("")
  const [reason, setReason] = useState("")
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    if (!open) {
      setCreditsInput("")
      setReason("")
      setTouched(false)
    }
  }, [open])

  const creditsValue = useMemo(() => {
    const parsed = Number.parseInt(creditsInput, 10)
    return Number.isFinite(parsed) ? parsed : NaN
  }, [creditsInput])

  const creditsError =
    touched && (!Number.isInteger(creditsValue) || creditsValue < 1 || creditsValue > MAX_CREDITS)
      ? t("users.topup.creditsInvalid", { max: MAX_CREDITS.toLocaleString() })
      : null

  const trimmedReason = reason.trim()
  const reasonError =
    touched && trimmedReason.length < MIN_REASON_LENGTH
      ? t("users.topup.reasonRequired")
      : null

  const currentRemaining = target?.creditsRemaining ?? 0
  const newBalance =
    Number.isInteger(creditsValue) && creditsValue >= 1
      ? currentRemaining + creditsValue
      : null

  const canSubmit =
    Boolean(target) &&
    Number.isInteger(creditsValue) &&
    creditsValue >= 1 &&
    creditsValue <= MAX_CREDITS &&
    trimmedReason.length >= MIN_REASON_LENGTH &&
    !topup.isPending

  function handleSubmit() {
    setTouched(true)
    if (!target || !canSubmit) return
    topup.mutate(
      { userId: target.userId, credits: creditsValue, reason: trimmedReason },
      { onSuccess: () => onOpenChange(false) },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("users.topup.title")}</DialogTitle>
          <DialogDescription>
            {t("users.topup.description", { email: target?.email ?? "" })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-sm">
            <span className="text-muted-foreground">{t("users.topup.currentBalance")}: </span>
            <span className="font-mono tabular-nums">
              {formatBalance(target?.creditsRemaining ?? null, target?.creditsPerMonth ?? null)}
            </span>
          </div>

          <div className="space-y-2">
            <Label htmlFor={creditsId}>{t("users.topup.creditsLabel")}</Label>
            <Input
              id={creditsId}
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_CREDITS}
              step={1}
              value={creditsInput}
              aria-invalid={Boolean(creditsError)}
              aria-describedby={creditsError ? creditsErrorId : undefined}
              onChange={(e) => setCreditsInput(e.target.value)}
              onBlur={() => setTouched(true)}
            />
            <p className="text-xs text-muted-foreground">{t("users.topup.creditsHint")}</p>
            {creditsError ? (
              <p id={creditsErrorId} className="text-xs text-destructive" role="alert">
                {creditsError}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor={reasonId}>{t("users.topup.reasonLabel")}</Label>
            <Textarea
              id={reasonId}
              value={reason}
              rows={3}
              aria-invalid={Boolean(reasonError)}
              aria-describedby={reasonError ? reasonErrorId : undefined}
              onChange={(e) => setReason(e.target.value)}
              onBlur={() => setTouched(true)}
            />
            <p className="text-xs text-muted-foreground">{t("users.topup.reasonHint")}</p>
            {reasonError ? (
              <p id={reasonErrorId} className="text-xs text-destructive" role="alert">
                {reasonError}
              </p>
            ) : null}
          </div>

          {newBalance != null ? (
            <p
              className={cn(
                "rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-sm",
              )}
              aria-live="polite"
            >
              {t("users.topup.preview", {
                current: currentRemaining.toLocaleString(),
                next: newBalance.toLocaleString(),
              })}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={topup.isPending}
            onClick={() => onOpenChange(false)}
          >
            {t("users.topup.cancel")}
          </Button>
          <Button type="button" disabled={!canSubmit} onClick={handleSubmit}>
            {topup.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            {topup.isPending ? t("users.topup.processing") : t("users.topup.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
