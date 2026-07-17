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

  topupUserCredits: (
    userId: string,
    body: { credits: number; reason: string },
  ) =>
    apiClient.post(`/admin/users/${userId}/credits/topup`, body).then((r) => r.data),

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

  getCreditConfig: () => apiClient.get("/admin/credit/config").then((r) => r.data),

  updateCreditConfig: (body: {
    creditPriceUsd?: number
    marginTarget?: number
    basicUsersPerMonth?: number
  }) => apiClient.put("/admin/credit/config", body).then((r) => r.data),

  getCreditConfigHistory: (params?: { page?: number; limit?: number }) =>
    apiClient.get("/admin/credit/config/history", { params }).then((r) => r.data),

  recalculateCreditOverhead: () =>
    apiClient.post("/admin/credit/recalculate-overhead").then((r) => r.data),

  listFixedCosts: () =>
    apiClient.get("/admin/credit/fixed-costs").then((r) => r.data),

  createFixedCost: (body: { name: string; amountUsd: number }) =>
    apiClient.post("/admin/credit/fixed-costs", body).then((r) => r.data),

  updateFixedCost: (
    id: string,
    body: { name?: string; amountUsd?: number; isActive?: boolean },
  ) => apiClient.put(`/admin/credit/fixed-costs/${id}`, body).then((r) => r.data),

  deleteFixedCost: (id: string) =>
    apiClient.delete(`/admin/credit/fixed-costs/${id}`).then((r) => r.data),

  listServiceRates: () =>
    apiClient.get("/admin/credit/service-rates").then((r) => r.data),

  createServiceRate: (body: Record<string, unknown>) =>
    apiClient.post("/admin/credit/service-rates", body).then((r) => r.data),

  updateServiceRate: (id: string, body: Record<string, unknown>) =>
    apiClient.put(`/admin/credit/service-rates/${id}`, body).then((r) => r.data),

  deleteServiceRate: (id: string) =>
    apiClient.delete(`/admin/credit/service-rates/${id}`).then((r) => r.data),

  previewCreditWorkflow: (body: {
    nodes: Array<{
      serviceType: "text" | "image" | "video"
      model: string
      provider?: string
      count?: number
      durationSec?: number
    }>
  }) => apiClient.post("/admin/credit/preview", body).then((r) => r.data),

  listNodeCredits: () =>
    apiClient.get("/admin/node-credits").then((r) => r.data),

  updateNodeCredit: (nodeType: string, body: { costUsd: number }) =>
    apiClient.put(`/admin/node-credits/${encodeURIComponent(nodeType)}`, body).then((r) => r.data),

  listPlans: () => apiClient.get("/admin/plans").then((r) => r.data),

  createPlan: (body: Record<string, unknown>) =>
    apiClient.post("/admin/plans", body).then((r) => r.data),

  updatePlan: (planId: string, body: Record<string, unknown>) =>
    apiClient.put(`/admin/plans/${planId}`, body).then((r) => r.data),

  deletePlan: (planId: string) =>
    apiClient.delete(`/admin/plans/${planId}`).then((r) => r.data),

  getPlanUsers: (planId: string, params?: { page?: number; limit?: number }) =>
    apiClient.get(`/admin/plans/${planId}/users`, { params }).then((r) => r.data),

  assignPlan: (planId: string, userId: string) =>
    apiClient.post(`/admin/plans/${planId}/assign`, { userId }).then((r) => r.data),

  listTopupPlans: () => apiClient.get("/admin/topup-plans").then((r) => r.data),

  createTopupPlan: (body: {
    code: string
    label: string
    credits: number
    priceUsd: number
    priceThb: number
    sortOrder: number
    active: boolean
  }) => apiClient.post("/admin/topup-plans", body).then((r) => r.data),

  updateTopupPlan: (
    code: string,
    body: {
      label: string
      credits: number
      priceUsd: number
      priceThb: number
      sortOrder: number
      active: boolean
    },
  ) => apiClient.put(`/admin/topup-plans/${encodeURIComponent(code)}`, body).then((r) => r.data),

  setTopupPlanActive: (code: string, active: boolean) =>
    apiClient
      .patch(`/admin/topup-plans/${encodeURIComponent(code)}/active`, { active })
      .then((r) => r.data),

  getUsageHistory: (params?: Record<string, string | number | undefined>) =>
    apiClient.get("/admin/usage/history", { params }).then((r) => r.data),

  getUsageSummary: (params?: { from?: string; to?: string; userId?: string }) =>
    apiClient.get("/admin/usage/summary", { params }).then((r) => r.data),

  getUserUsageHistory: (
    userId: string,
    params?: { from?: string; to?: string; page?: number; limit?: number },
  ) => apiClient.get(`/admin/usage/user/${userId}`, { params }).then((r) => r.data),

  getOpenAiBilling: (days = 30) =>
    apiClient.get("/admin/openai/billing", { params: { days } }).then((r) => r.data),

  updateOpenAiPrepaid: (prepaidCreditUsd: number) =>
    apiClient
      .put("/admin/openai/billing/prepaid", { prepaidCreditUsd })
      .then((r) => r.data),

  getApiUsage: (params?: { from?: string; to?: string; days?: number }) =>
    apiClient.get("/admin/api-usage", { params }).then((r) => r.data),

  updateApiUsagePrepaid: (provider: string, prepaidCreditUsd: number) =>
    apiClient
      .put(`/admin/api-usage/${provider}/prepaid`, { prepaidCreditUsd })
      .then((r) => r.data),

  listFaqDocuments: (params?: { page?: number; limit?: number }) =>
    apiClient.get("/admin/faq/documents", { params }).then((r) => r.data),

  getFaqDocument: (documentId: string) =>
    apiClient.get(`/admin/faq/documents/${documentId}`).then((r) => r.data),

  listFaqDocumentFaqs: (
    documentId: string,
    params?: { page?: number; limit?: number },
  ) =>
    apiClient
      .get(`/admin/faq/documents/${documentId}/faqs`, { params })
      .then((r) => r.data),

  downloadFaqDocument: (documentId: string) =>
    apiClient.get(`/admin/faq/documents/${documentId}/download`, {
      responseType: "blob",
    }),

  uploadFaqDocument: (
    file: File,
    options?: { onUploadProgress?: (percent: number) => void },
  ) => {
    const form = new FormData()
    form.append("file", file)
    return apiClient
      .post("/admin/faq/documents", form, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (event) => {
          if (!options?.onUploadProgress) return
          const total = event.total ?? 0
          if (total <= 0) {
            options.onUploadProgress(0)
            return
          }
          options.onUploadProgress(
            Math.min(100, Math.round((event.loaded / total) * 100)),
          )
        },
      })
      .then((r) => r.data)
  },

  listFaqs: (params?: { page?: number; limit?: number; q?: string }) =>
    apiClient.get("/admin/faq/faqs", { params }).then((r) => r.data),

  askFaq: (body: { question: string; topK?: number }) =>
    apiClient.post("/admin/faq/ask", body).then((r) => r.data),

  listLineConnections: (params?: {
    page?: number
    limit?: number
    search?: string
  }) => apiClient.get("/admin/line/connections", { params }).then((r) => r.data),

  sendLineMessage: (userId: string, body: { text: string }) =>
    apiClient
      .post(`/admin/line/connections/${userId}/messages`, body)
      .then((r) => r.data),
}
