import { Link } from "react-router-dom"
import { motion } from "framer-motion"
import {
  AlertCircle,
  Calendar,
  CheckCircle,
  Clock,
  RotateCw,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import {
  FileServiceImage,
  FileServiceVideo,
} from "@/features/upload/components/upload-display-media"
import { ChannelStack } from "@/features/posts/lib/channel-stack"
import { POST_STATUS_THEME } from "@/features/posts/lib/post-status-theme"
import type { PostRecord, PostStatus } from "@/shared/types/post.type"

type PostListCardProps = {
  post: PostRecord
  selected: boolean
  onToggleSelect: (postId: string, next: boolean) => void
  onOpen: (postId: string) => void
  onRetry?: (postId: string) => void
  retryBusy?: boolean
}

export function PostListCard({
  post,
  selected,
  onToggleSelect,
  onOpen,
  onRetry,
  retryBusy,
}: PostListCardProps) {
  const cfg = POST_STATUS_THEME[post.status]
  const caption =
    post.captionPreview?.trim() ||
    "No caption preview yet — open the post for full detail."

  const mediaUrl = post.mediaPreviewUrl?.trim() || null
  const mediaKind = post.mediaKind
  const showMediaHero =
    mediaUrl && (mediaKind === "image" || mediaKind === "video")

  const metaParts: string[] = []
  if (post.scheduledAt) {
    metaParts.push(`Scheduled ${fmtCompact(post.scheduledAt)}`)
  }
  if (post.publishedAt) {
    metaParts.push(`Published ${fmtCompact(post.publishedAt)}`)
  }

  return (
    <motion.article
      whileHover={{ y: -2 }}
      className={cn(
        "group relative flex w-full max-w-[22rem] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-[box-shadow,border-color] duration-200",
        selected
          ? "border-navy-500/40 ring-2 ring-navy-500/15"
          : "hover:border-muted-foreground/30 hover:shadow-lg"
      )}
    >
      <button
        type="button"
        className="flex w-full flex-col text-left"
        onClick={() => onOpen(post.postId)}
      >
        <motion.div className="relative h-40 overflow-hidden">
          {showMediaHero && mediaKind === "video" ? (
            <FileServiceVideo
              url={mediaUrl!}
              className="absolute inset-0 size-full object-cover"
              muted
              playsInline
              controls={false}
            />
          ) : showMediaHero && mediaKind === "image" ? (
            <FileServiceImage
              url={mediaUrl!}
              alt=""
              className="absolute inset-0 size-full object-cover"
              loadingClassName="absolute inset-0 flex size-full items-center justify-center bg-muted/50 text-[10px] text-muted-foreground"
            />
          ) : null}

          <div
            className={cn(
              "absolute inset-0 bg-gradient-to-br",
              cfg.heroGradient,
              showMediaHero && "opacity-75 mix-blend-multiply"
            )}
          />

          <div className="relative z-10 flex h-full flex-col justify-end p-3">
            {!showMediaHero ? (
              <p className="line-clamp-5 text-left text-[13px] leading-snug text-foreground/90">
                {caption}
              </p>
            ) : (
              <p className="line-clamp-2 text-left text-xs leading-snug text-white drop-shadow-sm">
                {caption}
              </p>
            )}
          </div>

          {!showMediaHero ? (
            <span
              className="absolute top-1/2 left-1/2 z-[5] -translate-x-1/2 -translate-y-1/2 text-3xl opacity-40"
              aria-hidden
            >
              {cfg.emoji}
            </span>
          ) : null}

          <span
            className={cn(
              "absolute top-2.5 left-2.5 z-20 flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold shadow-sm",
              cfg.badge,
              cfg.pulse && "animate-pulse"
            )}
          >
            {cfg.label}
          </span>

          <div
            className="absolute top-2.5 right-2.5 z-20"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="presentation"
          >
            <Checkbox
              checked={selected}
              onCheckedChange={(v) => onToggleSelect(post.postId, v === true)}
              aria-label="Select post"
              className="size-4 border-border/70 bg-background shadow-sm"
            />
          </div>
        </motion.div>

        <div className="flex flex-col gap-2 px-3 pt-2.5 pb-2">
          <ChannelStack channels={post.channels ?? []} sizeClass="size-7" />

          {post.youtubeTitlePreview?.trim() ? (
            <p className="line-clamp-2 font-heading text-sm leading-snug font-medium text-foreground">
              {post.youtubeTitlePreview}
            </p>
          ) : null}

          <p className="line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
            {caption}
          </p>

          {post.failureReason ? (
            <p className="line-clamp-2 flex gap-1.5 text-[11px] leading-snug text-red-700 dark:text-red-300">
              <AlertCircle className="mt-0.5 size-3 shrink-0" aria-hidden />
              {post.failureReason}
            </p>
          ) : null}

          {metaParts.length > 0 ? (
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] text-muted-foreground">
              {metaParts.map((part, i) => (
                <span key={part} className="inline-flex items-center gap-1.5">
                  {i > 0 ? (
                    <span className="text-muted-foreground/40" aria-hidden>
                      ·
                    </span>
                  ) : null}
                  {part}
                </span>
              ))}
            </p>
          ) : null}
        </div>
      </button>

      <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/80 px-3 py-2">
        <Link
          to={`/content/${encodeURIComponent(post.contentRef)}`}
          className="text-[11px] font-medium text-primary hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          Content
        </Link>
        {post.status === "failed" && onRetry ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
            disabled={retryBusy}
            aria-label="Retry publish"
            onClick={(e) => {
              e.stopPropagation()
              onRetry(post.postId)
            }}
          >
            <RotateCw
              className={cn("size-3", retryBusy && "animate-spin")}
              aria-hidden
            />
            Retry
          </Button>
        ) : (
          <StatusMetaIcon status={post.status} />
        )}
      </div>
    </motion.article>
  )
}

function StatusMetaIcon({ status }: { status: PostStatus }) {
  switch (status) {
    case "scheduled":
      return (
        <Calendar className="size-3.5 text-[#185FA5]" aria-hidden />
      )
    case "published":
      return (
        <CheckCircle className="size-3.5 text-[#0F6E56]" aria-hidden />
      )
    case "pending":
      return <Clock className="size-3.5 text-muted-foreground/50" aria-hidden />
    default:
      return null
  }
}

function fmtCompact(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}
