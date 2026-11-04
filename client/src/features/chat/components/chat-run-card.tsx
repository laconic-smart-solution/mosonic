import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useQueryClient } from "@tanstack/react-query"
import { Check, ChevronDown, OctagonX, TriangleAlert } from "lucide-react"

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
import { useCancelPipelineMutation } from "@/shared/queries/pipeline.query"
import { pipelineService } from "@/shared/services/pipeline.service"
import type { ChatRunProgress, ChatRunStep } from "@/shared/services/chat.service"
import { useChatActions } from "../hooks/use-chat-actions"
import { useChatRunProgress } from "../hooks/use-chat-run-progress"
import { CHAT_DIALOG_CONTENT_CLASS, chatDialogButton } from "../lib/chat-dialog-styles"
import {
  liveRemainingMs,
  progressFraction,
  remainingLabel,
  runDurationSeconds,
} from "../lib/chat-run-progress"
import { ChatDialogBody, ChatDialogFooter, ChatDialogHeading } from "./dialogs/chat-dialog-shell"

const CARD = "w-full min-w-0 overflow-hidden rounded-[14px] border border-canvas-200 bg-white dark:border-white/8 dark:bg-navy-700"
const HEADER = "flex min-w-0 items-center gap-2.5 border-b border-canvas-200 bg-[#FBF9F6] px-3.5 py-3 dark:border-white/8 dark:bg-[#0B1730]"

function StepDot({ status }: { status: ChatRunStep["status"] }) {
  if (status === "done" || status === "skipped") {
    return (
      <span className={cn("grid size-[18px] shrink-0 place-items-center rounded-full text-white", status === "done" ? "bg-teal-400" : "bg-canvas-400 dark:bg-navy-200/40")}>
        <Check className="size-3" strokeWidth={3} aria-hidden />
      </span>
    )
  }
  if (status === "failed") {
    return (
      <span className="grid size-[18px] shrink-0 place-items-center rounded-full bg-[#D64545] text-[11px] font-bold text-white" aria-hidden>
        !
      </span>
    )
  }
  if (status === "running") {
    return (
      <span className="relative grid size-[18px] shrink-0 place-items-center rounded-full border-[1.5px] border-amber-400 shadow-[0_0_0_4px_var(--color-amber-50)] dark:shadow-[0_0_0_4px_rgba(245,166,35,0.15)]" aria-hidden>
        <span className="size-[7px] animate-pulse rounded-full bg-amber-400" />
      </span>
    )
  }
  return <span className="size-[18px] shrink-0 rounded-full border-[1.5px] border-canvas-300 dark:border-white/14" aria-hidden />
}

function StepRow({ step, trailing, failed }: { step: ChatRunStep; trailing?: string | null; failed?: boolean }) {
  const current = step.status === "running" || step.status === "failed"
  return (
    <li
      className={cn(
        "flex items-center gap-2.5 px-3.5 py-2 text-[13px] text-canvas-700 dark:text-navy-200",
        current && "font-medium text-navy-900 dark:text-[#E8EDF6]",
        failed && "text-[#D64545] dark:text-[#D64545]",
      )}
    >
      <StepDot status={step.status} />
      <span className="min-w-0 flex-1 truncate">{step.label}</span>
      {trailing ? <span className="ml-auto text-xs font-normal text-canvas-600 dark:text-navy-200">{trailing}</span> : null}
    </li>
  )
}

