import type { UploadChannelStatus } from "@/shared/types/upload.type"

export type ChannelTabDotStatus =
  | "pending"
  | "ready"
  | "publishing"
  | "published"
  | "scheduled"
  | "failed"
  | "not_connected"

/**
 * Maps server status + connectivity + saved draft to the dot shown on channel tabs.
 */
export function getTabDotStatus(params: {
  serverStatus: UploadChannelStatus
  connected: boolean
  hasAssignedText: boolean
  isSaved: boolean
}): ChannelTabDotStatus {
  const { serverStatus, connected, hasAssignedText, isSaved } = params

  if (!connected && serverStatus === "pending") {
    return "not_connected"
  }

  switch (serverStatus) {
    case "publishing":
      return "publishing"
    case "published":
      return "published"
    case "scheduled":
      return "scheduled"
    case "failed":
      return "failed"
    case "skipped":
      return "pending"
    default:
      break
  }

  if (connected && hasAssignedText && isSaved) {
    return "ready"
  }
  return "pending"
}

export function tabDotClassName(status: ChannelTabDotStatus): string {
  switch (status) {
    case "pending":
      return "bg-[#888780]"
    case "ready":
    case "published":
      return "bg-[#1D9E75]"
    case "publishing":
      return "animate-pulse bg-[#1D9E75]"
    case "scheduled":
      return "bg-[#185FA5]"
    case "failed":
      return "bg-[#E24B4A]"
    case "not_connected":
      return "bg-[#EF9F27]"
    default:
      return "bg-muted-foreground"
  }
}
