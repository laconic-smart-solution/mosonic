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

function mediaFromLayer(layer: Record<string, unknown>): LaneMediaUrls {
  const img = typeof layer.image === "string" ? layer.image.trim() : ""
  const vid = typeof layer.video === "string" ? layer.video.trim() : ""
  return {
    image: img || undefined,
    video: vid || undefined,
  }
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
    const media = mediaFromLayer(layer)
    if (media.image) image = media.image
    if (media.video) video = media.video
  }

  return { image, video }
}

/** Shared trunk media from nodes without a lane suffix (pre-branch). */
export function trunkMediaFromNodeOutputs(
  layers: WorkflowNodeLayersSnapshot,
): LaneMediaUrls {
  let image: string | undefined
  let video: string | undefined

  const nodeIds = new Set([
    ...Object.keys(layers.nodeOutputs ?? {}),
    ...Object.keys(layers.nodeUserEdits ?? {}),
  ])

  for (const nodeId of nodeIds) {
    if (laneSuffixFromNodeId(nodeId)) continue

    const layer = mergeNodeOutputLayers(
      layers.nodeOutputs,
      layers.nodeUserEdits,
      nodeId,
    )
    const media = mediaFromLayer(layer)
    if (media.image) image = media.image
    if (media.video) video = media.video
  }

  return { image, video }
}

/**
 * Resolve media for a channel.
 * Prefer lane-specific layers, then true trunk (unlaned) layers.
 * Never fall back to flattened resolved.image/video when layers are present —
 * that snapshot mixes every lane's media and would auto-assign FB images to IG, etc.
 */
export function resolveLaneMediaForChannel(
  channelKey: string,
  resolved: UploadResolvedOutputs,
  layers?: WorkflowNodeLayersSnapshot | null,
): LaneMediaUrls {
  if (layers) {
    const fromLane = laneMediaFromNodeOutputs(channelKey, layers)
    const fromTrunk = trunkMediaFromNodeOutputs(layers)
    return {
      image: fromLane.image ?? fromTrunk.image,
      video: fromLane.video ?? fromTrunk.video,
    }
  }

  const trunkImage = resolved.image?.trim()
  const trunkVideo = resolved.video?.trim()
  return {
    image: trunkImage || undefined,
    video: trunkVideo || undefined,
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
  if (imageUrl) return "multiple"
  return preferredTab === "video"
    ? "video"
    : (cfg.tabs[0] ?? "multiple")
}
