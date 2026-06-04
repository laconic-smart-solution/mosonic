import { useMemo } from "react"
import { AlertCircle, ImageIcon, type LucideIcon, Video } from "lucide-react"

import { cn } from "@/lib/utils"

export type MediaLoadKind = "image" | "video" | "media"

type MediaLoadPlaceholderProps = {
  className?: string
  /** 0–100 when known; `null` = size unknown (bar stays in a soft waiting state). */
  progress: number | null
  status?: "loading" | "error"
  kind?: MediaLoadKind
  /** Tighter layout for canvas thumbnails and list tiles. */
  compact?: boolean
}

const KIND_META: Record<
  MediaLoadKind,
  { label: string; Icon: LucideIcon; loadingHint: string; errorHint: string }
> = {
  image: {
    label: "Image",
    Icon: ImageIcon,
    loadingHint: "Resolving image from storage",
    errorHint: "Image preview unavailable",
  },
  video: {
    label: "Video",
    Icon: Video,
    loadingHint: "Buffering video from storage",
    errorHint: "Video preview unavailable",
  },
  media: {
    label: "Media",
    Icon: ImageIcon,
    loadingHint: "Fetching media from storage",
    errorHint: "Media preview unavailable",
  },
}

function loadingDetail(progress: number | null): string {
  if (progress == null) return "Waiting for file service…"
  if (progress < 15) return "Starting download…"
  if (progress < 85) return "Downloading file…"
  return "Almost ready…"
}

function statusLine(
  status: "loading" | "error",
  progress: number | null,
  kind: MediaLoadKind
): string {
  if (status === "error") return KIND_META[kind].errorHint
  return loadingDetail(progress)
}

export function MediaLoadPlaceholder({
  className,
  progress,
  status = "loading",
  kind = "media",
  compact = false,
}: MediaLoadPlaceholderProps) {
  const meta = KIND_META[kind]
  const BadgeIcon = status === "error" ? AlertCircle : meta.Icon

  const detail = useMemo(
    () => statusLine(status, progress, kind),
    [status, progress, kind]
  )

  const percentLabel =
    status === "loading" && progress != null
      ? `${progress}%`
      : status === "loading"
        ? "—"
        : null

  const fillPercent =
    status === "error" ? 0 : progress != null ? Math.min(100, progress) : null

  return (
    <div
      className={cn(
        "flex w-full flex-col",
        compact ? "gap-1.5 px-2 py-2" : "gap-2.5 px-3 py-3.5",
        className
      )}
      role="status"
      aria-busy={status === "loading"}
      aria-valuenow={fillPercent ?? undefined}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={
        status === "error"
          ? `${meta.label} failed to load`
          : `Loading ${meta.label.toLowerCase()}`
      }
    >
      <div className="flex items-start gap-2">
        <div
          className={cn(
            "flex shrink-0 items-center justify-center rounded-md border",
            status === "error"
              ? "border-red-200/80 bg-red-50 text-red-600"
              : "border-border/80 bg-muted/30 text-muted-foreground",
            compact ? "size-6" : "size-8"
          )}
        >
          <BadgeIcon
            className={cn(compact ? "size-3" : "size-3.5")}
            aria-hidden
          />
        </div>

        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-baseline justify-between gap-2">
            <p
              className={cn(
                "font-medium leading-none tracking-tight text-foreground",
                compact ? "text-[10px]" : "text-xs"
              )}
            >
              {status === "loading"
                ? `Loading ${meta.label.toLowerCase()}`
                : `${meta.label} unavailable`}
            </p>
            {percentLabel != null ? (
              <span
                className={cn(
                  "shrink-0 tabular-nums text-muted-foreground",
                  compact ? "text-[9px]" : "text-[10px]"
                )}
              >
                {percentLabel}
              </span>
            ) : null}
          </div>
          <p
            className={cn(
              "leading-snug text-muted-foreground",
              compact ? "text-[9px]" : "text-[10px]"
            )}
          >
            {detail}
          </p>
          {status === "error" ? (
            <p
              className={cn(
                "leading-snug text-muted-foreground/80",
                compact ? "text-[9px]" : "text-[10px]"
              )}
            >
              Refresh the page or re-upload the file.
            </p>
          ) : null}
        </div>
      </div>

      {/* Single bar — do not use <Progress>; it renders a duplicate track. */}
      <div
        className={cn(
          "w-full overflow-hidden rounded-full bg-muted/50",
          compact ? "h-1" : "h-1.5"
        )}
      >
        {fillPercent != null ? (
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-300 ease-out",
              status === "error" ? "bg-red-400/80" : "bg-[#00C9A7]"
            )}
            style={{ width: `${fillPercent}%` }}
          />
        ) : (
          <div
            className={cn(
              "h-full w-[36%] rounded-full bg-[#00C9A7]/55",
              status === "loading" && "opacity-70"
            )}
          />
        )}
      </div>
    </div>
  )
}
