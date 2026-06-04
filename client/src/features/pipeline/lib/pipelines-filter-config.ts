import {
  parsePipelineSort,
  type PipelineSortParam,
} from "@/features/pipeline/lib/pipeline-list-format"
import { PIPELINE_STATUSES } from "@/features/pipeline/lib/pipeline-status-theme"
import type { PipelineStatus } from "@/shared/types/pipeline.type"

export function parsePipelineFilters(search: string): {
  workflowId: string | null
  status: PipelineStatus | "all"
  sort: PipelineSortParam
} {
  const params = new URLSearchParams(search)
  const workflowRaw = params.get("workflow")?.trim()
  const statusRaw = params.get("status")
  const status: PipelineStatus | "all" =
    statusRaw && PIPELINE_STATUSES.includes(statusRaw as PipelineStatus)
      ? (statusRaw as PipelineStatus)
      : "all"

  return {
    workflowId: workflowRaw || null,
    status,
    sort: parsePipelineSort(params.get("sort")),
  }
}
