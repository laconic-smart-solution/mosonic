import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import type { ChatMessage } from "@/shared/services/chat.service"
import { chatMessageTokenUsage } from "../lib/chat-message-tokens"

export function ChatMessageTokenMeta({
  message,
  align,
}: {
  message: ChatMessage
  align: "start" | "end"
}) {
  const { t, i18n } = useTranslation("chat")
  const usage = chatMessageTokenUsage(message)
  if (!usage) return null

  const fmt = (n: number) => n.toLocaleString(i18n.language)
  const label = t("messageTokens.label", { formatted: fmt(usage.total) })
  const breakdown = t("messageTokens.breakdown", {
    input: fmt(usage.input),
    output: fmt(usage.output),
  })

  return (
    <p
      className={cn(
        "px-1 text-[11px] tabular-nums text-canvas-500 dark:text-navy-200",
        align === "end" ? "text-right" : "text-left",
      )}
      title={breakdown}
      aria-label={`${label}. ${breakdown}`}
    >
      {label}
      <span className="text-canvas-400 dark:text-navy-300"> · {breakdown}</span>
    </p>
  )
}
