import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Loader2, RefreshCw, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { MediaLoadPlaceholder } from "@/shared/components/media-load-placeholder"
import { useFileObjectUrl } from "@/shared/hooks/use-file-object-url"
import { cn } from "@/lib/utils"
import { uploadMediaService } from "@/shared/services/upload-media.service"
import type { NodeReviewPayload } from "@/shared/types/pipeline.type"

const TEXT_NODE_TYPES = new Set([
  "text_generation",
  "translation",
  "summarization",
  "transcription",
  "adapt",
  "keyword_planner",
  "intelligence",
])

const MEDIA_NODE_TYPES = new Set(["image_generation", "video_generation"])

type Props = {
  nodeType: string
  reviewText?: string
  previewImage?: string
  previewVideo?: string
  isSubmitting?: boolean
  variant?: "inline" | "dialog"
  regenerateCredits?: number
  regenerateCreditsLoading?: boolean
  regenerateDisabled?: boolean
  onRegenerateInsufficient?: () => void
  onReview: (payload: NodeReviewPayload) => void
}

function formatCredits(value: number): string {
  return Math.max(0, Math.round(value)).toLocaleString()
}

export function WorkflowNodeReviewCard({
  nodeType,
  reviewText = "",
  previewImage,
  previewVideo,
  isSubmitting = false,
  variant = "inline",
  regenerateCredits = 0,
  regenerateCreditsLoading = false,
  regenerateDisabled = false,
  onRegenerateInsufficient,
  onReview,
}: Props) {
  const { t } = useTranslation("workflow")
  const [draft, setDraft] = useState(reviewText)
  const [instruction, setInstruction] = useState("")
  const [mediaUrl, setMediaUrl] = useState<string | undefined>()
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const originalRef = useRef(reviewText)

  useEffect(() => {
    originalRef.current = reviewText
    setDraft(reviewText)
    setInstruction("")
    setMediaUrl(undefined)
  }, [reviewText])

  const isText = TEXT_NODE_TYPES.has(nodeType)
  const isMedia = MEDIA_NODE_TYPES.has(nodeType)
  const busy = isSubmitting || uploading
  const isDialog = variant === "dialog"

  const imagePreviewRef =
    nodeType === "image_generation" ? mediaUrl ?? previewImage : undefined
  const videoPreviewRef =
    nodeType === "video_generation" ? mediaUrl ?? previewVideo : undefined
  const imageMedia = useFileObjectUrl(imagePreviewRef)
  const videoMedia = useFileObjectUrl(videoPreviewRef)
  const imageSrc =
    imageMedia.status === "ready" ? imageMedia.src : undefined
  const videoSrc =
    videoMedia.status === "ready" ? videoMedia.src : undefined

  async function handleUpload(file: File) {
    setUploading(true)
    try {
      const { url } = await uploadMediaService.uploadFile(file)
      setMediaUrl(url)
    } finally {
      setUploading(false)
    }
  }

  function handleContinue() {
    if (isText) {
      const trimmed = draft.trim()
      if (!trimmed) return
      if (trimmed !== originalRef.current.trim()) {
        onReview({ action: "edit", editedContent: trimmed })
        return
      }
    }
    if (isMedia && mediaUrl) {
      onReview({ action: "edit", mediaUrl })
      return
    }
    onReview({ action: "continue" })
  }

  function handleRegenerate() {
    if (regenerateDisabled) {
      onRegenerateInsufficient?.()
      return
    }
    onReview({
      action: "regenerate",
      ...(instruction.trim() ? { regenerateInstruction: instruction.trim() } : {}),
    })
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        !isDialog &&
          "mt-2 rounded-lg border border-teal-500/30 bg-teal-500/5 p-2",
      )}
    >
      {!isDialog ? (
        <span className="text-[10px] font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-400">
          {t("stepMode.reviewTitle")}
        </span>
      ) : null}

      {isText ? (
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={isDialog ? 12 : 4}
          className={cn(
            "resize-y",
            isDialog ? "min-h-[200px] text-sm" : "min-h-[72px] text-[11px]",
          )}
          disabled={busy}
        />
      ) : null}

      {isMedia && nodeType === "image_generation" ? (
        <div className="flex flex-col gap-2">
          {imageSrc ? (
            <img
              src={imageSrc}
              alt={t("stepMode.previewAlt")}
              className={cn(
                "w-full rounded-md object-contain",
                isDialog ? "max-h-64" : "max-h-24 object-cover",
              )}
            />
          ) : (
            <MediaLoadPlaceholder
              className={cn(
                "w-full rounded-md border border-border bg-muted/30",
                isDialog ? "min-h-[200px]" : "min-h-[96px]",
              )}
              progress={imageMedia.progress}
              status={imageMedia.status === "error" ? "error" : "loading"}
              kind="image"
              compact={!isDialog}
            />
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleUpload(file)
              e.target.value = ""
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={isDialog ? undefined : "h-7 text-[10px]"}
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Upload className="size-3" />
            )}
            {t("stepMode.replaceImage")}
          </Button>
        </div>
      ) : null}

      {isMedia && nodeType === "video_generation" ? (
        <div className="flex flex-col gap-2">
          {videoSrc ? (
            <video
              src={videoSrc}
              className={cn(
                "w-full rounded-md object-contain",
                isDialog ? "max-h-64" : "max-h-24 object-cover",
              )}
              muted
              controls
            />
          ) : (
            <MediaLoadPlaceholder
              className={cn(
                "w-full rounded-md border border-border bg-muted/30",
                isDialog ? "min-h-[200px]" : "min-h-[96px]",
              )}
              progress={videoMedia.progress}
              status={videoMedia.status === "error" ? "error" : "loading"}
              kind="video"
              compact={!isDialog}
            />
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleUpload(file)
              e.target.value = ""
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={isDialog ? undefined : "h-7 text-[10px]"}
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Upload className="size-3" />
            )}
            {t("stepMode.replaceVideo")}
          </Button>
        </div>
      ) : null}

      <Textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        rows={isDialog ? 3 : 2}
        placeholder={t("stepMode.regeneratePlaceholder")}
        className={cn(
          "resize-y",
          isDialog ? "min-h-[72px] text-sm" : "min-h-[40px] text-[10px]",
        )}
        disabled={busy}
      />

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          className={cn("flex-1", !isDialog && "h-7 text-[10px]")}
          disabled={busy || (isText && !draft.trim())}
          onClick={handleContinue}
        >
          {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
          {t("stepMode.continue")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn("flex-1", !isDialog && "h-7 text-[10px]")}
          disabled={busy || regenerateDisabled || regenerateCreditsLoading}
          onClick={handleRegenerate}
        >
          <RefreshCw className="size-4" />
          {regenerateCreditsLoading ? (
            t("stepMode.regenerate")
          ) : regenerateCredits > 0 ? (
            t("stepMode.regenerateWithCredits", {
              credits: formatCredits(regenerateCredits),
            })
          ) : (
            t("stepMode.regenerate")
          )}
        </Button>
      </div>
    </div>
  )
}
