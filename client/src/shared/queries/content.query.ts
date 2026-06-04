import { useQuery } from "@tanstack/react-query"
import { contentService } from "../services/content.service"
import type { ContentPageQueryPayload } from "../types/content.type"

export const useContentPageQuery = (
  payload: ContentPageQueryPayload,
  enabled = true
) => {
  return useQuery({
    queryKey: ["contents", "pageable", payload],
    queryFn: () => contentService.pageable(payload),
    enabled,
    retry: false,
  })
}

export const useGetContentQuery = (contentId: string | undefined) => {
  return useQuery({
    queryKey: ["content", contentId],
    queryFn: () => contentService.getById(contentId!),
    enabled: !!contentId,
    retry: false,
  })
}
