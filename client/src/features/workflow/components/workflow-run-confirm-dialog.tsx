import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { AlertTriangle, Coins, Loader2, Play, Wallet } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { ReviewableWorkflowNode } from "@/features/workflow/lib/workflow-review-nodes"
import {
  readStoredPipelineExecutionMode,
  writeStoredPipelineExecutionMode,
  type PipelineUserExecutionMode,
} from "@/features/workflow/lib/pipeline-execution-mode.storage"
import { usePipelineEstimateQuery } from "@/shared/queries/pipeline.query"
import { TopupDialog } from "@/features/credit/components/topup-dialog"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workflowId: string | undefined
  ruleId: string | undefined
  reviewableNodes: ReviewableWorkflowNode[]
  onConfirm: (
    executionMode: PipelineUserExecutionMode,
    reviewNodeIds?: string[],
  ) => void
  isStarting?: boolean
  showFreshnessWarning?: boolean
}

function formatCredits(value: number): string {
  return Math.max(0, Math.round(value)).toLocaleString()
}

export function WorkflowRunConfirmDialog({
  open,
  onOpenChange,
  workflowId,
  ruleId,
  reviewableNodes,
  onConfirm,
  isStarting = false,
  showFreshnessWarning = false,
}: Props) {
  const { t } = useTranslation("credit")
  const { t: tWorkflow } = useTranslation("workflow")
  const [topupOpen, setTopupOpen] = useState(false)
  const [executionMode, setExecutionMode] = useState<PipelineUserExecutionMode>(
    () => readStoredPipelineExecutionMode(),
  )
  const [selectedReviewNodeIds, setSelectedReviewNodeIds] = useState<string[]>(
    [],
  )
  const estimateQuery = usePipelineEstimateQuery(workflowId, ruleId, open)

  const allReviewNodeIds = useMemo(
    () => reviewableNodes.map((node) => node.nodeId),
    [reviewableNodes],
  )

  useEffect(() => {
    if (open) {
      setExecutionMode(readStoredPipelineExecutionMode())
      setSelectedReviewNodeIds(allReviewNodeIds)
    }
  }, [open, allReviewNodeIds])

  const estimate = estimateQuery.data
  const loading = estimateQuery.isLoading || estimateQuery.isFetching
  const totalCredits = estimate?.totalCredits ?? 0
  const creditsRemaining = estimate?.creditsRemaining ?? 0
  const sufficient = estimate?.sufficient ?? false
  const balanceAfter = creditsRemaining - totalCredits
  const stepModeActive = executionMode === "step"
  const noStepsSelected = stepModeActive && selectedReviewNodeIds.length === 0

  const confirmDisabled =
    isStarting ||
    loading ||
    estimateQuery.isError ||
    !estimate ||
    !sufficient ||
    noStepsSelected

  function selectMode(mode: PipelineUserExecutionMode) {
    setExecutionMode(mode)
    writeStoredPipelineExecutionMode(mode)
    if (mode === "step" && selectedReviewNodeIds.length === 0) {
      setSelectedReviewNodeIds(allReviewNodeIds)
    }
  }

  function toggleReviewNode(nodeId: string, checked: boolean) {
    setSelectedReviewNodeIds((current) => {
      if (checked) {
        return current.includes(nodeId) ? current : [...current, nodeId]
      }
      return current.filter((id) => id !== nodeId)
    })
  }

  function handleConfirm() {
    if (executionMode === "step") {
      onConfirm(executionMode, selectedReviewNodeIds)
      return
    }
    onConfirm(executionMode)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play className="size-4 text-primary" />
              {t("runConfirm.title")}
            </DialogTitle>
            <DialogDescription>
              {t("runConfirm.description")}
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t("runConfirm.loading")}
            </div>
          ) : estimateQuery.isError ? (
            <p className="py-6 text-center text-sm text-destructive">
              {t("runConfirm.estimateError")}
            </p>
          ) : (
            <div className="flex max-h-[min(60vh,520px)] flex-col gap-4 overflow-y-auto pr-1">
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  {tWorkflow("stepMode.executionModeTitle")}
                </span>
                <div className="grid grid-cols-2 gap-2 rounded-2xl border border-border p-1">
                  <button
                    type="button"
                    disabled={isStarting}
                    onClick={() => selectMode("auto")}
                    className={cn(
                      "rounded-xl px-3 py-2 text-left text-sm transition-colors",
                      executionMode === "auto"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted/60",
                    )}
                  >
                    <span className="block font-medium">
                      {tWorkflow("stepMode.auto")}
                    </span>
                    <span
                      className={cn(
                        "mt-0.5 block text-[11px]",
                        executionMode === "auto"
                          ? "text-primary-foreground/80"
                          : "text-muted-foreground",
                      )}
                    >
                      {tWorkflow("stepMode.autoHint")}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={isStarting}
                    onClick={() => selectMode("step")}
                    className={cn(
                      "rounded-xl px-3 py-2 text-left text-sm transition-colors",
                      executionMode === "step"
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted/60",
                    )}
                  >
                    <span className="block font-medium">
                      {tWorkflow("stepMode.step")}
                    </span>
                    <span
                      className={cn(
                        "mt-0.5 block text-[11px]",
                        executionMode === "step"
                          ? "text-primary-foreground/80"
                          : "text-muted-foreground",
                      )}
                    >
                      {tWorkflow("stepMode.stepHint")}
                    </span>
                  </button>
                </div>
              </div>

              {stepModeActive && reviewableNodes.length > 0 ? (
                <div className="flex flex-col gap-2 rounded-2xl border border-border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">
                        {tWorkflow("stepMode.reviewStepsTitle")}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {tWorkflow("stepMode.reviewStepsHint")}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        disabled={isStarting}
                        onClick={() => setSelectedReviewNodeIds(allReviewNodeIds)}
                      >
                        {tWorkflow("stepMode.selectAll")}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        disabled={isStarting}
                        onClick={() => setSelectedReviewNodeIds([])}
                      >
                        {tWorkflow("stepMode.clearAll")}
                      </Button>
                    </div>
                  </div>
                  <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                    {reviewableNodes.map((node) => {
                      const checked = selectedReviewNodeIds.includes(node.nodeId)
                      return (
                        <li key={node.nodeId}>
                          <label
                            className={cn(
                              "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/50",
                              isStarting && "pointer-events-none opacity-60",
                            )}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(value) =>
                                toggleReviewNode(node.nodeId, value === true)
                              }
                              disabled={isStarting}
                            />
                            <span className="min-w-0 flex-1 truncate">
                              {node.label}
                            </span>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                  <p className="text-xs text-muted-foreground">
                    {tWorkflow("stepMode.reviewStepCount", {
                      selected: selectedReviewNodeIds.length,
                      total: reviewableNodes.length,
                    })}
                  </p>
                  {noStepsSelected ? (
                    <p className="text-xs text-destructive">
                      {tWorkflow("stepMode.noStepsSelected")}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-border bg-muted/30 p-3">
                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Coins className="size-3.5" />
                    {t("runConfirm.estimatedCost")}
                  </span>
                  <span className="mt-1 block font-heading text-xl font-semibold tabular-nums">
                    {formatCredits(totalCredits)}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {t("runConfirm.credits")}
                  </span>
                </div>
                <div className="rounded-2xl border border-border bg-muted/30 p-3">
                  <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Wallet className="size-3.5" />
                    {t("runConfirm.currentBalance")}
                  </span>
                  <span className="mt-1 block font-heading text-xl font-semibold tabular-nums">
                    {formatCredits(creditsRemaining)}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {t("runConfirm.credits")}
                  </span>
                </div>
              </div>

              {totalCredits === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("runConfirm.noBillableNodes")}
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    {t("runConfirm.breakdownTitle")}
                  </span>
                  <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border">
                    {estimate?.breakdown.map((item) => (
                      <li
                        key={item.nodeType}
                        className="flex items-center justify-between px-3 py-2 text-sm"
                      >
                        <span>
                          {t(`nodeType.${item.nodeType}`, {
                            defaultValue: item.nodeType,
                          })}
                          {item.count > 1 && (
                            <span className="ml-1 text-muted-foreground">
                              ×{item.count}
                            </span>
                          )}
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          {formatCredits(item.creditsTotal)}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center justify-between px-1 text-sm">
                    <span className="text-muted-foreground">
                      {t("runConfirm.balanceAfter")}
                    </span>
                    <span
                      className={cn(
                        "font-medium tabular-nums",
                        balanceAfter < 0 && "text-destructive",
                      )}
                    >
                      {formatCredits(balanceAfter)}
                    </span>
                  </div>
                </div>
              )}

              {showFreshnessWarning && (
                <div className="flex flex-col gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="size-4" />
                    {tWorkflow("freshness.warningTitle")}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {tWorkflow("freshness.warning")}
                  </p>
                </div>
              )}

              {!sufficient && totalCredits > 0 && (
                <div className="flex flex-col gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-3">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-destructive">
                    <AlertTriangle className="size-4" />
                    {t("runConfirm.insufficientTitle")}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {t("runConfirm.insufficientDescription", {
                      required: formatCredits(totalCredits),
                      remaining: formatCredits(creditsRemaining),
                    })}
                  </p>
                  <Button
                    size="sm"
                    className="self-start"
                    onClick={() => setTopupOpen(true)}
                  >
                    {t("runConfirm.refill")}
                  </Button>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isStarting}
            >
              {t("runConfirm.cancel")}
            </Button>
            <Button onClick={handleConfirm} disabled={confirmDisabled}>
              {isStarting && <Loader2 className="size-4 animate-spin" />}
              {isStarting
                ? t("runConfirm.starting")
                : t("runConfirm.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TopupDialog
        open={topupOpen}
        onOpenChange={setTopupOpen}
        onToppedUp={() => {
          void estimateQuery.refetch()
        }}
      />
    </>
  )
}
