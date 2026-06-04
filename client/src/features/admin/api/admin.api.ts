import apiClient from "@/shared/api/api-client"

export const adminApi = {
  getOverview: () => apiClient.get("/admin/dashboard/overview").then((r) => r.data),

  getUserGrowth: (days = 30) =>
    apiClient.get(`/admin/dashboard/user-growth`, { params: { days } }).then((r) => r.data),

  getPipelineTrend: (days = 30) =>
    apiClient.get(`/admin/dashboard/pipeline-trend`, { params: { days } }).then((r) => r.data),

  getCostTrend: (days = 30) =>
    apiClient.get(`/admin/dashboard/cost-trend`, { params: { days } }).then((r) => r.data),

  getNodeTypes: () => apiClient.get("/admin/dashboard/node-types").then((r) => r.data),

  getChannels: () => apiClient.get("/admin/dashboard/channels").then((r) => r.data),

  listUsers: (params: { page?: number; limit?: number; search?: string; status?: string }) =>
    apiClient.get("/admin/users", { params }).then((r) => r.data),

  getUserDetail: (userId: string) => apiClient.get(`/admin/users/${userId}`).then((r) => r.data),

  suspendUser: (userId: string) => apiClient.put(`/admin/users/${userId}/suspend`).then((r) => r.data),

  reactivateUser: (userId: string) => apiClient.put(`/admin/users/${userId}/reactivate`).then((r) => r.data),

  getCostSummary: (params?: { from?: string; to?: string }) =>
    apiClient.get("/admin/cost/summary", { params }).then((r) => r.data),

  getMonthOverMonth: () => apiClient.get("/admin/cost/month-over-month").then((r) => r.data),

  listContent: (params: {
    page?: number
    limit?: number
    status?: string
    userId?: string
    from?: string
    to?: string
  }) => apiClient.get("/admin/content", { params }).then((r) => r.data),

  getContentDetail: (contentId: string) =>
    apiClient.get(`/admin/content/${contentId}`).then((r) => r.data),
}
