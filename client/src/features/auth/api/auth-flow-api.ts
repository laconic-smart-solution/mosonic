import apiClient from "@/shared/api/api-client"
import { getApiErrorMessage } from "@/shared/lib/api-error"

export function authFlowErrorMessage(err: unknown, fallback: string): string {
  return getApiErrorMessage(err, fallback)
}

export function parseAuthApiViolations(err: unknown, fallback: string): string {
  return getApiErrorMessage(err, fallback)
}

export function setAuthFormApiError(
  setError: (name: "root", error: { message: string }) => void,
  err: unknown,
  fallback: string,
): void {
  setError("root", { message: getApiErrorMessage(err, fallback) })
}

export type SignupBody = {
  email: string
  username: string
  password: string
  firstName?: string
  lastName?: string
  phoneNumber?: string
}

export type AuthSessionResponse = {
  email: string | null
  userId: string | null
  otpVerified: boolean
}

export async function signup(body: SignupBody): Promise<unknown> {
  const res = await apiClient.post("/auth/signup", body)
  return res.data
}

export async function resendOtp(email: string): Promise<unknown> {
  const res = await apiClient.post("/auth/resend-otp", { email })
  return res.data
}

/** Verify OTP; Nest sets HttpOnly cookies when verification succeeds. */
export async function verifyOtp(body: {
  email: string
  otp: string
}): Promise<AuthSessionResponse> {
  const res = await apiClient.post<AuthSessionResponse>("/auth/verify-otp", body)
  return res.data
}

/** Change password using the access cookie; Nest clears cookies afterward. */
export async function changePassword(newPassword: string): Promise<void> {
  await apiClient.post("/auth/change-password", { newPassword })
}
