import { useTranslation } from "react-i18next"
import { TriangleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { ToolErrorInfo } from "../../lib/parse-tool-error"
import {
  ChatDialogFooter,
  ChatDialogHeading,
} from "./chat-dialog-shell"
import { CHAT_DIALOG_CONTENT_CLASS, chatDialogButton } from "../../lib/chat-dialog-styles"

/** 10 · Tool error recovery — retry/skip are sent back to the AI as chat messages. */
export function ChatToolErrorDialog({
  open,
  onOpenChange,
  error,
  disabled,
  onRetry,
  onSkip,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  error: ToolErrorInfo
  disabled?: boolean
  onRetry: () => void
  onSkip: () => void
}) {
  const { t } = useTranslation("chat")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(CHAT_DIALOG_CONTENT_CLASS, "sm:max-w-md")}>
        <ChatDialogHeading
          icon={TriangleAlert}
          tone="amber"
          title={<DialogTitle className="text-[15px] font-semibold">{t("dialogs.toolError.title")}</DialogTitle>}
          subtitle={
            <DialogDescription className="text-xs">
              {t(`dialogs.toolError.code.${error.code}`, {
                defaultValue: t("dialogs.toolError.code.tool_failed"),
              })}
            </DialogDescription>
          }
        />
        <ChatDialogFooter>
          <Button
            variant="outline"
            className={chatDialogButton.secondary}
            disabled={disabled}
            onClick={() => {
              onSkip()
              onOpenChange(false)
            }}
          >
            {t("dialogs.toolError.skip")}
          </Button>
          <Button
            className={chatDialogButton.primary}
            disabled={disabled}
            onClick={() => {
              onRetry()
              onOpenChange(false)
            }}
          >
            {t("dialogs.toolError.retry")}
          </Button>
        </ChatDialogFooter>
      </DialogContent>
    </Dialog>
  )
}
