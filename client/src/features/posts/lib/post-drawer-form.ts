import type { PostRecord, PostStatus } from "@/shared/types/post.type"

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
