import { io, type Socket } from "socket.io-client"

import { appConfig } from "@/app/config/app-config"
import { useAuthStore } from "@/shared/stores/auth.store"

type SocketHandler = (...args: unknown[]) => void
type JoinAck = { ok?: boolean; room?: string; error?: string }

let socketInstance: Socket | null = null
let connectedForAuth = false
const joinedRooms = new Set<string>()
const eventRegistry = new Map<string, Set<SocketHandler>>()

const JOIN_RETRY_DELAYS_MS = [100, 300, 700]

function attachRegistryToSocket(socket: Socket): void {
  for (const [event, handlers] of eventRegistry) {
    for (const handler of handlers) {
      socket.on(event, handler)
    }
  }
}

function detachRegistryFromSocket(socket: Socket): void {
  for (const [event, handlers] of eventRegistry) {
    for (const handler of handlers) {
      socket.off(event, handler)
    }
  }
}

function emitJoinWithRetry(socket: Socket, room: string, attempt = 0): void {
  socket.emit("join", { room }, (res: JoinAck | undefined) => {
    if (res?.ok) return
    if (attempt >= JOIN_RETRY_DELAYS_MS.length) return
    window.setTimeout(() => {
      if (!joinedRooms.has(room)) return
      if (socketInstance !== socket || !socket.connected) return
      emitJoinWithRetry(socket, room, attempt + 1)
    }, JOIN_RETRY_DELAYS_MS[attempt])
  })
}

function rejoinTrackedRooms(socket: Socket): void {
  for (const room of joinedRooms) {
    emitJoinWithRetry(socket, room)
  }
}

function onConnectRejoin(): void {
  if (socketInstance?.connected) {
    rejoinTrackedRooms(socketInstance)
  }
}

function attachSocketLifecycle(socket: Socket): void {
  socket.off("connect", onConnectRejoin)
  socket.on("connect", onConnectRejoin)
}

function destroySocketInstance(): void {
  if (!socketInstance) return
  detachRegistryFromSocket(socketInstance)
  socketInstance.off("connect", onConnectRejoin)
  socketInstance.disconnect()
  socketInstance = null
}

/**
 * Subscribe to a Socket.IO event on the shared connection.
 * Handlers survive socket recreation (session refresh / reconnect).
 */
export function subscribeSocketEvent(
  event: string,
  handler: SocketHandler,
): () => void {
  let handlers = eventRegistry.get(event)
  if (!handlers) {
    handlers = new Set()
    eventRegistry.set(event, handlers)
  }
  handlers.add(handler)

  const socket = socketInstance
  if (socket) {
    socket.on(event, handler)
  }

  return () => {
    const set = eventRegistry.get(event)
    set?.delete(handler)
    if (set?.size === 0) {
      eventRegistry.delete(event)
    }
    socketInstance?.off(event, handler)
  }
}

/**
 * Single shared Socket.IO connection for the app.
 * Auth is via HttpOnly access cookie (withCredentials); server reads the cookie.
 */
export function getSharedSocket(): Socket {
  const isAuthenticated = useAuthStore.getState().isAuthenticated

  if (socketInstance && connectedForAuth === isAuthenticated) {
    return socketInstance
  }

  destroySocketInstance()

  connectedForAuth = isAuthenticated
  socketInstance = io(appConfig.apiBaseUrl, {
    withCredentials: true,
    transports: ["websocket", "polling"],
  })
  attachSocketLifecycle(socketInstance)
  attachRegistryToSocket(socketInstance)

  if (socketInstance.connected) {
    rejoinTrackedRooms(socketInstance)
  }

  return socketInstance
}

/** Join a Socket.IO room; re-joins automatically on connect/reconnect. */
export function joinSocketRoom(room: string): Socket {
  const trimmed = room.trim()
  if (!trimmed) {
    return getSharedSocket()
  }

  joinedRooms.add(trimmed)
  const socket = getSharedSocket()

  const emitJoin = () => {
    emitJoinWithRetry(socket, trimmed)
  }

  if (socket.connected) {
    emitJoin()
  } else {
    socket.once("connect", emitJoin)
  }

  return socket
}

export function leaveSocketRoom(room: string): void {
  const trimmed = room.trim()
  if (!trimmed) return

  joinedRooms.delete(trimmed)
  const socket = socketInstance
  if (socket?.connected) {
    socket.emit("leave", { room: trimmed })
  }
}

export function disconnectSharedSocket(): void {
  joinedRooms.clear()
  destroySocketInstance()
  connectedForAuth = false
}
