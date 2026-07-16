import { useEffect, useId, useState } from "react"
import { Loader2, MessageCircle, Send } from "lucide-react"
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
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

import {
  useAdminSendLineMessage,
  type AdminLineConnection,
} from "../hooks/use-admin-line"

const MAX_CHARS = 5000

type Props = {
  target: AdminLineConnection | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase()
}

export function AdminLineSendDialog({ target, open, onOpenChange }: Props) {
  const { t } = useTranslation("admin")
  const messageId = useId()
  const sendMutation = useAdminSendLineMessage()
  const [message, setMessage] = useState("")

  useEffect(() => {
    if (!open) setMessage("")
  }, [open])

  const trimmed = message.trim()
  const charCount = message.length
  const nearLimit = charCount > MAX_CHARS * 0.9
  const canSubmit =
    Boolean(target) && trimmed.length > 0 && !sendMutation.isPending

  const handleSubmit = () => {
    if (!target || !canSubmit) return
    sendMutation.mutate(
      { userId: target.userId, text: trimmed },
      { onSuccess: () => onOpenChange(false) },
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (sendMutation.isPending) return
        onOpenChange(next)
      }}
    >
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg">
        <div className="border-b border-border bg-muted/20 px-6 py-5">
          <DialogHeader className="gap-1.5">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <span className="inline-flex size-8 items-center justify-center rounded-lg bg-[#06C755]/15 text-[#06C755]">
                <MessageCircle className="size-4" aria-hidden />
              </span>
              {t("communication.line.sendTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("communication.line.sendDesc", {
                name: target?.displayName ?? "",
              })}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-4 px-6 py-5">
          {target ? (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3">
              <div
                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#06C755]/15 text-sm font-semibold text-[#06C755]"
                aria-hidden
              >
                {initials(target.displayName)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">
                  {target.displayName}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {target.email ?? t("communication.line.noEmail")}
                </div>
              </div>
              <span className="shrink-0 rounded-full bg-[#06C755]/12 px-2 py-0.5 text-[11px] font-medium text-[#06C755]">
                LINE
              </span>
            </div>
          ) : null}

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={messageId}>{t("communication.line.messageLabel")}</Label>
              <span
                className={cn(
                  "text-xs tabular-nums text-muted-foreground",
                  nearLimit && "text-amber-600 dark:text-amber-400",
                  charCount >= MAX_CHARS && "text-destructive",
                )}
              >
                {t("communication.line.charCount", {
                  count: charCount,
                  max: MAX_CHARS,
                })}
              </span>
            </div>
            <Textarea
              id={messageId}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={7}
              maxLength={MAX_CHARS}
              placeholder={t("communication.line.messagePlaceholder")}
              className="min-h-36 resize-y text-sm leading-relaxed"
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault()
                  handleSubmit()
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              {t("communication.line.sendHint")}
            </p>
          </div>
        </div>

        <DialogFooter className="border-t border-border bg-muted/10 px-6 py-4 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            disabled={sendMutation.isPending}
            onClick={() => onOpenChange(false)}
          >
            {t("communication.line.cancel")}
          </Button>
          <Button type="button" disabled={!canSubmit} onClick={handleSubmit}>
            {sendMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Send className="size-4" aria-hidden />
            )}
            {sendMutation.isPending
              ? t("communication.line.sending")
              : t("communication.line.send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
