import { useMutation, useQuery } from "@tanstack/react-query"

import { faqService } from "@/shared/services/faq.service"
import type { FaqAskResponse, FaqListResponse } from "@/shared/types/faq.type"

export const faqQueryKeys = {
  list: (params: { page?: number; limit?: number; q?: string }) =>
    ["faq", "list", params] as const,
}

export function usePublicFaqsQuery(params: {
  page?: number
  limit?: number
  q?: string
}) {
  return useQuery<FaqListResponse>({
    queryKey: faqQueryKeys.list(params),
    queryFn: () => faqService.listFaqs(params),
    staleTime: 30_000,
  })
}

export function useFaqAskMutation() {
  return useMutation<FaqAskResponse, unknown, { question: string; topK?: number }>({
    mutationFn: (body) => faqService.askFaq(body),
  })
}
