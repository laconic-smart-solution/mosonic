import { ChevronDown, ChevronUp, Circle, CircleDot } from "lucide-react"

import { PipelineStatusBadge } from "@/features/pipeline/components/pipeline-status-badge"
import {
  formatRelativeTime,
  truncatePrompt,
} from "@/features/pipeline/lib/pipeline-list-format"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { PipelinePageItem } from "@/shared/types/pipeline.type"

type WorkflowUsedPipelinesPanelProps = {
  items: PipelinePageItem[]
  total: number
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
  selectedPipelineId?: string
  onToggleSelect: (item: PipelinePageItem) => void
  onClearSelection: () => void
  isLoading?: boolean
  hasMore?: boolean
  isFetchingMore?: boolean
  onLoadMore?: () => void
}

export function WorkflowUsedPipelinesPanel({
  items,
  total,
  collapsed,
  onCollapsedChange,
  selectedPipelineId,
  onToggleSelect,
  onClearSelection,
  isLoading = false,
  hasMore = false,
  isFetchingMore = false,
  onLoadMore,
}: WorkflowUsedPipelinesPanelProps) {
  const selectedItem = items.find((i) => i.pipelineId === selectedPipelineId)

  return (
    <aside
      className="pointer-events-auto absolute top-3 right-3 z-20 flex w-[min(calc(100%-1.5rem),360px)] max-w-[360px] flex-col rounded-xl border border-border bg-card/98 shadow-lg backdrop-blur-sm"
      aria-label="Used pipelines"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <button
          type="button"
          onClick={() => onCollapsedChange(!collapsed)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-semibold text-foreground"
        >
          <span className="truncate">Used Pipelines</span>
          {collapsed ? (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronUp className="size-4 shrink-0 text-muted-foreground" />
          )}
        </button>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {items.length}/{total}
        </span>
      </div>

      {!collapsed ? (
        <div className="flex min-h-0 flex-col px-2 pb-2 pt-1">
          {selectedPipelineId && selectedItem ? (
            <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-2">
              <p className="min-w-0 text-[11px] leading-snug text-foreground">
                Previewing run · click again or clear to edit workflow
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 px-2 text-[11px]"
                onClick={onClearSelection}
              >
                Clear
              </Button>
            </div>
          ) : null}

          <ul className="max-h-[min(42vh,320px)] space-y-1.5 overflow-y-auto overscroll-contain px-0.5">
            {items.map((item) => {
              const selected = selectedPipelineId === item.pipelineId
              return (
                <li key={item.pipelineId}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onToggleSelect(item)}
                    className={cn(
                      "flex w-full gap-2.5 rounded-lg border px-2.5 py-2.5 text-left transition-colors",
                      selected
                        ? "border-primary bg-primary/10 ring-1 ring-primary/25"
                        : "border-border bg-background hover:border-muted-foreground/25 hover:bg-muted/50",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
                        selected
                          ? "text-primary"
                          : "text-muted-foreground/70",
                      )}
                      aria-hidden
                    >
                      {selected ? (
                        <CircleDot className="size-4" strokeWidth={2.25} />
                      ) : (
                        <Circle className="size-4" strokeWidth={1.75} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <PipelineStatusBadge status={item.status} />
                        <span className="text-[10px] text-muted-foreground">
                          {formatRelativeTime(item.startedAt)}
                        </span>
                      </span>
                      <p className="mt-1.5 line-clamp-2 text-xs leading-snug text-foreground/90">
                        {truncatePrompt(item.contentPrompt || "No prompt", 100)}
                      </p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {item.nodeCount}{" "}
                        {item.nodeCount === 1 ? "node" : "nodes"}
                      </p>
                    </span>
                  </button>
                </li>
              )
            })}
            {!isLoading && items.length === 0 ? (
              <li className="px-2 py-6 text-center text-xs text-muted-foreground">
                No pipelines yet for this workflow.
              </li>
            ) : null}
            {isLoading && items.length === 0 ? (
              <li className="px-2 py-6 text-center text-xs text-muted-foreground">
                Loading pipelines…
              </li>
            ) : null}
          </ul>

          {hasMore && onLoadMore ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 h-8 w-full text-xs"
              disabled={isFetchingMore}
              onClick={onLoadMore}
            >
              {isFetchingMore ? "Loading…" : "Load more"}
            </Button>
          ) : null}
        </div>
      ) : null}
    </aside>
  )
}
