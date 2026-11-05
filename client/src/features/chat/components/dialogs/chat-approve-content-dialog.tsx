import { useTranslation } from "react-i18next"
import { CircleAlert } from "lucide-react"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useApproveChatContentMutation } from "../../hooks/use-chat-content-actions"
import {
  ChatDialogBody,
  ChatDialogFooter,
  ChatDialogHeading,
} from "./chat-dialog-shell"
import { CHAT_DIALOG_CONTENT_CLASS, chatDialogButton } from "../../lib/chat-dialog-styles"

/** 02 · Approve — AlertDialog confirming approval (calls POST /contents/:id/approve). */
export function ChatApproveContentDialog({
  open,
  onOpenChange,
  contentId,
  preview,
  onApproved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  contentId: string
  preview?: string
  onApproved?: () => void
}) {
  const { t } = useTranslation("chat")
  const approve = useApproveChatContentMutation()

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className={cn(CHAT_DIALOG_CONTENT_CLASS, "sm:max-w-md")}>
        <ChatDialogHeading
          icon={CircleAlert}
          tone="amber"
          title={<AlertDialogTitle className="text-[15px] font-semibold">{t("dialogs.approve.title")}</AlertDialogTitle>}
          subtitle={<AlertDialogDescription className="text-xs">{t("dialogs.approve.subtitle")}</AlertDialogDescription>}
        />
        {preview ? (
          <ChatDialogBody>
            <p className="line-clamp-3 rounded-xl border border-canvas-200 dark:border-white/8 px-3 py-2.5 text-xs">{preview}</p>
            {/* TODO: "Publish on schedule" toggle — no scheduling field on the approve endpoint yet. */}
          </ChatDialogBody>
        ) : null}
        <ChatDialogFooter>
          <AlertDialogCancel className={chatDialogButton.secondary}>{t("dialogs.actions.notYet")}</AlertDialogCancel>
          <Button
            className={chatDialogButton.positive}
            disabled={approve.isPending}
            onClick={() =>
              approve.mutate(contentId, {
                onSuccess: () => {
                  onOpenChange(false)
                  onApproved?.()
                },
              })
            }
          >
            {t("dialogs.actions.approve")}
          </Button>
        </ChatDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
