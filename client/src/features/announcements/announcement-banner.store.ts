import { create } from "zustand"

import type { AnnouncementLevel } from "./api/announcements.api"

export type GlobalBannerKind = "announcement" | "low_credit"

export type GlobalBannerItem = {
  id: string
  kind: GlobalBannerKind
  level: AnnouncementLevel
  title: string
  message: string
  href: string
  /** i18n key under the announcements namespace */
  actionLabelKey: string
  publishedAt?: string
}

export const LOW_CREDIT_BANNER_ID = "low_credit"

const DISMISSED_KEY = "mosonic:global-banner:dismissed-ids"

function readDismissedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((v): v is string => typeof v === "string"))
  } catch {
    return new Set()
  }
}

function writeDismissedIds(ids: Set<string>) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]))
  } catch {
    // ignore
  }
}

function priority(item: GlobalBannerItem): number {
  if (item.kind === "announcement" && item.level === "critical") return 100
  if (item.kind === "announcement" && item.level === "warning") return 80
  if (item.kind === "low_credit") return 60
  return 40
}

type GlobalBannerState = {
  items: Record<string, GlobalBannerItem>
  dismissedIds: Set<string>
  upsert: (item: GlobalBannerItem, opts?: { forceShow?: boolean }) => void
  removeKind: (kind: GlobalBannerKind) => void
  dismiss: (id: string) => void
  getActive: () => GlobalBannerItem | null
}

export const useGlobalBannerStore = create<GlobalBannerState>((set, get) => ({
  items: {},
  dismissedIds: readDismissedIds(),

  upsert: (item, opts) => {
    set((state) => {
      const dismissedIds = new Set(state.dismissedIds)
      if (opts?.forceShow) {
        dismissedIds.delete(item.id)
        writeDismissedIds(dismissedIds)
      }
      const nextItems: Record<string, GlobalBannerItem> = {}
      for (const [id, existing] of Object.entries(state.items)) {
        if (existing.kind !== item.kind) nextItems[id] = existing
      }
      nextItems[item.id] = item
      return { items: nextItems, dismissedIds }
    })
  },

  removeKind: (kind) => {
    set((state) => {
      const nextItems: Record<string, GlobalBannerItem> = {}
      const dismissedIds = new Set(state.dismissedIds)
      for (const [id, existing] of Object.entries(state.items)) {
        if (existing.kind === kind) {
          dismissedIds.delete(id)
          continue
        }
        nextItems[id] = existing
      }
      // Low-credit uses a stable id even when the item was already removed.
      if (kind === "low_credit") dismissedIds.delete(LOW_CREDIT_BANNER_ID)
      writeDismissedIds(dismissedIds)
      return { items: nextItems, dismissedIds }
    })
  },

  dismiss: (id) => {
    set((state) => {
      const dismissedIds = new Set(state.dismissedIds)
      dismissedIds.add(id)
      writeDismissedIds(dismissedIds)
      return { dismissedIds }
    })
  },

  getActive: () => {
    const { items, dismissedIds } = get()
    const visible = Object.values(items).filter((item) => !dismissedIds.has(item.id))
    if (visible.length === 0) return null
    return visible.sort((a, b) => priority(b) - priority(a))[0] ?? null
  },
}))

export function upsertAnnouncementBanner(
  announcement: {
    id: string
    title: string
    message: string
    level?: AnnouncementLevel
    publishedAt?: string
  } | null,
  opts?: { forceShow?: boolean },
) {
  const store = useGlobalBannerStore.getState()
  if (!announcement) {
    store.removeKind("announcement")
    return
  }
  store.upsert(
    {
      id: announcement.id,
      kind: "announcement",
      level: announcement.level ?? "info",
      title: announcement.title,
      message: announcement.message,
      href: "/announcements",
      actionLabelKey: "banner.viewMore",
      publishedAt: announcement.publishedAt,
    },
    opts,
  )
}

export function upsertLowCreditBanner(args: {
  title: string
  message: string
  forceShow?: boolean
}) {
  useGlobalBannerStore.getState().upsert(
    {
      id: LOW_CREDIT_BANNER_ID,
      kind: "low_credit",
      level: "warning",
      title: args.title,
      message: args.message,
      href: "/usage/topup",
      actionLabelKey: "lowCredit.topUp",
    },
    { forceShow: args.forceShow },
  )
}
