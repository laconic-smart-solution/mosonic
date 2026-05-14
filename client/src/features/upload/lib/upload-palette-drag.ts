import {
  mergeNodeOutputLayers,
  type OutputKey,
} from "@/features/content/data/content-review-helpers"
import type { WorkflowNodeType } from "@/shared/types/workflow.type"
import type { UploadPaletteDragPayload } from "@/features/upload/components/upload-dnd-payload"

/** Stable drag id per workflow node (matches palette preview expectations). */
export function paletteDragIdForNode(nodeId: string): string {
  return `palette-node-${nodeId}`
}

export function palettePayloadForNode(
  nodeId: string,
  nodeType: WorkflowNodeType,
  nodeOutputs: Record<string, Record<string, unknown>>,
  nodeUserEdits: Record<string, Record<string, unknown>>
): UploadPaletteDragPayload | null {
  const layer = mergeNodeOutputLayers(nodeOutputs, nodeUserEdits, nodeId)
  switch (nodeType) {
    case "text_generation": {
      const t = typeof layer.text === "string" ? layer.text.trim() : ""
      return t ? { kind: "text", source: "text", nodeId } : null
    }
    case "translation": {
      const t =
        typeof layer.translatedText === "string"
          ? layer.translatedText.trim()
          : ""
      return t ? { kind: "text", source: "translatedText", nodeId } : null
    }
    case "summarization": {
      const t = typeof layer.summary === "string" ? layer.summary.trim() : ""
      return t ? { kind: "text", source: "summary", nodeId } : null
    }
    case "image_generation": {
      const url = typeof layer.image === "string" ? layer.image.trim() : ""
      return url ? { kind: "image", url, nodeId } : null
    }
    case "video_generation": {
      const url = typeof layer.video === "string" ? layer.video.trim() : ""
      return url ? { kind: "video", url, nodeId } : null
    }
    default:
      return null
  }
}

/** @deprecated Use palettePayloadForNode — kept for any legacy imports */
export function paletteDragIdForKey(key: OutputKey): string {
  return `palette-legacy-${key}`
}

/** @deprecated Use palettePayloadForNode */
export function palettePayloadForKey(
  key: OutputKey,
  edited: Partial<Record<OutputKey, string | undefined>>
): UploadPaletteDragPayload | null {
  switch (key) {
    case "text":
      return { kind: "text", source: "text" }
    case "translatedText":
      return { kind: "text", source: "translatedText" }
    case "summary":
      return { kind: "text", source: "summary" }
    case "image": {
      const url = edited.image?.trim()
      return url ? { kind: "image", url } : null
    }
    case "video": {
      const url = edited.video?.trim()
      return url ? { kind: "video", url } : null
    }
    case "transcription":
      return null
    default:
      return null
  }
}
