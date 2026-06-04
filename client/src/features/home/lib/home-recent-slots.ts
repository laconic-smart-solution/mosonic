import { formatRelativeTime } from "@/features/content/components/content-list/content-list-format"
import {
  displayLinkedRef,
  listCardPrimaryTitle,
} from "@/features/content/lib/content-display"
import { HOME_RECENT_RAIL_COLORS } from "@/features/home/data/home-constants"
import type { ContentPageItem } from "@/shared/types/content.type"

export type HomeRecentContentSlot = {
  kind: "content"
  contentId: string
  uploadId?: string
  label: string
  initial: string
  color: string
  updated: string
}

export type HomeRecentEmptySlot = { kind: "empty" }

export type HomeRecentSlot = HomeRecentContentSlot | HomeRecentEmptySlot

function pickPublicLabel(item: ContentPageItem): string {
  const o = item.outputs
  const raw =
    o?.summary?.trim() ||
    o?.text?.trim() ||
    o?.transcription?.trim() ||
    o?.translatedText?.trim()
  if (raw) {
    const words = raw.split(/\s+/).filter(Boolean).slice(0, 10).join(" ")
    return words.length > 48 ? `${words.slice(0, 48)}…` : words
  }
  const campaign = displayLinkedRef(item.ruleRef, "campaign")
  if (campaign !== "—") return campaign
  return listCardPrimaryTitle(item.status)
}

function initialForLabel(label: string): string {
  const t = label.trim()
  if (!t) return "•"
  const ch = [...t][0]
  return ch && /\S/u.test(ch) ? ch.toUpperCase() : "•"
}

/** Up to three API rows, padded with empty slots so the rail always shows three rows. */
export function buildHomeRecentSlots(items: ContentPageItem[]): HomeRecentSlot[] {
  const colors = HOME_RECENT_RAIL_COLORS
  const slots: HomeRecentSlot[] = items.slice(0, 3).map((item, i) => {
    const label = pickPublicLabel(item)
    return {
      kind: "content",
      contentId: item.contentId,
      uploadId: item.uploadId,
      label,
      initial: initialForLabel(label),
      color: colors[i % colors.length]!,
      updated: formatRelativeTime(item.updatedAt),
    }
  })
  while (slots.length < 3) slots.push({ kind: "empty" })
  return slots
}
