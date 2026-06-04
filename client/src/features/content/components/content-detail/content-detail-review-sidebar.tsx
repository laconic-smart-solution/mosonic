import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { OutputKey } from "@/features/content/data/content-review-helpers"
import { workflowLabelForUser } from "@/features/content/lib/content-display"
import { cn } from "@/lib/utils"
import type { ContentDetail } from "@/shared/types/content.type"
import type { WorkflowNode } from "@/shared/types/workflow.type"
import type { CardRunState } from "./content-detail-review-ui"

type Props = {
  data: ContentDetail
  workflowName: string | undefined
  sortedWorkflowNodes: WorkflowNode[]
  editedOutputs: Partial<Record<OutputKey, string | undefined>>
  runByKey: Partial<Record<OutputKey, CardRunState>>
  approveDisabled: boolean
  approveLoading: boolean
  uploadNavLoading: boolean
  saveLoading: boolean
  globalRerunning: boolean
  hasUnsavedChanges: boolean
  onApproveClick: () => void
  onRejectClick: () => void
  onContinueToUpload: () => void
  onSave: () => void
  /** Hide “Continue to upload” when already on the upload workspace */
  hideContinueToUpload?: boolean
  /** Hide workflow/updated block (shown elsewhere, e.g. upload left rail) */
  omitContentInfo?: boolean
  /** Hide save button (shown elsewhere, e.g. next to generated outputs on upload) */
  omitSaveButton?: boolean
  className?: string
}

export function ContentDetailReviewSidebar({
  data,
  workflowName,
  sortedWorkflowNodes: _sortedWorkflowNodes,
  editedOutputs: _editedOutputs,
  runByKey: _runByKey,
  approveDisabled,
  approveLoading,
  uploadNavLoading,
  saveLoading,
  globalRerunning,
  hasUnsavedChanges,
  onApproveClick,
  onRejectClick,
  onContinueToUpload,
  onSave,
  hideContinueToUpload = false,
  omitContentInfo = false,
  omitSaveButton = false,
  className,
}: Props) {
  const { t } = useTranslation("content")
  const wfLabel = workflowLabelForUser(workflowName)

  return (
    <aside
      className={cn(
        "flex max-h-[min(100%,520px)] w-full shrink-0 flex-col gap-0 overflow-y-auto border-t border-border bg-card lg:max-h-none lg:w-[320px] lg:border-t-0 lg:border-l",
        className,
      )}
    >
      <div className="border-b border-border px-5 py-4">
        <p className="mb-3 text-[10px] font-semibold tracking-widest text-[#A89D8E] uppercase">
          {t("sidebar.reviewDecision")}
        </p>
        <div className="mb-3 rounded-xl border border-border bg-[color:var(--nt-canvas)] px-4 py-3">
          <p className="text-[11px] text-[#A89D8E]">{t("sidebar.currentStatus")}</p>
          <p className="text-sm font-semibold text-foreground">
            {data.status === "draft"
              ? t("sidebar.statusDraft")
              : data.status === "in_review"
                ? t("sidebar.statusInReview")
                : data.status === "approved"
                  ? t("sidebar.statusApproved")
                  : t("sidebar.statusRejected")}
          </p>
        </div>
        {(data.approval?.steps?.length ?? 0) > 0 ? (
          <div className="mb-3 space-y-2 rounded-xl border border-border bg-card px-3 py-3">
            <p className="text-[10px] font-semibold tracking-widest text-[#A89D8E] uppercase">
              {t("sidebar.approvalSteps")}
            </p>
            {data.approval!.steps.map((step, index) => {
              const done = data.approval!.records.some(
                (r) => r.stepIndex === index,
              )
              const nextIndex = data.approval!.records.length
              const isNext = !done && index === nextIndex
              return (
                <div
                  key={`${step.role}-${index}`}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <span className="capitalize text-muted-foreground">
                    {step.role.replace(/_/g, " ")}
                    {step.required ? "" : ` ${t("sidebar.optional")}`}
                  </span>
                  <span
                    className={
                      done
                        ? "font-medium text-emerald-700"
                        : isNext
                          ? "font-medium text-amber-700"
                          : "text-[#A89D8E]"
                    }
                  >
                    {done
                      ? t("sidebar.stepApproved")
                      : isNext
                        ? t("sidebar.stepPending")
                        : t("sidebar.stepWaiting")}
                  </span>
                </div>
              )
            })}
          </div>
        ) : null}
        {data.status === "approved" ? (
          hideContinueToUpload ? (
            <p className="mb-2 rounded-lg border border-border bg-[color:var(--nt-canvas)] px-3 py-2 text-xs leading-snug text-muted-foreground">
              {t("sidebar.approvedHint")}
            </p>
          ) : (
            <Button
              type="button"
              className="mb-2 h-10 w-full rounded-[10px] bg-[#00C9A7] text-sm font-semibold text-white hover:bg-[#00A589]"
              disabled={uploadNavLoading}
              onClick={() => void onContinueToUpload()}
            >
              {uploadNavLoading ? t("sidebar.opening") : t("sidebar.continueToUpload")}
            </Button>
          )
        ) : (
          <>
            {approveDisabled ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span className="mb-2 inline-flex w-full">
                      <Button
                        type="button"
                        className="pointer-events-none h-10 w-full rounded-[10px] bg-[#00C9A7] text-sm font-semibold text-white opacity-50"
                        disabled
                      >
                        {approveLoading
                          ? t("sidebar.approving")
                          : (data.approval?.steps?.length ?? 0) > 0
                            ? t("sidebar.approveStep")
                            : t("sidebar.approveSend")}
                      </Button>
                    </span>
                  }
                />
                <TooltipContent>{t("sidebar.saveFirst")}</TooltipContent>
              </Tooltip>
            ) : (
              <Button
                type="button"
                className="mb-2 h-10 w-full rounded-[10px] bg-[#00C9A7] text-sm font-semibold text-white hover:bg-[#00A589]"
                disabled={approveLoading}
                onClick={onApproveClick}
              >
                {approveLoading ? t("sidebar.approving") : t("sidebar.approveSend")}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              className="relative mb-3 h-[38px] w-full rounded-[10px] border border-red-200/80 bg-transparent text-sm text-red-600 hover:bg-red-50"
              onClick={onRejectClick}
            >
              {t("sidebar.rejectDraft")}
            </Button>
          </>
        )}
        {omitSaveButton ? null : (
          <Button
            type="button"
            variant="outline"
            className="relative h-9 w-full border-border text-muted-foreground hover:bg-muted"
            disabled={saveLoading || globalRerunning}
            onClick={() => void onSave()}
          >
            {saveLoading ? t("sidebar.saving") : t("sidebar.saveChanges")}
            {hasUnsavedChanges ? (
              <span
                className="absolute top-1 right-2 size-2 rounded-full bg-amber-500"
                aria-hidden
              />
            ) : null}
          </Button>
        )}
      </div>

      {omitContentInfo ? null : (
        <div className="border-b border-border px-5 py-4">
          <p className="mb-3 text-[10px] font-semibold tracking-widest text-[#A89D8E] uppercase">
            {t("sidebar.contentInfo")}
          </p>
          <div className="space-y-2.5 text-[13px]">
            <div>
              <p className="mb-0.5 text-[11px] text-[#A89D8E]">{t("sidebar.workflow")}</p>
              <p className="text-muted-foreground">{wfLabel}</p>
            </div>
            <div>
              <p className="mb-0.5 text-[11px] text-[#A89D8E]">{t("sidebar.updated")}</p>
              <p className="text-[12px] text-muted-foreground">
                {new Date(data.updatedAt).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
