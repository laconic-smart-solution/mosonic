import { cn } from "@/lib/utils"

import { UploadPreviewMedia } from "./upload-preview-media"
import { getPlatformMediaConfig, normalizeChannelKey } from "../lib/upload-platform-media"
import type { MediaTabMode } from "../lib/upload-platform-media"

type UploadPlatformPreviewProps = {
  channel: string
  caption: string
  mediaTab: MediaTabMode
  imageUrls: string[]
  videoUrl: string | null
  youtubeTitle: string
  variant?: "compact" | "dialog"
}

export function UploadPlatformPreview({
  channel,
  caption,
  mediaTab,
  imageUrls,
  videoUrl,
  youtubeTitle,
  variant = "compact",
}: UploadPlatformPreviewProps) {
  const key = normalizeChannelKey(channel)
  const cfg = getPlatformMediaConfig(channel)
  const label = cfg.displayName
  const isDialog = variant === "dialog"

  const media = (
    <UploadPreviewMedia
      mediaTab={mediaTab}
      imageUrls={imageUrls}
      videoUrl={videoUrl}
      variant={variant}
    />
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
    const tiktokMedia = (
      <UploadPreviewMedia
        mediaTab={mediaTab}
        imageUrls={imageUrls}
        videoUrl={videoUrl}
        variant={variant}
        className={cn(!isDialog && "h-full min-h-[140px]")}
      />
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
              isDialog ? "aspect-9/16 max-h-[min(480px,60vh)]" : "aspect-9/16 max-h-[min(340px,52vh)]",
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

  if (key === "rednote") {
    return (
      <div className="overflow-hidden rounded-xl border bg-card text-xs shadow-sm">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <div className="flex size-8 items-center justify-center rounded-full bg-[#ff2442] text-[10px] font-bold text-white">
            小
          </div>
          <span className="font-medium">{label}</span>
        </div>
        {media}
        <p className="px-3 py-2 whitespace-pre-wrap leading-relaxed">{caption}</p>
        <p className="border-t px-3 py-2 text-[10px] leading-snug text-muted-foreground">
          Video only (like TikTok). Publish confirmation is based on page scrape —
          verify on RedNote if unsure.
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
