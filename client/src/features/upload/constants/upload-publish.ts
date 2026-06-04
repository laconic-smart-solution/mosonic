import type { UploadChannelStatus } from "@/shared/types/upload.type"

export const UPLOAD_STATUS_META: Record<
  UploadChannelStatus,
  { label: string; className: string }
> = {
  pending: { label: "Pending", className: "text-amber-600" },
  publishing: { label: "Publishing...", className: "text-blue-600" },
  scheduled: { label: "Scheduled", className: "text-blue-600" },
  published: { label: "Published", className: "text-green-600" },
  failed: { label: "Failed", className: "text-red-600" },
  skipped: { label: "Skipped", className: "text-muted-foreground" },
}
