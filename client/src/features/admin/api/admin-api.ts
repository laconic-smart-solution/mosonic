import apiClient from "@/shared/api/api-client"

export type AdminUsersPage = {
  data: any[]
  meta: { total: number; page: number; limit: number; totalPages: number }
}

export async function adminGetUserStats() {
  const res = await apiClient.get("/admin/stats/users")
  return res.data as {
    total: number
    admins: number
    customers: number
    disabled: number
    new7d: number
    new30d: number
  }
}

export async function adminListUsers(params: {
  q?: string
  role?: string
  status?: string
  page?: number
  limit?: number
}) {
  const res = await apiClient.get("/admin/users", { params })
  return res.data as AdminUsersPage
}

export async function adminCreateUser(body: {
  email: string
  username: string
  password: string
  firstName?: string
  lastName?: string
  role: "ADMIN" | "CUSTOMER"
}) {
  const res = await apiClient.post("/admin/users", body)
  return res.data as any
}

export async function adminUpdateUserRole(userId: string, role: "ADMIN" | "CUSTOMER") {
  const res = await apiClient.patch(`/admin/users/${userId}/role`, { role })
  return res.data as any
}

export async function adminUpdateUserStatus(userId: string, status: "ACTIVE" | "DISABLED") {
  const res = await apiClient.patch(`/admin/users/${userId}/status`, { status })
  return res.data as any
}

export async function adminDeleteUser(userId: string) {
  const res = await apiClient.delete(`/admin/users/${userId}`)
  return res.data as any
}

