import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  PIPELINE_PAGE_LIMITS,
  PIPELINE_SORT_VALUES,
  pipelineSortLabel,
  type PipelineSortParam,
} from "@/features/pipeline/lib/pipeline-list-format"
import { displayWorkflowLabel } from "@/features/pipeline/lib/pipeline-display"

export type PipelinesToolbarProps = {
  workflowId: string | null
  workflowOptions: { workflowId: string; name: string }[]
  onWorkflowChange: (id: string | null) => void
  sort: PipelineSortParam
  onSortChange: (value: PipelineSortParam) => void
  limit: number
  onLimitChange: (n: (typeof PIPELINE_PAGE_LIMITS)[number]) => void
  onClear: () => void
}

export function PipelinesToolbar({
  workflowId,
  workflowOptions,
  onWorkflowChange,
  sort,
  onSortChange,
  limit,
  onLimitChange,
  onClear,
}: PipelinesToolbarProps) {
  const { t } = useTranslation("pipeline")
  const { t: tc } = useTranslation("common")

  const sortLabel = pipelineSortLabel(sort, t)

  const workflowLabel = !workflowId
    ? t("toolbar.allWorkflows")
    : displayWorkflowLabel(
        workflowOptions.find((o) => o.workflowId === workflowId)?.name,
      )

  return (
    <ToolbarShell>
      <ToolbarRow className="border-b border-border/60">
        <ToolbarField label={t("toolbar.workflow")} className="sm:max-w-xs sm:flex-1">
          <Select
            value={workflowId ?? "all"}
            onValueChange={(v) => onWorkflowChange(v === "all" ? null : v)}
          >
            <SelectTrigger className="h-10 w-full">
              <SelectValue>{workflowLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("toolbar.allWorkflows")}</SelectItem>
              {workflowOptions.map((row) => (
                <SelectItem key={row.workflowId} value={row.workflowId}>
                  {displayWorkflowLabel(row.name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ToolbarField>

        <Button
          type="button"
          variant="outline"
          className="h-10 w-full shrink-0 sm:w-auto sm:min-w-[88px]"
          onClick={onClear}
        >
          {tc("actions.clear")}
        </Button>
      </ToolbarRow>

      <ToolbarRow>
        <ToolbarField label={t("toolbar.sort")}>
          <Select
            value={sort}
            onValueChange={(v) => onSortChange(v as PipelineSortParam)}
          >
            <SelectTrigger className="h-10 w-full">
              <SelectValue>{sortLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {PIPELINE_SORT_VALUES.map((value) => (
                <SelectItem key={value} value={value}>
                  {pipelineSortLabel(value, t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ToolbarField>

        <ToolbarField label={t("toolbar.perPage")}>
          <Select
            value={String(limit)}
            onValueChange={(v) =>
              onLimitChange(Number(v) as (typeof PIPELINE_PAGE_LIMITS)[number])
            }
          >
            <SelectTrigger className="h-10 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PIPELINE_PAGE_LIMITS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ToolbarField>
      </ToolbarRow>
    </ToolbarShell>
  )
}

function ToolbarShell({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[color:var(--nt-border)] bg-[color:var(--nt-surface)] shadow-[var(--nt-surface-shadow)]">
      {children}
    </div>
  )
}

function ToolbarRow({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`flex flex-col gap-3 p-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4 sm:p-4 ${className ?? ""}`}
    >
      {children}
    </div>
  )
}

function ToolbarField({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`min-w-0 flex-1 space-y-1.5 sm:max-w-[220px] ${className ?? ""}`}
    >
      <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}
