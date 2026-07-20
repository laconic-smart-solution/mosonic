import { useMemo, useState } from "react"
import { ImageIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  FileServiceImage,
  FileServiceVideo,
} from "@/features/upload/components/upload-display-media"
import { UploadMediaDetailDialog } from "@/features/upload/components/upload-media-detail-dialog"
import { cn } from "@/lib/utils"
import type { PostMediaItem } from "@/shared/types/post.type"

type Props = {
  items: PostMediaItem[]
  className?: string
}

const COLLAGE_VISIBLE = 3
const MEDIA_FRAME_H = "h-56"

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

export function PostDetailMediaGallery({ items, className }: Props) {
  const { t } = useTranslation(["posts", "upload"])
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailIndex, setDetailIndex] = useState(0)

  const videoItem = useMemo(
    () => items.find((item) => item.kind === "video"),
    [items],
  )
  const imageUrls = useMemo(
    () =>
      items
        .filter((item) => item.kind === "image")
        .map((item) => item.url)
        .filter((url) => url?.trim()),
    [items],
  )

  const isVideo = Boolean(videoItem?.url?.trim()) && imageUrls.length === 0
  const visibleImages = imageUrls.slice(0, COLLAGE_VISIBLE)
  const overflowCount = Math.max(0, imageUrls.length - COLLAGE_VISIBLE)
  const collageCount = visibleImages.length

  function openDetail(index: number) {
    setDetailIndex(index)
    setDetailOpen(true)
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("detail.mediaTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/30 px-4 py-10 text-center">
            <ImageIcon className="size-8 text-muted-foreground/60" aria-hidden />
            <p className="text-sm text-muted-foreground">{t("detail.noMedia")}</p>
          </div>
        ) : (
          <div
            className={cn(
              "relative overflow-hidden rounded-md border bg-muted/40",
              MEDIA_FRAME_H,
            )}
          >
            {isVideo && videoItem ? (
              <button
                type="button"
                className="relative block size-full cursor-zoom-in bg-black text-left"
                onClick={() => openDetail(0)}
                aria-label={t("upload:mediaDetail.openHint")}
              >
                <FileServiceVideo
                  url={videoItem.url}
                  controls
                  muted={false}
                  className="size-full object-contain"
                />
              </button>
            ) : null}

            {!isVideo && collageCount > 0 ? (
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
                        "relative min-h-0 min-w-0 overflow-hidden bg-muted/60",
                        collageCellClass(collageCount, i),
                      )}
                    >
                      <button
                        type="button"
                        className="relative block size-full cursor-zoom-in"
                        onClick={() =>
                          openDetail(showOverflow ? COLLAGE_VISIBLE : i)
                        }
                        aria-label={
                          showOverflow
                            ? t("upload:mediaDetail.openOverflow", {
                                count: overflowCount,
                              })
                            : t("upload:mediaDetail.openHint")
                        }
                      >
                        <FileServiceImage
                          url={url}
                          alt=""
                          className={cn(
                            "size-full",
                            collageCount > 1
                              ? "object-cover"
                              : "object-contain",
                          )}
                          loadingClassName="size-full"
                        />
                        {showOverflow ? (
                          <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-lg font-semibold text-white">
                            +{overflowCount}
                          </span>
                        ) : null}
                      </button>
                    </div>
                  )
                })}
              </div>
            ) : null}
          </div>
        )}

        <UploadMediaDetailDialog
          open={detailOpen}
          onOpenChange={setDetailOpen}
          mediaTab={isVideo ? "video" : "multiple"}
          imageUrls={imageUrls}
          videoUrl={isVideo ? (videoItem?.url ?? null) : null}
          initialImageIndex={detailIndex}
        />
      </CardContent>
    </Card>
  )
}
