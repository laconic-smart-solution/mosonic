import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQueryClient } from "@tanstack/react-query"
import { GitBranch, OctagonX, Play } from "lucide-react"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toastApiError } from "@/shared/lib/toast-error"
import { useActivePipelinesQuery, useCancelPipelineMutation } from "@/shared/queries/pipeline.query"
import { useWorkflowByRuleQuery } from "@/shared/queries/workflow.query"
import type { WorkflowCardSnapshot } from "../lib/parse-workflow-card"
import { ChatWorkflowCard } from "./chat-workflow-card"
import { useActiveRunProgress } from "../hooks/use-chat-run-progress"
import { liveRemainingMs, progressFraction, remainingLabel } from "../lib/chat-run-progress"
import { chatDialogButton } from "../lib/chat-dialog-styles"
import { ChatStartGenerationDialog } from "./dialogs/chat-start-generation-dialog"
import { ChatDialogBody, ChatDialogFooter, ChatDialogHeading } from "./dialogs/chat-dialog-shell"
import { CHAT_DIALOG_CONTENT_CLASS } from "../lib/chat-dialog-styles"

/** "Cancel run" link + AlertDialog confirm, wired to POST /pipeline/:id/cancel for every active run. */
function ChatCancelRunControl({ workflowId }: { workflowId: string }) {
  const { t } = useTranslation("chat")
  const queryClient = useQueryClient()
  const active = useActivePipelinesQuery(workflowId)
  const cancel = useCancelPipelineMutation()
  const [open, setOpen] = useState(false)
  const runs = active.data ?? []
  if (runs.length === 0) return null

  async function confirm() {
    try {
      for (const run of runs) {
        await cancel.mutateAsync(run.pipelineId)
      }
      setOpen(false)
    } catch (err) {
      toastApiError(err, "chat:toast.cancelRunFailed")
    } finally {
      void queryClient.invalidateQueries({ queryKey: ["pipeline"] })
    }
  }

  return (
    <>
      <button
        type="button"
        className="w-full text-center text-[11px] font-medium text-[#D64545] underline-offset-2 hover:underline disabled:opacity-50"
        disabled={cancel.isPending}
        onClick={() => setOpen(true)}
      >
        {t("workspace.cancelRun", { count: runs.length })}
      </button>
      <AlertDialog open={open} onOpenChange={(next) => !cancel.isPending && setOpen(next)}>
        <AlertDialogContent className={cn(CHAT_DIALOG_CONTENT_CLASS, "sm:max-w-md")}>
          <ChatDialogHeading
            icon={OctagonX}
            tone="red"
            title={
              <AlertDialogTitle className="text-[15px] font-semibold">
                {t("dialogs.cancelRun.title", { count: runs.length })}
              </AlertDialogTitle>
            }
            subtitle={
              <AlertDialogDescription className="text-xs">{t("dialogs.cancelRun.subtitle")}</AlertDialogDescription>
            }
          />
          <ChatDialogBody>
            <ul className="space-y-1 text-xs text-canvas-700 dark:text-navy-200">
              {runs.map((run) => (
                <li key={run.pipelineId} className="line-clamp-1">
                  {run.name || run.contentPrompt || run.pipelineId}
                </li>
              ))}
            </ul>
          </ChatDialogBody>
          <ChatDialogFooter>
            <AlertDialogCancel className={chatDialogButton.secondary} disabled={cancel.isPending}>
              {t("dialogs.actions.notYet")}
            </AlertDialogCancel>
            <Button className={chatDialogButton.destructive} disabled={cancel.isPending} onClick={() => void confirm()}>
              {t("dialogs.cancelRun.confirm")}
            </Button>
          </ChatDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/** Compact mirror of the thread's run card: current step, bar and time left. */
function ChatActiveRunStrip() {
  const { t } = useTranslation("chat")
  const entry = useActiveRunProgress()
  if (!entry) return null
  const { progress, receivedAt } = entry
  const current = progress.steps.find((s) => s.nodeId === progress.currentStep)
  const remaining = remainingLabel(liveRemainingMs(progress, receivedAt, Date.now()))
  const pct = Math.round(progressFraction(progress) * 100)
  return (
    <div className="space-y-1.5 rounded-[12px] border border-amber-400/60 bg-amber-50 px-3 py-2 dark:bg-amber-400/10">
      <div className="flex items-center gap-2 text-[12px] font-medium text-navy-900 dark:text-[#E8EDF6]">
        <span className="size-[7px] shrink-0 animate-pulse rounded-full bg-amber-400" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{current?.label ?? t("runCard.running")}</span>
        {remaining ? (
          <span className="shrink-0 text-[11px] font-normal text-canvas-600 dark:text-navy-200">
            {t(`runCard.left.${remaining.key}`, { count: remaining.count })}
          </span>
        ) : null}
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-canvas-200 dark:bg-white/8">
        <i className="block h-full rounded-full bg-amber-400 transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function ChatActiveWorkflowCard({ ruleId }: { ruleId: string }) {
  const { t } = useTranslation("chat")
  const query = useWorkflowByRuleQuery(ruleId)
  const [startOpen, setStartOpen] = useState(false)

  if (query.isLoading) {
    return <div className="h-20 w-full animate-pulse rounded-2xl bg-muted/50" aria-busy="true" />
  }

  const data = query.data
  if (!data) {
    return (
      <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-border px-3 py-6 text-center">
        <GitBranch className="size-5 text-muted-foreground" aria-hidden />
        <p className="text-xs text-muted-foreground">{t("workspace.noWorkflow")}</p>
      </div>
    )
  }

  const snapshot: WorkflowCardSnapshot = {
    action: "show_workflow",
    workflowId: data.workflow.workflowId,
    ruleId: data.workflow.ruleRef || ruleId,
    status: data.workflow.status,
    name: data.workflow.name,
    nodes: data.nodes.map((node) => ({
      nodeId: node.nodeId,
      type: node.type,
      order: node.order,
      lane: node.lane?.trim() ? node.lane : null,
      isLocked: node.isLocked,
    })),
  }

  return (
    <div className="min-h-56 space-y-2 [&>*:first-child]:min-h-48">
      <ChatWorkflowCard snapshot={snapshot} />
      {snapshot.status === "ready" && snapshot.nodes.length > 0 ? (
        <Button size="sm" className={`w-full ${chatDialogButton.positive}`} onClick={() => setStartOpen(true)}>
          <Play data-icon="inline-start" />
          {t("dialogs.actions.startGeneration")}
        </Button>
      ) : null}
      <ChatActiveRunStrip />
      <ChatCancelRunControl workflowId={snapshot.workflowId} />
      <ChatStartGenerationDialog
        open={startOpen}
        onOpenChange={setStartOpen}
        workflowId={snapshot.workflowId}
        workflowName={snapshot.name || t("workflowCard.untitled")}
        ruleId={snapshot.ruleId}
        stepCount={snapshot.nodes.length}
      />
    </div>
  )
}
