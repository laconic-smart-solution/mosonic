import apiClient from "@/shared/api/api-client"

export type AuthSessionResponse = {
  email: string | null
  userId: string | null
  otpVerified: boolean
}

export async function login(body: {
  username: string
  password: string
}): Promise<AuthSessionResponse> {
  const res = await apiClient.post<AuthSessionResponse>("/auth/login", body)
  return res.data
}

export async function me(options?: { skipAuthRefresh?: boolean }) {
  const res = await apiClient.get("/auth/me", {
    // Custom flag read by the 401 interceptor (not part of Axios typings).
    skipAuthRefresh: options?.skipAuthRefresh,
  } as never)
  return res.data as {
    auth?: {
      localUser?: {
        role?: string
        [key: string]: unknown
      }
      [key: string]: unknown
    }
  }
}
