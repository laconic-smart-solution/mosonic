import i18n from "@/i18n"
import type { PostListSort } from "@/shared/types/post.type"

export const VALID_CHANNELS = [
  "instagram",
  "facebook",
  "linkedin",
  "youtube",
  "tiktok",
] as const

/** Sentinel value for Channel Select (not sent to API). */
export const CHANNEL_FILTER_ALL = "all"

export const SORT_OPTIONS: { value: PostListSort; labelKey: string }[] = [
  { value: "newest_created", labelKey: "sort.newest_created" },
  { value: "oldest_created", labelKey: "sort.oldest_created" },
  { value: "scheduled_desc", labelKey: "sort.scheduled_desc" },
  { value: "scheduled_asc", labelKey: "sort.scheduled_asc" },
  { value: "status_asc", labelKey: "sort.status_asc" },
]

export const DEFAULT_SORT: PostListSort = "newest_created"

export function sortOptionLabel(value: PostListSort): string {
  const key = SORT_OPTIONS.find((o) => o.value === value)?.labelKey
  return key ? i18n.t(`posts:${key}`) : value
}

export function channelSelectLabel(ch: string): string {
  if (!ch) return i18n.t("posts:toolbar.allChannels")
  return ch.charAt(0).toUpperCase() + ch.slice(1)
}
