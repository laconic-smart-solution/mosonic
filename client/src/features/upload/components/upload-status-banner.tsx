import {
  AlertCircle,
  AlertTriangle,
  CircleCheck,
  Clock,
  Loader2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type BannerVariant =
  | "hidden"
  | "not_connected"
  | "needs_reauth"
  | "manual_verify"
  | "failed"
  | "publishing"
  | "published"
  | "scheduled"

type UploadStatusBannerProps = {
  platformLabel: string
  variant: BannerVariant
  publishedAt: string | null
  scheduledAt: string | null
  failureReason?: string | null
  onConnect?: () => void
  onRetry?: () => void
  /** When false, status text is shown without Connect / Retry buttons (e.g. preview dialog). */
  showActions?: boolean
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
  failureReason,
  onConnect,
  onRetry,
  showActions = true,
}: UploadStatusBannerProps) {
  if (variant === "hidden") {
    return null
  }

  if (variant === "not_connected") {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-md border px-3 py-2.5 text-xs",
          "border-amber-500/40 bg-amber-500/10 text-amber-950 dark:border-amber-400/35 dark:bg-amber-500/15 dark:text-amber-100",
        )}
      >
        <AlertCircle className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">
          Your {platformLabel} account is not connected.
        </span>
        {showActions ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 shrink-0 border-amber-600/40 bg-background/80 text-amber-950 hover:bg-amber-500/15 dark:border-amber-400/40 dark:text-amber-50 dark:hover:bg-amber-500/20"
            onClick={() => onConnect?.()}
          >
            Connect
          </Button>
        ) : null}
      </div>
    )
  }

  if (variant === "needs_reauth") {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-md border px-3 py-2.5 text-xs",
          "border-amber-500/40 bg-amber-500/10 text-amber-950 dark:border-amber-400/35 dark:bg-amber-500/15 dark:text-amber-100",
        )}
      >
        <AlertCircle className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">
          {failureReason?.trim() ||
            `${platformLabel} session expired. Reconnect in Settings.`}
        </span>
        {showActions ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 shrink-0 border-amber-600/40 bg-background/80 text-amber-950 hover:bg-amber-500/15 dark:border-amber-400/40 dark:text-amber-50 dark:hover:bg-amber-500/20"
            onClick={() => onConnect?.()}
          >
            Reconnect
          </Button>
        ) : null}
      </div>
    )
  }

  if (variant === "manual_verify") {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-md border px-3 py-2.5 text-xs",
          "border-blue-500/40 bg-blue-500/10 text-blue-950 dark:border-blue-400/35 dark:bg-blue-500/15 dark:text-blue-100",
        )}
      >
        <AlertTriangle className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">
          {failureReason?.trim() ||
            `Published to ${platformLabel}, but confirmation was inconclusive — verify on the platform.`}
        </span>
      </div>
    )
  }

  if (variant === "failed") {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-md border px-3 py-2.5 text-xs",
          "border-destructive/40 bg-destructive/10 text-destructive",
        )}
      >
        <AlertTriangle className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">Publishing failed. Please retry.</span>
        {showActions ? (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            className="h-8 shrink-0"
            onClick={() => onRetry?.()}
          >
            Retry
          </Button>
        ) : null}
      </div>
    )
  }

  if (variant === "publishing") {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-md border px-3 py-2.5 text-xs",
          "border-teal-500/40 bg-teal-500/10 text-teal-950 dark:border-teal-400/35 dark:bg-teal-500/15 dark:text-teal-100",
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
          "flex items-center gap-2 rounded-md border px-3 py-2.5 text-xs",
          "border-teal-500/40 bg-teal-500/10 text-teal-950 dark:border-teal-400/35 dark:bg-teal-500/15 dark:text-teal-100",
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
          "flex items-center gap-2 rounded-md border px-3 py-2.5 text-xs",
          "border-blue-500/40 bg-blue-500/10 text-blue-950 dark:border-blue-400/35 dark:bg-blue-500/15 dark:text-blue-100",
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
