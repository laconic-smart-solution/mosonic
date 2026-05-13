import type { WorkflowNodeType } from "@/shared/types/workflow.type"
import type { ContentOutputs } from "@/shared/types/content.type"

export type OutputKey = keyof ContentOutputs

export const OUTPUT_GRID: OutputKey[][] = [
  ["keywords", "text"],
  ["translatedText", "summary"],
  ["image", "video"],
  ["transcription"],
]

export const NODE_TYPE_BY_KEY: Record<OutputKey, WorkflowNodeType> = {
  keywords: "keyword_planner",
  text: "text_generation",
  translatedText: "translation",
  image: "image_generation",
  video: "video_generation",
  transcription: "transcription",
  summary: "summarization",
}

export function outputsFromDetail(outputs?: ContentOutputs | null): Partial<Record<OutputKey, string | undefined>> {
  if (!outputs) return {}
  return {
    keywords: outputs.keywords,
    text: outputs.text,
    translatedText: outputs.translatedText,
    transcription: outputs.transcription,
    summary: outputs.summary,
    image: outputs.image,
    video: outputs.video,
  }
}

export function resolveNodeId(
  nodes: Array<{ nodeId: string; type: WorkflowNodeType; order: number }>,
  key: OutputKey
): string | undefined {
  const want = NODE_TYPE_BY_KEY[key]
  const sorted = [...nodes].sort((a, b) => a.order - b.order)
  return sorted.find((n) => n.type === want)?.nodeId
}

export function outputKeyForNodeType(type: WorkflowNodeType): OutputKey | undefined {
  const pair = (Object.entries(NODE_TYPE_BY_KEY) as [OutputKey, WorkflowNodeType][]).find(
    ([, t]) => t === type,
  )
  return pair?.[0]
}

export function mergeExecutorOutput(
  nodeType: string,
  output: Record<string, unknown>,
  prev: Partial<Record<OutputKey, string | undefined>>
): Partial<Record<OutputKey, string | undefined>> {
  const next = { ...prev }
  switch (nodeType) {
    case "keyword_planner":
      if (typeof output.keywords === "string") next.keywords = output.keywords
      break
    case "text_generation":
      if (typeof output.text === "string") next.text = output.text
      break
    case "image_generation":
      if (typeof output.image === "string") next.image = output.image
      break
    case "translation":
      if (typeof output.translatedText === "string") next.translatedText = output.translatedText
      break
    case "video_generation":
      if (typeof output.video === "string") next.video = output.video
      break
    case "transcription":
      if (typeof output.transcription === "string") next.transcription = output.transcription
      break
    case "summarization":
      if (typeof output.summary === "string") next.summary = output.summary
      break
    default:
      break
  }
  return next
}

export function cardTitle(key: OutputKey): string {
  switch (key) {
    case "keywords":
      return "Keywords"
    case "text":
      return "Text"
    case "translatedText":
      return "Translation"
    case "image":
      return "Image"
    case "video":
      return "Video"
    case "transcription":
      return "Transcription"
    case "summary":
      return "Summary"
    default:
      return key
  }
}
