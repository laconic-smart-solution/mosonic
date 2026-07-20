import { useCallback, useEffect, useId, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import {
  CheckCircle2,
  FileText,
  Loader2,
  Upload,
  XCircle,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

import { useAdminFaqDocumentUpload } from "../hooks/use-admin-faq"
import type { GenerateFaqsResponse } from "../types/faq.types"

const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".txt", ".md"] as const
const ACCEPT_ATTR = ".pdf,.docx,.txt,.md,application/pdf,text/plain,text/markdown"
const MAX_FILE_BYTES = 25 * 1024 * 1024

type UploadPhase = "idle" | "uploading" | "processing" | "success" | "error"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function hasAcceptedExtension(filename: string) {
  const lower = filename.toLowerCase()
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

export function AdminFaqUploadDialog({ open, onOpenChange }: Props) {
  const { t } = useTranslation("admin")
  const { t: tc } = useTranslation("common")
  const navigate = useNavigate()
  const upload = useAdminFaqDocumentUpload()
  const inputId = useId()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [phase, setPhase] = useState<UploadPhase>("idle")
  const [uploadPercent, setUploadPercent] = useState(0)
  const [processingPercent, setProcessingPercent] = useState(72)
  const [localError, setLocalError] = useState<string | null>(null)
  const [result, setResult] = useState<GenerateFaqsResponse | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const busy = phase === "uploading" || phase === "processing"

  const resetState = useCallback(() => {
    setFile(null)
    setPhase("idle")
    setUploadPercent(0)
    setProcessingPercent(72)
    setLocalError(null)
    setResult(null)
    setDragOver(false)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }, [])

  useEffect(() => {
    if (!open) resetState()
  }, [open, resetState])

  useEffect(() => {
    if (phase !== "processing") return
    const timer = window.setInterval(() => {
      setProcessingPercent((prev) => {
        if (prev >= 94) return prev
        return Math.min(94, Number((prev + Math.max(0.2, (94 - prev) * 0.06)).toFixed(2)))
      })
    }, 450)
    return () => window.clearInterval(timer)
  }, [phase])

  // Advance to processing when upload hits 100%, or when no progress events fire (tiny files).
  useEffect(() => {
    if (phase !== "uploading") return
    if (uploadPercent >= 100) {
      setPhase("processing")
      setProcessingPercent((prev) => Math.max(prev, 72))
      return
    }
    if (uploadPercent > 0) return
    const timer = window.setTimeout(() => {
      setPhase((current) => {
        if (current !== "uploading") return current
        setProcessingPercent((prev) => Math.max(prev, 72))
        return "processing"
      })
    }, 2000)
    return () => window.clearTimeout(timer)
  }, [phase, uploadPercent])

  const selectFile = useCallback(
    (next: File | null | undefined) => {
      if (!next) return
      if (!hasAcceptedExtension(next.name)) {
        setLocalError(t("faq.uploadDialog.invalidType"))
        setFile(null)
        setPhase("idle")
        return
      }
      if (next.size > MAX_FILE_BYTES) {
        setLocalError(t("faq.uploadDialog.tooLarge", { maxMb: 25 }))
        setFile(null)
        setPhase("idle")
        return
      }
      setLocalError(null)
      setResult(null)
      setFile(next)
      setPhase("idle")
      setUploadPercent(0)
      setProcessingPercent(72)
    },
    [t],
  )

  function handleOpenChange(next: boolean) {
    if (busy) return
    onOpenChange(next)
  }

  function handleUpload() {
    if (!file || busy) return
    setLocalError(null)
    setResult(null)
    setPhase("uploading")
    setUploadPercent(0)
    setProcessingPercent(72)

    upload.mutate(
      {
        file,
        onUploadProgress: (percent) => {
          setUploadPercent(percent)
          if (percent >= 100) {
            setPhase("processing")
            setProcessingPercent((prev) => Math.max(prev, 72))
          }
        },
      },
      {
        onSuccess: (data) => {
          setResult(data)
          setPhase("success")
          setUploadPercent(100)
          setProcessingPercent(100)
        },
        onError: () => {
          setPhase("error")
          setLocalError(t("faq.uploadError"))
        },
      },
    )
  }

  const displayPercent =
    phase === "uploading"
      ? Math.min(uploadPercent, 99)
      : phase === "processing"
        ? Math.max(uploadPercent, Math.round(processingPercent))
        : phase === "success"
          ? 100
          : uploadPercent

  const progressLabel =
    phase === "uploading"
      ? t("faq.uploadDialog.progressUploading")
      : phase === "processing"
        ? t("faq.uploadDialog.progressProcessing")
        : phase === "success"
          ? t("faq.uploadDialog.progressDone")
          : phase === "error"
            ? t("faq.uploadDialog.progressFailed")
            : t("faq.uploadDialog.progressIdle")

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>{t("faq.uploadDialog.title")}</DialogTitle>
          <DialogDescription>{t("faq.uploadDialog.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <input
            ref={fileInputRef}
            id={inputId}
            type="file"
            accept={ACCEPT_ATTR}
            className="sr-only"
            disabled={busy}
            onChange={(event) => {
              selectFile(event.target.files?.[0])
              event.target.value = ""
            }}
          />

          {phase === "success" && result ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-6 text-center">
              <CheckCircle2 className="size-10 text-emerald-600 dark:text-emerald-400" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  {t("faq.uploadDialog.successTitle")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("faq.uploadDialog.successHint", {
                    count: result.faq_count,
                    filename: file?.name ?? "",
                  })}
                </p>
              </div>
            </div>
          ) : (
            <>
              <label
                htmlFor={inputId}
                onDragEnter={(e) => {
                  e.preventDefault()
                  if (!busy) setDragOver(true)
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  if (!busy) setDragOver(true)
                }}
                onDragLeave={(e) => {
                  e.preventDefault()
                  setDragOver(false)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOver(false)
                  if (busy) return
                  selectFile(e.dataTransfer.files?.[0])
                }}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-8 text-center transition-colors",
                  dragOver
                    ? "border-primary bg-primary/5"
                    : "border-border bg-muted/20 hover:bg-muted/40",
                  busy && "pointer-events-none opacity-60",
                )}
              >
                <Upload className="size-8 text-muted-foreground" aria-hidden />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    {t("faq.uploadDialog.dropTitle")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("faq.uploadDialog.dropHint")}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="mt-1"
                  disabled={busy}
                  onClick={(e) => {
                    e.preventDefault()
                    fileInputRef.current?.click()
                  }}
                >
                  {t("faq.uploadDialog.browse")}
                </Button>
              </label>

              {file ? (
                <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 px-3 py-2.5">
                  <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatBytes(file.size)}
                    </p>
                  </div>
                  {!busy ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => {
                        setFile(null)
                        setLocalError(null)
                      }}
                    >
                      {t("faq.uploadDialog.remove")}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </>
          )}

          {(busy || phase === "success" || phase === "error") && (
            <div className="space-y-2 rounded-xl border border-border p-3">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  {busy ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : phase === "error" ? (
                    <XCircle className="size-3.5 text-destructive" aria-hidden />
                  ) : (
                    <CheckCircle2 className="size-3.5 text-emerald-600" aria-hidden />
                  )}
                  {progressLabel}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {displayPercent}%
                </span>
              </div>
              <Progress value={displayPercent} className="w-full gap-0" />
              {phase === "processing" ? (
                <p className="text-[11px] text-muted-foreground">
                  {t("faq.uploadDialog.processingHint")}
                </p>
              ) : null}
            </div>
          )}

          {localError ? (
            <p className="text-sm text-destructive" role="alert">
              {localError}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          {phase === "success" && result ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {tc("actions.close")}
              </Button>
              <Button
                onClick={() => {
                  onOpenChange(false)
                  navigate(`/admin/faq/documents/${result.document_id}`)
                }}
              >
                {t("faq.uploadDialog.viewDocument")}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => onOpenChange(false)}
              >
                {tc("actions.cancel")}
              </Button>
              <Button
                disabled={!file || busy}
                onClick={handleUpload}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Upload className="size-4" aria-hidden />
                )}
                {busy
                  ? t("faq.uploading")
                  : phase === "error"
                    ? t("faq.uploadDialog.retry")
                    : t("faq.uploadDialog.submit")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
