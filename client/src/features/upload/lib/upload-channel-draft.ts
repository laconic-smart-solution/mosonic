import type {
  PatchUploadChannelBody,
  PublishUploadRequest,
  UploadDetail,
  UploadChannelRow,
  UploadResolvedOutputs,
} from "@/shared/types/upload.type"

import {
  captionFromOutputs,
  type CaptionSourceOption,
  inferCaptionSource,
} from "./upload-publish.helpers"
import {
  getPlatformMediaConfig,
  isVideoUrl,
  normalizeChannelKey,
  type MediaTabMode,
} from "./upload-platform-media"

export type ChannelDraft = {
  captionSource: CaptionSourceOption
  captionCustom: string
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

  const mediaTab = inferMediaTabFromRow(row, channelKey)
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
      resolved.video?.trim() ||
      null
  } else {
    imageUrls = storedUrls.filter((u) => u && !isVideoUrl(u))
    if (imageUrls.length === 0 && storedUrls[0] && !isVideoUrl(storedUrls[0])) {
      imageUrls = [storedUrls[0]]
    }
  }

  return {
    captionSource,
    captionCustom,
    mediaTab,
    imageUrls,
    videoUrl,
    youtubeTitle: row.youtubeTitle ?? "",
    dirty: false,
  }
}

export function effectiveCaptionForDraft(
  draft: ChannelDraft,
  resolved: UploadResolvedOutputs,
): string {
  if (draft.captionSource === "custom") {
    return draft.captionCustom.trim()
  }
  return captionFromOutputs(
    draft.captionSource as Exclude<CaptionSourceOption, "custom">,
    resolved,
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
): PatchUploadChannelBody {
  const key = normalizeChannelKey(row.channel)
  const caption = effectiveCaptionForDraft(draft, resolved)
  const { mediaUrl, mediaUrls } = draftToMediaStorage(draft, key)
  const body: PatchUploadChannelBody = { caption, mediaUrl, mediaUrls }
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
    if (key !== channelKey || !connectedSet.has(key)) {
      return { channel: r.channel, included: false }
    }
    return { channel: r.channel, included: true }
  })

  return { publishNow, scheduledAt, channels }
}
