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
import { cn } from "@/lib/utils"
import type { PostMediaItem } from "@/shared/types/post.type"

type Props = {
  items: PostMediaItem[]
  className?: string
}

export function PostDetailMediaGallery({ items, className }: Props) {
  const { t } = useTranslation("posts")

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
              "grid gap-2",
              items.length === 1
                ? "grid-cols-1"
                : items.length === 2
                  ? "grid-cols-2"
                  : "grid-cols-2 sm:grid-cols-3",
            )}
          >
            {items.map((item, index) => (
              <div
                key={`${item.url}-${index}`}
                className={cn(
                  "relative overflow-hidden rounded-lg border bg-muted/20",
                  items.length === 1 ? "aspect-video max-h-[420px]" : "aspect-square",
                )}
              >
                {item.kind === "video" ? (
                  <FileServiceVideo
                    url={item.url}
                    className="size-full object-cover"
                    controls
                    muted={false}
                  />
                ) : (
                  <FileServiceImage
                    url={item.url}
                    alt=""
                    className="size-full object-cover"
                    loadingClassName="size-full min-h-[120px]"
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
