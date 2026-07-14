import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { postService } from "@/shared/services/post.service"
import { useAuthStore } from "@/shared/stores/auth.store"
import type {
  BulkPostIdsBody,
  BulkScheduleBody,
  PatchPostBody,
  PostsListQueryParams,
  PostsStatsResponse,
} from "@/shared/types/post.type"

function assertPostsStatsPayload(data: unknown): PostsStatsResponse {
  if (
    data === null ||
    typeof data !== "object" ||
    typeof (data as PostsStatsResponse).total !== "number" ||
    typeof (data as PostsStatsResponse).byStatus !== "object" ||
    (data as PostsStatsResponse).byStatus === null
  ) {
    throw new Error("Invalid posts stats response from API")
  }
  return data as PostsStatsResponse
}

export const postsQueryKeys = {
  root: ["posts"] as const,
  list: (params: PostsListQueryParams) =>
    [...postsQueryKeys.root, "list", params] as const,
  stats: () => [...postsQueryKeys.root, "stats"] as const,
  detail: (postId: string | undefined, hydrate: boolean) =>
    [...postsQueryKeys.root, "detail", postId ?? "", hydrate] as const,
}

export function usePostsStatsQuery() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return useQuery({
    queryKey: postsQueryKeys.stats(),
    queryFn: async () => assertPostsStatsPayload(await postService.stats()),
    enabled: isAuthenticated,
    retry: false,
  })
}

export function usePostsListQuery(params: PostsListQueryParams) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const page = params.page ?? 1
  const limit = params.limit ?? 20
  const stable = { ...params, page, limit }

  return useQuery({
    queryKey: postsQueryKeys.list(stable),
    queryFn: () => postService.list(stable),
    enabled: isAuthenticated,
    retry: false,
  })
}

export function usePostDetailQuery(
  postId: string | undefined,
  opts?: { hydrateZernio?: boolean; enabled?: boolean },
) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const hydrate = Boolean(opts?.hydrateZernio)
  return useQuery({
    queryKey: postsQueryKeys.detail(postId, hydrate),
    queryFn: () =>
      postService.getById(postId!, {
        hydrate: hydrate ? "zernio" : undefined,
      }),
    enabled: isAuthenticated && !!postId && (opts?.enabled ?? true),
    retry: false,
  })
}

export function usePatchPostMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      postId,
      body,
    }: {
      postId: string
      body: PatchPostBody
    }) => postService.patch(postId, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: postsQueryKeys.root })
    },
    meta: { silent: true },
  })
}

export function useBulkSchedulePostsMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: BulkScheduleBody) => postService.bulkSchedule(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: postsQueryKeys.root })
    },
    meta: { silent: true },
  })
}

export function useBulkPublishNowMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: BulkPostIdsBody) => postService.bulkPublishNow(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: postsQueryKeys.root })
    },
    meta: { silent: true },
  })
}

export function usePublishPostMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (postId: string) => postService.publishNow(postId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: postsQueryKeys.root })
    },
    meta: { silent: true },
  })
}

export function useRetryPostMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (postId: string) => postService.retry(postId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: postsQueryKeys.root })
    },
    meta: { silent: true },
  })
}

export function useSyncPostAnalyticsMutation(postId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => postService.syncAnalytics(postId!),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: postsQueryKeys.detail(postId, true),
      })
    },
    meta: { silent: true },
  })
}

export function useDeletePostMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (postId: string) => postService.delete(postId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: postsQueryKeys.root })
    },
    meta: { silent: true },
  })
}

export function useBulkDeletePostsMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: BulkPostIdsBody) => postService.bulkDelete(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: postsQueryKeys.root })
    },
    meta: { silent: true },
  })
}
