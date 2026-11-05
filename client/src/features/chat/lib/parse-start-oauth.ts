export type StartOauthMarker = {
  action: "start_oauth"
  platform: string
  connectUrl: string
}

export type StartRednoteQrMarker = {
  action: "start_rednote_qr"
  platform: "rednote"
  socketRoom: string
}

export function parseStartOauth(result: string): StartOauthMarker | null {
  try {
    const parsed: unknown = JSON.parse(result)
    if (!parsed || typeof parsed !== "object") return null
    const obj = parsed as Record<string, unknown>
    if (obj.action !== "start_oauth") return null
    if (typeof obj.platform !== "string" || !obj.platform.trim()) return null
    if (typeof obj.connectUrl !== "string" || !obj.connectUrl.trim()) return null
    return {
      action: "start_oauth",
      platform: obj.platform.trim().toLowerCase(),
      connectUrl: obj.connectUrl.trim(),
    }
  } catch {
    return null
  }
}

export function parseStartRednoteQr(result: string): StartRednoteQrMarker | null {
  try {
    const parsed: unknown = JSON.parse(result)
    if (!parsed || typeof parsed !== "object") return null
    const obj = parsed as Record<string, unknown>
    if (obj.action !== "start_rednote_qr") return null
    if (typeof obj.socketRoom !== "string" || !obj.socketRoom.trim()) return null
    return {
      action: "start_rednote_qr",
      platform: "rednote",
      socketRoom: obj.socketRoom.trim(),
    }
  } catch {
    return null
  }
}

/** Latest OAuth connect marker per platform from tool observations. */
export function findStartOauth(
  steps: { type: string; result?: string }[] | null,
): StartOauthMarker[] {
  if (!steps) return []
  const byPlatform = new Map<string, StartOauthMarker>()
  for (const step of steps) {
    if (step.type !== "observation" && step.type !== "tool_call") continue
    if (typeof step.result !== "string") continue
    const marker = parseStartOauth(step.result)
    if (marker) byPlatform.set(marker.platform, marker)
  }
  return [...byPlatform.values()]
}

/** Latest RedNote QR connect marker from tool observations. */
export function findStartRednoteQr(
  steps: { type: string; result?: string }[] | null,
): StartRednoteQrMarker | null {
  if (!steps) return null
  let latest: StartRednoteQrMarker | null = null
  for (const step of steps) {
    if (step.type !== "observation" && step.type !== "tool_call") continue
    if (typeof step.result !== "string") continue
    const marker = parseStartRednoteQr(step.result)
    if (marker) latest = marker
  }
  return latest
}
