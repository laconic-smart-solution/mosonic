import i18n from "@/i18n"
import { getIntlLocale } from "@/i18n/format"
import type { ContentStatus } from "@/shared/types/content.type"

export function formatRelativeTime(iso: string) {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return iso
  const diff = Date.now() - t
  const m = Math.floor(diff / 60000)
  if (m < 1) return i18n.t("content:relativeTime.justNow")
  if (m < 60) return i18n.t("content:relativeTime.minutesAgo", { count: m })
  const h = Math.floor(m / 60)
  if (h < 24) return i18n.t("content:relativeTime.hoursAgo", { count: h })
  const d = Math.floor(h / 24)
  if (d < 7) return i18n.t("content:relativeTime.daysAgo", { count: d })
  const w = Math.floor(d / 7)
  if (w < 5) return i18n.t("content:relativeTime.weeksAgo", { count: w })
  return new Intl.DateTimeFormat(getIntlLocale(i18n.language), {
    dateStyle: "medium",
  }).format(new Date(iso))
}

export function previewEmoji(status: ContentStatus): string {
  if (status === "approved") return "✓"
  if (status === "rejected") return "✕"
  return "◆"
}
