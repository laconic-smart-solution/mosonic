import { useEffect, useState, useSyncExternalStore } from "react"

import { chatService, type ChatRunProgress } from "@/shared/services/chat.service"
import { onChatRunProgress } from "@/shared/socket/chat-events"

type Entry = { progress: ChatRunProgress; receivedAt: number }

/** Shared run state so the thread card and the left workflow card show the same progress. */
const store = new Map<string, Entry>()
const listeners = new Set<() => void>()
let version = 0

function publish(progress: ChatRunProgress) {
  store.set(progress.pipelineId, { progress, receivedAt: Date.now() })
  version += 1
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

let socketBound = false
function bindSocket() {
  if (socketBound) return
  socketBound = true
  onChatRunProgress((payload) => publish(payload))
}

const POLL_MS = 5000

/** Live progress for one chat-started run: socket events plus a slow poll fallback. */
export function useChatRunProgress(
  sessionId: string,
  pipelineId: string,
  { live = true }: { live?: boolean } = {},
): Entry | null {
  useSyncExternalStore(subscribe, () => version)
  const [, setTick] = useState(0)

  useEffect(() => {
    bindSocket()
    let cancelled = false
    const load = async () => {
      try {
        const progress = await chatService.getRunProgress(sessionId, pipelineId)
        if (!cancelled) publish(progress)
      } catch {
        // socket events still update the card
      }
    }
    void load()
    if (!live) {
      return () => {
        cancelled = true
      }
    }
    const timer = setInterval(() => {
      const status = store.get(pipelineId)?.progress.status
      if (status && status !== "running") return
      void load()
    }, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [sessionId, pipelineId, live])

  // 1s tick for the local "time left" countdown while running.
  const running = live && store.get(pipelineId)?.progress.status === "running"
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(timer)
  }, [running])

  return store.get(pipelineId) ?? null
}

/** Most recent run that is still going, for the left workflow card. */
export function useActiveRunProgress(): Entry | null {
  useSyncExternalStore(subscribe, () => version)
  const [, setTick] = useState(0)
  let latest: Entry | null = null
  for (const entry of store.values()) {
    if (entry.progress.status !== "running") continue
    if (!latest || entry.receivedAt > latest.receivedAt) latest = entry
  }
  const running = latest !== null
  useEffect(() => {
    bindSocket()
    if (!running) return
    const timer = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(timer)
  }, [running])
  return latest
}
