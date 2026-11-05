import apiClient from "../api/api-client"

export type RuleAssetType = "logo" | "reference_image" | "guideline_document"
export type RuleAssetStatus = "pending" | "processing" | "ready" | "failed"

export type RuleAsset = {
  ruleAssetId: string
  ruleId: string
  type: RuleAssetType
  status: RuleAssetStatus
  fileUrl: string
  relativePath: string | null
  originalFileName: string
  mimeType: string
  fileSize: number
  aiDescription: string | null
  extractedText: string | null
  ragEnabled: boolean
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

export const ruleAssetService = {
  list: async (ruleId: string): Promise<RuleAsset[]> => {
    const response = await apiClient.get(`/rules/${ruleId}/assets`)
    return response.data
  },
  upload: async (
    ruleId: string,
    file: File,
    type: RuleAssetType,
  ): Promise<RuleAsset> => {
    const form = new FormData()
    form.append("file", file)
    form.append("type", type)
    const response = await apiClient.post(`/rules/${ruleId}/assets`, form)
    return response.data
  },
  remove: async (ruleId: string, ruleAssetId: string): Promise<void> => {
    await apiClient.delete(`/rules/${ruleId}/assets/${ruleAssetId}`)
  },
}
