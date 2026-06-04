import apiClient from "@/shared/api/api-client"

export type WorkflowTemplateItem = {
  workflowId: string
  templateName: string
  name: string
  updatedAt: string
}

export const workflowTemplateService = {
  list: async (): Promise<WorkflowTemplateItem[]> => {
    const { data } = await apiClient.get<WorkflowTemplateItem[]>("/workflow/templates")
    return data
  },

  apply: async (
    templateId: string,
    ruleId: string,
  ): Promise<{ workflowId: string }> => {
    const { data } = await apiClient.post<{ workflowId: string }>(
      `/workflow/templates/${templateId}/apply`,
      { ruleId },
    )
    return data
  },

  saveAsTemplate: async (
    workflowId: string,
    templateName: string,
  ): Promise<{ workflowId: string; templateName: string }> => {
    const { data } = await apiClient.post<{ workflowId: string; templateName: string }>(
      `/workflow/${workflowId}/save-as-template`,
      { templateName },
    )
    return data
  },
}
