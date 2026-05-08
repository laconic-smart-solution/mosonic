import apiClient from "../api/api-client"
import type {
  GenerateWorkflowPayload,
  GenerateWorkflowResponse,
  GetWorkflowResponse,
  SaveWorkflowNodesPayload,
} from "../types/workflow.type"

export const workflowService = {
  generateWorkflow: async (payload: GenerateWorkflowPayload): Promise<GenerateWorkflowResponse> => {
    const response = await apiClient.post(`/workflow/generate`, payload)
    return response.data
  },

  regenerateByRule: async (
    ruleId: string,
    payload: Pick<GenerateWorkflowPayload, "contentPrompt">,
  ): Promise<GenerateWorkflowResponse> => {
    const response = await apiClient.post(`/workflow/rule/${ruleId}/regenerate`, payload)
    return response.data
  },

  getById: async (workflowId: string): Promise<GetWorkflowResponse> => {
    const response = await apiClient.get(`/workflow/${workflowId}`)
    return response.data
  },

  getByRuleId: async (ruleId: string): Promise<GetWorkflowResponse | null> => {
    const response = await apiClient.get(`/workflow/rule/${ruleId}`)
    return response.data
  },

  saveNodes: async (
    workflowId: string,
    payload: SaveWorkflowNodesPayload,
  ): Promise<{ success: boolean }> => {
    const response = await apiClient.put(`/workflow/${workflowId}/nodes`, payload)
    return response.data
  },
}
