import apiClient from "@/shared/api/api-client"

function pick(obj: any, path: string[]) {
  let cur = obj
  for (const key of path) {
    if (cur == null) return undefined
    cur = cur[key]
  }
  return cur
}

export async function login(body: { username: string; password: string }) {
  const res = await apiClient.post("/auth/login", body)
  const data = res.data
  const accessToken =
    pick(data, ["data", "token", "accessToken"]) ??
    pick(data, ["data", "token", "access_token"]) ??
    pick(data, ["token", "accessToken"]) ??
    pick(data, ["token", "access_token"])
  const refreshToken =
    pick(data, ["data", "token", "refreshToken"]) ??
    pick(data, ["data", "token", "refresh_token"]) ??
    pick(data, ["token", "refreshToken"]) ??
    pick(data, ["token", "refresh_token"])
  const email = pick(data, ["data", "email"]) ?? pick(data, ["email"])
  const userId = pick(data, ["data", "userId"]) ?? pick(data, ["userId"])
  return { raw: data, accessToken, refreshToken, email, userId }
}

export async function me() {
  const res = await apiClient.get("/auth/me")
  return res.data as any
}

