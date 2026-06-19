import { useState } from "react"
import { useTranslation } from "react-i18next"
import { AlertTriangle, Coins, Loader2, Sparkles, Wallet } from "lucide-react"

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
import { useGenerationCreditCostsQuery } from "@/shared/queries/credit.query"
import { useUsageSummaryQuery } from "@/shared/queries/usage.query"
import { TopupDialog } from "@/features/credit/components/topup-dialog"

export type GenerationConfirmKind = "rule" | "workflow"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: GenerationConfirmKind
  onConfirm: () => void
  isSubmitting?: boolean
}

function formatCredits(value: number): string {
  return Math.max(0, Math.round(value)).toLocaleString()
}

export function GenerationCreditConfirmDialog({
  open,
  onOpenChange,
  kind,
  onConfirm,
  isSubmitting = false,
}: Props) {
  const { t } = useTranslation("credit")
  const [topupOpen, setTopupOpen] = useState(false)
  const costsQuery = useGenerationCreditCostsQuery(open)
  const summaryQuery = useUsageSummaryQuery()

  const loading =
    costsQuery.isLoading ||
    costsQuery.isFetching ||
    summaryQuery.isLoading ||
    summaryQuery.isFetching

  const totalCredits =
    kind === "rule"
      ? (costsQuery.data?.ruleGeneration ?? 0)
      : (costsQuery.data?.workflowGeneration ?? 0)
  const creditsRemaining = summaryQuery.data?.creditsRemaining ?? 0
  const sufficient = totalCredits <= 0 || creditsRemaining >= totalCredits
  const balanceAfter = creditsRemaining - totalCredits

  const confirmDisabled =
    isSubmitting ||
    loading ||
    costsQuery.isError ||
    summaryQuery.isError ||
    !sufficient

  const nodeTypeKey = kind === "rule" ? "rule_generation" : "workflow_generation"

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              {kind === "rule"
                ? t("generationConfirm.ruleTitle")
                : t("generationConfirm.workflowTitle")}
            </DialogTitle>
            <DialogDescription>
              {kind === "rule"
                ? t("generationConfirm.ruleDescription")
                : t("generationConfirm.workflowDescription")}
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t("generationConfirm.loading")}
            </div>
          ) : costsQuery.isError || summaryQuery.isError ? (
            <p className="py-6 text-center text-sm text-destructive">
              {t("runConfirm.estimateError")}
            </p>
          ) : (
            <div className="flex flex-col gap-4">
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

              {totalCredits > 0 ? (
                <div className="flex flex-col gap-2">
                  <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    {t("runConfirm.breakdownTitle")}
                  </span>
                  <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border">
                    <li className="flex items-center justify-between px-3 py-2 text-sm">
                      <span>
                        {t(`nodeType.${nodeTypeKey}`, {
                          defaultValue: nodeTypeKey,
                        })}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {formatCredits(totalCredits)}
                      </span>
                    </li>
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
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("generationConfirm.noCharge")}
                </p>
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
              disabled={isSubmitting}
            >
              {t("runConfirm.cancel")}
            </Button>
            <Button onClick={onConfirm} disabled={confirmDisabled}>
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              {isSubmitting
                ? t("generationConfirm.starting")
                : kind === "rule"
                  ? t("generationConfirm.confirmRule")
                  : t("generationConfirm.confirmWorkflow")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TopupDialog open={topupOpen} onOpenChange={setTopupOpen} />
    </>
  )
}
