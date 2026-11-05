import type { ChatMessage, ChatMessagePage } from "@/shared/services/chat.service"

/**
 * Infinite-query pages arrive newest page first; the thread wants one oldest-first list.
 * Messages repeated across pages (a refetch shifted the window) are kept once.
 * `historicalIds` = messages that only came from older pages (render without live updates).
 */
export function flattenChatMessagePages(pages: ChatMessagePage[] | undefined): {
  messages: ChatMessage[]
  historicalIds: Set<string>
} {
  const messages: ChatMessage[] = []
  const historicalIds = new Set<string>()
  if (!pages || pages.length === 0) return { messages, historicalIds }
  const seen = new Set<string>()
  const newest = new Set(pages[0].messages.map((m) => m.messageId))
  for (let i = pages.length - 1; i >= 0; i -= 1) {
    for (const message of pages[i].messages) {
      if (seen.has(message.messageId)) continue
      seen.add(message.messageId)
      messages.push(message)
      if (!newest.has(message.messageId)) historicalIds.add(message.messageId)
    }
  }
  return { messages, historicalIds }
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** Local-day key, so dividers only appear where the day changes. */
export function chatDayKey(iso: string): number {
  return startOfDay(new Date(iso))
}

/** "today" | "yesterday" | a short localized date ("Oct 30", year added when not this year). */
export function chatDayLabel(
  iso: string,
  locale: string,
  now: Date = new Date(),
): { kind: "today" | "yesterday" } | { kind: "date"; text: string } {
  const date = new Date(iso)
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)
  if (diffDays === 0) return { kind: "today" }
  if (diffDays === 1) return { kind: "yesterday" }
  const text = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  }).format(date)
  return { kind: "date", text }
}
