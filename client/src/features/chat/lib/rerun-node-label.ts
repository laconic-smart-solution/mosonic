import type { LucideIcon } from "lucide-react"
import { FileText, Images, Languages, ListOrdered, RefreshCw } from "lucide-react"

/** Prefer observation.pendingNodeType — never guess from nodeId === "image". */
export function pendingNodeTypeFromResult(result: string | undefined): string | null {
  if (!result) return null
  try {
    const parsed: unknown = JSON.parse(result)
    if (!parsed || typeof parsed !== "object") return null
    const type = (parsed as { pendingNodeType?: unknown }).pendingNodeType
    return typeof type === "string" && type.trim() ? type.trim() : null
  } catch {
    return null
  }
}

export function rerunToolLabelKey(nodeType: string | null | undefined): string {
  switch (nodeType) {
    case "image_generation":
      return "toolCall.rerunImageNode"
    case "adapt":
    case "text_generation":
      return "toolCall.rerunCaptionNode"
    case "translation":
      return "toolCall.rerunTranslationNode"
    case "summarization":
      return "toolCall.rerunSummaryNode"
    default:
      return "toolCall.rerunContentNode"
  }
}

export function rerunToolIcon(nodeType: string | null | undefined): LucideIcon {
  switch (nodeType) {
    case "image_generation":
      return Images
    case "translation":
      return Languages
    case "summarization":
      return ListOrdered
    case "adapt":
    case "text_generation":
      return FileText
    default:
      return RefreshCw
  }
}

export function contentCardWorkingKey(nodeType: string | null | undefined): string {
  switch (nodeType) {
    case "image_generation":
      return "contentCard.workingImage"
    case "adapt":
    case "text_generation":
      return "contentCard.workingCaption"
    case "translation":
      return "contentCard.workingTranslation"
    case "summarization":
      return "contentCard.workingSummary"
    default:
      return "contentCard.working"
  }
}

export function contentCardPendingTitleKey(nodeType: string | null | undefined): string {
  switch (nodeType) {
    case "image_generation":
      return "contentCard.titleUpdatingImage"
    case "adapt":
    case "text_generation":
      return "contentCard.titleUpdatingCaption"
    default:
      return "contentCard.title"
  }
}

export function imageUrlFromNodeOutput(
  nodeOutputs: Record<string, Record<string, unknown> | undefined> | undefined,
  nodeId: string | null,
): string | null {
  if (!nodeId || !nodeOutputs) return null
  for (const [id, layer] of Object.entries(nodeOutputs)) {
    if (!nodeIdsMatch(nodeId, id)) continue
    const image = layer?.image
    if (typeof image === "string" && image.trim()) return image.trim()
  }
  return null
}

export function nodeStillPending(
  nodeOutputs: Record<string, Record<string, unknown> | undefined> | undefined,
  nodeId: string | null,
): boolean {
  if (!nodeId || !nodeOutputs) return false
  for (const [id, layer] of Object.entries(nodeOutputs)) {
    if (!nodeIdsMatch(nodeId, id)) continue
    if (layer?._pending === true) return true
  }
  return false
}

/** Catalog id vs materialized `uuid__lane` from pipeline/socket events. */
export function nodeIdsMatch(pendingId: string | null, eventId: string): boolean {
  if (!pendingId) return true
  if (pendingId === eventId) return true
  return (
    eventId.startsWith(`${pendingId}__`) || pendingId.startsWith(`${eventId}__`)
  )
}

/** Terminal failure written by content.service markGenerateMoreFailed / rerun catch. */
export function nodeOutputError(
  nodeOutputs: Record<string, Record<string, unknown> | undefined> | undefined,
  nodeId: string | null,
): string | null {
  if (!nodeId || !nodeOutputs) return null
  for (const [id, layer] of Object.entries(nodeOutputs)) {
    if (!nodeIdsMatch(nodeId, id)) continue
    if (layer?._pending === true) continue
    const error = layer?.error
    if (typeof error === "string" && error.trim()) return error.trim()
  }
  return null
}
