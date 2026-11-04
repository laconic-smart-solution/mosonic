import { useState } from "react"
import { useTranslation } from "react-i18next"
import { AlertTriangle, Play } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { toastApiError } from "@/shared/lib/toast-error"
import { usePipelineEstimateQuery, useStartPipelineMutation } from "@/shared/queries/pipeline.query"
import {
  ChatDialogBody,
  ChatDialogFooter,
  ChatDialogHeading,
} from "./chat-dialog-shell"
import { CHAT_DIALOG_CONTENT_CLASS, chatDialogButton } from "../../lib/chat-dialog-styles"

/** 06 · Start generation — estimate via POST /pipeline/estimate, start via useStartPipelineMutation. */
export function ChatStartGenerationDialog({
  open,
  onOpenChange,
  workflowId,
  workflowName,
  ruleId,
  stepCount,
  hasRunningRun,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  workflowId: string
  workflowName: string
  ruleId: string
  stepCount: number
  hasRunningRun?: boolean
}) {
  const { t } = useTranslation("chat")
  const [prompt, setPrompt] = useState("")
  const estimate = usePipelineEstimateQuery(workflowId, ruleId, open)
  const start = useStartPipelineMutation()
  const data = estimate.data

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(CHAT_DIALOG_CONTENT_CLASS, "sm:max-w-md")}>
        <ChatDialogHeading
          icon={Play}
          tone="teal"
          title={
            <DialogTitle className="text-[15px] font-semibold">
              {t("dialogs.startGeneration.title", { name: workflowName })}
            </DialogTitle>
          }
          subtitle={
            <DialogDescription className="text-xs">
              {t("dialogs.startGeneration.steps", { count: stepCount })}
            </DialogDescription>
          }
        />
        <ChatDialogBody>
          <Textarea
            value={prompt}
            rows={2}
            placeholder={t("dialogs.startGeneration.promptPlaceholder")}
            onChange={(e) => setPrompt(e.target.value)}
            className="rounded-[9px] border-canvas-300 dark:border-white/14"
          />
          <div className="flex items-center justify-between border-t border-canvas-200 dark:border-white/8 pt-2.5 text-sm font-semibold">
            <span>{t("dialogs.startGeneration.estimated")}</span>
            <span>
              {estimate.isLoading
                ? "…"
                : t("dialogs.startGeneration.credits", { count: Math.round(data?.totalCredits ?? 0) })}
            </span>
          </div>
          {data && !data.sufficient ? (
            <p className="text-xs text-[#D64545]">{t("dialogs.startGeneration.insufficient")}</p>
          ) : null}
          {hasRunningRun ? (
            <div className="flex gap-2 rounded-xl border border-amber-400 bg-amber-50 dark:bg-amber-400/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="size-4 shrink-0" aria-hidden />
              {t("dialogs.startGeneration.queued")}
            </div>
          ) : null}
        </ChatDialogBody>
        <ChatDialogFooter>
          <DialogClose render={<Button variant="outline" className={chatDialogButton.secondary} />}>
            {t("dialogs.actions.cancel")}
          </DialogClose>
          <Button
            className={chatDialogButton.positive}
            disabled={start.isPending || !prompt.trim() || (data ? !data.sufficient : true)}
            onClick={() =>
              start.mutate(
                { workflowId, ruleId, contentPrompt: prompt.trim() },
                {
                  onSuccess: () => onOpenChange(false),
                  onError: (err) => toastApiError(err, "pipeline:errors.startFailed"),
                },
              )
            }
          >
            {t("dialogs.actions.start")}
          </Button>
        </ChatDialogFooter>
      </DialogContent>
    </Dialog>
  )
}
