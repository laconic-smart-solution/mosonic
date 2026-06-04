import { motion } from "framer-motion"
import { useTranslation } from "react-i18next"
import {
  ArrowRight,
  Clock,
  GitBranch,
  Layers,
  Newspaper,
  Square,
} from "lucide-react"

import { Button } from "@/components/ui/button"

import { PipelineStatusBadge } from "@/features/pipeline/components/pipeline-status-badge"
import {
  formatRelativeTime,
  truncatePrompt,
} from "@/features/pipeline/lib/pipeline-list-format"
import {
  pipelineNodeTypeLabel,
  pipelineNodeTypeMeta,
  sortPipelineNodeTypes,
} from "@/features/pipeline/lib/pipeline-node-icons"
import { pipelineStatusIconMeta } from "@/features/pipeline/lib/pipeline-status-icon"
import { PIPELINE_STATUS_THEME } from "@/features/pipeline/lib/pipeline-status-theme"
import { cn } from "@/lib/utils"
import type { PipelinePageItem } from "@/shared/types/pipeline.type"

const MAX_NODE_CHIPS = 5

type Props = {
  item: PipelinePageItem
  index: number
  workflowName?: string
  onOpen: (item: PipelinePageItem) => void
  onStop?: (item: PipelinePageItem) => void
}

export function PipelineListCard({
  item,
  index,
  workflowName,
  onOpen,
  onStop,
}: Props) {
  const { t, i18n } = useTranslation("pipeline")
  const canStop = item.status === "running" || item.status === "paused"
  const theme = PIPELINE_STATUS_THEME[item.status]
  const statusIcon = pipelineStatusIconMeta(item.status)
  const StatusIcon = statusIcon.Icon
  const nodeTypes = sortPipelineNodeTypes(item.nodeTypes ?? [])
  const visibleTypes = nodeTypes.slice(0, MAX_NODE_CHIPS)
  const hiddenTypeCount = nodeTypes.length - visibleTypes.length

  return (
    <motion.button
      type="button"
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.22, delay: index * 0.04 }}
      whileHover={{ y: -2 }}
      onClick={() => onOpen(item)}
      className={cn(
        "group relative flex h-full w-full flex-col overflow-hidden rounded-2xl border border-border/80 bg-card text-left shadow-sm",
        "transition-[border-color,box-shadow,background-color] duration-200",
        "hover:border-primary/30 hover:shadow-md",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2",
        theme.rowHover,
      )}
    >
      <span
        className={cn(
          "absolute inset-y-0 left-0 w-1 rounded-l-2xl",
          item.status === "completed" && "bg-emerald-500",
          item.status === "running" && "bg-sky-500",
          item.status === "paused" && "bg-amber-500",
          item.status === "failed" && "bg-red-500",
        )}
        aria-hidden
      />

      <div className="flex flex-1 flex-col gap-3 p-4 pl-5">
        <div className="flex items-start justify-between gap-3">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset",
              statusIcon.ringClass,
              item.status === "running" && "animate-pulse",
            )}
          >
            <StatusIcon
              className={cn("size-4", statusIcon.iconClass)}
              aria-hidden
            />
          </span>
          <div className="flex min-w-0 flex-col items-end gap-1.5">
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              {item.metadataSource === "news" ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-sky-200/90 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-800">
                  <Newspaper className="size-3 shrink-0" aria-hidden />
                  {t("card.news")}
                </span>
              ) : null}
              <PipelineStatusBadge status={item.status} />
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="size-3 shrink-0" aria-hidden />
              {formatRelativeTime(item.startedAt, t, i18n.language)}
            </span>
          </div>
        </div>

        <div className="min-w-0 space-y-1">
          {item.newsTitle ? (
            <p className="line-clamp-1 text-[11px] font-medium text-sky-800">
              {item.newsTitle}
            </p>
          ) : null}
          <p className="line-clamp-2 text-[15px] leading-snug font-semibold tracking-tight text-foreground">
            {truncatePrompt(item.contentPrompt || t("card.noPrompt"), 140)}
          </p>
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
            <span className="text-[11px] text-muted-foreground">{t("card.noSteps")}</span>
          )}
        </div>

        <div className="mt-auto space-y-2 border-t border-border/60 pt-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1 font-medium text-foreground/80">
              <Layers className="size-3.5 shrink-0" aria-hidden />
              {t("card.node", { count: item.nodeCount })}
            </span>
          </div>
          {workflowName ? (
            <p className="inline-flex max-w-full items-center gap-1.5 text-[11px] text-muted-foreground">
              <GitBranch className="size-3.5 shrink-0 text-muted-foreground/80" aria-hidden />
              <span className="truncate">{workflowName}</span>
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <span className="text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground">
              {t("card.openRun")}
            </span>
            <div className="flex items-center gap-1">
              {canStop && onStop ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 border-destructive/40 px-2 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation()
                    onStop(item)
                  }}
                >
                  <Square className="size-3 fill-current" aria-hidden />
                  {t("card.stop")}
                </Button>
              ) : null}
              <ArrowRight
                className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                aria-hidden
              />
            </div>
          </div>
        </div>
      </div>
    </motion.button>
  )
}
