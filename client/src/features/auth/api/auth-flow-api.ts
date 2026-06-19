import axios from "axios"

import { appConfig } from "@/app/config/app-config"
import apiClient from "@/shared/api/api-client"
import { extractTokensFromAuthResponse } from "@/shared/lib/extract-auth-tokens"

function pick(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj
  for (const key of path) {
    if (cur == null || typeof cur !== "object") return undefined
    cur = (cur as Record<string, unknown>)[key]
  }
  return cur
}

export function authFlowErrorMessage(err: unknown, fallback: string): string {
  return parseAuthApiViolations(err, fallback)
}

export function parseAuthApiViolations(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "response" in err) {
    const data = (err as { response?: { data?: { message?: unknown } } }).response?.data
    const m = data?.message
    if (typeof m === "string") return m
    if (Array.isArray(m)) return m.filter((x) => typeof x === "string").join(", ")
  }
  if (err instanceof Error) return err.message
  return fallback
}

export function setAuthFormApiError(
  setError: (name: "root", error: { message: string }) => void,
  err: unknown,
  fallback: string,
): void {
  const message = parseAuthApiViolations(err, fallback)
  setError("root", { message })
}

export type SignupBody = {
  email: string
  username: string
  password: string
  firstName?: string
  lastName?: string
  phoneNumber?: string
}

export async function signup(body: SignupBody): Promise<unknown> {
  const res = await apiClient.post("/auth/signup", body)
  return res.data
}

export async function resendOtp(email: string): Promise<unknown> {
  const res = await apiClient.post("/auth/resend-otp", { email })
  return res.data
}

/** Verify OTP; response shape matches normalized login/refresh from the SSO proxy. */
export async function verifyOtp(body: { email: string; otp: string }) {
  const res = await apiClient.post("/auth/verify-otp", body)
  const data = res.data
  const { accessToken, refreshToken } = extractTokensFromAuthResponse(data)
  const email =
    (pick(data, ["data", "data", "email"]) as string | undefined) ??
    (pick(data, ["data", "email"]) as string | undefined) ??
    (pick(data, ["email"]) as string | undefined)
  const userIdRaw =
    pick(data, ["data", "data", "userId"]) ??
    pick(data, ["data", "userId"]) ??
    pick(data, ["userId"])
  const userId = userIdRaw != null ? String(userIdRaw) : undefined
  return { raw: data, accessToken, refreshToken, email, userId }
}

export async function changePassword(newPassword: string, accessToken: string): Promise<void> {
  await axios.post(
    `${appConfig.apiBaseUrl}/auth/change-password`,
    { newPassword },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      withCredentials: true,
    },
  )
}
