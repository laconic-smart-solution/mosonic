import apiClient from "@/shared/api/api-client"
import {
  extractOtpVerifiedFromAuthResponse,
  extractTokensFromAuthResponse,
} from "@/shared/lib/extract-auth-tokens"

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
  const { accessToken, refreshToken } = extractTokensFromAuthResponse(data)
  const email = pick(data, ["data", "email"]) ?? pick(data, ["email"])
  const userId = pick(data, ["data", "userId"]) ?? pick(data, ["userId"])
  const otpVerified = extractOtpVerifiedFromAuthResponse(data)
  return { raw: data, accessToken, refreshToken, email, userId, otpVerified }
}

export async function me() {
  const res = await apiClient.get("/auth/me")
  return res.data as any
}

