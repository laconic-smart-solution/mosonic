import type { PostMediaItem, PostRecord, PostStatus } from "@/shared/types/post.type"
import type { MediaTabMode } from "@/features/upload/lib/upload-platform-media"
import { getPlatformMediaConfig, normalizeChannelKey } from "@/features/upload/lib/upload-platform-media"

const EDITABLE_POST_STATUSES: ReadonlySet<PostStatus> = new Set([
  "pending",
  "scheduled",
  "partial",
])

export function isPostZernioEditable(post: Pick<PostRecord, "status" | "zernioPostId">): boolean {
  return (
    EDITABLE_POST_STATUSES.has(post.status) &&
    Boolean(post.zernioPostId?.trim?.())
  )
}

const PUBLISHABLE_POST_STATUSES: ReadonlySet<PostStatus> = new Set([
  "pending",
  "scheduled",
  "partial",
  "failed",
])

export function isPostPublishable(post: Pick<PostRecord, "status">): boolean {
  return PUBLISHABLE_POST_STATUSES.has(post.status)
}

export function pickZernioRoot(
  remote: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!remote) return {}
  const inner = remote.post
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    return inner as Record<string, unknown>
  }
  return remote
}

function optionalString(...candidates: unknown[]): string {
  for (const c of candidates) {
    if (typeof c === "string") return c
  }
  return ""
}

function toDatetimeLocalValue(iso: string | null | undefined) {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

export type PostDrawerDraft = {
  content: string
  title: string
  scheduledLocal: string
  mediaTab: MediaTabMode
  imageUrls: string[]
  videoUrl: string | null
}

export function draftMediaFromItems(items: PostMediaItem[]): Pick<
  PostDrawerDraft,
  "mediaTab" | "imageUrls" | "videoUrl"
> {
  if (items.length === 0) {
    return { mediaTab: "single", imageUrls: [], videoUrl: null }
  }
  const video = items.find((i) => i.kind === "video")
  if (video) {
    return { mediaTab: "video", imageUrls: [], videoUrl: video.url }
  }
  const images = items.filter((i) => i.kind === "image").map((i) => i.url)
  return {
    mediaTab: images.length > 1 ? "multiple" : "single",
    imageUrls: images,
    videoUrl: null,
  }
}

export function postDraftToMediaPayload(
  draft: Pick<PostDrawerDraft, "mediaTab" | "imageUrls" | "videoUrl">,
  channel: string,
): { mediaUrl: string | null; mediaUrls: string[] } {
  const key = normalizeChannelKey(channel)
  const cfg = getPlatformMediaConfig(key)
  if (draft.mediaTab === "video") {
    const v = draft.videoUrl?.trim() || null
    return { mediaUrl: v, mediaUrls: v ? [v] : [] }
  }
  if (draft.mediaTab === "multiple") {
    const urls = draft.imageUrls
      .map((u) => u.trim())
      .filter(Boolean)
      .slice(0, cfg.maxCarousel || 10)
    return { mediaUrl: urls[0] ?? null, mediaUrls: urls }
  }
  const u = draft.imageUrls[0]?.trim() || null
  return { mediaUrl: u, mediaUrls: u ? [u] : [] }
}

export function editableFieldsFromZernio(
  remote: Record<string, unknown> | null | undefined,
  localFallback?: PostRecord | null,
): PostDrawerDraft {
  const root = pickZernioRoot(remote ?? null)
  const scheduledIso = optionalString(
    root.scheduledFor,
    root.scheduled_for,
    root.scheduledAt,
    localFallback?.scheduledAt,
  )

  const content = optionalString(
    root.content,
    root.body,
    root.description,
    root.caption,
  )

  const title = optionalString(root.title)

  const scheduledLocal = toDatetimeLocalValue(scheduledIso)

  return {
    content,
    title,
    scheduledLocal,
  }
}

export function isoFromDatetimeLocal(local: string): string | undefined {
  if (!local.trim()) return undefined
  const d = new Date(local)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}
