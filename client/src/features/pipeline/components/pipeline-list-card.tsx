import { motion } from "framer-motion"
import { useTranslation } from "react-i18next"
import { ArrowRight, Clock, Newspaper, Square } from "lucide-react"

import { Button } from "@/components/ui/button"

import { PipelineStatusBadge } from "@/features/pipeline/components/pipeline-status-badge"
import {
  displayPipelineRuleName,
  pipelineCardPrimaryTitle,
  pipelineCardSecondaryPrompt,
} from "@/features/pipeline/lib/pipeline-display"
import {
  formatRelativeTime,
} from "@/features/pipeline/lib/pipeline-list-format"
import {
  pipelineNodeTypeLabel,
  pipelineNodeTypeMeta,
  sortPipelineNodeTypes,
} from "@/features/pipeline/lib/pipeline-node-icons"
import { cn } from "@/lib/utils"
import type { PipelinePageItem } from "@/shared/types/pipeline.type"

const MAX_NODE_CHIPS = 5

type Props = {
  item: PipelinePageItem
  index: number
  onOpen: (item: PipelinePageItem) => void
  onStop?: (item: PipelinePageItem) => void
}

export function PipelineListCard({
  item,
  index,
  onOpen,
  onStop,
}: Props) {
  const { t, i18n } = useTranslation("pipeline")
  const canStop = item.status === "running" || item.status === "paused"
  const nodeTypes = sortPipelineNodeTypes(item.nodeTypes ?? [])
  const visibleTypes = nodeTypes.slice(0, MAX_NODE_CHIPS)
  const hiddenTypeCount = nodeTypes.length - visibleTypes.length
  const campaignLabel = displayPipelineRuleName(item.ruleName, item.ruleRef)
  const title = pipelineCardPrimaryTitle(item, t("card.noName"))
  const subtitle = pipelineCardSecondaryPrompt(item)
  const startedLabel = formatRelativeTime(item.startedAt, t, i18n.language)

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.22, delay: index * 0.04 }}
      whileHover={{ y: -2 }}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(item)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onOpen(item)
        }
      }}
      className={cn(
        "group flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-border bg-card text-left shadow-sm",
        "transition-[border-color,box-shadow] duration-200",
        "hover:border-muted-foreground/30 hover:shadow-lg",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2",
      )}
    >
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-0.5">
            {campaignLabel ? (
              <>
                <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                  {t("card.campaign")}
                </p>
                <p className="line-clamp-1 text-[13px] font-medium text-foreground/90">
                  {campaignLabel}
                </p>
              </>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              {item.metadataSource === "news" ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-sky-200/90 bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-800">
                  <Newspaper className="size-3 shrink-0" aria-hidden />
                  {t("card.news")}
                </span>
              ) : null}
              <PipelineStatusBadge status={item.status} />
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-1">
          {item.newsTitle ? (
            <p className="line-clamp-1 text-[11px] font-medium text-sky-800">
              {item.newsTitle}
            </p>
          ) : null}
          <h2 className="line-clamp-2 font-heading text-[15px] leading-snug font-semibold tracking-tight text-foreground">
            {title}
          </h2>
          {subtitle ? (
            <p className="line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
        </div>

        <div className="min-h-[1.75rem]">
          {visibleTypes.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {visibleTypes.map((type) => {
                const meta = pipelineNodeTypeMeta(type)
                const Icon = meta.Icon
                return (
                  <span
                    key={type}
                    title={pipelineNodeTypeLabel(type, t)}
                    className={cn(
                      "inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5",
                      meta.chipClass,
                    )}
                  >
                    <Icon
                      className={cn("size-3 shrink-0", meta.iconClass)}
                      aria-hidden
                    />
                    <span className="truncate text-[10px] font-medium leading-none">
                      {pipelineNodeTypeLabel(type, t)}
                    </span>
                  </span>
                )
              })}
              {hiddenTypeCount > 0 ? (
                <span className="inline-flex items-center rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  +{hiddenTypeCount}
                </span>
              ) : null}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground/70">{t("card.noSteps")}</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/40 px-4 py-2.5">
        <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
          <span>{t("card.node", { count: item.nodeCount })}</span>
          <span className="text-muted-foreground/40" aria-hidden>
            ·
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3 shrink-0" aria-hidden />
            {startedLabel}
          </span>
        </p>
        <div className="flex shrink-0 items-center gap-1">
          {canStop && onStop ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation()
                onStop(item)
              }}
            >
              <Square className="size-3 fill-current" aria-hidden />
              {t("card.stop")}
            </Button>
          ) : (
            <ArrowRight
              className="size-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
              aria-hidden
            />
          )}
        </div>
      </div>
    </motion.article>
  )
}
