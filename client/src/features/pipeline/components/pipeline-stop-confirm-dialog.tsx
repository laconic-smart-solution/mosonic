import { useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useCancelPipelineMutation } from "@/shared/queries/pipeline.query"

type Props = {
  pipelineId: string | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
  onStopped?: () => void
  onError?: (message: string) => void
}

export function PipelineStopConfirmDialog({
  pipelineId,
  open,
  onOpenChange,
  onStopped,
  onError,
}: Props) {
  const { t } = useTranslation("pipeline")
  const queryClient = useQueryClient()
  const cancelMutation = useCancelPipelineMutation()

  function handleConfirm() {
    if (!pipelineId) return
    cancelMutation.mutate(pipelineId, {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: ["pipeline"] })
        onOpenChange(false)
        onStopped?.()
      },
      onError: (err) => {
        const message =
          err instanceof Error ? err.message : t("stopDialog.error")
        onError?.(message)
      },
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("stopDialog.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("stopDialog.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={cancelMutation.isPending}>
            {t("stopDialog.keepRunning")}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={!pipelineId || cancelMutation.isPending}
            onClick={(e) => {
              e.preventDefault()
              handleConfirm()
            }}
          >
            {cancelMutation.isPending ? t("stopDialog.stopping") : t("stopDialog.stop")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
