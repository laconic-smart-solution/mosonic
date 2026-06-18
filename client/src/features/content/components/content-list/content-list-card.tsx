import type { MouseEvent, KeyboardEvent } from "react"
import { motion } from "framer-motion"
import {
  AlignLeft,
  ArrowRight,
  Copy,
  FileText,
  ImageIcon,
  Languages,
  Video,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import i18n from "@/i18n"
import type {
  ContentPageItem,
} from "@/shared/types/content.type"
import { cn } from "@/lib/utils"
import {
  contentPreviewFromPageItem,
  displayLinkedRef,
  laneOutputChannelCount,
  listCardPrimaryTitle,
  pageItemHasImage,
  pageItemHasVideo,
  resolvePageItemImage,
  resolvePageItemVideo,
} from "@/features/content/lib/content-display"
import {
  FileServiceImage,
  FileServiceVideo,
} from "@/features/upload/components/upload-display-media"
import { ContentListStatusBadge } from "./content-list-status-badge"
import { formatRelativeTime, previewEmoji } from "./content-list-format"

type Props = {
  item: ContentPageItem
  index: number
  onOpen: (contentId: string, uploadId?: string) => void
}

function hasOutput(value: string | undefined): boolean {
  return Boolean(value?.trim())
}

type GridHeroResolved =
  | { kind: "video"; url: string }
  | { kind: "image"; url: string }
  | { kind: "text"; label: string; body: string }
  | null

/** Preview priority for grid hero: video → image → lane/page text → other fields. */
function resolveGridHeroOutput(item: ContentPageItem): GridHeroResolved {
  const o = item.outputs
  const videoUrl = resolvePageItemVideo(item)
  if (videoUrl) {
    return { kind: "video", url: videoUrl }
  }
  const imageUrl = resolvePageItemImage(item)
  if (imageUrl) {
    return { kind: "image", url: imageUrl }
  }
  const pagePreview = contentPreviewFromPageItem(item)
  if (pagePreview) {
    const hasLaneCaption = laneOutputChannelCount(item.laneOutputs) > 0
    return {
      kind: "text",
      label: hasLaneCaption
        ? i18n.t("list.heroCaption")
        : i18n.t("list.heroText"),
      body: pagePreview,
    }
  }
  if (hasOutput(o?.summary)) {
    return {
      kind: "text",
      label: i18n.t("list.heroSummary"),
      body: o!.summary!.trim(),
    }
  }
  if (hasOutput(o?.translatedText)) {
    return {
      kind: "text",
      label: i18n.t("list.heroTranslation"),
      body: o!.translatedText!.trim(),
    }
  }
  if (hasOutput(o?.transcription)) {
    return {
      kind: "text",
      label: i18n.t("list.heroTranscript"),
      body: o!.transcription!.trim(),
    }
  }
  return null
}

async function copyPageLink(
  contentId: string,
  uploadId: string | undefined,
  e: MouseEvent<HTMLButtonElement>
) {
  e.stopPropagation()
  try {
    const path = uploadId ? `/upload/${uploadId}` : `/content/${contentId}`
    const url = `${window.location.origin}${path}`
    await navigator.clipboard.writeText(url)
    toast.success(i18n.t("content:toast.linkCopied"))
  } catch {
    toast.error(i18n.t("content:toast.copyFailed"))
  }
}

export function ContentListCard({ item, index, onOpen }: Props) {
  const { t } = useTranslation("content")
  const campaignLabel = displayLinkedRef(item.ruleRef, "campaign")
  const title = listCardPrimaryTitle(item.status)
  const o = item.outputs
  const hasText = hasOutput(o?.text) || hasOutput(o?.transcription)
  const hasImage = pageItemHasImage(item)
  const hasTranslation = hasOutput(o?.translatedText)
  const hasVideo = pageItemHasVideo(item)
  const hasSummary = hasOutput(o?.summary)
  const laneCount = laneOutputChannelCount(item.laneOutputs)
  const gridHero = resolveGridHeroOutput(item)
  const showMediaHero =
    gridHero?.kind === "image" || gridHero?.kind === "video"

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index, 11) * 0.04 }}
      whileHover={{ y: -2 }}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(item.contentId, item.uploadId)}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onOpen(item.contentId, item.uploadId)
        }
      }}
      className={cn(
        "group cursor-pointer overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-[box-shadow,border-color] duration-200",
        "hover:border-muted-foreground/30 hover:shadow-lg"
      )}
    >
      <div className="relative flex h-40 items-center justify-center overflow-hidden bg-muted/30">
        {gridHero?.kind === "video" ? (
          <FileServiceVideo
            url={gridHero.url}
            className="absolute inset-0 size-full object-cover"
            muted
            playsInline
            controls={false}
            autoPlay
            loop
          />
        ) : gridHero?.kind === "image" ? (
          <FileServiceImage
            url={gridHero.url}
            alt=""
            className="absolute inset-0 size-full object-cover"
            loadingClassName="absolute inset-0 flex size-full items-center justify-center bg-muted/50 text-[10px] text-muted-foreground"
          />
        ) : null}
        {showMediaHero ? (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-12 bg-gradient-to-t from-black/35 to-transparent"
            aria-hidden
          />
        ) : null}
        <div className="relative z-10 flex max-h-full w-full flex-col items-center justify-center gap-1.5 px-3 text-center">
          {gridHero?.kind === "text" ? (
            <div className="flex max-h-30 w-full flex-col items-start gap-1 rounded-md bg-background/85 px-2.5 py-2 text-foreground shadow-sm backdrop-blur-sm">
              <span className="text-[10px] font-semibold tracking-widest uppercase">
                {gridHero.label}
              </span>
              <p className="line-clamp-5 w-full text-left text-sm">
                {gridHero.body}
              </p>
            </div>
          ) : !showMediaHero ? (
            <span className="text-3xl text-foreground/90">
              {previewEmoji(item.status)}
            </span>
          ) : null}
        </div>
        <div className="absolute top-2.5 right-2.5 z-20">
          <ContentListStatusBadge status={item.status} />
        </div>
      </div>

      <div className="px-3 pt-1 pb-3">
        <div className="flex gap-3.5">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex gap-2">
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                  {t("list.campaign")}
                </p>
                <h2 className="line-clamp-2 font-heading text-[15px] leading-snug tracking-tight text-foreground">
                  {title}
                </h2>
                {campaignLabel.trim() ? (
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{campaignLabel}</p>
                ) : null}
                {laneCount > 1 ? (
                  <p className="mt-0.5 text-[10px] font-medium text-muted-foreground">
                    {t("list.channels", { count: laneCount })}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className="flex size-[22px] items-center justify-center rounded-md border border-border bg-muted text-[11px] text-muted-foreground"
                title={t("list.workflow")}
              >
                W
              </span>
              <span
                className="flex size-[22px] items-center justify-center rounded-md border border-border bg-muted text-[11px] text-muted-foreground"
                title={t("list.pipeline")}
              >
                P
              </span>
              <span className="ml-auto text-[11px] text-muted-foreground/70">
                {formatRelativeTime(item.updatedAt)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 border-t border-border bg-muted px-4 py-2.5">
        <div className="flex items-center gap-1">
          <span
            className={cn(
              "flex size-5 items-center justify-center rounded-md border",
              hasText
                ? "border-border/80 bg-accent text-accent-foreground"
                : "border-border bg-muted text-muted-foreground/40 opacity-70"
            )}
            title={t("list.textOrTranscript")}
          >
            <FileText className="size-2.5" />
          </span>
          <span
            className={cn(
              "flex size-5 items-center justify-center rounded-md border",
              hasVideo
                ? "border-border/80 bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
                : "border-border bg-muted text-muted-foreground/40 opacity-70"
            )}
            title={t("list.video")}
          >
            <Video className="size-2.5" />
          </span>
          <span
            className={cn(
              "flex size-5 items-center justify-center rounded-md border",
              hasImage
                ? "border-border/80 bg-teal-50 text-teal-600 dark:bg-teal-950/50 dark:text-teal-300"
                : "border-border bg-muted text-muted-foreground/40 opacity-70"
            )}
            title={t("list.image")}
          >
            <ImageIcon className="size-2.5" />
          </span>
          <span
            className={cn(
              "flex size-5 items-center justify-center rounded-md border",
              hasTranslation
                ? "border-border/80 bg-accent text-accent-foreground"
                : "border-border bg-muted text-muted-foreground/40 opacity-70"
            )}
            title={t("list.translation")}
          >
            <Languages className="size-2.5" />
          </span>
          <span
            className={cn(
              "flex size-5 items-center justify-center rounded-md border",
              hasSummary
                ? "border-border/80 bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300"
                : "border-border bg-muted text-muted-foreground/40 opacity-70"
            )}
            title={t("list.summary")}
          >
            <AlignLeft className="size-2.5" />
          </span>
        </div>
        <span className="ml-1 text-[11px] text-muted-foreground/70">
          {t("list.outputs")}
        </span>
        <div
          className="ml-auto flex gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            title={t("list.copyLink")}
            className="flex size-7 items-center justify-center rounded-md border border-border bg-transparent text-muted-foreground transition-colors hover:border-muted-foreground/30 hover:bg-card hover:text-foreground"
            onClick={(e) => void copyPageLink(item.contentId, item.uploadId, e)}
          >
            <Copy className="size-3.5" />
          </button>
          <button
            type="button"
            title={t("list.open")}
            className="flex size-7 items-center justify-center rounded-md border border-border bg-transparent text-muted-foreground transition-colors hover:border-muted-foreground/30 hover:bg-card hover:text-foreground"
            onClick={() => onOpen(item.contentId)}
          >
            <ArrowRight className="size-3.5" />
          </button>
        </div>
      </div>
    </motion.article>
  )
}
