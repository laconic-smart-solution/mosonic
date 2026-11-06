import type { ContentDraftNode } from "./content-channel-preview"

export type ContentCardSnapshot = {
  action: string
  contentId: string
  pipelineId: string
  workflowId: string
  status: string
  textPreview: string
  translatedPreview: string
  summaryPreview: string
  hasImage: boolean
  hasVideo: boolean
  hasTranslation: boolean
  hasSummary: boolean
  pendingNodeId: string | null
  pendingNodeType: string | null
  saved: boolean
  /** User's reason from reject_content (or the reject dialog), when known. */
  rejectReason: string | null
  /** Set when a generate-more / re-run node fails (credits refunded). */
  failReason: string | null
  /** Channel ids from get_content / content detail (e.g. tiktok, instagram). */
  lanes: string[]
  /** Per-node previews used for channel switcher. */
  nodes: ContentDraftNode[]
}

const SHOW_ACTIONS = new Set([
  "show_content",
  // Automatic follow-up after a chat-started run (synthetic pipeline_result).
  "pipeline_result",
  "generate_more_started",
  "content_rerun_started",
  "content_rerun_failed",
  "content_approved",
  "content_rejected",
  "publish_started",
])

function parseNodes(raw: unknown): ContentDraftNode[] {
  if (!Array.isArray(raw)) return []
  const out: ContentDraftNode[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const obj = item as Record<string, unknown>
    if (typeof obj.nodeId !== "string" || !obj.nodeId.trim()) continue
    if (typeof obj.type !== "string") continue
    if (typeof obj.field !== "string") continue
    out.push({
      nodeId: obj.nodeId,
      type: obj.type,
      lane: typeof obj.lane === "string" && obj.lane.trim() ? obj.lane.trim() : null,
      field: obj.field,
      preview: typeof obj.preview === "string" ? obj.preview : "",
      pending: obj.pending === true,
    })
  }
  return out
}

function parseLanes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== "string") continue
    const id = item.trim().toLowerCase()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

export function parseContentCard(result: string): ContentCardSnapshot | null {
  try {
    const parsed: unknown = JSON.parse(result)
    if (!parsed || typeof parsed !== "object") return null
    const obj = parsed as Record<string, unknown>
    if (obj.ok !== true) return null
    if (typeof obj.action !== "string" || !SHOW_ACTIONS.has(obj.action)) return null
    if (typeof obj.contentId !== "string" || !obj.contentId.trim()) return null
    const action =
      obj.action === "pipeline_result" ? "show_content" : obj.action
    const draftStatuses = new Set(["draft", "in_review", "approved", "rejected"])
    const status =
      obj.action === "pipeline_result"
        ? typeof obj.status === "string" && draftStatuses.has(obj.status)
          ? obj.status
          : "draft"
        : typeof obj.status === "string"
          ? obj.status
          : "draft"
    return {
      action,
      contentId: obj.contentId,
      pipelineId: typeof obj.pipelineId === "string" ? obj.pipelineId : "",
      workflowId: typeof obj.workflowId === "string" ? obj.workflowId : "",
      status,
      textPreview: typeof obj.textPreview === "string" ? obj.textPreview : "",
      translatedPreview:
        typeof obj.translatedPreview === "string" ? obj.translatedPreview : "",
      summaryPreview: typeof obj.summaryPreview === "string" ? obj.summaryPreview : "",
      hasImage: obj.hasImage === true,
      hasVideo: obj.hasVideo === true,
      hasTranslation: obj.hasTranslation === true,
      hasSummary: obj.hasSummary === true,
      pendingNodeId: typeof obj.pendingNodeId === "string" ? obj.pendingNodeId : null,
      pendingNodeType: typeof obj.pendingNodeType === "string" ? obj.pendingNodeType : null,
      saved: obj.saved === true,
      rejectReason:
        typeof obj.rejectReason === "string" && obj.rejectReason.trim() ? obj.rejectReason.trim() : null,
      failReason:
        typeof obj.failReason === "string" && obj.failReason.trim()
          ? obj.failReason.trim()
          : typeof obj.message === "string" &&
              obj.action === "content_rerun_failed" &&
              obj.message.trim()
            ? obj.message.trim()
            : null,
      lanes: parseLanes(obj.lanes),
      nodes: parseNodes(obj.nodes),
    }
  } catch {
    return null
  }
}

export function findContentCards(
  steps: { type: string; result?: string }[] | null,
): ContentCardSnapshot[] {
  if (!steps) return []
  const byId = new Map<string, ContentCardSnapshot>()
  for (const step of steps) {
    if (step.type !== "observation" && step.type !== "tool_call") continue
    if (typeof step.result !== "string") continue
    const card = parseContentCard(step.result)
    if (card) byId.set(card.contentId, card)
  }
  return [...byId.values()]
}
