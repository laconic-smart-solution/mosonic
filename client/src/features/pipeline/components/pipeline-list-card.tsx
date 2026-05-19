import { motion } from "framer-motion"
import { ChevronRight, GitBranch } from "lucide-react"

import { PipelineStatusBadge } from "@/features/pipeline/components/pipeline-status-badge"
import {
  formatRelativeTime,
  truncatePrompt,
} from "@/features/pipeline/lib/pipeline-list-format"
import {
  pipelineNodeTypeMeta,
  sortPipelineNodeTypes,
} from "@/features/pipeline/lib/pipeline-node-icons"
import { PIPELINE_STATUS_THEME } from "@/features/pipeline/lib/pipeline-status-theme"
import { cn } from "@/lib/utils"
import type { PipelinePageItem } from "@/shared/types/pipeline.type"

type Props = {
  item: PipelinePageItem
  index: number
  workflowName?: string
  onOpen: (item: PipelinePageItem) => void
}

export function PipelineListCard({
  item,
  index,
  workflowName,
  onOpen,
}: Props) {
  const theme = PIPELINE_STATUS_THEME[item.status]
  const nodeTypes = sortPipelineNodeTypes(item.nodeTypes ?? [])

  return (
    <motion.button
      type="button"
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.22, delay: index * 0.04 }}
      whileHover={{ y: -3 }}
      onClick={() => onOpen(item)}
      className={cn(
        "group flex h-full w-full flex-col rounded-2xl border border-[color:var(--nt-border)] bg-[color:var(--nt-surface)] p-4 text-left shadow-[var(--nt-surface-shadow)]",
        "transition-colors hover:border-primary/25 hover:shadow-md",
        theme.rowHover,
      )}
    >
      <motion.div
        className="mb-3 flex items-start justify-between gap-2"
        initial={false}
      >
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/80 text-base"
          aria-hidden
        >
          {theme.emoji}
        </span>
        <PipelineStatusBadge status={item.status} />
      </motion.div>

      <p className="mb-3 line-clamp-3 min-h-[3.75rem] flex-1 text-[15px] leading-snug font-semibold text-foreground">
        {truncatePrompt(item.contentPrompt || "No prompt", 120)}
      </p>

      <motion.div
        className="mb-3 flex min-h-[36px] flex-wrap gap-1.5"
        initial={false}
      >
        {nodeTypes.length > 0 ? (
          nodeTypes.map((type) => {
            const meta = pipelineNodeTypeMeta(type)
            const Icon = meta.Icon
            return (
              <span
                key={type}
                title={meta.label}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5",
                  meta.chipClass,
                )}
              >
                <Icon className={cn("size-3.5 shrink-0", meta.iconClass)} aria-hidden />
                <span className="text-[10px] font-medium">{meta.label}</span>
              </span>
            )
          })
        ) : (
          <span className="text-[11px] text-muted-foreground">No steps yet</span>
        )}
      </motion.div>

      <motion.div
        className="mt-auto space-y-2 border-t border-border/50 pt-3 text-[11px] text-muted-foreground"
        initial={false}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="rounded-md bg-muted/60 px-1.5 py-0.5 font-medium tabular-nums">
            {item.nodeCount} nodes
          </span>
          <span>Started {formatRelativeTime(item.startedAt)}</span>
        </div>
        {workflowName ? (
          <p className="inline-flex max-w-full items-center gap-1 truncate text-foreground/70">
            <GitBranch className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{workflowName}</span>
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <span className="text-[11px] font-medium text-muted-foreground transition-colors group-hover:text-foreground">
            Open run
          </span>
          <ChevronRight
            className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </div>
      </motion.div>
    </motion.button>
  )
}
