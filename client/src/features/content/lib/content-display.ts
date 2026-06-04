import i18n from "@/i18n"
import type {
  ContentOutputs,
  ContentPageItem,
  ContentStatus,
} from "@/shared/types/content.type"

/** Heuristic: UUID / long opaque ids we don't show verbatim to users. */
export function isLikelyOpaqueId(value: string): boolean {
  const t = value.trim()
  if (t.length < 12) return false
  if (/^[0-9a-f-]{32,}$/i.test(t)) return true
  return /^[0-9a-f]{24,}$/i.test(t)
}

/** User-facing label for a rule / pipeline ref. */
export function displayLinkedRef(ref: string, kind: "campaign" | "pipeline"): string {
  if (!ref.trim()) return "—"
  if (isLikelyOpaqueId(ref)) {
    return kind === "campaign"
      ? i18n.t("content:display.linkedCampaign")
      : i18n.t("content:display.linkedPipeline")
  }
  return ref.length > 48 ? `${ref.slice(0, 48)}…` : ref
}

export function listCardPrimaryTitle(status: ContentStatus): string {
  return i18n.t(`content:cardTitle.${status}`)
}

function hasOutput(value: string | undefined): boolean {
  return Boolean(value?.trim())
}

function captionFromLaneLayer(layer: Record<string, unknown>): string | null {
  if (typeof layer.text === "string" && layer.text.trim()) {
    return layer.text.trim()
  }
  if (typeof layer.adaptedCaption === "string" && layer.adaptedCaption.trim()) {
    return layer.adaptedCaption.trim()
  }
  return null
}

/** Count of lanes with a non-empty adapt caption. */
export function laneOutputChannelCount(
  laneOutputs?: Record<string, Record<string, unknown>>,
): number {
  if (!laneOutputs) return 0
  return Object.values(laneOutputs).filter((layer) =>
    captionFromLaneLayer(layer ?? {}),
  ).length
}

/** First non-empty lane caption (stable object key order). */
export function firstLaneCaption(
  laneOutputs?: Record<string, Record<string, unknown>>,
): string | null {
  if (!laneOutputs) return null
  for (const layer of Object.values(laneOutputs)) {
    const caption = captionFromLaneLayer(layer ?? {})
    if (caption) return caption
  }
  return null
}

/** Lane-aware preview for pageable list rows — shows one real caption, not a count label. */
export function contentPreviewFromPageItem(
  item: ContentPageItem,
): string | null {
  const laneCaption = firstLaneCaption(item.laneOutputs)
  if (laneCaption) return laneCaption
  return contentPreviewFromOutputs(item.outputs)
}

/** First meaningful text or media label from merged content outputs. */
export function contentPreviewFromOutputs(
  outputs?: ContentOutputs,
): string | null {
  if (!outputs) return null
  if (hasOutput(outputs.text)) return outputs.text!.trim()
  if (hasOutput(outputs.translatedText)) return outputs.translatedText!.trim()
  if (hasOutput(outputs.summary)) return outputs.summary!.trim()
  if (hasOutput(outputs.transcription)) return outputs.transcription!.trim()
  if (hasOutput(outputs.keywords)) return outputs.keywords!.trim()
  if (hasOutput(outputs.video)) return i18n.t("content:display.videoContent")
  if (hasOutput(outputs.image)) return i18n.t("content:display.imageContent")
  return null
}

export function truncateContentPreview(text: string, max = 100): string {
  const oneLine = text.replace(/\s+/g, " ").trim()
  if (oneLine.length <= max) return oneLine
  return `${oneLine.slice(0, max)}…`
}

/** Primary line for compact lists (workflow drawer, etc.). */
export function contentDrawerItemTitle(item: ContentPageItem): string {
  const preview = contentPreviewFromPageItem(item)
  if (preview) return truncateContentPreview(preview, 100)
  return listCardPrimaryTitle(item.status)
}

export function contentStatusLabel(status: ContentStatus): string {
  return i18n.t(`content:status.${status}`, { defaultValue: status })
}

export function workflowLabelForUser(workflowName: string | undefined): string {
  const n = workflowName?.trim()
  if (n) return n
  return i18n.t("content:display.workflow")
}
