export type FaqDocument = {
  id: string
  filename: string
  content_type: string | null
  file_size: number
  uploaded_by: string
  status: string
  faq_count: number
  error_message: string | null
  storage_path: string | null
  created_at: string
}

export type FaqDocumentListResponse = {
  items: FaqDocument[]
  total: number
  page: number
  limit: number
}

export type FaqItem = {
  id: string
  question: string
  answer: string
  created_by: string
  updated_by: string | null
  source_document_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type FaqListResponse = {
  items: FaqItem[]
  total: number
  page: number
  limit: number
}

export type FaqMatchedSource = {
  document_id: string
  filename: string
  chunk_index: number
  excerpt: string
}

export type FaqAskResponse = {
  answer: string
  source: "faq" | "llm" | "no_match"
  confidence: number | null
  matched_sources: FaqMatchedSource[]
}

export type GenerateFaqsResponse = {
  document_id: string
  faq_count: number
  faqs: FaqItem[]
}
