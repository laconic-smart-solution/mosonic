import { useDroppable } from "@dnd-kit/core"
import { ImageIcon, Upload, Video, X } from "lucide-react"
import { useCallback, useId, useState } from "react"
import { toast } from "sonner"

import { buttonVariants } from "@/lib/button-variants"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { uploadMediaService } from "@/shared/services/upload-media.service"

import { FileServiceImage, FileServiceVideo } from "./upload-display-media"
import type { MediaTabMode } from "../lib/upload-platform-media"
import type { UploadPaletteDragPayload } from "./upload-dnd-payload"

type UploadMediaDropZoneProps = {
  mode: MediaTabMode
  imageUrls: string[]
  videoUrl: string | null
  maxImages: number
  activeDrag: UploadPaletteDragPayload | null
  disabled?: boolean
  carouselIndex?: number
  onRemoveImage: (index: number) => void
  onClear: () => void
  /** Called with URLs after each successful local upload batch (order preserved). */
  onUploadedUrls: (urls: string[]) => void
}

function mediaDropVisual(
  mode: MediaTabMode,
  active: UploadPaletteDragPayload | null
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
  maxExtra: number
): File[] {
  if (mode === "video") {
    return files.filter((f) => f.type.startsWith("video/")).slice(0, 1)
  }
  const images = files.filter((f) => f.type.startsWith("image/"))
  if (mode === "multiple") {
    return images.slice(0, Math.max(0, maxExtra))
  }
  return images.slice(0, 1)
}

export function UploadMediaDropZone({
  mode,
  imageUrls,
  videoUrl,
  maxImages,
  activeDrag,
  disabled = false,
  carouselIndex = 0,
  onRemoveImage,
  onClear,
  onUploadedUrls,
}: UploadMediaDropZoneProps) {
  const visual = mediaDropVisual(mode, disabled ? null : activeDrag)
  const { isOver, setNodeRef } = useDroppable({ id: "drop-media", disabled })
  const fileInputId = useId()
  const [uploading, setUploading] = useState(false)

  const atCapacity =
    mode === "multiple" && imageUrls.length >= maxImages && maxImages > 0

  const slotsLeft =
    mode === "multiple" ? Math.max(0, maxImages - imageUrls.length) : 1

  const has =
    mode === "video"
      ? Boolean(videoUrl?.trim())
      : mode === "single"
        ? imageUrls.length > 0
        : imageUrls.length > 0

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
      : mode === "multiple"
        ? "Drop images (carousel) or upload"
        : "Drag image here or upload"

  const accept = mode === "video" ? "video/*" : "image/*"

  const runUpload = useCallback(
    async (files: File[]) => {
      if (disabled) return
      if (files.length === 0) {
        toast.error(
          mode === "video" ? "Choose a video file." : "Choose image file(s)."
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
      } catch {
        toast.error("Upload failed. Try again.")
      } finally {
        setUploading(false)
      }
    },
    [disabled, mode, onUploadedUrls]
  )

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : []
    e.target.value = ""
    if (disabled) return
    if (files.length === 0) return
    const maxExtra = mode === "multiple" ? slotsLeft : mode === "video" ? 1 : 1
    const use = filterFilesForMode(mode, files, maxExtra)
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
    const maxExtra = mode === "multiple" ? slotsLeft : mode === "video" ? 1 : 1
    const use = filterFilesForMode(mode, Array.from(dt.files), maxExtra)
    void runUpload(use)
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group relative min-h-[100px] rounded-md border-[1.5px] p-3 transition-colors",
        border
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
        multiple={mode === "multiple"}
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
            : mode === "multiple"
              ? "Images"
              : "Image"}
        </div>
        {disabled ? (
          <span
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "pointer-events-none h-7 gap-1 px-2 text-[10px] opacity-50"
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
              "pointer-events-none h-7 gap-1 px-2 text-[10px] opacity-50"
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
              "h-7 cursor-pointer gap-1 px-2 text-[10px]"
            )}
          >
            <Upload className="size-3" aria-hidden />
            Upload
          </label>
        )}
      </div>

      {!has && !uploading ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 py-6 text-center text-[11px] text-muted-foreground">
          {disabled ? "Media cannot be changed after scheduling" : hint}
          {atCapacity ? (
            <span className="text-destructive">Maximum {maxImages} images</span>
          ) : null}
        </div>
      ) : null}

      {uploading && !has ? (
        <div className="flex flex-1 flex-col items-center justify-center py-6 text-center text-[11px] text-muted-foreground">
          Uploading…
        </div>
      ) : null}

      {mode === "video" && videoUrl ? (
        <FileServiceVideo
          url={videoUrl}
          controls
          muted={false}
          className="max-h-48 w-full rounded-md border bg-background"
        />
      ) : null}

      {mode === "single" && imageUrls[0] ? (
        <FileServiceImage
          url={imageUrls[0]}
          alt=""
          className="max-h-48 w-full rounded-md border object-cover"
          loadingClassName="max-h-48 w-full min-h-[8rem] rounded-md border"
        />
      ) : null}

      {mode === "multiple" && imageUrls.length > 0 ? (
        <div>
          <p className="mb-2 text-[10px] text-muted-foreground">
            {carouselIndex + 1} / {imageUrls.length}
          </p>
          <div className="flex flex-wrap gap-2">
            {imageUrls.map((url, i) => (
              <div
                key={`${url}-${i}`}
                className="group/slot relative size-[52px] overflow-hidden rounded-md border"
              >
                <FileServiceImage
                  url={url}
                  alt=""
                  className="size-full object-cover"
                  loadingClassName="size-full"
                />
                {!disabled ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute -top-1 -right-1 size-5 rounded-full p-0 opacity-0 transition-opacity group-hover/slot:opacity-100"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => onRemoveImage(i)}
                    aria-label={`Remove image ${i + 1}`}
                  >
                    <X className="size-2.5" />
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

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
    </div>
  )
}
