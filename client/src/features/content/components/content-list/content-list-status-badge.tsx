import type { ContentStatus } from "@/shared/types/content.type"
import { cn } from "@/lib/utils"

export function ContentListStatusBadge({ status }: { status: ContentStatus }) {
  const base =
    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide capitalize"
  if (status === "draft") {
    return (
      <span
        className={cn(
          base,
          "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
        )}
      >
        Draft
      </span>
    )
  }
  if (status === "in_review") {
    return (
      <span
        className={cn(
          base,
          "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-300",
        )}
      >
        In review
      </span>
    )
  }
  if (status === "approved") {
    return (
      <span
        className={cn(
          base,
          "border-teal-400/25 bg-teal-50 text-teal-700 dark:border-teal-700/40 dark:bg-teal-950/60 dark:text-teal-300",
        )}
      >
        Approved
      </span>
    )
  }
  return (
    <span
      className={cn(
        base,
        "border-destructive/20 bg-destructive/10 text-destructive",
      )}
    >
      Rejected
    </span>
  )
}
