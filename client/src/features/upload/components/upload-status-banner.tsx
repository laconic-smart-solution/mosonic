import {
  AlertCircle,
  AlertTriangle,
  CircleCheck,
  Clock,
  Loader2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type BannerVariant =
  | "hidden"
  | "not_connected"
  | "failed"
  | "publishing"
  | "published"
  | "scheduled"

type UploadStatusBannerProps = {
  platformLabel: string
  variant: BannerVariant
  publishedAt: string | null
  scheduledAt: string | null
  onConnect: () => void
  onRetry: () => void
}

function formatWhen(iso: string | null): string {
  if (!iso) return ""
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short" as const,
    })
  } catch {
    return iso
  }
}

export function UploadStatusBanner({
  platformLabel,
  variant,
  publishedAt,
  scheduledAt,
  onConnect,
  onRetry,
}: UploadStatusBannerProps) {
  if (variant === "hidden") {
    return null
  }

  if (variant === "not_connected") {
    return (
      <div
        className={cn(
          "mb-3 flex items-center gap-2 rounded-md border px-3 py-2.5 text-xs",
          "border-[#EF9F27] bg-[#FAEEDA] text-[#633806]",
        )}
      >
        <AlertCircle className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">
          Your {platformLabel} account is not connected.
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 shrink-0 border-[#854F0B] text-[#633806] hover:bg-[#FAC775]"
          onClick={onConnect}
        >
          Connect
        </Button>
      </div>
    )
  }

  if (variant === "failed") {
    return (
      <div
        className={cn(
          "mb-3 flex items-center gap-2 rounded-md border px-3 py-2.5 text-xs",
          "border-destructive/40 bg-destructive/10 text-destructive",
        )}
      >
        <AlertTriangle className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">Publishing failed. Please retry.</span>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          className="h-8 shrink-0"
          onClick={onRetry}
        >
          Retry
        </Button>
      </div>
    )
  }

  if (variant === "publishing") {
    return (
      <div
        className={cn(
          "mb-3 flex items-center gap-2 rounded-md border px-3 py-2.5 text-xs",
          "border-[#1D9E75]/50 bg-[#E1F5EE] text-[#085041]",
        )}
      >
        <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
        <span>Publishing to {platformLabel}…</span>
      </div>
    )
  }

  if (variant === "published") {
    return (
      <div
        className={cn(
          "mb-3 flex items-center gap-2 rounded-md border px-3 py-2.5 text-xs",
          "border-[#1D9E75]/50 bg-[#E1F5EE] text-[#085041]",
        )}
      >
        <CircleCheck className="size-4 shrink-0" aria-hidden />
        <span>
          Published successfully to {platformLabel}
          {publishedAt ? ` · ${formatWhen(publishedAt)}` : ""}
        </span>
      </div>
    )
  }

  if (variant === "scheduled") {
    return (
      <div
        className={cn(
          "mb-3 flex items-center gap-2 rounded-md border px-3 py-2.5 text-xs",
          "border-[#185FA5]/50 bg-[#E6F1FB] text-[#042C53]",
        )}
      >
        <Clock className="size-4 shrink-0" aria-hidden />
        <span>
          Scheduled for {formatWhen(scheduledAt)} on {platformLabel}
        </span>
      </div>
    )
  }

  return null
}