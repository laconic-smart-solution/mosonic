import { useEffect, useState } from "react"
import { ChevronLeft, ChevronRight, ImageOff } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { FileServiceImage, FileServiceVideo } from "./upload-display-media"
import type { MediaTabMode } from "../lib/upload-platform-media"

type Props = {
  mediaTab: MediaTabMode
  imageUrls: string[]
  videoUrl: string | null
  /** Compact = inline card; dialog = larger preview with thumbnails. */
  variant?: "compact" | "dialog"
  className?: string
  /** Carousel start index when opening the dialog variant. */
  initialIndex?: number
  /**
   * Fill a fixed parent frame (e.g. TikTok/RedNote 9:16 phone).
   * Media uses object-contain and ignores natural max-height caps.
   */
  fillFrame?: boolean
}

const DIALOG_FRAME =
  "relative h-[min(52vh,480px)] w-full overflow-hidden rounded-lg bg-muted/40"

export function UploadPreviewMedia({
  mediaTab,
  imageUrls,
  videoUrl,
  variant = "compact",
  className,
  initialIndex = 0,
  fillFrame = false,
}: Props) {
  const { t } = useTranslation("upload")
  const [activeIndex, setActiveIndex] = useState(0)
  const images = imageUrls.filter((url) => url?.trim())
  const isDialog = variant === "dialog"

  useEffect(() => {
    setActiveIndex(initialIndex)
  }, [mediaTab, videoUrl, imageUrls.join("|"), initialIndex])

  const naturalMaxH = isDialog ? undefined : "max-h-40"
  const mediaClass = fillFrame
    ? cn("absolute inset-0 size-full bg-black object-contain", className)
    : isDialog
      ? cn("absolute inset-0 size-full object-contain", className)
      : cn("w-full bg-muted object-contain", naturalMaxH, className)
  const loadingClass = fillFrame
    ? cn(
        "absolute inset-0 flex size-full items-center justify-center bg-black/80",
        className,
      )
    : isDialog
      ? cn(
          "absolute inset-0 flex size-full items-center justify-center bg-muted/50",
          className,
        )
      : cn(
          "flex w-full items-center justify-center bg-muted/50",
          "min-h-[140px] max-h-40",
        )

  if (mediaTab === "video" && videoUrl) {
    if (isDialog || fillFrame) {
      return (
        <div
          className={cn(
            fillFrame ? "absolute inset-0 size-full bg-black" : DIALOG_FRAME,
            !fillFrame && "bg-black",
            className,
          )}
        >
          <FileServiceVideo
            url={videoUrl}
            className="absolute inset-0 size-full object-contain"
            controls={isDialog && !fillFrame}
            muted={!isDialog || fillFrame}
          />
        </div>
      )
    }
    return (
      <FileServiceVideo
        url={videoUrl}
        className={mediaClass}
        controls={false}
        muted
      />
    )
  }

  if (images.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 text-center",
          fillFrame
            ? "absolute inset-0 size-full bg-zinc-900 px-4"
            : isDialog
              ? cn(DIALOG_FRAME, "px-4")
              : cn("w-full bg-muted/40 px-4", "min-h-[140px]"),
          className,
        )}
        role="img"
        aria-label={t("preview.noMedia")}
      >
        <div
          className={cn(
            "flex size-11 items-center justify-center rounded-full",
            fillFrame
              ? "bg-white/10 text-white/80"
              : "bg-background/80 text-muted-foreground shadow-sm",
          )}
        >
          <ImageOff className="size-5" strokeWidth={1.75} aria-hidden />
        </div>
        <div className="space-y-0.5">
          <p
            className={cn(
              "text-sm font-medium",
              fillFrame ? "text-white/90" : "text-foreground/80",
            )}
          >
            {t("preview.noMedia")}
          </p>
          <p
            className={cn(
              "max-w-[12rem] text-[11px] leading-snug",
              fillFrame ? "text-white/50" : "text-muted-foreground",
            )}
          >
            {t("preview.noMediaHint")}
          </p>
        </div>
      </div>
    )
  }

  if (images.length === 1) {
    if (isDialog) {
      return (
        <div className={cn(DIALOG_FRAME, className)}>
          <FileServiceImage
            url={images[0]!}
            alt=""
            className="absolute inset-0 size-full object-contain"
            loadingClassName={loadingClass}
          />
        </div>
      )
    }
    return (
      <FileServiceImage
        url={images[0]!}
        alt=""
        className={mediaClass}
        loadingClassName={loadingClass}
      />
    )
  }

  const safeIndex = Math.min(activeIndex, images.length - 1)
  const currentUrl = images[safeIndex]!

  const goPrev = () =>
    setActiveIndex((i) => (i <= 0 ? images.length - 1 : i - 1))
  const goNext = () =>
    setActiveIndex((i) => (i >= images.length - 1 ? 0 : i + 1))

  if (fillFrame) {
    return (
      <div className={cn("absolute inset-0 size-full", className)}>
        <FileServiceImage
          url={currentUrl}
          alt=""
          className="absolute inset-0 size-full bg-black object-contain"
          loadingClassName="absolute inset-0 flex size-full items-center justify-center bg-black/80"
        />
        {isDialog ? (
          <>
            <Button
              type="button"
              variant="secondary"
              size="icon-sm"
              className="absolute top-1/2 left-2 z-10 -translate-y-1/2 rounded-full bg-background/90 shadow-sm"
              onClick={goPrev}
              aria-label={t("preview.previousMedia")}
            >
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon-sm"
              className="absolute top-1/2 right-2 z-10 -translate-y-1/2 rounded-full bg-background/90 shadow-sm"
              onClick={goNext}
              aria-label={t("preview.nextMedia")}
            >
              <ChevronRight className="size-4" aria-hidden />
            </Button>
            <span className="absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">
              {t("preview.mediaCounter", {
                current: safeIndex + 1,
                total: images.length,
              })}
            </span>
          </>
        ) : (
          <div className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 gap-1">
            {images.map((_, index) => (
              <span
                key={index}
                className={cn(
                  "size-1.5 rounded-full",
                  index === safeIndex ? "bg-white/90" : "bg-white/35",
                )}
                aria-hidden
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div
        className={cn(
          "relative overflow-hidden",
          isDialog ? DIALOG_FRAME : "bg-muted/30",
        )}
      >
        <FileServiceImage
          url={currentUrl}
          alt=""
          className={cn(
            isDialog
              ? "absolute inset-0 size-full object-contain"
              : "max-h-40 w-full bg-muted object-contain",
          )}
          loadingClassName={
            isDialog
              ? "absolute inset-0 flex size-full items-center justify-center bg-muted/50"
              : "flex min-h-[140px] max-h-40 w-full items-center justify-center bg-muted/50"
          }
        />
        {isDialog ? (
          <>
            <Button
              type="button"
              variant="secondary"
              size="icon-sm"
              className="absolute top-1/2 left-2 z-10 -translate-y-1/2 rounded-full bg-background/90 shadow-sm"
              onClick={goPrev}
              aria-label={t("preview.previousMedia")}
            >
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon-sm"
              className="absolute top-1/2 right-2 z-10 -translate-y-1/2 rounded-full bg-background/90 shadow-sm"
              onClick={goNext}
              aria-label={t("preview.nextMedia")}
            >
              <ChevronRight className="size-4" aria-hidden />
            </Button>
            <span className="absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">
              {t("preview.mediaCounter", {
                current: safeIndex + 1,
                total: images.length,
              })}
            </span>
          </>
        ) : null}
      </div>

      {isDialog ? (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {images.map((url, index) => (
            <button
              key={`${url}-${index}`}
              type="button"
              onClick={() => setActiveIndex(index)}
              className={cn(
                "relative size-14 shrink-0 overflow-hidden rounded-md border-2 bg-muted/40 transition-colors",
                index === safeIndex
                  ? "border-primary"
                  : "border-transparent opacity-70 hover:opacity-100",
              )}
            >
              <FileServiceImage
                url={url}
                alt=""
                className="size-full object-cover"
                loadingClassName="size-full bg-muted"
              />
            </button>
          ))}
        </div>
      ) : (
        <div className="flex justify-center gap-1">
          {images.map((_, index) => (
            <span
              key={index}
              className={cn(
                "size-1.5 rounded-full",
                index === safeIndex
                  ? "bg-foreground/70"
                  : "bg-muted-foreground/30",
              )}
              aria-hidden
            />
          ))}
        </div>
      )}
    </div>
  )
}
