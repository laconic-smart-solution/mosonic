import type {
  PatchUploadChannelBody,
  PublishUploadRequest,
  UploadDetail,
  UploadChannelRow,
  UploadResolvedOutputs,
} from "@/shared/types/upload.type"

import { mergeNodeOutputLayers } from "@/features/content/data/content-review-helpers"

import {
  captionFromOutputs,
  type CaptionSourceOption,
  inferCaptionSource,
} from "./upload-publish.helpers"
import {
  inferMediaTabFromUrls,
  resolveLaneMediaForChannel,
  type WorkflowNodeLayersSnapshot,
} from "@/features/upload/lib/upload-lane-media"
import {
  getPlatformMediaConfig,
  isVideoUrl,
  normalizeChannelKey,
  type MediaTabMode,
} from "./upload-platform-media"
import {
  isTikTokPhotoMedia,
  tiktokPhotoCaptionErrorI18n,
} from "./tiktok-publish"

export type { WorkflowNodeLayersSnapshot } from "@/features/upload/lib/upload-lane-media"

export type ChannelDraft = {
  captionSource: CaptionSourceOption
  captionCustom: string
  /** When set with a semantic captionSource, pull text from this workflow node's output/edits instead of flattened resolved outputs. */
  captionSourceNodeId?: string | undefined
  mediaTab: MediaTabMode
  imageUrls: string[]
  videoUrl: string | null
  youtubeTitle: string
  dirty: boolean
}

export function createEmptyDraft(): ChannelDraft {
  return {
    captionSource: "text",
    captionCustom: "",
    captionSourceNodeId: undefined,
    mediaTab: "single",
    imageUrls: [],
    videoUrl: null,
    youtubeTitle: "",
    dirty: false,
  }
}

function inferMediaTabFromRow(row: UploadChannelRow, channelKey: string): MediaTabMode {
  const cfg = getPlatformMediaConfig(channelKey)
  const urls =
    row.mediaUrls?.length && row.mediaUrls.some(Boolean)
      ? row.mediaUrls.filter(Boolean)
      : row.mediaUrl
        ? [row.mediaUrl]
        : []

  if (cfg.tabs.length === 1 && cfg.tabs[0] === "video") {
    return "video"
  }

  if (urls.length > 1) {
    return "multiple"
  }

  const candidate = urls[0] ?? row.mediaUrl?.trim()
  if (candidate && isVideoUrl(candidate)) {
    return "video"
  }
  if (urls.length === 1) {
    return "single"
  }

  const auto = row.mediaUrl?.trim()
  if (auto && isVideoUrl(auto)) {
    return "video"
  }

  return cfg.tabs[0] ?? "single"
}

export function draftFromUploadRow(
  row: UploadChannelRow,
  channelKey: string,
  resolved: UploadResolvedOutputs,
  layers?: WorkflowNodeLayersSnapshot | null,
): ChannelDraft {
  const persisted = (row.caption ?? "").trim()
  const inferred = inferCaptionSource(row, resolved)
  let captionSource: CaptionSourceOption = inferred
  let captionCustom = ""

  if (inferred === "custom" && persisted) {
    captionSource = "custom"
    captionCustom = persisted
  } else if (persisted && inferred !== "custom") {
    const fromInferred = captionFromOutputs(
      inferred as Exclude<CaptionSourceOption, "custom">,
      resolved,
    ).trim()
    if (persisted !== fromInferred) {
      captionSource = "custom"
      captionCustom = persisted
    }
  }

  let mediaTab = inferMediaTabFromRow(row, channelKey)
  const storedUrls =
    row.mediaUrls?.length && row.mediaUrls.some(Boolean)
      ? row.mediaUrls.filter(Boolean)
      : row.mediaUrl
        ? [row.mediaUrl]
        : []

  let imageUrls: string[] = []
  let videoUrl: string | null = null

  if (mediaTab === "video") {
    videoUrl =
      storedUrls.find((u) => isVideoUrl(u)) ||
      (row.mediaUrl && isVideoUrl(row.mediaUrl) ? row.mediaUrl : null) ||
      null
  } else {
    imageUrls = storedUrls.filter((u) => u && !isVideoUrl(u))
    if (imageUrls.length === 0 && storedUrls[0] && !isVideoUrl(storedUrls[0])) {
      imageUrls = [storedUrls[0]]
    }
  }

  const hasStoredMedia =
    imageUrls.length > 0 || Boolean(videoUrl?.trim())
  if (!hasStoredMedia) {
    const laneMedia = resolveLaneMediaForChannel(channelKey, resolved, layers)
    mediaTab = inferMediaTabFromUrls(
      channelKey,
      laneMedia.image,
      laneMedia.video,
      mediaTab,
    )
    if (mediaTab === "video") {
      videoUrl = laneMedia.video ?? null
      imageUrls = []
    } else if (laneMedia.image) {
      imageUrls = [laneMedia.image]
      videoUrl = null
    } else if (laneMedia.video) {
      videoUrl = laneMedia.video
      imageUrls = []
      mediaTab = "video"
    }
  }

  return {
    captionSource,
    captionCustom,
    captionSourceNodeId: undefined,
    mediaTab,
    imageUrls,
    videoUrl,
    youtubeTitle: row.youtubeTitle ?? "",
    dirty: false,
  }
}

