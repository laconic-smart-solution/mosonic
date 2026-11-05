import { useTranslation } from "react-i18next"
import { MessageCircle } from "lucide-react"

export function ChatEmptyState({ variant }: { variant: "no-rule" | "no-messages" }) {
  const { t } = useTranslation("chat")

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      <MessageCircle className="size-8 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium text-foreground">
        {t(variant === "no-rule" ? "empty.noRuleTitle" : "empty.noMessagesTitle")}
      </p>
      <p className="max-w-sm text-xs text-muted-foreground">
        {t(variant === "no-rule" ? "empty.noRuleSubtitle" : "empty.noMessagesSubtitle")}
      </p>
    </div>
  )
}
