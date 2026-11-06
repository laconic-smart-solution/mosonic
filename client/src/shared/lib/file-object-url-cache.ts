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

/** Backoff between retries of a failed file fetch (3 retries ? 4 attempts). */
export const FETCH_RETRY_DELAYS_MS = [400, 1200, 3000]

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener("abort", () => {
      clearTimeout(timer)
      resolve()
    }, { once: true })
  })
}

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
  rawByKey.delete(key)
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
    let response: { data: unknown } | undefined
    for (let attempt = 0; ; attempt++) {
      try {
        response = await apiClient.get("/api/file/v1/file", {
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
        break
      } catch (err) {
        if (controller.signal.aborted || attempt >= FETCH_RETRY_DELAYS_MS.length) {
          throw err
        }
        await sleep(FETCH_RETRY_DELAYS_MS[attempt], controller.signal)
        if (controller.signal.aborted) return
      }
    }

    if (controller.signal.aborted) return

    const current = cache.get(key)
    if (!current || current !== entry) return

    entry.blobUrl = URL.createObjectURL(response!.data as Blob)
    entry.status = "ready"
    entry.progress = 100
    entry.abortController = undefined
    notify(entry)
  } catch {
    if (controller.signal.aborted) return

    const current = cache.get(key)
    if (!current || current !== entry) return

    entry.status = "error"
    entry.progress = null
    entry.abortController = undefined
    notify(entry)
  }
}

/** Raw value per cache key, so errored entries can be re-fetched later. */
const rawByKey = new Map<string, string>()

function ensureLoading(key: string, raw: string, entry: CacheEntry) {
  rawByKey.set(key, raw)
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

/**
 * Re-fetch every errored entry that still has subscribers (e.g. after the
 * assets list refetches) so one failed load is never permanent.
 */
export function retryErroredFileObjectUrls(): void {
  for (const [key, entry] of cache) {
    if (entry.status !== "error" || entry.refCount <= 0) continue
    const raw = rawByKey.get(key)
    if (!raw) continue
    entry.status = "idle"
    ensureLoading(key, raw, entry)
  }
}
