import { io, type Socket } from "socket.io-client"

import { appConfig } from "@/app/config/app-config"
import { useAuthStore } from "@/shared/stores/auth.store"

let socketInstance: Socket | null = null
let connectedToken: string | null = null
const joinedRooms = new Set<string>()

function rejoinTrackedRooms(socket: Socket): void {
  for (const room of joinedRooms) {
    socket.emit("join", { room })
  }
}

function attachSocketLifecycle(socket: Socket): void {
  socket.on("connect", () => {
    rejoinTrackedRooms(socket)
  })
}

/**
 * Single shared Socket.IO connection for the app.
 * Passes JWT via handshake.auth so the server can join `user:{userId}`.
 */
export function getSharedSocket(): Socket {
  const token = useAuthStore.getState().accessToken?.trim() ?? null

  if (socketInstance && connectedToken === token) {
    return socketInstance
  }

  if (socketInstance) {
    socketInstance.removeAllListeners()
    socketInstance.disconnect()
    socketInstance = null
  }

  connectedToken = token
  socketInstance = io(appConfig.apiBaseUrl, {
    withCredentials: true,
    transports: ["websocket", "polling"],
    auth: token ? { token } : {},
  })
  attachSocketLifecycle(socketInstance)

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
    socket.emit("join", { room: trimmed })
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
  if (socketInstance) {
    socketInstance.removeAllListeners()
    socketInstance.disconnect()
    socketInstance = null
  }
  connectedToken = null
}
