import { useTranslation } from "react-i18next"
import { Trash2 } from "lucide-react"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  ChatDialogBody,
  ChatDialogFooter,
  ChatDialogHeading,
} from "./chat-dialog-shell"
import { CHAT_DIALOG_CONTENT_CLASS, chatDialogButton } from "../../lib/chat-dialog-styles"

/**
 * 09 · Clear conversation — wipes only this brand's message history.
 * TODO: no clear-messages endpoint exists (DELETE /chat/sessions/:id would drop the whole
 * session, which we must not do). `onConfirm` is owned by the caller; the confirm button stays
 * disabled until it is provided.
 */
export function ChatClearConversationDialog({
  open,
  onOpenChange,
  brandName,
  onConfirm,
  isPending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  brandName: string
  onConfirm?: () => void
  isPending?: boolean
}) {
  const { t } = useTranslation("chat")

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className={cn(CHAT_DIALOG_CONTENT_CLASS, "sm:max-w-md")}>
        <ChatDialogHeading
          icon={Trash2}
          tone="red"
          title={
            <AlertDialogTitle className="text-[15px] font-semibold">
              {t("dialogs.clearConversation.title", { name: brandName })}
            </AlertDialogTitle>
          }
          subtitle={<AlertDialogDescription className="text-xs">{t("dialogs.clearConversation.subtitle")}</AlertDialogDescription>}
        />
        <ChatDialogBody>
          <p className="rounded-[9px] bg-[#FDECEC] dark:bg-[#D64545]/12 px-3 py-2 text-xs text-[#D64545]">{t("dialogs.clearConversation.warning")}</p>
        </ChatDialogBody>
        <ChatDialogFooter>
          <AlertDialogCancel className={chatDialogButton.secondary}>{t("dialogs.actions.cancel")}</AlertDialogCancel>
          <Button
            className={chatDialogButton.destructive}
            disabled={!onConfirm || isPending}
            onClick={onConfirm}
          >
            {t("dialogs.clearConversation.confirm")}
          </Button>
        </ChatDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
