import { useEffect, useState } from "react"
import apiClient from "@/shared/api/api-client"
import { extractRelativePath } from "@/shared/utils/file-url"

export function useFileObjectUrl(
  value: string | undefined
): string | undefined {
  const [src, setSrc] = useState<string | undefined>(undefined)

  useEffect(() => {
    let active = true
    let objectUrl: string | undefined
    const raw = value?.trim()
    if (!raw) {
      setSrc(undefined)
      return
    }

    if (
      raw.startsWith("data:") ||
      raw.startsWith("blob:") ||
      (raw.startsWith("http://") && !raw.includes("/api/file/v1/file?")) ||
      (raw.startsWith("https://") && !raw.includes("/api/file/v1/file?"))
    ) {
      setSrc(raw)
      return
    }

    const relativePath = extractRelativePath(raw)
    if (!relativePath) {
      setSrc(raw)
      return
    }

    void (async () => {
      try {
        const response = await apiClient.get("/api/file/v1/file", {
          params: { relativePath },
          responseType: "blob",
        })
        if (!active) return
        objectUrl = URL.createObjectURL(response.data as Blob)
        setSrc(objectUrl)
      } catch {
        if (!active) return
        setSrc(undefined)
      }
    })()

    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [value])

  return src
}
