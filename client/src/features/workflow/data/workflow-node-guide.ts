import i18n from "@/i18n"

export type WorkflowNodeGuide = {
  usage: string
  example: string
  tips?: string
}

const GUIDE_NODE_TYPES = [
  "keywords",
  "text",
  "image",
  "video",
  "translation",
  "transcription",
  "summarization",
  "branch",
  "adapt",
  "merge",
  "intelligence",
] as const

export function getWorkflowNodeGuide(
  canvasType: string,
): WorkflowNodeGuide | undefined {
  if (!(GUIDE_NODE_TYPES as readonly string[]).includes(canvasType)) {
    return undefined
  }
  const base = `guide.${canvasType}`
  const tips = i18n.t(`${base}.tips`, { defaultValue: "" })
  return {
    usage: i18n.t(`${base}.usage`),
    example: i18n.t(`${base}.example`),
    ...(tips ? { tips } : {}),
  }
}

/** First sentence of usage for compact UI (palette, lists). */
export function getWorkflowNodeUsageSummary(canvasType: string): string | undefined {
  const guide = getWorkflowNodeGuide(canvasType)
  if (!guide) return undefined
  const first = guide.usage.split(/(?<=[.!?])\s+/)[0]
  return first?.trim() || guide.usage
}
