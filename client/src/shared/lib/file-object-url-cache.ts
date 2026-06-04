import apiClient from "@/shared/api/api-client"
import { extractRelativePath } from "@/shared/utils/file-url"

export type FileObjectUrlCacheStatus = "idle" | "loading" | "ready" | "error"

export type FileObjectUrlCacheSnapshot = {
  status: FileObjectUrlCacheStatus
  /** Resolved src when status is `ready`. */
  src: string | undefined
  /** 0–100 when known; `null` when download size is unknown. */
  progress: number | null
}

type Listener = (snapshot: FileObjectUrlCacheSnapshot) => void

type CacheEntry = {
  status: FileObjectUrlCacheStatus
  blobUrl?: string
  progress: number | null
  refCount: number
  listeners: Set<Listener>
  abortController?: AbortController
}

const cache = new Map<string, CacheEntry>()

function isPassthroughUrl(raw: string): boolean {
  return (
    raw.startsWith("data:") ||
    raw.startsWith("blob:") ||
    (raw.startsWith("http://") && !raw.includes("/api/file/v1/file?")) ||
    (raw.startsWith("https://") && !raw.includes("/api/file/v1/file?"))
  )
}

export function resolveFileObjectUrlCacheKey(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed || isPassthroughUrl(trimmed)) return null

  const relativePath = extractRelativePath(trimmed)
  if (relativePath) return `rel:${relativePath}`
  return `raw:${trimmed}`
}

function snapshotFromEntry(entry: CacheEntry): FileObjectUrlCacheSnapshot {
  return {
    status: entry.status,
    src: entry.status === "ready" ? entry.blobUrl : undefined,
    progress: entry.progress,
  }
}

function notify(entry: CacheEntry) {
  const snap = snapshotFromEntry(entry)
  for (const listener of entry.listeners) {
    listener(snap)
  }
}

function releaseEntry(key: string, entry: CacheEntry) {
  entry.refCount -= 1
  if (entry.refCount > 0) return

  entry.abortController?.abort()
  if (entry.blobUrl) {
    URL.revokeObjectURL(entry.blobUrl)
  }
  cache.delete(key)
}

async function fetchBlobForKey(
  key: string,
  raw: string,
  entry: CacheEntry
): Promise<void> {
  const relativePath = extractRelativePath(raw)
  if (!relativePath) {
    entry.status = "ready"
    entry.blobUrl = raw.trim()
    entry.progress = 100
    notify(entry)
    return
  }

  const controller = new AbortController()
  entry.abortController = controller
  entry.status = "loading"
  entry.progress = 0
  notify(entry)

  try {
    const response = await apiClient.get("/api/file/v1/file", {
      params: { relativePath },
      responseType: "blob",
      signal: controller.signal,
      onDownloadProgress: (event) => {
        const total = event.total ?? 0
        if (total > 0) {
          entry.progress = Math.min(
            99,
            Math.round((event.loaded / total) * 100)
          )
        } else if (event.loaded > 0) {
          entry.progress = null
        }
        notify(entry)
      },
    })

    if (controller.signal.aborted) return

    const current = cache.get(key)
    if (!current || current !== entry) return

    entry.blobUrl = URL.createObjectURL(response.data as Blob)
    entry.status = "ready"
    entry.progress = 100
    entry.abortController = undefined
    notify(entry)
  } catch (err) {
    if (controller.signal.aborted) return

    const current = cache.get(key)
    if (!current || current !== entry) return

    entry.status = "error"
    entry.progress = null
    entry.abortController = undefined
    notify(entry)
  }
}

function ensureLoading(key: string, raw: string, entry: CacheEntry) {
  if (entry.status === "loading" || entry.status === "ready") return
  void fetchBlobForKey(key, raw, entry)
}

/**
 * Subscribe to a cached file-service blob URL. Multiple subscribers share one fetch.
 */
export function subscribeFileObjectUrl(
  raw: string,
  listener: Listener
): () => void {
  const trimmed = raw.trim()
  if (!trimmed) {
    listener({ status: "idle", src: undefined, progress: null })
    return () => {}
  }

  if (isPassthroughUrl(trimmed)) {
    listener({ status: "ready", src: trimmed, progress: 100 })
    return () => {}
  }

  const key = resolveFileObjectUrlCacheKey(trimmed)
  if (!key) {
    listener({ status: "ready", src: trimmed, progress: 100 })
    return () => {}
  }

  let entry = cache.get(key)
  if (!entry) {
    entry = {
      status: "idle",
      progress: null,
      refCount: 0,
      listeners: new Set(),
    }
    cache.set(key, entry)
  }

  entry.refCount += 1
  entry.listeners.add(listener)
  listener(snapshotFromEntry(entry))
  ensureLoading(key, trimmed, entry)

  return () => {
    const current = cache.get(key)
    if (!current) return
    current.listeners.delete(listener)
    releaseEntry(key, current)
  }
}

/** Clears a cached blob (e.g. after replace upload). */
export function invalidateFileObjectUrlCache(raw: string): void {
  const key = resolveFileObjectUrlCacheKey(raw.trim())
  if (!key) return
  const entry = cache.get(key)
  if (!entry) return
  entry.abortController?.abort()
  if (entry.blobUrl) URL.revokeObjectURL(entry.blobUrl)
  cache.delete(key)
}
