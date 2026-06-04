import { mergeNodeOutputLayers } from "@/features/content/data/content-review-helpers"

import {
  laneSuffixFromNodeId,
  lanesMatch,
} from "@/features/upload/lib/upload-generation-lane"
import {
  getPlatformMediaConfig,
  isVideoUrl,
  normalizeChannelKey,
  type MediaTabMode,
} from "@/features/upload/lib/upload-platform-media"
import type { UploadResolvedOutputs } from "@/shared/types/upload.type"

/** Live per-node layers from the generation panel (lane media + pinned captions). */
export type WorkflowNodeLayersSnapshot = {
  nodeOutputs: Record<string, Record<string, unknown>>
  nodeUserEdits: Record<string, Record<string, unknown>>
}

export type LaneMediaUrls = {
  image?: string
  video?: string
}

/** Per-lane image/video from materialized nodeOutputs (nodeId suffix or layer fields). */
export function laneMediaFromNodeOutputs(
  channelKey: string,
  layers: WorkflowNodeLayersSnapshot,
): LaneMediaUrls {
  const target = normalizeChannelKey(channelKey)
  let image: string | undefined
  let video: string | undefined

  const nodeIds = new Set([
    ...Object.keys(layers.nodeOutputs ?? {}),
    ...Object.keys(layers.nodeUserEdits ?? {}),
  ])

  for (const nodeId of nodeIds) {
    const suffix = laneSuffixFromNodeId(nodeId)
    if (!suffix || !lanesMatch(suffix, target)) continue

    const layer = mergeNodeOutputLayers(
      layers.nodeOutputs,
      layers.nodeUserEdits,
      nodeId,
    )
    const img =
      typeof layer.image === "string" ? layer.image.trim() : ""
    const vid =
      typeof layer.video === "string" ? layer.video.trim() : ""
    if (img) image = img
    if (vid) video = vid
  }

  return { image, video }
}

export function resolveLaneMediaForChannel(
  channelKey: string,
  resolved: UploadResolvedOutputs,
  layers?: WorkflowNodeLayersSnapshot | null,
): LaneMediaUrls {
  const fromLayers = layers ? laneMediaFromNodeOutputs(channelKey, layers) : {}
  const trunkImage = resolved.image?.trim()
  const trunkVideo = resolved.video?.trim()
  return {
    image: fromLayers.image ?? (trunkImage || undefined),
    video: fromLayers.video ?? (trunkVideo || undefined),
  }
}

export function inferMediaTabFromUrls(
  channelKey: string,
  imageUrl: string | undefined,
  videoUrl: string | undefined,
  preferredTab?: MediaTabMode,
): MediaTabMode {
  const cfg = getPlatformMediaConfig(channelKey)
  if (preferredTab === "multiple" && imageUrl) return "multiple"
  if (videoUrl && isVideoUrl(videoUrl)) {
    if (cfg.tabs.length === 1 && cfg.tabs[0] === "video") return "video"
    if (!imageUrl) return "video"
  }
  if (imageUrl) return preferredTab === "multiple" ? "multiple" : "single"
  return preferredTab ?? cfg.tabs[0] ?? "single"
}
