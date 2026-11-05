import { useTranslation } from "react-i18next"
import { Search } from "lucide-react"

import type { ChatToolCall } from "@/shared/services/chat.service"
import { TOOL_ICON, TOOL_LABEL_KEY } from "../lib/tool-call-labels"

/** Static, non-interactive status badge — not a clickable element. */
export function ChatToolCallBadge({ toolCall }: { toolCall: ChatToolCall }) {
  const { t } = useTranslation("chat")
  const Icon = TOOL_ICON[toolCall.name] ?? Search
  const labelKey = TOOL_LABEL_KEY[toolCall.name]

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
      <Icon className="size-3" aria-hidden />
      {labelKey ? t(labelKey) : toolCall.name}
    </span>
  )
}
