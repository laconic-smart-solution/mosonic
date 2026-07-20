import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { io, type Socket } from "socket.io-client"
import { Loader2 } from "lucide-react"

import { appConfig } from "@/app/config/app-config"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { rednoteService } from "@/shared/services/rednote.service"
import { useAuthStore } from "@/shared/stores/auth.store"

type RedNoteQrConnectDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after POST /rednote/connect succeeds — parent starts connect then opens dialog. */
  socketRoom: string | null
  onSuccess: () => void
  onFailed: (reason: string) => void
}

function toImgSrc(image: string): string {
  if (image.startsWith("data:")) return image
  return `data:image/png;base64,${image}`
}

export function RedNoteQrConnectDialog({
  open,
  onOpenChange,
  socketRoom,
  onSuccess,
  onFailed,
}: RedNoteQrConnectDialogProps) {
  const { t } = useTranslation("settings")
  const [qrImage, setQrImage] = useState<string | null>(null)
  const [status, setStatus] = useState<"waiting" | "scanning" | "done" | "failed">(
    "waiting",
  )
  const [socketState, setSocketState] = useState<"connecting" | "connected" | "error">(
    "connecting",
  )
  const socketRef = useRef<Socket | null>(null)
  const finishedRef = useRef(false)
  const lastImageRef = useRef<string | null>(null)
  const onSuccessRef = useRef(onSuccess)
  const onFailedRef = useRef(onFailed)
  const onOpenChangeRef = useRef(onOpenChange)
  onSuccessRef.current = onSuccess
  onFailedRef.current = onFailed
  onOpenChangeRef.current = onOpenChange

  function applyQrFrame(image: string) {
    if (!image || image === lastImageRef.current) return
    lastImageRef.current = image
    setQrImage(image)
    setStatus("scanning")
  }

  useEffect(() => {
    if (!open || !socketRoom) return
    finishedRef.current = false
    lastImageRef.current = null
    setQrImage(null)
    setStatus("waiting")
    setSocketState("connecting")

    const isAuthenticated = useAuthStore.getState().isAuthenticated
    if (!isAuthenticated) {
      setSocketState("error")
      onFailedRef.current("missing_auth_token")
      return
    }

    const baseUrl = (appConfig.apiBaseUrl || "").replace(/\/$/, "")
    if (!baseUrl) {
      setSocketState("error")
      onFailedRef.current("missing_api_base_url")
      return
    }

    const socket = io(`${baseUrl}/rednote`, {
      transports: ["websocket", "polling"],
      withCredentials: true,
      forceNew: true,
    })
    socketRef.current = socket

    socket.on("connect", () => {
      setSocketState("connected")
      // Server also auto-joins on connect; emit again for older servers.
      socket.emit("join-login-session")
    })

    socket.on("connect_error", (err) => {
      // Keep polling — HTTP fallback can still deliver the QR.
      setSocketState("error")
      console.warn("[rednote] socket connect_error", err?.message || err)
    })

    socket.on("qr_frame", (payload: { image?: string }) => {
      if (payload?.image) applyQrFrame(payload.image)
    })

    socket.on("login_success", () => {
      finishedRef.current = true
      setStatus("done")
      onSuccessRef.current()
      onOpenChangeRef.current(false)
    })

    socket.on("login_failed", (payload: { reason?: string }) => {
      if (payload?.reason === "cancelled") return
      finishedRef.current = true
      setStatus("failed")
      onFailedRef.current(payload?.reason ?? "unknown")
    })

    // HTTP poll fallback — covers missed Socket.IO room joins / late connect.
    const pollId = window.setInterval(() => {
      if (finishedRef.current) return
      void rednoteService
        .getLatestQr()
        .then((res) => {
          if (res?.image) applyQrFrame(res.image)
        })
        .catch(() => undefined)
    }, 1000)

    return () => {
      window.clearInterval(pollId)
      socket.removeAllListeners()
      socket.disconnect()
      socketRef.current = null
    }
  }, [open, socketRoom])

  function handleClose() {
    if (!finishedRef.current) {
      void rednoteService.cancelConnect().catch(() => undefined)
    }
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose()
        else onOpenChange(true)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("rednote.connectTitle")}</DialogTitle>
          <DialogDescription>{t("rednote.connectDesc")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-2">
          {qrImage ? (
            <img
              src={toImgSrc(qrImage)}
              alt={t("rednote.scanPrompt")}
              className="size-64 rounded-lg border border-border bg-white p-3 object-contain"
              style={{ imageRendering: "pixelated" }}
            />
          ) : (
            <div className="flex size-56 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
            </div>
          )}
          <p className="text-center text-sm text-muted-foreground">
            {status === "failed"
              ? null
              : qrImage
                ? t("rednote.scanPrompt")
                : socketState === "error"
                  ? t("rednote.waitingQr")
                  : t("rednote.waitingQr")}
          </p>
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
