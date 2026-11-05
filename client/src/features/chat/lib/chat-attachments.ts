/** Attachment markers the composer appends to a user message: [[asset:<type>:<ruleAssetId>:<url>]]. */
export type ChatAttachment = { type: string; id: string; url: string | null; name?: string }

const MARKER = /^\[\[asset:([a-z_]+):([^:\]]+):(.*?)\]\]\s*$/
const LEGACY = /^\(Attached: (.+)\)\s*$/

export function formatAttachmentMarker(type: string, id: string, url: string): string {
  return `[[asset:${type}:${id}:${url}]]`
}

/** Splits a stored user message into the typed text and its attachments (markers and legacy "(Attached: x)" notes). */
export function splitAttachments(content: string): { text: string; attachments: ChatAttachment[] } {
  const attachments: ChatAttachment[] = []
  const lines: string[] = []
  for (const line of content.split("\n")) {
    const m = MARKER.exec(line.trim())
    if (m) {
      attachments.push({ type: m[1], id: m[2], url: m[3] || null })
      continue
    }
    const legacy = LEGACY.exec(line.trim())
    if (legacy) {
      for (const name of legacy[1].split(",").map((s) => s.trim()).filter(Boolean)) {
        attachments.push({ type: "file", id: name, url: null, name })
      }
      continue
    }
    lines.push(line)
  }
  return { text: lines.join("\n").trim(), attachments }
}
