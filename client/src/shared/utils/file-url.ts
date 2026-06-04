import { appConfig } from "@/app/config/app-config"

const FILE_GET_PATH = "/api/file/v1/file"

function toAbsoluteUrl(pathOrUrl: string): string {
  const base = appConfig.apiBaseUrl
  if (!base) return pathOrUrl
  try {
    return new URL(pathOrUrl, base).toString()
  } catch {
    return pathOrUrl
  }
}

export function extractRelativePath(value: string | undefined): string | undefined {
  if (!value) return undefined
  const raw = value.trim()
  if (!raw) return undefined

  if (raw.startsWith("data:") || raw.startsWith("blob:")) {
    return undefined
  }

  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      const parsed = new URL(raw)
      if (parsed.pathname.endsWith(FILE_GET_PATH)) {
        return parsed.searchParams.get("relativePath") ?? undefined
      }
      return undefined
    } catch {
      return undefined
    }
  }

  if (raw.startsWith(FILE_GET_PATH) || raw.includes("/api/file/v1/file?")) {
    const absolute = toAbsoluteUrl(raw)
    try {
      const parsed = new URL(absolute)
      return parsed.searchParams.get("relativePath") ?? undefined
    } catch {
      return undefined
    }
  }

  if (raw.startsWith("/")) {
    return undefined
  }

  return raw
}

export function resolveMediaUrl(value: string | undefined): string | undefined {
  if (!value) return undefined
  const raw = value.trim()
  if (!raw) return undefined

  if (
    raw.startsWith("http://") ||
    raw.startsWith("https://") ||
    raw.startsWith("data:") ||
    raw.startsWith("blob:")
  ) {
    return raw
  }

  const relativePath = extractRelativePath(raw)
  if (!relativePath) {
    return raw.startsWith("/") ? toAbsoluteUrl(raw) : undefined
  }
  return toAbsoluteUrl(
    `${FILE_GET_PATH}?relativePath=${encodeURIComponent(relativePath)}`
  )
}
