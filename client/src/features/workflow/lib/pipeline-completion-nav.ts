import type { NavigateFunction } from "react-router-dom"
import { toast } from "sonner"

import i18n from "@/i18n"
import { contentService } from "@/shared/services/content.service"

export type PipelineCompletionTarget = {
  pipelineId: string
  contentId?: string
  uploadId?: string
}

function detailPath(contentId?: string, uploadId?: string): string | null {
  if (uploadId?.trim()) return `/upload/${uploadId.trim()}`
  if (contentId?.trim()) return `/content/${contentId.trim()}`
  return null
}

/**
 * Resolves content/upload ids and navigates to the detail workspace.
 * Returns true when navigation was scheduled.
 */
export async function navigateAfterPipelineSuccess(
  navigate: NavigateFunction,
  target: PipelineCompletionTarget,
): Promise<boolean> {
  const direct = detailPath(target.contentId, target.uploadId)
  if (direct) {
    navigate(direct)
    return true
  }

  try {
    const page = await contentService.pageable({
      page: 1,
      limit: 1,
      filter: { pipelineRef: target.pipelineId },
      sortBy: "createdAt",
      sortOrder: "desc",
    })
    const row = page.data[0]
    const fromList = detailPath(row?.contentId, row?.uploadId)
    if (fromList) {
      navigate(fromList)
      return true
    }
  } catch {
    // fall through to toast
  }

  toast.error(i18n.t("workflow:errors.pipelineContentNotFound"))
  return false
}
