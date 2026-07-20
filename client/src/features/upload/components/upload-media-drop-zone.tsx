import { useDroppable } from "@dnd-kit/core"
import { ImageIcon, Upload, Video, X } from "lucide-react"
import { useCallback, useId, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { toastApiError } from "@/shared/lib/toast-error"

import { buttonVariants } from "@/lib/button-variants"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { uploadMediaService } from "@/shared/services/upload-media.service"

import { FileServiceImage, FileServiceVideo } from "./upload-display-media"
import { UploadMediaDetailDialog } from "./upload-media-detail-dialog"
import {
  isImageMediaTab,
  normalizeMediaTab,
  type MediaTabMode,
} from "../lib/upload-platform-media"
import type { UploadPaletteDragPayload } from "./upload-dnd-payload"

type UploadMediaDropZoneProps = {
  mode: MediaTabMode
  imageUrls: string[]
  videoUrl: string | null
  maxImages: number
  activeDrag: UploadPaletteDragPayload | null
  disabled?: boolean
  onRemoveImage: (index: number) => void
  onClear: () => void
  /** Called with URLs after each successful local upload batch (order preserved). */
  onUploadedUrls: (urls: string[]) => void
}

/** How many collage cells to show before collapsing the rest into +N. */
const COLLAGE_VISIBLE = 3
const MEDIA_FRAME_H = "h-56"

function mediaDropVisual(
  mode: MediaTabMode,
  active: UploadPaletteDragPayload | null,
): "idle" | "accept" | "reject" {
  if (!active) return "idle"
  if (mode === "video") {
    return active.kind === "video" ? "accept" : "reject"
  }
  return active.kind === "image" ? "accept" : "reject"
}

function filterFilesForMode(
  mode: MediaTabMode,
  files: File[],
  maxExtra: number,
): File[] {
  if (mode === "video") {
    return files.filter((f) => f.type.startsWith("video/")).slice(0, 1)
  }
  return files
    .filter((f) => f.type.startsWith("image/"))
    .slice(0, Math.max(0, maxExtra))
}

function collageGridClass(count: number): string {
  if (count <= 1) return "grid-cols-1 grid-rows-1"
  if (count === 2) return "grid-cols-2 grid-rows-1"
  if (count === 3) return "grid-cols-2 grid-rows-2"
  return "grid-cols-2 grid-rows-2"
}

function collageCellClass(count: number, index: number): string {
  if (count === 3 && index === 0) return "row-span-2"
  return ""
}

export function UploadMediaDropZone({
  mode,
  imageUrls,
  videoUrl,
  maxImages,
  activeDrag,
  disabled = false,
  onRemoveImage,
  onClear,
  onUploadedUrls,
}: UploadMediaDropZoneProps) {
  const { t } = useTranslation("upload")
  const normalizedMode = normalizeMediaTab(mode)
  const isImages = isImageMediaTab(mode)
  const visual = mediaDropVisual(normalizedMode, disabled ? null : activeDrag)
  const { isOver, setNodeRef } = useDroppable({ id: "drop-media", disabled })
  const fileInputId = useId()
  const [uploading, setUploading] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailImageIndex, setDetailImageIndex] = useState(0)

  const openMediaDetail = useCallback((imageIndex = 0) => {
    setDetailImageIndex(imageIndex)
    setDetailOpen(true)
  }, [])

  const atCapacity =
    isImages && maxImages > 0 && imageUrls.length >= maxImages

  const slotsLeft = isImages
    ? Math.max(0, maxImages - imageUrls.length)
    : 1

  const has = mode === "video" ? Boolean(videoUrl?.trim()) : imageUrls.length > 0

  const border =
    isOver && visual === "accept" && !atCapacity
      ? "border-[#1D9E75] bg-[#1D9E75]/10"
      : isOver && (visual === "reject" || atCapacity)
        ? "border-destructive bg-destructive/10"
        : has
          ? "border-border bg-card"
          : "border-dashed border-border bg-muted/30"

  const hint =
    mode === "video"
      ? "Drag video here or upload"
      : "Drop images or upload"

  const accept = mode === "video" ? "video/*" : "image/*"

  const runUpload = useCallback(
    async (files: File[]) => {
      if (disabled) return
      if (files.length === 0) {
        toast.error(
          mode === "video" ? "Choose a video file." : "Choose image file(s).",
        )
        return
      }
      setUploading(true)
      const urls: string[] = []
      try {
        for (const file of files) {
          const { url } = await uploadMediaService.uploadFile(file)
          urls.push(url)
        }
        onUploadedUrls(urls)
      } catch (err) {
        toastApiError(err, "upload:toast.mediaUploadFailed")
      } finally {
        setUploading(false)
      }
    },
    [disabled, mode, onUploadedUrls],
  )

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : []
    e.target.value = ""
    if (disabled) return
    if (files.length === 0) return
    const maxExtra = mode === "video" ? 1 : slotsLeft
    const use = filterFilesForMode(normalizedMode, files, maxExtra)
    void runUpload(use)
  }

  const onNativeDragOver = (e: React.DragEvent) => {
    if (!disabled && e.dataTransfer.types.includes("Files")) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  const onNativeDrop = (e: React.DragEvent) => {
    const dt = e.dataTransfer
    if (!dt?.files?.length) return
    if (disabled) return
    e.preventDefault()
    e.stopPropagation()
    if (uploading || atCapacity) return
    const maxExtra = mode === "video" ? 1 : slotsLeft
    const use = filterFilesForMode(normalizedMode, Array.from(dt.files), maxExtra)
    void runUpload(use)
  }

  const visibleImages = imageUrls.slice(0, COLLAGE_VISIBLE)
  const overflowCount = Math.max(0, imageUrls.length - COLLAGE_VISIBLE)
  const collageCount = visibleImages.length

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group relative rounded-md border-[1.5px] p-3 transition-colors",
        border,
      )}
      onDragOver={onNativeDragOver}
      onDragEnter={onNativeDragOver}
      onDrop={onNativeDrop}
    >
      <input
        id={fileInputId}
        type="file"
        className="sr-only"
        accept={accept}
        multiple={isImages}
        disabled={disabled}
        onChange={onFileInputChange}
        tabIndex={-1}
        aria-label={
          mode === "video" ? "Choose video file" : "Choose image file(s)"
        }
      />
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {mode === "video" ? (
            <Video className="size-3.5 shrink-0" aria-hidden />
          ) : (
            <ImageIcon className="size-3.5 shrink-0" aria-hidden />
          )}
          {mode === "video"
            ? "Video"
            : imageUrls.length > 1
              ? `Images (${imageUrls.length})`
              : "Images"}
        </div>
        {disabled ? (
          <span
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "pointer-events-none h-7 gap-1 px-2 text-[10px] opacity-50",
            )}
            aria-disabled="true"
          >
            <Upload className="size-3" aria-hidden />
            Locked
          </span>
        ) : uploading || atCapacity ? (
          <span
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "pointer-events-none h-7 gap-1 px-2 text-[10px] opacity-50",
            )}
            aria-disabled="true"
          >
            <Upload className="size-3" aria-hidden />
            {uploading ? "Uploading…" : "Upload"}
          </span>
        ) : (
          <label
            htmlFor={fileInputId}
            onPointerDown={(e) => e.stopPropagation()}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "h-7 cursor-pointer gap-1 px-2 text-[10px]",
            )}
          >
            <Upload className="size-3" aria-hidden />
            Upload
          </label>
        )}
      </div>

      <div
        className={cn(
          "relative overflow-hidden rounded-md border bg-muted/40",
          MEDIA_FRAME_H,
        )}
      >
        {!has && !uploading ? (
          <div className="flex size-full flex-col items-center justify-center gap-1 px-3 text-center text-[11px] text-muted-foreground">
            {disabled ? "Media cannot be changed after scheduling" : hint}
            {atCapacity ? (
              <span className="text-destructive">
                Maximum {maxImages} images
              </span>
            ) : null}
          </div>
        ) : null}

        {uploading && !has ? (
          <div className="flex size-full items-center justify-center text-[11px] text-muted-foreground">
            Uploading…
          </div>
        ) : null}

        {mode === "video" && videoUrl ? (
          <button
            type="button"
            className="relative block size-full cursor-zoom-in bg-black text-left"
            onClick={(e) => {
              e.stopPropagation()
              openMediaDetail(0)
            }}
            aria-label={t("mediaDetail.openHint")}
          >
            <FileServiceVideo
              url={videoUrl}
              controls
              muted={false}
              className="size-full object-contain"
            />
          </button>
        ) : null}

        {isImages && collageCount > 0 ? (
          <div
            className={cn(
              "grid size-full gap-0.5 bg-border",
              collageGridClass(collageCount),
            )}
          >
            {visibleImages.map((url, i) => {
              const isLastVisible = i === collageCount - 1
              const showOverflow = isLastVisible && overflowCount > 0
              return (
                <div
                  key={`${url}-${i}`}
                  className={cn(
                    "group/slot relative min-h-0 min-w-0 overflow-hidden bg-muted/60",
                    collageCellClass(collageCount, i),
                  )}
                >
                  <button
                    type="button"
                    className="relative block size-full cursor-zoom-in"
                    onClick={(e) => {
                      e.stopPropagation()
                      openMediaDetail(showOverflow ? COLLAGE_VISIBLE : i)
                    }}
                    aria-label={
                      showOverflow
                        ? t("mediaDetail.openOverflow", {
                            count: overflowCount,
                            defaultValue: `View ${overflowCount} more images`,
                          })
                        : t("mediaDetail.openHint")
                    }
                  >
                    <FileServiceImage
                      url={url}
                      alt=""
                      className={cn(
                        "size-full",
                        collageCount > 1 ? "object-cover" : "object-contain",
                      )}
                      loadingClassName="size-full"
                    />
                    {showOverflow ? (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-lg font-semibold text-white">
                        +{overflowCount}
                      </span>
                    ) : null}
                  </button>
                  {!disabled && !showOverflow ? (
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-1 right-1 size-6 rounded-full p-0 opacity-0 shadow-sm transition-opacity group-hover/slot:opacity-100"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation()
                        onRemoveImage(i)
                      }}
                      aria-label={`Remove image ${i + 1}`}
                    >
                      <X className="size-3" />
                    </Button>
                  ) : null}
                </div>
              )
            })}
          </div>
        ) : null}
      </div>

      {isOver && visual === "reject" ? (
        <p className="mt-2 text-center text-[11px] text-destructive">
          Wrong media type for this tab
        </p>
      ) : null}

      {has && !disabled ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 size-7 rounded-full border bg-background opacity-0 transition-opacity group-hover:opacity-100 hover:opacity-100"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onClear}
          aria-label="Clear media"
        >
          <X className="size-3.5" />
        </Button>
      ) : null}

      <UploadMediaDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        mediaTab={normalizedMode}
        imageUrls={imageUrls}
        videoUrl={videoUrl}
        initialImageIndex={detailImageIndex}
      />
    </div>
  )
}