function semanticCaptionFromLayer(
  source: Exclude<CaptionSourceOption, "custom">,
  layer: Record<string, unknown>,
): string {
  switch (source) {
    case "text":
      return typeof layer.text === "string" ? layer.text : ""
    case "translatedText":
      return typeof layer.translatedText === "string"
        ? layer.translatedText
        : ""
    case "summary":
      return typeof layer.summary === "string" ? layer.summary : ""
    default:
      return ""
  }
}

export function effectiveCaptionForDraft(
  draft: ChannelDraft,
  resolved: UploadResolvedOutputs,
  layers?: WorkflowNodeLayersSnapshot | null,
): string {
  if (draft.captionSource === "custom") {
    return draft.captionCustom.trim()
  }
  const source = draft.captionSource as Exclude<CaptionSourceOption, "custom">
  const nid = draft.captionSourceNodeId?.trim()
  if (nid && layers) {
    const merged = mergeNodeOutputLayers(
      layers.nodeOutputs,
      layers.nodeUserEdits,
      nid,
    )
    const pinned = semanticCaptionFromLayer(source, merged).trim()
    if (pinned.length > 0) return pinned
  }
  return captionFromOutputs(source, resolved)
}

export function channelRequiresMedia(channelKey: string): boolean {
  const key = normalizeChannelKey(channelKey)
  return key === "youtube" || key === "tiktok"
}

/** Media URLs that would be used on publish (draft overrides persisted row). */
export function effectiveMediaUrlsForPublish(
  draft: ChannelDraft,
  row: UploadChannelRow,
  resolved: UploadResolvedOutputs,
  channelKey: string,
  layers?: WorkflowNodeLayersSnapshot | null,
): string[] {
  const stored = draft.dirty
    ? draftToMediaStorage(draft, channelKey)
    : {
        mediaUrl: row.mediaUrl,
        mediaUrls: row.mediaUrls ?? [],
      }

  const urls = (
    stored.mediaUrls?.length
      ? stored.mediaUrls
      : stored.mediaUrl
        ? [stored.mediaUrl]
        : []
  )
    .map((u) => u?.trim())
    .filter(Boolean) as string[]

  if (urls.length > 0) return urls

  const laneMedia = resolveLaneMediaForChannel(channelKey, resolved, layers)
  const laneUrl = (laneMedia.video ?? laneMedia.image ?? "").trim()
  if (laneUrl) return [laneUrl]

  const fallback = (resolved.image?.trim() || resolved.video?.trim() || "").trim()
  return fallback ? [fallback] : []
}

