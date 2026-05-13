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
  const wfLabel = workflowLabelForUser(workflowName)

  return (
    <aside
      className={cn(
        "flex max-h-[min(100%,520px)] w-full shrink-0 flex-col gap-0 overflow-y-auto border-t border-[#EDE9E1] bg-card lg:max-h-none lg:w-[320px] lg:border-t-0 lg:border-l",
        className,
      )}
    >
      <div className="border-b border-[#EDE9E1] px-5 py-4">
        <p className="mb-3 text-[10px] font-semibold tracking-widest text-[#A89D8E] uppercase">
          Review decision
        </p>
        <div className="mb-3 rounded-xl border border-[#EDE9E1] bg-[color:var(--nt-canvas)] px-4 py-3">
          <p className="text-[11px] text-[#A89D8E]">Current status</p>
          <p className="text-sm font-semibold text-[#0F1F3D]">
            {data.status === "draft"
              ? "Draft — pending review"
              : data.status === "approved"
                ? "Approved — ready for upload"
                : "Rejected"}
          </p>
        </div>
        {data.status === "approved" ? (
          hideContinueToUpload ? (
            <p className="mb-2 rounded-lg border border-[#EDE9E1] bg-[color:var(--nt-canvas)] px-3 py-2 text-xs leading-snug text-[#857A6C]">
              Use the preview column to assign captions and publish.
            </p>
          ) : (
            <Button
              type="button"
              className="mb-2 h-10 w-full rounded-[10px] bg-[#00C9A7] text-sm font-semibold text-white hover:bg-[#00A589]"
              disabled={uploadNavLoading}
              onClick={() => void onContinueToUpload()}
            >
              {uploadNavLoading ? "Opening…" : "Continue to upload"}
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
                          ? "Approving…"
                          : "Approve & send to upload"}
                      </Button>
                    </span>
                  }
                />
                <TooltipContent>Save your changes first</TooltipContent>
              </Tooltip>
            ) : (
              <Button
                type="button"
                className="mb-2 h-10 w-full rounded-[10px] bg-[#00C9A7] text-sm font-semibold text-white hover:bg-[#00A589]"
                disabled={approveLoading}
                onClick={onApproveClick}
              >
                {approveLoading ? "Approving…" : "Approve & send to upload"}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              className="relative mb-3 h-[38px] w-full rounded-[10px] border border-red-200/80 bg-transparent text-sm text-red-600 hover:bg-red-50"
              onClick={onRejectClick}
            >
              Reject draft
            </Button>
          </>
        )}
        {omitSaveButton ? null : (
          <Button
            type="button"
            variant="outline"
            className="relative h-9 w-full border-[#EDE9E1] text-[#62594E] hover:bg-[#F7F4EF]"
            disabled={saveLoading || globalRerunning}
            onClick={() => void onSave()}
          >
            {saveLoading ? "Saving…" : "Save changes"}
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
        <div className="border-b border-[#EDE9E1] px-5 py-4">
          <p className="mb-3 text-[10px] font-semibold tracking-widest text-[#A89D8E] uppercase">
            Content info
          </p>
          <div className="space-y-2.5 text-[13px]">
            <div>
              <p className="mb-0.5 text-[11px] text-[#A89D8E]">Workflow</p>
              <p className="text-[#62594E]">{wfLabel}</p>
            </div>
            <div>
              <p className="mb-0.5 text-[11px] text-[#A89D8E]">Updated</p>
              <p className="text-[12px] text-[#857A6C]">
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
