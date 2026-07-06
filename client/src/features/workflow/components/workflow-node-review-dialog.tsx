import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { AlertTriangle } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { TopupDialog } from "@/features/credit/components/topup-dialog"
import { useReviewRegenerateEstimateQuery } from "@/shared/queries/pipeline.query"
import type { NodeReviewPayload } from "@/shared/types/pipeline.type"

import { WorkflowNodeReviewCard } from "./workflow-node-review-card"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  pipelineId?: string
  pipelineNodeId?: string
  nodeLabel?: string
  nodeType: string
  reviewText?: string
  previewImage?: string
  previewVideo?: string
  isSubmitting?: boolean
  onReview: (payload: NodeReviewPayload) => void
  onInsufficientCredits?: () => void
  refillRequestNonce?: number
}

function formatCredits(value: number): string {
  return Math.max(0, Math.round(value)).toLocaleString()
}

export function WorkflowNodeReviewDialog({
  open,
  onOpenChange,
  pipelineId,
  pipelineNodeId,
  nodeLabel,
  nodeType,
  reviewText,
  previewImage,
  previewVideo,
  isSubmitting = false,
  onReview,
  onInsufficientCredits,
  refillRequestNonce = 0,
}: Props) {
  const { t } = useTranslation("workflow")
  const { t: tCredit } = useTranslation("credit")
  const [topupOpen, setTopupOpen] = useState(false)

  useEffect(() => {
    if (refillRequestNonce > 0) {
      setTopupOpen(true)
    }
  }, [refillRequestNonce])

  const estimateQuery = useReviewRegenerateEstimateQuery(
    pipelineId,
    pipelineNodeId,
    open,
  )

  const creditsRequired = estimateQuery.data?.creditsRequired ?? 0
  const creditsRemaining = estimateQuery.data?.creditsRemaining ?? 0
  const regenerateSufficient = estimateQuery.data?.sufficient ?? true
  const estimateLoading =
    estimateQuery.isLoading || estimateQuery.isFetching

  function openRefill() {
    setTopupOpen(true)
    onInsufficientCredits?.()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[min(90vh,720px)] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
          <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
            <DialogTitle>{t("stepMode.reviewDialogTitle")}</DialogTitle>
            <DialogDescription>
              {nodeLabel
                ? t("stepMode.reviewDialogDescription", { node: nodeLabel })
                : t("stepMode.reviewTitle")}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {!regenerateSufficient && creditsRequired > 0 ? (
              <div className="mb-4 flex flex-col gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-3">
                <span className="flex items-center gap-1.5 text-sm font-medium text-destructive">
                  <AlertTriangle className="size-4" />
                  {tCredit("runConfirm.insufficientTitle")}
                </span>
                <p className="text-xs text-muted-foreground">
                  {tCredit("runConfirm.insufficientDescription", {
                    required: formatCredits(creditsRequired),
                    remaining: formatCredits(creditsRemaining),
                  })}
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="self-start"
                  onClick={openRefill}
                >
                  {tCredit("runConfirm.refill")}
                </Button>
              </div>
            ) : null}

            <WorkflowNodeReviewCard
              nodeType={nodeType}
              reviewText={reviewText}
              previewImage={previewImage}
              previewVideo={previewVideo}
              isSubmitting={isSubmitting}
              onReview={onReview}
              variant="dialog"
              regenerateCredits={creditsRequired}
              regenerateCreditsLoading={estimateLoading}
              regenerateDisabled={
                estimateQuery.isError ||
                (!regenerateSufficient && creditsRequired > 0)
              }
              onRegenerateInsufficient={openRefill}
            />
          </div>
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
