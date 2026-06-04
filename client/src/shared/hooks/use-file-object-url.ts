import { useEffect, useState } from "react"

import {
  subscribeFileObjectUrl,
  type FileObjectUrlCacheSnapshot,
} from "@/shared/lib/file-object-url-cache"

export type FileObjectUrlState = FileObjectUrlCacheSnapshot

const IDLE: FileObjectUrlState = {
  status: "idle",
  src: undefined,
  progress: null,
}

export function useFileObjectUrl(
  value: string | undefined
): FileObjectUrlState {
  const [state, setState] = useState<FileObjectUrlState>(IDLE)

  useEffect(() => {
    const raw = value?.trim()
    if (!raw) {
      setState(IDLE)
      return () => {}
    }

    return subscribeFileObjectUrl(raw, setState)
  }, [value])

  return state
}

/** Convenience when only the resolved URL is needed. */
export function fileObjectUrlReadySrc(
  state: FileObjectUrlState
): string | undefined {
  return state.status === "ready" ? state.src : undefined
}
