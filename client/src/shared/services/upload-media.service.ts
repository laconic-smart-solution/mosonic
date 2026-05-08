import apiClient from "../api/api-client"

export const uploadMediaService = {
  uploadFile: async (file: File): Promise<{ url: string }> => {
    const form = new FormData()
    form.append("file", file)
    const response = await apiClient.post<{ url: string }>("/upload/media", form)
    return response.data
  },
}
