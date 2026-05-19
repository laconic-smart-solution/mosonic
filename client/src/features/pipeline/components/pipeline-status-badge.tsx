import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { PipelineStatus } from "@/shared/types/pipeline.type"

function statusBadgeClass(status: PipelineStatus): string {
  switch (status) {
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-800"
    case "failed":
      return "border-red-200 bg-red-50 text-red-800"
    case "paused":
      return "border-amber-200 bg-amber-50 text-amber-900"
    default:
      return "border-sky-200 bg-sky-50 text-sky-900"
  }
}

export function PipelineStatusBadge({ status }: { status: PipelineStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "shrink-0 text-[10px] font-normal capitalize",
        statusBadgeClass(status),
      )}
    >
      {status}
    </Badge>
  )
}
