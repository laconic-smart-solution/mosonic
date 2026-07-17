import type {
  ChannelPublishRequest,
  PublishUploadRequest,
  UploadChannelRow,
  UploadChannelStatus,
  UploadDetail,
  UploadResolvedOutputs,
} from "@/shared/types/upload.type"
import { zonedDateTimeLocalToUtcIso } from "@/shared/lib/timezones"

export { getApiErrorMessage } from "@/shared/lib/api-error"

export type CaptionSourceOption =
  | "text"
  | "translatedText"
  | "summary"
  | "custom"

export type MediaChoice = "auto" | "none" | "image" | "video"

export type ChannelSelection = {
  included: boolean
  isOverridden: boolean
  captionSource: CaptionSourceOption
  captionDraft: string
  mediaChoice: MediaChoice
}

export function previewCaption(ro: {
  text?: string
  translatedText?: string
  summary?: string
}): string {
  return (
    (ro.text?.trim() && ro.text) ||
    (ro.translatedText?.trim() && ro.translatedText) ||
    (ro.summary?.trim() && ro.summary) ||
    ""
  )
}

export function captionFromOutputs(
  source: Exclude<CaptionSourceOption, "custom">,
  resolved: UploadResolvedOutputs,
): string {
  switch (source) {
    case "text":
      return (resolved.text ?? "").trim()
    case "translatedText":
      return (resolved.translatedText ?? resolved.text ?? "").trim()
    case "summary":
      return (resolved.summary ?? resolved.text ?? "").trim()
    default:
      return ""
  }
}

export function inferCaptionSource(
  row: UploadChannelRow,
  resolved: UploadResolvedOutputs,
): CaptionSourceOption {
  const cap = (row.caption ?? "").trim()
  if (!cap) return "text"
  if ((resolved.translatedText ?? "").trim() === cap) return "translatedText"
  if ((resolved.summary ?? "").trim() === cap) return "summary"
  if ((resolved.text ?? "").trim() === cap) return "text"
  return "custom"
}

export function resolvedCaptionForChannel(
  row: UploadChannelRow,
  sel: ChannelSelection,
  resolved: UploadResolvedOutputs,
): string {
  if (!sel.isOverridden) return (row.caption ?? "").trim()
  if (sel.captionSource === "custom") return sel.captionDraft.trim()
  return captionFromOutputs(sel.captionSource, resolved)
}

export function defaultChannelSelection(
  row: UploadChannelRow,
  connected: boolean,
  resolved: UploadResolvedOutputs,
): ChannelSelection {
  return {
    included: connected,
    isOverridden: false,
    captionSource: inferCaptionSource(row, resolved),
    captionDraft: row.caption ?? "",
    mediaChoice: "auto",
  }
}

export function isChannelPublishEligible(
  status: UploadChannelStatus | undefined,
): boolean {
  return status === "pending" || status === "failed"
}

/** Global publish/schedule — included + connected + eligible channels only. */
export function buildGlobalPublishRequest(
  upload: UploadDetail,
  includedByKey: Record<string, boolean>,
  connectedChannelSet: Set<string>,
  publishNow: boolean,
  scheduledLocal: string,
  timezone?: string,
): PublishUploadRequest {
  const zone = timezone?.trim() || "UTC"
  const scheduledAt = publishNow
    ? null
    : scheduledLocal.trim()
      ? zonedDateTimeLocalToUtcIso(scheduledLocal, zone)
      : null

  const channels: ChannelPublishRequest[] = upload.channels.map((row) => {
    const key = row.channel.toLowerCase()
    const connected = connectedChannelSet.has(key)
    const eligible = isChannelPublishEligible(row.status)
    const included =
      Boolean(includedByKey[key]) && connected && eligible
    return {
      channel: row.channel,
      included,
    }
  })

  return {
    publishNow,
    scheduledAt,
    ...(publishNow ? {} : { timezone: zone }),
    channels,
  }
}

/** Content must be persisted via PATCH before publish; body is `included` flags only. */
export function buildPublishRequest(
  upload: UploadDetail,
  selectionByChannel: Record<string, ChannelSelection>,
  connectedChannelSet: Set<string>,
  publishNow: boolean,
  scheduledLocal: string,
  resolved: UploadResolvedOutputs,
  timezone?: string,
): PublishUploadRequest {
  const zone = timezone?.trim() || "UTC"
  const scheduledAt = publishNow
    ? null
    : scheduledLocal.trim()
      ? zonedDateTimeLocalToUtcIso(scheduledLocal, zone)
      : null

  const channels: ChannelPublishRequest[] = upload.channels.map((row) => {
    const key = row.channel.toLowerCase()
    const connected = connectedChannelSet.has(key)
    const sel =
      selectionByChannel[key] ??
      defaultChannelSelection(row, connected, resolved)

    const included = sel.included && connected
    return {
      channel: row.channel,
      included,
    }
  })

  return {
    publishNow,
    scheduledAt,
    ...(publishNow ? {} : { timezone: zone }),
    channels,
  }
}
