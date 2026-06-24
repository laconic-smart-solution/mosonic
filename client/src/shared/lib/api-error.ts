import axios from "axios"
import i18n from "@/i18n"

export type ApiErrorBody = {
  statusCode?: number
  error?: string
  message?: string | string[]
  requiredCredits?: number
  creditsRemaining?: number
}

export type ParsedApiError = ApiErrorBody & {
  status?: number
}

function extractMessageFromData(data: unknown): string | string[] | undefined {
  if (typeof data === "string" && data.trim()) return data.trim()
  if (!data || typeof data !== "object") return undefined
  const obj = data as Record<string, unknown>
  const direct = obj.message ?? obj.error ?? obj.detail
  if (typeof direct === "string" && direct.trim()) return direct.trim()
  if (Array.isArray(direct)) {
    const parts = direct.filter((x) => typeof x === "string" && x.trim())
    if (parts.length) return parts.join(", ")
  }
  const nested = obj.data
  if (nested && typeof nested === "object") {
    return extractMessageFromData(nested)
  }
  return undefined
}

export function parseApiError(err: unknown): ParsedApiError {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status
    const data = err.response?.data as ApiErrorBody | undefined
    const message =
      extractMessageFromData(data) ??
      (err.message.trim() ? err.message : undefined)
    return {
      status,
      statusCode: data?.statusCode ?? status,
      error: typeof data?.error === "string" ? data.error : undefined,
      message,
      requiredCredits:
        typeof data?.requiredCredits === "number"
          ? data.requiredCredits
          : undefined,
      creditsRemaining:
        typeof data?.creditsRemaining === "number"
          ? data.creditsRemaining
          : undefined,
    }
  }
  if (err instanceof Error && err.message.trim()) {
    return { message: err.message }
  }
  return {}
}

export function isNetworkError(err: unknown): boolean {
  return axios.isAxiosError(err) && !err.response
}

export function isInsufficientCredits(err: unknown): boolean {
  const parsed = parseApiError(err)
  return (
    parsed.status === 402 ||
    parsed.error === "InsufficientCredits" ||
    parsed.error === "InsufficientCreditsException"
  )
}

export function isAuthErrorCode(
  err: unknown,
  code: string,
): boolean {
  const parsed = parseApiError(err)
  return parsed.error === code
}

function statusFallbackKey(status?: number): string | null {
  switch (status) {
    case 400:
    case 422:
      return "common:errors.validation"
    case 401:
      return "common:errors.unauthorized"
    case 403:
      return "common:errors.forbidden"
    case 404:
      return "common:errors.notFound"
    case 402:
      return "credit:runConfirm.insufficientTitle"
    case 413:
      return "common:errors.payloadTooLarge"
    case 502:
    case 503:
      return "common:errors.serviceUnavailable"
    case 409:
      return "auth:errors.emailTaken"
    default:
      return null
  }
}

function authErrorFallback(err: unknown): string | null {
  if (isAuthErrorCode(err, "InvalidCredentials")) {
    return i18n.t("auth:errors.invalidCredentials")
  }
  if (isAuthErrorCode(err, "InvalidOtp")) {
    return i18n.t("auth:errors.invalidOtp")
  }
  if (isAuthErrorCode(err, "InvalidToken")) {
    return i18n.t("auth:errors.sessionExpired")
  }
  if (isAuthErrorCode(err, "Conflict")) {
    return i18n.t("auth:errors.emailTaken")
  }
  if (isAuthErrorCode(err, "AuthServiceUnavailable")) {
    return i18n.t("auth:errors.serviceUnavailable")
  }
  return null
}

export function getApiErrorMessage(
  err: unknown,
  fallback?: string,
): string {
  if (isNetworkError(err)) {
    return i18n.t("common:errors.network")
  }
  if (isInsufficientCredits(err)) {
    return i18n.t("credit:runConfirm.insufficientTitle")
  }

  const authFallback = authErrorFallback(err)
  if (authFallback) return authFallback

  const parsed = parseApiError(err)
  if (typeof parsed.message === "string" && parsed.message.trim()) {
    return parsed.message
  }
  if (Array.isArray(parsed.message) && parsed.message.length > 0) {
    return parsed.message.join(", ")
  }

  const statusKey = statusFallbackKey(parsed.status)
  if (statusKey) return i18n.t(statusKey)

  return fallback ?? i18n.t("common:errors.unknown")
}

export function getToastErrorMessage(
  err: unknown,
  fallbackKey: string,
): string {
  const fallback = fallbackKey.includes(":")
    ? i18n.t(fallbackKey)
    : fallbackKey
  return getApiErrorMessage(err, fallback)
}
