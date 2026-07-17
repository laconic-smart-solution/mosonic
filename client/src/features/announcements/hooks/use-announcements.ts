import { useInfiniteQuery, useQuery } from "@tanstack/react-query"

import {
  announcementsApi,
  type PublicAnnouncement,
} from "../api/announcements.api"

export const ANNOUNCEMENTS_PAGE_SIZE = 10

export const announcementQueryKeys = {
  latest: ["announcements", "latest"] as const,
  infinite: (limit: number) => ["announcements", "infinite", limit] as const,
}

export function useLatestAnnouncementQuery(enabled = true) {
  return useQuery({
    queryKey: announcementQueryKeys.latest,
    queryFn: async () => {
      const data = await announcementsApi.latest()
      return data.announcement as PublicAnnouncement | null
    },
    enabled,
    staleTime: 60_000,
  })
}

export function useAnnouncementsInfiniteQuery(
  limit = ANNOUNCEMENTS_PAGE_SIZE,
) {
  return useInfiniteQuery({
    queryKey: announcementQueryKeys.infinite(limit),
    queryFn: ({ pageParam }) =>
      announcementsApi.list({ page: pageParam, limit }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page < last.totalPages ? last.page + 1 : undefined,
    staleTime: 30_000,
  })
}
