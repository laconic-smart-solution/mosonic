import apiClient from "../api/api-client"
import type {
  BulkDeleteResult,
  BulkOpResult,
  BulkPostIdsBody,
  BulkScheduleBody,
  DeletePostResult,
  PatchPostBody,
  PostAnalyticsSnapshot,
  PostRecord,
  PostsListQueryParams,
  PostsListResponse,
  PostsStatsResponse,
  PostDetailResponse,
} from "../types/post.type"

export const postService = {
  async stats(): Promise<PostsStatsResponse> {
    const response = await apiClient.get<PostsStatsResponse>("/posts/stats")
    return response.data
  },

  async list(params: PostsListQueryParams): Promise<PostsListResponse> {
    const response = await apiClient.get<PostsListResponse>("/posts", {
      params,
    })
    return response.data
  },

  async getById(
    postId: string,
    opts?: { hydrate?: "zernio" },
  ): Promise<PostDetailResponse> {
    const response = await apiClient.get<PostDetailResponse>(
      `/posts/${encodeURIComponent(postId)}`,
      {
        params:
          opts?.hydrate === "zernio" ? { hydrate: "zernio" } : undefined,
      },
    )
    return response.data
  },

  async patch(postId: string, body: PatchPostBody): Promise<PostRecord> {
    const response = await apiClient.patch<PostRecord>(
      `/posts/${encodeURIComponent(postId)}`,
      body,
    )
    return response.data
  },

  async bulkSchedule(body: BulkScheduleBody): Promise<BulkOpResult> {
    const response = await apiClient.post<BulkOpResult>(
      "/posts/bulk-schedule",
      body,
    )
    return response.data
  },

  async bulkPublishNow(body: BulkPostIdsBody): Promise<BulkOpResult> {
    const response = await apiClient.post<BulkOpResult>(
      "/posts/bulk-publish",
      body,
    )
    return response.data
  },

  async publishNow(postId: string): Promise<{ postId: string }> {
    const response = await apiClient.post<{ postId: string }>(
      `/posts/${encodeURIComponent(postId)}/publish`,
    )
    return response.data
  },

  async retry(postId: string): Promise<{ newPostId: string }> {
    const response = await apiClient.post<{ newPostId: string }>(
      `/posts/${encodeURIComponent(postId)}/retry`,
    )
    return response.data
  },

  async delete(postId: string): Promise<DeletePostResult> {
    const response = await apiClient.delete<DeletePostResult>(
      `/posts/${encodeURIComponent(postId)}`,
    )
    return response.data
  },

  async bulkDelete(body: BulkPostIdsBody): Promise<BulkDeleteResult> {
    const response = await apiClient.post<BulkDeleteResult>(
      "/posts/bulk-delete",
      body,
    )
    return response.data
  },

  async syncAnalytics(postId: string): Promise<{ analytics: PostAnalyticsSnapshot }> {
    const response = await apiClient.post<{ analytics: PostAnalyticsSnapshot }>(
      `/posts/${encodeURIComponent(postId)}/analytics/sync`,
    )
    return response.data
  },
}
