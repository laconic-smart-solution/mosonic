import { useState } from "react"
import { useTranslation } from "react-i18next"
import { PencilLine } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { useGetContentQuery } from "@/shared/queries/content.query"
import { useSaveChatContentMutation } from "../../hooks/use-chat-content-actions"
import {
  ChatDialogBody,
  ChatDialogFooter,
  ChatDialogHeading,
} from "./chat-dialog-shell"
import { CHAT_DIALOG_CONTENT_CLASS, chatDialogButton } from "../../lib/chat-dialog-styles"

const MAX = 2000

/** 03 · Edit content — saves the caption via POST /contents/:id/save (userEdits.text). */
export function ChatEditContentDialog({
  open,
  onOpenChange,
  contentId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  contentId: string
}) {
  const { t } = useTranslation("chat")
  const query = useGetContentQuery(open ? contentId : undefined)
  const save = useSaveChatContentMutation()
  // null = untouched → show the saved caption; reset on close so reopening shows fresh data.
  const [edited, setEdited] = useState<string | null>(null)
  const text = edited ?? query.data?.outputs?.text ?? ""
  const setText = setEdited
  function handleOpenChange(next: boolean) {
    if (!next) setEdited(null)
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={cn(CHAT_DIALOG_CONTENT_CLASS, "sm:max-w-md")}>
        <ChatDialogHeading
          icon={PencilLine}
          tone="navy"
          title={<DialogTitle className="text-[15px] font-semibold">{t("dialogs.editContent.title")}</DialogTitle>}
          subtitle={<DialogDescription className="text-xs">{t("contentCard.title")}</DialogDescription>}
        />
        <ChatDialogBody>
          <label className="block space-y-1">
            <span className="text-[11px] font-semibold text-canvas-700 dark:text-navy-200">{t("dialogs.checkContent.caption")}</span>
            <Textarea
              value={text}
              maxLength={MAX}
              rows={6}
              onChange={(e) => setText(e.target.value)}
              className="rounded-[9px] border-canvas-300 dark:border-white/14 focus-visible:border-teal-400"
            />
          </label>
          <div className="flex justify-between text-[11px] text-canvas-600 dark:text-navy-200">
            <span>{t("dialogs.editContent.hint")}</span>
            <span>
              {text.length} / {MAX}
            </span>
          </div>
        </ChatDialogBody>
        <ChatDialogFooter>
          <DialogClose render={<Button variant="outline" className={chatDialogButton.secondary} />}>
            {t("dialogs.actions.cancel")}
          </DialogClose>
          <Button
            className={chatDialogButton.primary}
            disabled={save.isPending || !text.trim() || query.isLoading}
            onClick={() =>
              save.mutate(
                { contentId, body: { userEdits: { text } } },
                { onSuccess: () => handleOpenChange(false) },
              )
            }
          >
            {t("dialogs.actions.saveChanges")}
          </Button>
        </ChatDialogFooter>
      </DialogContent>
    </Dialog>
  )
}
