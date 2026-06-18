import { DndContext } from "@dnd-kit/core"
import { useTranslation } from "react-i18next"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { UploadMediaDropZone } from "@/features/upload/components/upload-media-drop-zone"
import {
  getPlatformMediaConfig,
  mediaTabLabels,
  normalizeChannelKey,
} from "@/features/upload/lib/upload-platform-media"
import { cn } from "@/lib/utils"
import type { PostDrawerDraft } from "@/features/posts/lib/post-drawer-form"

type Props = {
  channel: string
  draft: Pick<PostDrawerDraft, "mediaTab" | "imageUrls" | "videoUrl">
  disabled?: boolean
  onChange: (
    patch: Partial<Pick<PostDrawerDraft, "mediaTab" | "imageUrls" | "videoUrl">>,
  ) => void
}

export function PostDetailMediaEditor({
  channel,
  draft,
  disabled = false,
  onChange,
}: Props) {
  const { t } = useTranslation(["posts", "upload"])
  const mediaCfg = getPlatformMediaConfig(channel)
  const channelKey = normalizeChannelKey(channel)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("posts:detail.mediaTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex overflow-hidden rounded-md border">
          {mediaCfg.tabs.map((tab) => {
            const active = draft.mediaTab === tab
            return (
              <button
                key={tab}
                type="button"
                disabled={disabled}
                onClick={() => onChange({ mediaTab: tab })}
                className={cn(
                  "flex-1 border-r px-2 py-1.5 text-[11px] transition-colors last:border-r-0",
                  active
                    ? "bg-muted font-medium text-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted/50",
                  disabled && "cursor-not-allowed opacity-60",
                )}
              >
                {mediaTabLabels(tab)}
              </button>
            )
          })}
        </div>
        <DndContext onDragEnd={() => {}}>
          <UploadMediaDropZone
            mode={draft.mediaTab}
            imageUrls={draft.imageUrls}
            videoUrl={draft.videoUrl}
            maxImages={mediaCfg.maxCarousel}
            activeDrag={null}
            disabled={disabled}
            onRemoveImage={(i) => {
              onChange({
                imageUrls: draft.imageUrls.filter((_, j) => j !== i),
              })
            }}
            onClear={() =>
              onChange({ imageUrls: [], videoUrl: null })
            }
            onUploadedUrls={(urls) => {
              if (draft.mediaTab === "video") {
                onChange({
                  videoUrl: urls[0] ?? null,
                  imageUrls: [],
                })
                return
              }
              if (draft.mediaTab === "single") {
                onChange({
                  imageUrls: urls.slice(0, 1),
                  videoUrl: null,
                })
                return
              }
              const merged = [...draft.imageUrls, ...urls].slice(
                0,
                mediaCfg.maxCarousel,
              )
              onChange({ imageUrls: merged, videoUrl: null })
            }}
          />
        </DndContext>
        {channelKey === "tiktok" &&
        draft.mediaTab !== "video" &&
        draft.imageUrls.length > 0 ? (
          <p className="text-[11px] text-muted-foreground">
            {t("upload:tiktok.slideshowTitleHint")}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
