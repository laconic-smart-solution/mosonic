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
          "border-amber-200 bg-amber-50 text-amber-700",
        )}
      >
        Draft
      </span>
    )
  }
  if (status === "approved") {
    return (
      <span
        className={cn(
          base,
          "border-teal-400/25 bg-teal-50 text-teal-700",
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
