import { io, type Socket } from "socket.io-client"

import { appConfig } from "@/app/config/app-config"
import { useAuthStore } from "@/shared/stores/auth.store"

let socketInstance: Socket | null = null
let connectedToken: string | null = null

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
    socketInstance.disconnect()
    socketInstance = null
  }

  connectedToken = token
  socketInstance = io(appConfig.apiBaseUrl, {
    withCredentials: true,
    transports: ["websocket", "polling"],
    auth: token ? { token } : {},
  })

  return socketInstance
}

export function disconnectSharedSocket(): void {
  if (socketInstance) {
    socketInstance.disconnect()
    socketInstance = null
  }
  connectedToken = null
}
