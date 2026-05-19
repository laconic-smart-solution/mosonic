import type { PostListSort } from "@/shared/types/post.type"

export const VALID_CHANNELS = [
  "instagram",
  "facebook",
  "linkedin",
  "twitter",
  "youtube",
  "tiktok",
] as const

/** Sentinel value for Channel Select (not sent to API). */
export const CHANNEL_FILTER_ALL = "all"

export const SORT_OPTIONS: { value: PostListSort; label: string }[] = [
  { value: "newest_created", label: "Newest created" },
  { value: "oldest_created", label: "Oldest created" },
  { value: "scheduled_desc", label: "Scheduled (soonest last)" },
  { value: "scheduled_asc", label: "Scheduled (soonest first)" },
  { value: "status_asc", label: "Status (A→Z)" },
]

export const DEFAULT_SORT: PostListSort = "newest_created"

export function channelSelectLabel(ch: string): string {
  if (!ch) return "All channels"
  return ch.charAt(0).toUpperCase() + ch.slice(1)
}
