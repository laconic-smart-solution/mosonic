import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import type { ContextUsage } from "@/shared/services/chat.service"

export function ChatContextUsage({ usage }: { usage: ContextUsage | null }) {
  const { t } = useTranslation("chat")
  if (!usage || usage.limit <= 0) return null

  const ratio = Math.min(usage.used / usage.limit, 1)
  const isNearLimit = ratio >= 0.8

  return (
    <div className="flex items-center gap-2 px-4 pt-2 text-[11px] text-muted-foreground">
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-[width]",
            isNearLimit ? "bg-amber-500" : "bg-primary/60",
          )}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      <span className="shrink-0 tabular-nums">
        {t("contextUsage.label", {
          used: usage.used.toLocaleString(),
          limit: usage.limit.toLocaleString(),
        })}
      </span>
    </div>
  )
}