export function getChannelMediaValidationError(
  channelKey: string,
  draft: ChannelDraft,
  row: UploadChannelRow,
  resolved: UploadResolvedOutputs,
  layers?: WorkflowNodeLayersSnapshot | null,
): string | null {
  if (!channelRequiresMedia(channelKey)) return null

  const key = normalizeChannelKey(channelKey)
  const urls = effectiveMediaUrlsForPublish(
    draft,
    row,
    resolved,
    channelKey,
    layers,
  )
  const label = getPlatformMediaConfig(channelKey).displayName

  if (urls.length === 0) {
    return `${label} requires media (image or video) before publishing.`
  }

  if (key === "youtube" && !urls.some((u) => isVideoUrl(u))) {
    return `${label} requires a video before publishing.`
  }

  return null
}

export function getTikTokPhotoCaptionValidationError(
  channelKey: string,
  caption: string,
  draft: ChannelDraft,
  row: UploadChannelRow,
  resolved: UploadResolvedOutputs,
  layers: WorkflowNodeLayersSnapshot | null | undefined,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string | null {
  if (normalizeChannelKey(channelKey) !== "tiktok") return null
  const urls = effectiveMediaUrlsForPublish(
    draft,
    row,
    resolved,
    channelKey,
    layers,
  )
  if (!isTikTokPhotoMedia(urls)) return null
  return tiktokPhotoCaptionErrorI18n(caption, t)
}

export function getChannelPublishValidationError(
  channelKey: string,
  caption: string,
  draft: ChannelDraft,
  row: UploadChannelRow,
  resolved: UploadResolvedOutputs,
  layers: WorkflowNodeLayersSnapshot | null | undefined,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string | null {
  return (
    getChannelMediaValidationError(
      channelKey,
      draft,
      row,
      resolved,
      layers,
    ) ??
    getTikTokPhotoCaptionValidationError(
      channelKey,
      caption,
      draft,
      row,
      resolved,
      layers,
      t,
    )
  )
}

export function draftToMediaStorage(
  draft: ChannelDraft,
  channelKey: string,
): { mediaUrl: string | null; mediaUrls: string[] } {
  const cfg = getPlatformMediaConfig(channelKey)
  if (draft.mediaTab === "video") {
    const v = draft.videoUrl?.trim() || null
    return { mediaUrl: v, mediaUrls: v ? [v] : [] }
  }
  if (draft.mediaTab === "multiple") {
    const urls = draft.imageUrls
      .map((u) => u.trim())
      .filter(Boolean)
      .slice(0, cfg.maxCarousel || 10)
    return { mediaUrl: urls[0] ?? null, mediaUrls: urls }
  }
  const u = draft.imageUrls[0]?.trim() || null
  return { mediaUrl: u, mediaUrls: u ? [u] : [] }
}

export function draftToPatchBody(
  row: UploadChannelRow,
  draft: ChannelDraft,
  resolved: UploadResolvedOutputs,
  layers?: WorkflowNodeLayersSnapshot | null,
): PatchUploadChannelBody {
  const key = normalizeChannelKey(row.channel)
  const caption = effectiveCaptionForDraft(draft, resolved, layers)
  const { mediaUrl, mediaUrls } = draftToMediaStorage(draft, key)
  const body: PatchUploadChannelBody = {
    included: row.included ?? true,
    caption,
    mediaUrl,
    mediaUrls,
  }
  if (key === "youtube") {
    body.youtubeTitle = draft.youtubeTitle.trim() || null
  }
  return body
}

/** Publish uses persisted row; PATCH first if drafts are dirty. */
export function buildSingleChannelPublishRequest(params: {
  upload: UploadDetail
  channelKey: string
  connectedSet: Set<string>
  publishNow: boolean
  scheduledLocal: string
}): PublishUploadRequest {
  const { upload, channelKey, connectedSet, publishNow, scheduledLocal } = params
  const scheduledAt = publishNow
    ? null
    : scheduledLocal.trim()
      ? new Date(scheduledLocal).toISOString()
      : null

  const channels = upload.channels.map((r) => {
    const key = r.channel.toLowerCase()
    if (!connectedSet.has(key)) {
      return { channel: r.channel, included: false }
    }
    const included = key === channelKey
    return { channel: r.channel, included }
  })

  return { publishNow, scheduledAt, channels }
}
