import { useTranslation } from "react-i18next"
import { BrainCircuit } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { useRuleMemoriesQuery } from "@/shared/queries/rule-memory.query"
import type { RuleMemoryType } from "@/shared/services/rule-memory.service"
import {
  ChatDialogBody,
  ChatDialogFooter,
  ChatDialogHeading,
} from "./chat-dialog-shell"
import { CHAT_DIALOG_CONTENT_CLASS, chatDialogButton } from "../../lib/chat-dialog-styles"

const TYPE_TONE: Record<RuleMemoryType, string> = {
  preference: "bg-teal-50 text-teal-800 dark:bg-teal-400/10 dark:text-teal-200",
  correction: "bg-amber-50 text-amber-800 dark:bg-amber-400/10 dark:text-amber-200",
  fact: "bg-navy-50 text-navy-700 dark:bg-white/8 dark:text-navy-200",
}

/** Brand memory notes the chat agent saved for this rule. */
export function ChatMemoryDialog({
  open,
  onOpenChange,
  ruleId,
  brandName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  ruleId: string | null
  brandName: string
}) {
  const { t, i18n } = useTranslation("chat")
  const query = useRuleMemoriesQuery(ruleId, open)
  const memories = query.data ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(CHAT_DIALOG_CONTENT_CLASS, "sm:max-w-lg")}>
        <ChatDialogHeading
          icon={BrainCircuit}
          tone="navy"
          title={
            <DialogTitle className="text-[15px] font-semibold">
              {t("dialogs.memory.title", { name: brandName })}
            </DialogTitle>
          }
          subtitle={
            <DialogDescription className="text-xs">
              {t("dialogs.memory.subtitle")}
            </DialogDescription>
          }
        />
        <ChatDialogBody className="max-h-[min(60vh,28rem)] overflow-y-auto">
          {query.isLoading ? (
            <p className="text-sm text-muted-foreground">{t("dialogs.loading")}</p>
          ) : query.isError ? (
            <p className="rounded-[9px] bg-[#FDECEC] dark:bg-[#D64545]/12 px-3 py-2 text-xs text-[#D64545]">
              {t("dialogs.memory.loadFailed")}
            </p>
          ) : memories.length === 0 ? (
            <p className="rounded-[9px] bg-canvas-50 dark:bg-navy-800 px-3 py-4 text-center text-sm text-muted-foreground">
              {t("dialogs.memory.empty")}
            </p>
          ) : (
            <ul className="space-y-2">
              {memories.map((memory) => (
                <li
                  key={memory.ruleMemoryId}
                  className="rounded-xl border border-canvas-200 dark:border-white/8 bg-white dark:bg-navy-800/60 px-3 py-2.5"
                >
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize",
                        TYPE_TONE[memory.type] ?? TYPE_TONE.fact,
                      )}
                    >
                      {t(`dialogs.memory.type.${memory.type}`, {
                        defaultValue: memory.type,
                      })}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(memory.createdAt).toLocaleString(i18n.language)}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap text-navy-700 dark:text-[#E8EDF6]">
                    {memory.body}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </ChatDialogBody>
        <ChatDialogFooter>
          <Button
            type="button"
            variant="outline"
            className={chatDialogButton.secondary}
            onClick={() => onOpenChange(false)}
          >
            {t("dialogs.actions.close")}
          </Button>
        </ChatDialogFooter>
      </DialogContent>
    </Dialog>
  )
}
