import axios from "axios"

import type {
  ChannelPublishRequest,
  PublishUploadRequest,
  UploadChannelRow,
  UploadDetail,
  UploadResolvedOutputs,
} from "@/shared/types/upload.type"

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

export function getApiErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string | string[] } | undefined
    if (typeof data?.message === "string") return data.message
    if (Array.isArray(data?.message)) return data.message.join(", ")
  }
  if (err instanceof Error) return err.message
  return "Something went wrong"
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

/** Content must be persisted via PATCH before publish; body is `included` flags only. */
export function buildPublishRequest(
  upload: UploadDetail,
  selectionByChannel: Record<string, ChannelSelection>,
  connectedChannelSet: Set<string>,
  publishNow: boolean,
  scheduledLocal: string,
  resolved: UploadResolvedOutputs,
): PublishUploadRequest {
  const scheduledAt = publishNow
    ? null
    : scheduledLocal.trim()
      ? new Date(scheduledLocal).toISOString()
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
    channels,
  }
}
