import { channelLabel } from "@/shared/constants/distribution-channels"

export type ContentDraftNode = {
  nodeId: string
  type: string
  lane: string | null
  field: string
  preview: string
  pending?: boolean
}

export type ContentChannelPreview = {
  channel: string
  label: string
  text: string
  imageUrl: string | null
  videoUrl: string | null
  hasTranslation: boolean
  hasSummary: boolean
}

function isMediaUrl(value: string): boolean {
  const v = value.trim()
  return /^https?:\/\//i.test(v) || v.startsWith("/") || v.startsWith("data:")
}

function pickNodePreview(
  nodes: ContentDraftNode[],
  channel: string,
  fields: string[],
): string {
  const lane = channel.toLowerCase()
  for (const field of fields) {
    const hit = nodes.find(
      (n) =>
        (n.lane ?? "").toLowerCase() === lane &&
        n.field === field &&
        typeof n.preview === "string" &&
        n.preview.trim(),
    )
    if (hit?.preview.trim()) return hit.preview.trim()
  }
  // Trunk nodes (no lane) — shared media/copy when a channel has no adapt output.
  for (const field of fields) {
    const trunk = nodes.find(
      (n) =>
        !n.lane &&
        n.field === field &&
        typeof n.preview === "string" &&
        n.preview.trim(),
    )
    if (trunk?.preview.trim()) return trunk.preview.trim()
  }
  return ""
}

/** Unique channel ids from catalog lanes / node lanes, stable order. */
export function collectContentChannels(
  lanes: string[] | undefined,
  nodes: ContentDraftNode[] | undefined,
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (raw: string | null | undefined) => {
    const id = raw?.trim().toLowerCase()
    if (!id || seen.has(id)) return
    seen.add(id)
    out.push(id)
  }
  for (const lane of lanes ?? []) push(lane)
  for (const node of nodes ?? []) push(node.lane)
  return out
}

export function previewForChannel(
  channel: string,
  nodes: ContentDraftNode[],
  fallback: {
    text: string
    imageUrl: string | null
    videoUrl?: string | null
    hasTranslation?: boolean
    hasSummary?: boolean
  },
): ContentChannelPreview {
  const text =
    pickNodePreview(nodes, channel, ["text"]) ||
    fallback.text.trim()
  const imageRaw = pickNodePreview(nodes, channel, ["image"])
  const videoRaw = pickNodePreview(nodes, channel, ["video"])
  const translated = pickNodePreview(nodes, channel, ["translatedText"])
  const summary = pickNodePreview(nodes, channel, ["summary"])
  return {
    channel,
    label: channelLabel(channel),
    text,
    imageUrl:
      imageRaw && isMediaUrl(imageRaw) ? imageRaw : fallback.imageUrl,
    videoUrl:
      videoRaw && isMediaUrl(videoRaw)
        ? videoRaw
        : (fallback.videoUrl ?? null),
    hasTranslation: Boolean(translated) || Boolean(fallback.hasTranslation),
    hasSummary: Boolean(summary) || Boolean(fallback.hasSummary),
  }
}
