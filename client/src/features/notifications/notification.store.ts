import { create } from "zustand"

import type { AppNotificationPayload, NotificationItem } from "./notification.types"

const MAX_ITEMS = 50

type NotificationState = {
  items: NotificationItem[]
  unreadCount: number
  seenIds: Set<string>
  push: (payload: AppNotificationPayload) => boolean
  markAllRead: () => void
  markRead: (id: string) => void
  dismiss: (id: string) => void
  clearAll: () => void
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  items: [],
  unreadCount: 0,
  seenIds: new Set(),

  push(payload) {
    if (get().seenIds.has(payload.id)) {
      return false
    }
    const nextSeen = new Set(get().seenIds)
    nextSeen.add(payload.id)
    const item: NotificationItem = { ...payload, read: false }
    set((state) => {
      const items = [item, ...state.items].slice(0, MAX_ITEMS)
      return {
        items,
        unreadCount: items.filter((n) => !n.read).length,
        seenIds: nextSeen,
      }
    })
    return true
  },

  markAllRead() {
    set((state) => ({
      items: state.items.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }))
  },

  markRead(id) {
    set((state) => {
      const items = state.items.map((n) =>
        n.id === id ? { ...n, read: true } : n,
      )
      return {
        items,
        unreadCount: items.filter((n) => !n.read).length,
      }
    })
  },

  dismiss(id) {
    set((state) => {
      const items = state.items.filter((n) => n.id !== id)
      return {
        items,
        unreadCount: items.filter((n) => !n.read).length,
      }
    })
  },

  clearAll() {
    set({ items: [], unreadCount: 0 })
  },
}))
