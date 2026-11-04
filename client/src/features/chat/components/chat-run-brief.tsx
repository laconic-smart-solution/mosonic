import { useTranslation } from "react-i18next"

import { useChatActions } from "../hooks/use-chat-actions"
import type { RunBrief } from "../lib/parse-run-brief"

const CHANNEL_LABEL: Record<string, string> = {
  instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn", youtube: "YouTube", tiktok: "TikTok", rednote: "RedNote",
}

/** One line under a started run: topic · style · channels, with a Change link. */
export function ChatRunBrief({ brief }: { brief: RunBrief }) {
  const { t } = useTranslation("chat")
  const chatActions = useChatActions()
  const parts = [
    brief.topic,
    brief.style ?? (brief.images ? null : t("runBrief.textOnly")),
    brief.channels.map((c) => CHANNEL_LABEL[c] ?? c).join(", "),
  ].filter(Boolean)
  return (
    <p className="flex min-w-0 w-full items-center gap-2 overflow-hidden text-xs text-canvas-600 dark:text-navy-200">
      <span className="min-w-0 flex-1 truncate">{parts.join(" \u00b7 ")}</span>
      {chatActions ? (
        <button
          type="button"
          className="shrink-0 font-medium text-navy-700 dark:text-teal-300 underline-offset-2 hover:underline disabled:opacity-50"
          disabled={chatActions.busy}
          onClick={() => chatActions.sendMessage(t("runBrief.changeMessage"))}
        >
          {t("runBrief.change")}
        </button>
      ) : null}
    </p>
  )
}
