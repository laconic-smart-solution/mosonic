import type { TFunction } from "i18next"

export function fmtMetric(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(Math.round(n))
}

export function relTime(iso: string, t: TFunction<"analytics">): string {
  const ts = new Date(iso).getTime()
  if (Number.isNaN(ts)) return iso
  const d = Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000))
  if (d <= 0) return t("relativeTime.today")
  if (d === 1) return t("relativeTime.oneDayAgo")
  return t("relativeTime.daysAgo", { count: d })
}

export function channelLabel(channel: string): string {
  const t = channel.trim()
  if (!t) return "—"
  return t.charAt(0).toUpperCase() + t.slice(1)
}
