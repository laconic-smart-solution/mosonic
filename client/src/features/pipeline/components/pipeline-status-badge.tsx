import { useTranslation } from "react-i18next"
import { Badge } from "@/components/ui/badge"
import { pipelineStatusIconMeta } from "@/features/pipeline/lib/pipeline-status-icon"
import { cn } from "@/lib/utils"
import type { PipelineStatus } from "@/shared/types/pipeline.type"

function statusBadgeClass(status: PipelineStatus): string {
  switch (status) {
    case "completed":
      return "border-emerald-200/90 bg-emerald-50 text-emerald-800"
    case "failed":
      return "border-red-200/90 bg-red-50 text-red-800"
    case "paused":
      return "border-amber-200/90 bg-amber-50 text-amber-900"
    default:
      return "border-sky-200/90 bg-sky-50 text-sky-900"
  }
}

export function PipelineStatusBadge({ status }: { status: PipelineStatus }) {
  const { t } = useTranslation("pipeline")
  const { Icon } = pipelineStatusIconMeta(status)
  const label = t(`status.${status}`)

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 px-2 py-0.5 text-[10px] font-medium",
        statusBadgeClass(status),
      )}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      {label}
    </Badge>
  )
}