function CancelRunDialog({
  open,
  onOpenChange,
  pending,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  pending: boolean
  onConfirm: () => void
}) {
  const { t } = useTranslation("chat")
  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialogContent className={cn(CHAT_DIALOG_CONTENT_CLASS, "sm:max-w-md")}>
        <ChatDialogHeading
          icon={OctagonX}
          tone="red"
          title={<AlertDialogTitle className="text-[15px] font-semibold">{t("dialogs.cancelRun.title", { count: 1 })}</AlertDialogTitle>}
          subtitle={<AlertDialogDescription className="text-xs">{t("dialogs.cancelRun.subtitle")}</AlertDialogDescription>}
        />
        <ChatDialogBody>{null}</ChatDialogBody>
        <ChatDialogFooter>
          <AlertDialogCancel className={chatDialogButton.secondary} disabled={pending}>
            {t("dialogs.actions.notYet")}
          </AlertDialogCancel>
          <Button className={chatDialogButton.destructive} disabled={pending} onClick={onConfirm}>
            {t("dialogs.cancelRun.confirm")}
          </Button>
        </ChatDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function RunningView({ progress, receivedAt }: { progress: ChatRunProgress; receivedAt: number }) {
  const { t } = useTranslation("chat")
  const queryClient = useQueryClient()
  const cancel = useCancelPipelineMutation()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const remaining = remainingLabel(liveRemainingMs(progress, receivedAt, Date.now()))
  const pct = Math.round(progressFraction(progress) * 100)

  async function confirmCancel() {
    try {
      await cancel.mutateAsync(progress.pipelineId)
      setConfirmOpen(false)
    } catch (err) {
      toastApiError(err, "chat:toast.cancelRunFailed")
    } finally {
      void queryClient.invalidateQueries({ queryKey: ["pipeline"] })
    }
  }

  return (
    <div className={CARD} data-testid="chat-run-card" data-status="running">
      <div className={HEADER}>
        <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-amber-100 border-t-amber-400 dark:border-amber-400/20 dark:border-t-amber-400" aria-hidden />
        <b className="min-w-0 flex-1 truncate text-[13.5px] text-navy-900 dark:text-[#E8EDF6]">{progress.name}</b>
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11.5px] font-semibold text-amber-600 dark:bg-amber-400/10 dark:text-amber-300">
          {t("runCard.running")}
        </span>
      </div>
      <ol aria-label={t("runCard.stepsLabel")}>
        {progress.steps.map((step) => (
          <StepRow
            key={step.nodeId}
            step={step}
            trailing={
              step.status === "done" && step.durationMs !== null
                ? t("runCard.seconds", { count: Math.max(1, Math.round(step.durationMs / 1000)) })
                : null
            }
          />
        ))}
      </ol>
      <div className="flex items-center gap-2.5 border-t border-canvas-200 px-3.5 py-2.5 dark:border-white/8">
        <div
          className="h-[5px] flex-1 overflow-hidden rounded-full bg-canvas-200 dark:bg-white/8"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <i className="block h-full rounded-full bg-amber-400 transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
        {remaining ? (
          <span className="text-xs text-canvas-600 dark:text-navy-200">{t(`runCard.left.${remaining.key}`, { count: remaining.count })}</span>
        ) : null}
        <button
          type="button"
          className="text-[12.5px] font-semibold text-[#D64545] underline-offset-2 hover:underline disabled:opacity-50"
          disabled={cancel.isPending}
          onClick={() => setConfirmOpen(true)}
        >
          {t("runCard.cancel")}
        </button>
      </div>
      <CancelRunDialog open={confirmOpen} onOpenChange={setConfirmOpen} pending={cancel.isPending} onConfirm={() => void confirmCancel()} />
    </div>
  )
}

function FinishedView({ progress }: { progress: ChatRunProgress }) {
  const { t } = useTranslation("chat")
  const [open, setOpen] = useState(false)
  const seconds = runDurationSeconds(progress)
  return (
    <div className={CARD} data-testid="chat-run-card" data-status="completed">
      <button
        type="button"
        className={cn(HEADER, "w-full text-left", !open && "border-b-0")}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <StepDot status="done" />
        <b className="min-w-0 flex-1 truncate text-[13.5px] text-navy-900 dark:text-[#E8EDF6]">{progress.name}</b>
        <span className="text-xs text-canvas-600 dark:text-navy-200">
          {seconds !== null ? t("runCard.finishedIn", { count: seconds }) : t("runCard.finished")}
        </span>
        <ChevronDown className={cn("size-4 text-canvas-600 transition-transform dark:text-navy-200", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <ol>
          {progress.steps.map((step) => (
            <StepRow
              key={step.nodeId}
              step={step}
              trailing={step.durationMs !== null ? t("runCard.seconds", { count: Math.max(1, Math.round(step.durationMs / 1000)) }) : null}
            />
          ))}
        </ol>
      ) : null}
    </div>
  )
}

