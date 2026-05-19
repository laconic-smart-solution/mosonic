export function fmtMetric(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(Math.round(n))
}

export function relTime(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return iso
  const d = Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000))
  if (d <= 0) return "today"
  if (d === 1) return "1 day ago"
  return `${d} days ago`
}

export function channelLabel(channel: string): string {
  const t = channel.trim()
  if (!t) return "—"
  return t.charAt(0).toUpperCase() + t.slice(1)
}
