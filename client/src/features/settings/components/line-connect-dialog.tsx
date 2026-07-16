import { CheckCircle2, Copy, Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
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
import {
  lineQueryKeys,
  useLineConnectStartQuery,
  useLineConnectStatusQuery,
  useLineDisconnectMutation,
} from "@/shared/queries/line.query"
import type { LineConnectStatus } from "@/shared/services/line.service"

type LineConnectDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LineConnectDialog({ open, onOpenChange }: LineConnectDialogProps) {
  const { t } = useTranslation("settings")
  const queryClient = useQueryClient()
  const [copied, setCopied] = useState(false)

  // Status first: if LINE id exists, never start another CONNECT session.
  const statusQuery = useLineConnectStatusQuery({
    enabled: open,
    refetchInterval: (query) => {
      if (!open) return false
      const data = query.state.data as LineConnectStatus | undefined
      return data?.connected ? false : 2500
    },
  })

  const alreadyConnected = statusQuery.data?.connected === true

  const connectQuery = useLineConnectStartQuery({
    enabled: open && statusQuery.isSuccess && !alreadyConnected,
  })

  const disconnectMutation = useLineDisconnectMutation()

  const connected = alreadyConnected || connectQuery.data?.connected === true
  const connectMessage =
    connectQuery.data?.connectMessage ?? statusQuery.data?.connectMessage
  const qrImage = connectQuery.data?.qrImage
  const addFriendUrl = connectQuery.data?.addFriendUrl
  const expiresInSeconds =
    statusQuery.data?.expiresInSeconds ?? connectQuery.data?.expiresInSeconds

  useEffect(() => {
    if (!open) setCopied(false)
  }, [open])

  useEffect(() => {
    if (!open || !connected) return
    void queryClient.invalidateQueries({ queryKey: lineQueryKeys.connectStatus })
    void queryClient.invalidateQueries({ queryKey: lineQueryKeys.connectSession })
  }, [open, connected, queryClient])

  const copyCode = async () => {
    if (!connectMessage) return
    try {
      await navigator.clipboard.writeText(connectMessage)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  const loading =
    statusQuery.isLoading ||
    (!alreadyConnected && connectQuery.isLoading && statusQuery.isSuccess)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {connected ? t("contact.line.connectedTitle") : t("contact.line.qrTitle")}
          </DialogTitle>
          <DialogDescription>
            {connected ? t("contact.line.connectedDesc") : t("contact.line.qrDesc")}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="mx-auto flex size-56 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        ) : statusQuery.isError || (!connected && connectQuery.isError) ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {t("contact.line.loadFailed")}
          </div>
        ) : connected ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <CheckCircle2 className="size-12 text-[#06C755]" />
            <p className="text-center text-sm font-medium text-foreground">
              {t("contact.line.statusBadge")}
            </p>
            <p className="text-center text-xs text-muted-foreground">
              {t("contact.line.alreadyLinkedHint")}
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-2">
            {qrImage ? (
              <img
                src={qrImage}
                alt={t("contact.line.qrTitle")}
                className="size-56 rounded-lg border border-border bg-white p-3 object-contain"
              />
            ) : (
              <div className="flex size-56 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-4 text-center text-xs text-muted-foreground">
                {t("contact.line.qrUnavailable")}
              </div>
            )}

            <div className="w-full rounded-xl border border-border bg-muted/30 px-4 py-3">
              <p className="text-xs text-muted-foreground">{t("contact.line.step1")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("contact.line.step2")}</p>
              <div className="mt-3 flex items-center gap-2">
                <code className="flex-1 truncate rounded-md bg-background px-3 py-2 text-sm font-semibold tracking-wide">
                  {connectMessage ?? "—"}
                </code>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={() => void copyCode()}
                  disabled={!connectMessage}
                  aria-label={t("contact.line.copyCode")}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
              {copied ? (
                <p className="mt-2 text-xs text-[#06C755]">{t("contact.line.copied")}</p>
              ) : null}
              {typeof expiresInSeconds === "number" ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("contact.line.codeExpires", {
                    minutes: Math.max(1, Math.ceil(expiresInSeconds / 60)),
                  })}
                </p>
              ) : null}
              <p className="mt-2 text-xs text-muted-foreground">{t("contact.line.waiting")}</p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          {connected ? (
            <>
              <Button
                variant="outline"
                disabled={disconnectMutation.isPending}
                onClick={() => void disconnectMutation.mutateAsync()}
              >
                {disconnectMutation.isPending
                  ? t("contact.line.disconnecting")
                  : t("contact.line.disconnect")}
              </Button>
              <Button onClick={() => onOpenChange(false)}>{t("contact.line.done")}</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t("unlockConfirm.cancel")}
              </Button>
              <Button
                disabled={!addFriendUrl}
                onClick={() => {
                  if (!addFriendUrl) return
                  window.open(addFriendUrl, "_blank", "noopener,noreferrer")
                }}
              >
                {t("contact.line.openLineApp")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
