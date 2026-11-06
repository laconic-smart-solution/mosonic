import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const get = vi.fn()
vi.mock("@/shared/api/api-client", () => ({ default: { get: (...a: unknown[]) => get(...a) } }))

import {
  FETCH_RETRY_DELAYS_MS,
  retryErroredFileObjectUrls,
  subscribeFileObjectUrl,
  type FileObjectUrlCacheSnapshot,
} from "./file-object-url-cache"

const url = (n: string) => `/api/file/v1/file?relativePath=rule-assets%2F${n}.png`

describe("subscribeFileObjectUrl retry", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    get.mockReset()
    URL.createObjectURL = vi.fn(() => "blob:ok")
    URL.revokeObjectURL = vi.fn()
  })
  afterEach(() => vi.useRealTimers())

  it("retries a failed fetch with backoff and ends ready", async () => {
    get.mockRejectedValueOnce(new Error("net")).mockRejectedValueOnce(new Error("net")).mockResolvedValue({ data: new Blob() })
    const states: FileObjectUrlCacheSnapshot[] = []
    const off = subscribeFileObjectUrl(url("a"), (s) => states.push(s))
    await vi.runAllTimersAsync()
    expect(get).toHaveBeenCalledTimes(3)
    expect(states.at(-1)?.status).toBe("ready")
    expect(states.some((s) => s.status === "error")).toBe(false)
    off()
  })

  it("errors after retries run out, then retryErroredFileObjectUrls re-fetches", async () => {
    get.mockRejectedValue(new Error("net"))
    const states: FileObjectUrlCacheSnapshot[] = []
    const off = subscribeFileObjectUrl(url("b"), (s) => states.push(s))
    await vi.runAllTimersAsync()
    expect(get).toHaveBeenCalledTimes(FETCH_RETRY_DELAYS_MS.length + 1)
    expect(states.at(-1)?.status).toBe("error")

    get.mockReset().mockResolvedValue({ data: new Blob() })
    retryErroredFileObjectUrls()
    await vi.runAllTimersAsync()
    expect(states.at(-1)?.status).toBe("ready")
    off()
  })
})
