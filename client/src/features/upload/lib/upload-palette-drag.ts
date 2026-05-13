import type { OutputKey } from "@/features/content/data/content-review-helpers"
import type { UploadPaletteDragPayload } from "@/features/upload/components/upload-dnd-payload"

/** Matches ids in `UploadContentPalette` for the same drag payload. */
export function paletteDragIdForKey(key: OutputKey): string {
  switch (key) {
    case "text":
      return "palette-text"
    case "translatedText":
      return "palette-translation"
    case "summary":
      return "palette-summary"
    case "image":
      return "palette-image"
    case "video":
      return "palette-video"
    case "transcription":
      return "palette-transcription"
    default:
      return `palette-${key}`
  }
}

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
