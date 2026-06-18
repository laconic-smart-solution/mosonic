import { ChevronDown, ChevronUp, Circle, CircleDot, Pencil } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { PipelineStatusBadge } from "@/features/pipeline/components/pipeline-status-badge"
import {
  formatRelativeTime,
  truncatePrompt,
} from "@/features/pipeline/lib/pipeline-list-format"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
  onApplyToWorkflow?: (item: PipelinePageItem) => void
  onRenamePipeline?: (pipelineId: string, name: string) => void
  isApplying?: boolean
  isLoading?: boolean
  hasMore?: boolean
  isFetchingMore?: boolean
  onLoadMore?: () => void
}

function PipelineNameRow({
  item,
  onRenamePipeline,
}: {
  item: PipelinePageItem
  onRenamePipeline?: (pipelineId: string, name: string) => void
}) {
  const { t } = useTranslation("workflow")
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.name || "")

  useEffect(() => {
    if (!editing) {
      setDraft(item.name || "")
    }
  }, [editing, item.name])

  const displayName =
    item.name?.trim() ||
    truncatePrompt(item.contentPrompt || t("usedPipelines.noPrompt"), 48)

  if (!onRenamePipeline) {
    return (
      <p className="line-clamp-2 text-xs font-medium leading-snug text-foreground">
        {displayName}
      </p>
    )
  }

  if (editing) {
    return (
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const trimmed = draft.trim()
          setEditing(false)
          if (trimmed && trimmed !== item.name) {
            onRenamePipeline(item.pipelineId, trimmed)
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur()
          }
          if (e.key === "Escape") {
            setDraft(item.name || "")
            setEditing(false)
          }
        }}
        className="h-7 text-xs"
        autoFocus
        onClick={(e) => e.stopPropagation()}
      />
    )
  }

  return (
    <div className="flex items-start gap-1">
      <p className="min-w-0 flex-1 line-clamp-2 text-xs font-medium leading-snug text-foreground">
        {displayName}
      </p>
      <button
        type="button"
        className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={t("usedPipelines.rename")}
        onClick={(e) => {
          e.stopPropagation()
          setEditing(true)
        }}
      >
        <Pencil className="size-3" />
      </button>
    </div>
  )
}

export function WorkflowUsedPipelinesPanel({
  items,
  total,
  collapsed,
  onCollapsedChange,
  selectedPipelineId,
  onToggleSelect,
  onClearSelection,
  onApplyToWorkflow,
  onRenamePipeline,
  isApplying = false,
  isLoading = false,
  hasMore = false,
  isFetchingMore = false,
  onLoadMore,
}: WorkflowUsedPipelinesPanelProps) {
  const { t } = useTranslation("workflow")
  const { t: tPipeline, i18n } = useTranslation("pipeline")
  const selectedItem = items.find((i) => i.pipelineId === selectedPipelineId)

  return (
    <aside
      className="pointer-events-auto absolute top-3 right-3 z-20 flex w-[min(calc(100%-1.5rem),360px)] max-w-[360px] flex-col rounded-xl border border-border bg-card/98 shadow-lg backdrop-blur-sm"
      aria-label={t("usedPipelines.aria")}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <button
          type="button"
          onClick={() => onCollapsedChange(!collapsed)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-semibold text-foreground"
        >
          <span className="truncate">{t("usedPipelines.title")}</span>
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
            <div className="mb-2 space-y-2 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-2">
              <p className="text-[11px] leading-snug text-foreground">
                {t("usedPipelines.previewing")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {onApplyToWorkflow ? (
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 flex-1 px-2 text-[11px]"
                    disabled={isApplying}
                    onClick={() => onApplyToWorkflow(selectedItem)}
                  >
                    {isApplying
                      ? t("usedPipelines.applying")
                      : t("usedPipelines.apply")}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 px-2 text-[11px]"
                  disabled={isApplying}
                  onClick={onClearSelection}
                >
                  {t("usedPipelines.clear")}
                </Button>
              </div>
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
                          {formatRelativeTime(item.startedAt, tPipeline, i18n.language)}
                        </span>
                      </span>
                      <div className="mt-1.5">
                        <PipelineNameRow
                          item={item}
                          onRenamePipeline={onRenamePipeline}
                        />
                      </div>
                      {item.contentPrompt?.trim() ? (
                        <p className="mt-1 line-clamp-1 text-[10px] leading-snug text-muted-foreground">
                          {truncatePrompt(item.contentPrompt, 80)}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {t("usedPipelines.nodes", { count: item.nodeCount })}
                      </p>
                    </span>
                  </button>
                </li>
              )
            })}
            {!isLoading && items.length === 0 ? (
              <li className="px-2 py-6 text-center text-xs text-muted-foreground">
                {t("usedPipelines.empty")}
              </li>
            ) : null}
            {isLoading && items.length === 0 ? (
              <li className="px-2 py-6 text-center text-xs text-muted-foreground">
                {t("usedPipelines.loading")}
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
              {isFetchingMore
                ? t("usedPipelines.loadingMore")
                : t("usedPipelines.loadMore")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </aside>
  )
}
