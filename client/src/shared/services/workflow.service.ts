import apiClient from "../api/api-client"
import type {
  GenerateWorkflowPayload,
  GenerateWorkflowResponse,
  GetWorkflowResponse,
  SaveWorkflowNodesByRulePayload,
  SaveWorkflowNodesByRuleResponse,
  SaveWorkflowNodesPayload,
  UpdateWorkflowPayload,
  UpdateWorkflowResponse,
  WorkflowPageQueryPayload,
  WorkflowPageResponse,
} from "../types/workflow.type"

export const workflowService = {
  pageable: async (payload: WorkflowPageQueryPayload): Promise<WorkflowPageResponse> => {
    const { data } = await apiClient.post<WorkflowPageResponse>("/workflow/pageable", payload)
    return data
  },

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

  saveNodesByRuleId: async (
    ruleId: string,
    payload: SaveWorkflowNodesByRulePayload,
  ): Promise<SaveWorkflowNodesByRuleResponse> => {
    const response = await apiClient.put(`/workflow/rule/${ruleId}/nodes`, payload)
    return response.data
  },

  patchWorkflow: async (
    workflowId: string,
    payload: UpdateWorkflowPayload,
  ): Promise<UpdateWorkflowResponse> => {
    const response = await apiClient.patch(`/workflow/${workflowId}`, payload)
    return response.data
  },
}
