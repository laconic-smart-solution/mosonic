import apiClient from "@/shared/api/api-client"

export type AnnouncementLevel = "info" | "warning" | "critical"

export type PublicAnnouncement = {
  id: string
  title: string
  message: string
  level: AnnouncementLevel
  publishedAt: string
}

export const announcementsApi = {
  latest: () =>
    apiClient
      .get<{ announcement: PublicAnnouncement | null }>("/announcements/latest")
      .then((r) => r.data),

  list: (params?: { page?: number; limit?: number }) =>
    apiClient
      .get<{
        announcements: PublicAnnouncement[]
        total: number
        page: number
        limit: number
        totalPages: number
      }>("/announcements", { params })
      .then((r) => r.data),
}
