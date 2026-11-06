import { Link, useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { Send } from "lucide-react"

import { Skeleton } from "@/components/ui/skeleton"
import {
  FileServiceImage,
  FileServiceVideo,
} from "@/features/upload/components/upload-display-media"
import { ChannelStack } from "@/features/posts/lib/channel-stack"
import {
  POST_STATUS_THEME,
  postStatusLabel,
} from "@/features/posts/lib/post-status-theme"
import { usePostsListQuery } from "@/shared/queries/posts.query"
import { cn } from "@/lib/utils"

const LIMIT = 50

/** Compact posts rail for the home workspace (filtered to this brand). */
export function ChatPostList({ ruleId }: { ruleId: string }) {
  const { t } = useTranslation("chat")
  const navigate = useNavigate()
  const query = usePostsListQuery({
    page: 1,
    limit: LIMIT,
    ruleRef: ruleId,
    sort: "newest_created",
  })

  const items = query.data?.posts ?? []

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="overflow-hidden rounded-2xl border border-border bg-card"
            aria-busy="true"
          >
            <Skeleton className="h-24 rounded-none bg-muted" />
            <div className="space-y-2 p-3">
              <Skeleton className="h-4 w-2/3 bg-muted" />
              <Skeleton className="h-3 w-1/3 bg-muted" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-border px-3 py-6 text-center">
        <Send className="size-5 text-muted-foreground" aria-hidden />
        <p className="text-xs text-muted-foreground">{t("workspace.noPosts")}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((post) => {
        const theme = POST_STATUS_THEME[post.status]
        const caption = post.captionPreview?.trim() || t("workspace.postUntitled")
        const mediaUrl = post.mediaPreviewUrl?.trim() || null
        const isVideo = post.mediaKind === "video"
        return (
          <button
            key={post.postId}
            type="button"
            onClick={() => navigate(`/posts/${post.postId}`)}
            className="overflow-hidden rounded-2xl border border-border bg-card text-left transition-colors hover:border-muted-foreground/30 hover:shadow-sm"
          >
            {mediaUrl ? (
              isVideo ? (
                <FileServiceVideo
                  url={mediaUrl}
                  className="h-24 w-full object-cover"
                />
              ) : (
                <FileServiceImage
                  url={mediaUrl}
                  alt=""
                  className="h-24 w-full object-cover"
                />
              )
            ) : (
              <div className="flex h-20 items-center bg-muted/40 px-3">
                <p className="line-clamp-3 text-xs text-muted-foreground">{caption}</p>
              </div>
            )}
            <div className="space-y-1.5 p-3">
              {mediaUrl ? (
                <p className="line-clamp-2 text-xs text-foreground">{caption}</p>
              ) : null}
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    theme.badge,
                  )}
                >
                  {postStatusLabel(post.status)}
                </span>
                {post.channels.length > 0 ? (
                  <ChannelStack channels={post.channels} sizeClass="size-5" />
                ) : null}
              </div>
            </div>
          </button>
        )
      })}
      <Link
        to="/posts"
        className="text-center text-[11px] font-medium text-primary underline-offset-2 hover:underline"
      >
        {t("workspace.viewAllPosts")}
      </Link>
    </div>
  )
}
