import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { toastApiError } from "@/shared/lib/toast-error"

import { adminApi } from "../api/admin.api"
import type {
  FaqAskResponse,
  FaqDocumentListResponse,
  FaqListResponse,
  GenerateFaqsResponse,
} from "../types/faq.types"

export function useAdminFaqDocuments(params: { page?: number; limit?: number }) {
  return useQuery<FaqDocumentListResponse>({
    queryKey: ["admin-faq-documents", params],
    queryFn: () => adminApi.listFaqDocuments(params),
    staleTime: 30_000,
  })
}

export function useAdminFaqDocumentUpload() {
  const { t } = useTranslation("admin")
  const queryClient = useQueryClient()
  return useMutation<GenerateFaqsResponse, unknown, File>({
    mutationFn: (file) => adminApi.uploadFaqDocument(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-faq-documents"] })
      queryClient.invalidateQueries({ queryKey: ["admin-faqs"] })
      toast.success(t("faq.uploadSuccess"))
    },
    onError: (error) => toastApiError(error, "admin:faq.uploadError"),
  })
}

export function useAdminFaqs(params: {
  page?: number
  limit?: number
  q?: string
}) {
  return useQuery<FaqListResponse>({
    queryKey: ["admin-faqs", params],
    queryFn: () => adminApi.listFaqs(params),
    staleTime: 30_000,
  })
}

export function useAdminFaqDocument(documentId: string) {
  return useQuery({
    queryKey: ["admin-faq-document", documentId],
    queryFn: () => adminApi.getFaqDocument(documentId),
    enabled: Boolean(documentId),
    staleTime: 30_000,
  })
}

export function useAdminFaqDocumentFaqs(
  documentId: string,
  params?: { page?: number; limit?: number },
) {
  return useQuery<FaqListResponse>({
    queryKey: ["admin-faq-document-faqs", documentId, params],
    queryFn: () => adminApi.listFaqDocumentFaqs(documentId, params),
    enabled: Boolean(documentId),
    staleTime: 30_000,
  })
}

export function useAdminFaqAsk() {
  return useMutation<FaqAskResponse, unknown, { question: string }>({
    mutationFn: ({ question }) => adminApi.askFaq({ question }),
  })
}
