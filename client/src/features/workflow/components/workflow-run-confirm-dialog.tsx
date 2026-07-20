import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { AlertTriangle, Coins, Loader2, Play, Wallet } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
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
  onConfirm: (executionMode: PipelineUserExecutionMode) => void
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
  const estimateQuery = usePipelineEstimateQuery(workflowId, ruleId, open)

  useEffect(() => {
    if (open) {
      setExecutionMode(readStoredPipelineExecutionMode())
    }
  }, [open])

  const estimate = estimateQuery.data
  const loading = estimateQuery.isLoading || estimateQuery.isFetching
  const totalCredits = estimate?.totalCredits ?? 0
  const creditsRemaining = estimate?.creditsRemaining ?? 0
  const sufficient = estimate?.sufficient ?? false
  const balanceAfter = creditsRemaining - totalCredits
  const confirmDisabled =
    isStarting ||
    loading ||
    estimateQuery.isError ||
    !estimate ||
    !sufficient

  function selectMode(mode: PipelineUserExecutionMode) {
    setExecutionMode(mode)
    writeStoredPipelineExecutionMode(mode)
  }

  function handleConfirm() {
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
