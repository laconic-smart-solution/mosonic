import { useEffect, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
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
}

export function UploadPreviewMedia({
  mediaTab,
  imageUrls,
  videoUrl,
  variant = "compact",
  className,
  initialIndex = 0,
}: Props) {
  const { t } = useTranslation("upload")
  const [activeIndex, setActiveIndex] = useState(0)
  const images = imageUrls.filter((url) => url?.trim())
  const isDialog = variant === "dialog"

  useEffect(() => {
    setActiveIndex(initialIndex)
  }, [mediaTab, videoUrl, imageUrls.join("|"), initialIndex])

  if (mediaTab === "video" && videoUrl) {
    return (
      <FileServiceVideo
        url={videoUrl}
        className={cn(
          "w-full bg-muted object-cover",
          isDialog ? "max-h-[min(52vh,480px)]" : "max-h-40",
          className,
        )}
        controls={isDialog}
        muted={!isDialog}
      />
    )
  }

  if (images.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-muted/50 text-xs text-muted-foreground",
          isDialog ? "min-h-[240px] rounded-lg" : "min-h-[140px]",
          className,
        )}
      >
        {t("preview.noMedia")}
      </div>
    )
  }

  if (images.length === 1) {
    return (
      <FileServiceImage
        url={images[0]!}
        alt=""
        className={cn(
          "w-full bg-muted object-cover",
          isDialog ? "max-h-[min(52vh,480px)] rounded-lg" : "max-h-40",
          className,
        )}
        loadingClassName={cn(
          "flex w-full items-center justify-center bg-muted/50",
          isDialog ? "min-h-[240px]" : "min-h-[140px] max-h-40",
        )}
      />
    )
  }

  const safeIndex = Math.min(activeIndex, images.length - 1)
  const currentUrl = images[safeIndex]!

  const goPrev = () =>
    setActiveIndex((i) => (i <= 0 ? images.length - 1 : i - 1))
  const goNext = () =>
    setActiveIndex((i) => (i >= images.length - 1 ? 0 : i + 1))

  return (
    <div className={cn("space-y-2", className)}>
      <div className="relative overflow-hidden rounded-lg bg-muted/30">
        <FileServiceImage
          url={currentUrl}
          alt=""
          className={cn(
            "w-full bg-muted object-cover",
            isDialog ? "max-h-[min(48vh,440px)]" : "max-h-40",
          )}
          loadingClassName={cn(
            "flex w-full items-center justify-center bg-muted/50",
            isDialog ? "min-h-[220px]" : "min-h-[140px] max-h-40",
          )}
        />
        {isDialog ? (
          <>
            <Button
              type="button"
              variant="secondary"
              size="icon-sm"
              className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-background/90 shadow-sm"
              onClick={goPrev}
              aria-label={t("preview.previousMedia")}
            >
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon-sm"
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-background/90 shadow-sm"
              onClick={goNext}
              aria-label={t("preview.nextMedia")}
            >
              <ChevronRight className="size-4" aria-hidden />
            </Button>
            <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">
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
                "relative size-14 shrink-0 overflow-hidden rounded-md border-2 transition-colors",
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
                index === safeIndex ? "bg-foreground/70" : "bg-muted-foreground/30",
              )}
              aria-hidden
            />
          ))}
        </div>
      )}
    </div>
  )
}
