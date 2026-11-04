import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/** Tone of a dialog's 38px icon tile — matches the Mosonic dialog system colours. */
export type ChatDialogTone = "navy" | "teal" | "amber" | "red"

const TONE_CLASS: Record<ChatDialogTone, string> = {
  navy: "bg-navy-50 dark:bg-white/8 text-navy-700 dark:text-[#E8EDF6]",
  teal: "bg-teal-50 dark:bg-teal-400/10 text-teal-600",
  amber: "bg-amber-50 dark:bg-amber-400/10 text-amber-600",
  red: "bg-[#FDECEC] dark:bg-[#D64545]/12 text-[#D64545]",
}

export function ChatDialogHeading({
  icon: Icon,
  tone,
  title,
  subtitle,
}: {
  icon: LucideIcon
  tone: ChatDialogTone
  title: ReactNode
  subtitle?: ReactNode
}) {
  return (
    <div className="flex items-start gap-3 px-5 pt-5 pb-4 pr-12">
      <span
        className={cn(
          "flex size-[38px] shrink-0 items-center justify-center rounded-[10px]",
          TONE_CLASS[tone],
        )}
        aria-hidden
      >
        <Icon className="size-[18px]" />
      </span>
      <div className="min-w-0 space-y-0.5">{title}{subtitle}</div>
    </div>
  )
}

export function ChatDialogBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("space-y-3 px-5 pb-5", className)}>{children}</div>
}

/** Footer in #FBF9F6 with a top border; `start` sits left (Cancel / Reset / Reject), children right. */
export function ChatDialogFooter({ start, children }: { start?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-t border-canvas-200 dark:border-white/8 bg-[#FBF9F6] dark:bg-[#0B1730] px-5 py-3">
      <div className="mr-auto flex items-center gap-2">{start}</div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}
