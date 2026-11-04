import { useState } from "react"
import { useTranslation } from "react-i18next"
import { TriangleAlert } from "lucide-react"

import { useChatActions } from "../hooks/use-chat-actions"
import type { ToolErrorInfo } from "../lib/parse-tool-error"
import { ChatToolErrorDialog } from "./dialogs/chat-tool-error-dialog"

/** Amber "A step didn't finish" line under the latest reply; opens dialog 10 for retry / skip. */
export function ChatToolErrorNotice({ error }: { error: ToolErrorInfo }) {
  const { t } = useTranslation("chat")
  const chatActions = useChatActions()
  const [open, setOpen] = useState(false)
  const busy = !chatActions || chatActions.busy

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-[14px] border border-amber-400 bg-amber-50 dark:bg-amber-400/10 px-3 py-2 text-left text-xs text-amber-800 dark:text-amber-300"
      >
        <TriangleAlert className="size-3.5 shrink-0 text-amber-500" aria-hidden />
        <span className="flex-1">{t("dialogs.toolError.title")}</span>
        <span className="font-medium underline-offset-2 hover:underline">{t("dialogs.toolError.details")}</span>
      </button>
      <ChatToolErrorDialog
        open={open}
        onOpenChange={setOpen}
        error={error}
        disabled={busy}
        onRetry={() => chatActions?.sendMessage(t("dialogs.toolError.retryMessage", { tool: error.toolName }))}
        onSkip={() => chatActions?.sendMessage(t("dialogs.toolError.skipMessage", { tool: error.toolName }))}
      />
    </>
  )
}
