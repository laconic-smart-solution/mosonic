import type { LucideIcon } from "lucide-react"
import {
  CheckCircle2,
  CirclePause,
  CirclePlay,
  CircleX,
} from "lucide-react"

import type { PipelineStatus } from "@/shared/types/pipeline.type"

export type PipelineStatusIconMeta = {
  Icon: LucideIcon
  iconClass: string
  ringClass: string
}

export const PIPELINE_STATUS_ICON: Record<
  PipelineStatus,
  PipelineStatusIconMeta
> = {
  running: {
    Icon: CirclePlay,
    iconClass: "text-sky-600",
    ringClass: "bg-sky-50 ring-sky-200/80",
  },
  paused: {
    Icon: CirclePause,
    iconClass: "text-amber-700",
    ringClass: "bg-amber-50 ring-amber-200/80",
  },
  completed: {
    Icon: CheckCircle2,
    iconClass: "text-emerald-600",
    ringClass: "bg-emerald-50 ring-emerald-200/80",
  },
  failed: {
    Icon: CircleX,
    iconClass: "text-red-600",
    ringClass: "bg-red-50 ring-red-200/80",
  },
}

export function pipelineStatusIconMeta(
  status: PipelineStatus,
): PipelineStatusIconMeta {
  return PIPELINE_STATUS_ICON[status]
}
