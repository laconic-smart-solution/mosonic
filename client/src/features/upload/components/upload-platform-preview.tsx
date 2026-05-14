import { cn } from "@/lib/utils"

import { FileServiceImage, FileServiceVideo } from "./upload-display-media"
import { getPlatformMediaConfig, normalizeChannelKey } from "../lib/upload-platform-media"
import type { MediaTabMode } from "../lib/upload-platform-media"

type UploadPlatformPreviewProps = {
  channel: string
  caption: string
  mediaTab: MediaTabMode
  imageUrls: string[]
  videoUrl: string | null
  youtubeTitle: string
}

export function UploadPlatformPreview({
  channel,
  caption,
  mediaTab,
  imageUrls,
  videoUrl,
  youtubeTitle,
}: UploadPlatformPreviewProps) {
  const key = normalizeChannelKey(channel)
  const cfg = getPlatformMediaConfig(channel)
  const label = cfg.displayName

  const media =
    mediaTab === "video" && videoUrl ? (
      <FileServiceVideo
        url={videoUrl}
        className="max-h-40 w-full bg-muted object-cover"
        muted
      />
    ) : imageUrls[0] ? (
      <FileServiceImage
        url={imageUrls[0]}
        alt=""
        className="max-h-40 w-full bg-muted object-cover"
        loadingClassName="flex min-h-[140px] max-h-40 w-full items-center justify-center bg-muted/50"
      />
    ) : (
      <div className="flex min-h-[140px] items-center justify-center bg-muted/50 text-xs text-muted-foreground">
        No media
      </div>
    )

  if (key === "instagram") {
    return (
      <div className="overflow-hidden rounded-xl border bg-card text-xs shadow-sm">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <div className="size-8 rounded-full bg-linear-to-br from-[#f09433] via-[#dc2743] to-[#bc1888]" />
          <span className="font-medium">{label}</span>
        </div>
        {media}
        <p className="px-3 py-2 whitespace-pre-wrap leading-relaxed">{caption}</p>
      </div>
    )
  }

  if (key === "facebook") {
    return (
      <div className="overflow-hidden rounded-xl border bg-card text-xs shadow-sm">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <div className="flex size-9 items-center justify-center rounded-full bg-[#1877F2] font-semibold text-white">
            f
          </div>
          <span className="font-medium">{label}</span>
        </div>
        {media}
        <p className="px-3 py-2 whitespace-pre-wrap leading-relaxed">{caption}</p>
      </div>
    )
  }

  if (key === "linkedin") {
    return (
      <div className="overflow-hidden rounded-xl border bg-card text-xs shadow-sm">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-[#0A66C2] font-semibold text-white">
            in
          </div>
          <span className="font-medium">{label}</span>
        </div>
        {media}
        <p className="px-3 py-2 whitespace-pre-wrap leading-relaxed">{caption}</p>
      </div>
    )
  }

  if (key === "twitter" || key === "x") {
    return (
      <div className="overflow-hidden rounded-xl border bg-card text-xs shadow-sm">
        <div className="flex gap-2 px-3 pt-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#1DA1F2] font-semibold text-white">
            𝕏
          </div>
          <p className="whitespace-pre-wrap leading-relaxed text-foreground">
            {caption}
          </p>
        </div>
        <div className="p-3 pt-2">{media}</div>
      </div>
    )
  }

  if (key === "youtube") {
    const title =
      youtubeTitle.trim() ||
      caption.slice(0, 80) + (caption.length > 80 ? "…" : "")
    return (
      <div className="overflow-hidden rounded-xl border bg-card text-xs shadow-sm">
        <div className="border-b px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="flex size-6 items-center justify-center rounded-full bg-[#FF0000] text-[9px] font-bold text-white">
              ▶
            </div>
            <span className="line-clamp-2 font-medium">{title}</span>
          </div>
        </div>
        {media}
        <p className="px-3 py-2 whitespace-pre-wrap text-muted-foreground leading-relaxed">
          {caption}
        </p>
      </div>
    )
  }

  if (key === "tiktok") {
    const tiktokMedia =
      mediaTab === "video" && videoUrl ? (
        <FileServiceVideo
          url={videoUrl}
          className="h-full w-full object-contain"
          muted
        />
      ) : imageUrls[0] ? (
        <FileServiceImage
          url={imageUrls[0]}
          alt=""
          className="h-full w-full object-contain bg-muted"
          loadingClassName="flex h-full min-h-[140px] w-full items-center justify-center bg-muted/50"
        />
      ) : (
        <div className="flex h-full min-h-[140px] flex-col items-center justify-center gap-1 px-3 text-center text-[11px] text-muted-foreground">
          <span>No media yet</span>
          <span className="max-w-48 text-[10px] leading-snug opacity-90">
            Add a photo or video in the editor — TikTok supports both.
          </span>
        </div>
      )

    return (
      <div className="overflow-hidden rounded-xl border bg-card text-xs shadow-sm">
        <div className="flex items-center gap-2 border-b border-border bg-zinc-950 px-3 py-2 text-white">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-teal-400 via-pink-500 to-rose-600 text-[10px] font-bold text-white shadow-sm">
            ♪
          </div>
          <span className="font-medium">{label}</span>
        </div>
        <div className="flex justify-center bg-muted/25 p-3">
          <div
            className={cn(
              "relative w-full max-w-[220px] overflow-hidden rounded-xl border border-border/70 bg-black shadow-inner",
              "aspect-9/16 max-h-[min(340px,52vh)]",
            )}
          >
            {tiktokMedia}
          </div>
        </div>
        <p className="border-t border-border/60 px-3 py-2.5 whitespace-pre-wrap leading-relaxed text-foreground">
          {caption || " "}
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card p-3 text-xs shadow-sm">
      <p className="mb-2 font-medium capitalize">{label}</p>
      {media}
      <p className="mt-2 whitespace-pre-wrap leading-relaxed">{caption}</p>
    </div>
  )
}
