import { useState } from "react"
import { useTranslation } from "react-i18next"
import { CircleX } from "lucide-react"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { useRejectChatContentMutation } from "../../hooks/use-chat-content-actions"
import {
  ChatDialogBody,
  ChatDialogFooter,
  ChatDialogHeading,
} from "./chat-dialog-shell"
import { CHAT_DIALOG_CONTENT_CLASS, chatDialogButton } from "../../lib/chat-dialog-styles"

const REASONS = ["offBrand", "wrongProduct", "imageQuality", "factualError"] as const

/** 04 · Reject with reason — AlertDialog; calls POST /contents/:id/reject. */
export function ChatRejectContentDialog({
  open,
  onOpenChange,
  contentId,
  onRejected,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  contentId: string
  /** Receives the chosen reason so the caller can tell the AI (e.g. as a chat message). */
  onRejected?: (reason: { reasons: string[]; note: string; remember: boolean }) => void
}) {
  const { t } = useTranslation("chat")
  const reject = useRejectChatContentMutation()
  const [reasons, setReasons] = useState<string[]>([])
  const [note, setNote] = useState("")
  const [remember, setRemember] = useState(false)

  function toggle(key: string) {
    setReasons((prev) => (prev.includes(key) ? prev.filter((r) => r !== key) : [...prev, key]))
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className={cn(CHAT_DIALOG_CONTENT_CLASS, "sm:max-w-md")}>
        <ChatDialogHeading
          icon={CircleX}
          tone="red"
          title={<AlertDialogTitle className="text-[15px] font-semibold">{t("dialogs.reject.title")}</AlertDialogTitle>}
          subtitle={<AlertDialogDescription className="text-xs">{t("dialogs.reject.subtitle")}</AlertDialogDescription>}
        />
        <ChatDialogBody>
          <div className="flex flex-wrap gap-1.5">
            {REASONS.map((key) => {
              const on = reasons.includes(key)
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(key)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs",
                    on ? "border-[#D64545] bg-[#FDECEC] dark:bg-[#D64545]/12 text-[#D64545]" : "border-canvas-300 dark:border-white/14 bg-white dark:bg-navy-700",
                  )}
                >
                  {t(`dialogs.reject.reasons.${key}`)}
                </button>
              )
            })}
          </div>
          <Textarea
            value={note}
            rows={3}
            placeholder={t("dialogs.reject.notePlaceholder")}
            onChange={(e) => setNote(e.target.value)}
            className="rounded-[9px] border-canvas-300 dark:border-white/14"
          />
          <label className="flex items-center gap-2 text-xs">
            <Checkbox checked={remember} onCheckedChange={(v) => setRemember(Boolean(v))} />
            {t("dialogs.reject.remember")}
          </label>
        </ChatDialogBody>
        <ChatDialogFooter>
          <AlertDialogCancel className={chatDialogButton.secondary}>{t("dialogs.actions.cancel")}</AlertDialogCancel>
          <Button
            className={chatDialogButton.destructive}
            disabled={reject.isPending}
            onClick={() =>
              reject.mutate(contentId, {
                onSuccess: () => {
                  onOpenChange(false)
                  // The reject endpoint has no reason field; the caller forwards it to the AI
                  // (which can `remember` it) — TODO: persist reasons server-side when an API exists.
                  onRejected?.({
                    reasons: reasons.map((r) => t(`dialogs.reject.reasons.${r}`)),
                    note,
                    remember,
                  })
                },
              })
            }
          >
            {t("dialogs.actions.reject")}
          </Button>
        </ChatDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
