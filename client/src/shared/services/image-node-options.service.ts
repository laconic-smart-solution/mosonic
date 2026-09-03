import apiClient from "@/shared/api/api-client"

export type ImageTemplateOption = {
  key: string
  name: string
  description: string
  imageUrl: string | null
}

export type ImageDesignStyleOption = {
  key: string
  name: string
  description: string
  imageUrl?: string | null
}

export const imageNodeOptionsService = {
  listTemplates: () =>
    apiClient
      .get<ImageTemplateOption[]>("/nodes/image/templates")
      .then((response) => response.data),

  listStyles: () =>
    apiClient
      .get<ImageDesignStyleOption[]>("/nodes/image/styles")
      .then((response) => response.data),
}
