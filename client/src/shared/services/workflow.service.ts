import apiClient from "../api/api-client"
import type {
  ApplyPipelineToWorkflowResponse,
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
    payload: Pick<GenerateWorkflowPayload, "answers">,
  ): Promise<GenerateWorkflowResponse> => {
    const response = await apiClient.post(`/workflow/rule/${ruleId}/regenerate`, payload)
    return response.data
  },

  applyDefaultStructure: async (
    ruleId: string,
  ): Promise<GenerateWorkflowResponse> => {
    const response = await apiClient.post(
      `/workflow/rule/${ruleId}/default-structure`,
    )
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

  applyPipelineToWorkflow: async (
    ruleId: string,
    pipelineId: string,
  ): Promise<ApplyPipelineToWorkflowResponse> => {
    const response = await apiClient.post(
      `/workflow/rule/${ruleId}/apply-pipeline/${pipelineId}`,
    )
    return response.data
  },
}
