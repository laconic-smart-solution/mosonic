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
import { toast } from "sonner"
import type {
  ContentPageItem,
  ContentOutputs,
} from "@/shared/types/content.type"
import { cn } from "@/lib/utils"
import {
  displayLinkedRef,
  listCardPrimaryTitle,
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

/** Preview priority for grid hero: video → image → summary → translation → transcript → text. */
function resolveGridHeroOutput(
  o: ContentOutputs | undefined
): GridHeroResolved {
  if (hasOutput(o?.video)) {
    return { kind: "video", url: o!.video!.trim() }
  }
  if (hasOutput(o?.image)) {
    return { kind: "image", url: o!.image!.trim() }
  }
  if (hasOutput(o?.summary)) {
    return { kind: "text", label: "Summary", body: o!.summary!.trim() }
  }
  if (hasOutput(o?.translatedText)) {
    return {
      kind: "text",
      label: "Translation",
      body: o!.translatedText!.trim(),
    }
  }
  if (hasOutput(o?.transcription)) {
    return { kind: "text", label: "Transcript", body: o!.transcription!.trim() }
  }
  if (hasOutput(o?.text)) {
    return { kind: "text", label: "Text", body: o!.text!.trim() }
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
    toast.success("Link copied")
  } catch {
    toast.error("Copy failed")
  }
}

export function ContentListCard({ item, index, onOpen }: Props) {
  const campaignLabel = displayLinkedRef(item.ruleRef, "campaign")
  const title = listCardPrimaryTitle(item.status)
  const o = item.outputs
  const hasText = hasOutput(o?.text) || hasOutput(o?.transcription)
  const hasImage = hasOutput(o?.image)
  const hasTranslation = hasOutput(o?.translatedText)
  const hasVideo = hasOutput(o?.video)
  const hasSummary = hasOutput(o?.summary)
  const gridHero = resolveGridHeroOutput(o)
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
        "group cursor-pointer overflow-hidden rounded-2xl border border-canvas-200 bg-card shadow-sm transition-[box-shadow,border-color] duration-200",
        "hover:border-canvas-300 hover:shadow-lg"
      )}
    >
      <div className="relative flex h-40 items-center justify-center overflow-hidden">
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
        <div
          className={cn(
            "absolute inset-0",
            showMediaHero ? "opacity-80" : "opacity-95"
          )}
        />
        <div className="relative z-10 flex max-h-full w-full flex-col items-center justify-center gap-1.5 px-3 text-center">
          {gridHero?.kind === "text" ? (
            <div className="flex max-h-30 w-full flex-col items-start gap-1">
              <span className="text-[10px] font-semibold tracking-widest uppercase">
                {gridHero.label}
              </span>
              <p className="line-clamp-5 w-full text-left text-sm">
                {gridHero.body}
              </p>
            </div>
          ) : (
            <>
              <span className="text-3xl text-canvas-50">
                {previewEmoji(item.status)}
              </span>
            </>
          )}
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
                <p className="mb-1 text-[11px] font-semibold tracking-wider text-canvas-500 uppercase">
                  Campaign
                </p>
                <h2 className="line-clamp-2 font-heading text-[15px] leading-snug tracking-tight text-navy-700">
                  {title}
                </h2>
                {campaignLabel.trim() ? (
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-canvas-500">{campaignLabel}</p>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className="flex size-[22px] items-center justify-center rounded-md border border-canvas-200 bg-canvas-100 text-[11px] text-canvas-600"
                title="Workflow"
              >
                W
              </span>
              <span
                className="flex size-[22px] items-center justify-center rounded-md border border-canvas-200 bg-canvas-100 text-[11px] text-canvas-600"
                title="Pipeline"
              >
                P
              </span>
              <span className="ml-auto text-[11px] text-canvas-400">
                {formatRelativeTime(item.updatedAt)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 border-t border-canvas-200 bg-canvas-100 px-4 py-2.5">
        <div className="flex items-center gap-1">
          <span
            className={cn(
              "flex size-5 items-center justify-center rounded-md border",
              hasText
                ? "border-canvas-200/80 bg-navy-50 text-navy-500"
                : "border-canvas-200 bg-canvas-100 text-canvas-300 opacity-70"
            )}
            title="Text or transcript"
          >
            <FileText className="size-2.5" />
          </span>
          <span
            className={cn(
              "flex size-5 items-center justify-center rounded-md border",
              hasVideo
                ? "border-canvas-200/80 bg-amber-50 text-amber-700"
                : "border-canvas-200 bg-canvas-100 text-canvas-300 opacity-70"
            )}
            title="Video"
          >
            <Video className="size-2.5" />
          </span>
          <span
            className={cn(
              "flex size-5 items-center justify-center rounded-md border",
              hasImage
                ? "border-canvas-200/80 bg-teal-50 text-teal-600"
                : "border-canvas-200 bg-canvas-100 text-canvas-300 opacity-70"
            )}
            title="Image"
          >
            <ImageIcon className="size-2.5" />
          </span>
          <span
            className={cn(
              "flex size-5 items-center justify-center rounded-md border",
              hasTranslation
                ? "border-canvas-200/80 bg-navy-50 text-navy-500"
                : "border-canvas-200 bg-canvas-100 text-canvas-300 opacity-70"
            )}
            title="Translation"
          >
            <Languages className="size-2.5" />
          </span>
          <span
            className={cn(
              "flex size-5 items-center justify-center rounded-md border",
              hasSummary
                ? "border-canvas-200/80 bg-violet-50 text-violet-700"
                : "border-canvas-200 bg-canvas-100 text-canvas-300 opacity-70"
            )}
            title="Summary"
          >
            <AlignLeft className="size-2.5" />
          </span>
        </div>
        <span className="ml-1 text-[11px] text-canvas-400">Outputs</span>
        <div
          className="ml-auto flex gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            title="Copy link"
            className="flex size-7 items-center justify-center rounded-md border border-canvas-200 bg-transparent text-canvas-500 transition-colors hover:border-canvas-300 hover:bg-card hover:text-navy-700"
            onClick={(e) => void copyPageLink(item.contentId, item.uploadId, e)}
          >
            <Copy className="size-3.5" />
          </button>
          <button
            type="button"
            title="Open"
            className="flex size-7 items-center justify-center rounded-md border border-canvas-200 bg-transparent text-canvas-500 transition-colors hover:border-canvas-300 hover:bg-card hover:text-navy-700"
            onClick={() => onOpen(item.contentId)}
          >
            <ArrowRight className="size-3.5" />
          </button>
        </div>
      </div>
    </motion.article>
  )
}
