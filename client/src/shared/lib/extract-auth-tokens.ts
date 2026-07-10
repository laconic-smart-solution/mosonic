/** Pick nested value by path keys. */
function pick(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj
  for (const key of path) {
    if (cur == null || typeof cur !== "object") return undefined
    cur = (cur as Record<string, unknown>)[key]
  }
  return cur
}

export type ExtractedTokens = {
  accessToken: string | undefined
  refreshToken: string | undefined
}

/**
 * Normalize access/refresh tokens from Nest SSO proxy responses (login or refresh).
 */
export function extractTokensFromAuthResponse(data: unknown): ExtractedTokens {
  const accessToken =
    pick(data, ["data", "data", "token", "accessToken"]) ??
    pick(data, ["data", "data", "token", "access_token"]) ??
    pick(data, ["data", "token", "accessToken"]) ??
    pick(data, ["data", "token", "access_token"]) ??
    pick(data, ["token", "accessToken"]) ??
    pick(data, ["token", "access_token"]) ??
    pick(data, ["accessToken"]) ??
    pick(data, ["access_token"])

  const refreshToken =
    pick(data, ["data", "data", "token", "refreshToken"]) ??
    pick(data, ["data", "data", "token", "refresh_token"]) ??
    pick(data, ["data", "token", "refreshToken"]) ??
    pick(data, ["data", "token", "refresh_token"]) ??
    pick(data, ["token", "refreshToken"]) ??
    pick(data, ["token", "refresh_token"]) ??
    pick(data, ["refreshToken"]) ??
    pick(data, ["refresh_token"])

  return {
    accessToken: typeof accessToken === "string" ? accessToken : undefined,
    refreshToken: typeof refreshToken === "string" ? refreshToken : undefined,
  }
}

/** SSO login/verify responses include `data.otpVerified` when email must be confirmed. */
export function extractOtpVerifiedFromAuthResponse(
  data: unknown,
): boolean | undefined {
  const raw =
    pick(data, ["data", "data", "otpVerified"]) ??
    pick(data, ["data", "otpVerified"]) ??
    pick(data, ["otpVerified"])
  if (typeof raw === "boolean") return raw
  return undefined
}
