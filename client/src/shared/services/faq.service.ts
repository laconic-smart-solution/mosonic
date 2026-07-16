import apiClient from "@/shared/api/api-client"
import type { FaqAskResponse, FaqListResponse } from "@/shared/types/faq.type"

export const faqService = {
  listFaqs: (params?: { page?: number; limit?: number; q?: string }) =>
    apiClient
      .get<FaqListResponse>("/faq/faqs", { params })
      .then((response) => response.data),

  askFaq: (body: { question: string; topK?: number }) =>
    apiClient
      .post<FaqAskResponse>("/faq/ask", body)
      .then((response) => response.data),
}
