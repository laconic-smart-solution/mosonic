import { extractRelativePath, resolveMediaUrl } from "@/shared/utils/file-url"

function triggerAnchorDownload(href: string, filename: string) {
  const a = document.createElement("a")
  a.href = href
  a.download = filename
  a.rel = "noopener"
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/**
 * Downloads a piece of media to the user's device. `blob:`/`data:` URLs
 * (the common case — most media in this app is already resolved to a blob
 * URL via useFileObjectUrl) download directly with no extra network call.
 * Anything else is fetched and converted to a blob first, so a same-origin
 * file-service URL — or a cross-origin one that allows CORS — forces a save
 * instead of just navigating the tab (the plain `download` attribute alone
 * does not force cross-origin downloads). If the fetch fails (e.g. blocked
 * by CORS), falls back to opening the resolved URL in a new tab so the user
 * can still save it manually.
 */
export async function downloadMedia(
  src: string | undefined,
  filename: string
): Promise<void> {
  if (!src) return

  if (src.startsWith("blob:") || src.startsWith("data:")) {
    triggerAnchorDownload(src, filename)
    return
  }

  const resolved = resolveMediaUrl(src) ?? src
  try {
    const response = await fetch(resolved, { credentials: "include" })
    if (!response.ok) {
      throw new Error(`Download failed with status ${response.status}`)
    }
    const blob = await response.blob()
    const blobUrl = URL.createObjectURL(blob)
    try {
      triggerAnchorDownload(blobUrl, filename)
    } finally {
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000)
    }
  } catch {
    window.open(resolved, "_blank", "noopener")
  }
}

/**
 * Best-effort filename from a media URL/relative path — keeps the original
 * extension when one is present, otherwise falls back to a kind-appropriate
 * default so the browser still saves something sensible.
 */
export function filenameFromMediaUrl(
  src: string | undefined,
  kind: "image" | "video",
  fallbackBase = "media"
): string {
  if (src) {
    const relative = extractRelativePath(src)
    const pathForName = (relative ?? src).split("?")[0].split("#")[0]
    const last = pathForName.split("/").pop()
    if (last && /\.[a-zA-Z0-9]{2,5}$/.test(last)) {
      try {
        return decodeURIComponent(last)
      } catch {
        return last
      }
    }
  }
  const ext = kind === "video" ? "mp4" : "png"
  return `${fallbackBase}-${Date.now()}.${ext}`
}