function FailedView({ progress }: { progress: ChatRunProgress }) {
  const { t } = useTranslation("chat")
  const chatActions = useChatActions()
  const [pending, setPending] = useState(false)
  const failedStep = progress.steps.find((s) => s.nodeId === progress.failedNodeId) ?? null
  // retry-node / skip-node only work on a paused queue run; a failed run is retried through the chat.
  const canResume = progress.status === "paused" && Boolean(progress.failedNodeId)
  const busy = pending || !chatActions || chatActions.busy

  async function nodeAction(kind: "retry" | "skip") {
    if (!progress.failedNodeId) return
    setPending(true)
    try {
      if (kind === "retry") await pipelineService.retryNode(progress.pipelineId, { nodeId: progress.failedNodeId })
      else await pipelineService.skipNode(progress.pipelineId, { nodeId: progress.failedNodeId })
    } catch (err) {
      toastApiError(err, "chat:toast.runActionFailed")
    } finally {
      setPending(false)
    }
  }

  function tryAgain() {
    if (canResume) void nodeAction("retry")
    else chatActions?.sendMessage(t("runCard.retryMessage", { step: failedStep?.label ?? progress.name }))
  }

  return (
    <div className={CARD} data-testid="chat-run-card" data-status="failed">
      <div className={cn(HEADER, "bg-[#FDECEC] dark:bg-[#D64545]/12")}>
        <span className="grid size-[18px] shrink-0 place-items-center rounded-full bg-[#D64545] text-[11px] font-bold text-white" aria-hidden>
          !
        </span>
        <b className="min-w-0 flex-1 truncate text-[13.5px] text-navy-900 dark:text-[#E8EDF6]">{progress.name}</b>
        <span className="rounded-full bg-white px-2 py-0.5 text-[11.5px] font-semibold text-[#D64545] dark:bg-navy-900">
          {progress.status === "paused" ? t("runCard.paused") : t("runCard.stopped")}
        </span>
      </div>
      <ol>
        {progress.steps.map((step) => (
          <StepRow
            key={step.nodeId}
            step={step.nodeId === progress.failedNodeId ? { ...step, status: "failed" } : step}
            failed={step.nodeId === progress.failedNodeId}
            trailing={step.nodeId === progress.failedNodeId ? t("runCard.failedHere") : null}
          />
        ))}
      </ol>
      <p className="flex gap-2 px-3.5 pt-1 pb-3 text-[13px] leading-relaxed text-canvas-700 dark:text-navy-200">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-[#D64545]" aria-hidden />
        <span>{progress.error?.trim() || t("runCard.genericError")}</span>
      </p>
      <div className="flex items-center justify-end gap-2 border-t border-canvas-200 px-3.5 py-2.5 dark:border-white/8">
        {canResume ? (
          <Button size="sm" variant="outline" className={chatDialogButton.secondary} disabled={busy} onClick={() => void nodeAction("skip")}>
            {t("runCard.skipStep")}
          </Button>
        ) : null}
        {/* TODO: "Skip that step" for a failed (not paused) run needs a server endpoint; only paused queue runs support skip-node today. */}
        <Button size="sm" className={chatDialogButton.primary} disabled={busy} onClick={tryAgain}>
          {t("runCard.tryAgain")}
        </Button>
      </div>
    </div>
  )
}

/** Live run card shown under the reply that started a generation run. */
export function ChatRunCard({
  sessionId,
  pipelineId,
  historical = false,
}: {
  sessionId: string
  pipelineId: string
  /** Older history: fetch the state once, no polling or countdown. */
  historical?: boolean
}) {
  const entry = useChatRunProgress(sessionId, pipelineId, { live: !historical })
  if (!entry) {
    return <div className="h-24 w-full animate-pulse rounded-[14px] bg-muted/50" aria-busy="true" />
  }
  const { progress, receivedAt } = entry
  if (historical && progress.status !== "failed") return <FinishedView progress={progress} />
  if (progress.status === "running") return <RunningView progress={progress} receivedAt={receivedAt} />
  if (progress.status === "completed") return <FinishedView progress={progress} />
  return <FailedView progress={progress} />
}
