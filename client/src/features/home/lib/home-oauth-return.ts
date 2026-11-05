/** Query keys Zernio OAuth may append when returning to Home from chat connect. */
export type HomeOauthReturn = {
  connected: string | null
  error: string | null
}

export function readHomeOauthReturn(
  params: URLSearchParams | { get: (key: string) => string | null },
): HomeOauthReturn {
  return {
    connected: params.get("connected"),
    error: params.get("zernio_error"),
  }
}

export function stripHomeOauthParams(
  params: URLSearchParams,
): URLSearchParams {
  const next = new URLSearchParams(params)
  next.delete("connected")
  next.delete("zernio_error")
  return next
}
