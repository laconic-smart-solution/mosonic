import { Sparkles } from "lucide-react"

/** Mosonic's chat mascot — shown beside every assistant message. */
export function ChatAssistantAvatar() {
  return (
    <div
      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
      aria-hidden
    >
      <Sparkles className="size-3.5" />
    </div>
  )
}
