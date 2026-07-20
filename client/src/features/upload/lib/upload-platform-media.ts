import i18n from "@/i18n"

/** `single` kept for legacy drafts; UI treats it as images (same as `multiple`). */
export type MediaTabMode = "single" | "multiple" | "video"

export type PlatformMediaConfig = {
  tabs: MediaTabMode[]
  maxCarousel: number
  displayName: string
}

const PLATFORM: Record<string, PlatformMediaConfig> = {
  instagram: {
    tabs: ["multiple", "video"],
    maxCarousel: 10,
    displayName: "Instagram",
  },
  facebook: {
    tabs: ["multiple", "video"],
    maxCarousel: 10,
    displayName: "Facebook",
  },
  linkedin: {
    tabs: ["multiple", "video"],
    maxCarousel: 9,
    displayName: "LinkedIn",
  },
  youtube: {
    tabs: ["video"],
    maxCarousel: 0,
    displayName: "YouTube",
  },
  tiktok: {
    tabs: ["multiple", "video"],
    maxCarousel: 10,
    displayName: "TikTok",
  },
  rednote: {
    tabs: ["video"],
    maxCarousel: 0,
    displayName: "RedNote",
  },
}

export function normalizeChannelKey(channel: string): string {
  return channel.trim().toLowerCase()
}

export function getPlatformMediaConfig(channel: string): PlatformMediaConfig {
  const key = normalizeChannelKey(channel)
  return (
    PLATFORM[key] ?? {
      tabs: ["multiple", "video"] as MediaTabMode[],
      maxCarousel: 10,
      displayName: channel,
    }
  )
}

export function isImageMediaTab(tab: MediaTabMode): boolean {
  return tab === "single" || tab === "multiple"
}

/** Coerce legacy `single` drafts to the unified images tab. */
export function normalizeMediaTab(tab: MediaTabMode): "multiple" | "video" {
  return tab === "video" ? "video" : "multiple"
}

export function isVideoUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false
  const u = url.trim()
  if (/\.(mp4|webm|mov|m4v|mkv)(\?|$)/i.test(u)) return true
  if (/\/videos\//i.test(u)) return true
  return false
}

export function mediaTabLabels(tab: MediaTabMode): string {
  const key = normalizeMediaTab(tab)
  return i18n.t(`upload:mediaTab.${key}`, { defaultValue: key })
}
