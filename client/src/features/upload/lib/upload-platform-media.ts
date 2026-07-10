import i18n from "@/i18n"

export type MediaTabMode = "single" | "multiple" | "video"

export type PlatformMediaConfig = {
  tabs: MediaTabMode[]
  maxCarousel: number
  displayName: string
}

const PLATFORM: Record<string, PlatformMediaConfig> = {
  instagram: {
    tabs: ["single", "multiple", "video"],
    maxCarousel: 10,
    displayName: "Instagram",
  },
  facebook: {
    tabs: ["single", "multiple", "video"],
    maxCarousel: 10,
    displayName: "Facebook",
  },
  linkedin: {
    tabs: ["single", "multiple", "video"],
    maxCarousel: 9,
    displayName: "LinkedIn",
  },
  youtube: {
    tabs: ["video"],
    maxCarousel: 0,
    displayName: "YouTube",
  },
  tiktok: {
    tabs: ["single", "video"],
    maxCarousel: 1,
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
      tabs: ["single", "multiple", "video"] as MediaTabMode[],
      maxCarousel: 10,
      displayName: channel,
    }
  )
}

export function isVideoUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false
  const u = url.trim()
  if (/\.(mp4|webm|mov|m4v|mkv)(\?|$)/i.test(u)) return true
  if (/\/videos\//i.test(u)) return true
  return false
}

export function mediaTabLabels(tab: MediaTabMode): string {
  return i18n.t(`upload:mediaTab.${tab}`, { defaultValue: tab })
}
