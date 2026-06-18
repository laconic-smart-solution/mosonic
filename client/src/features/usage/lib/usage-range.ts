export type UsageRangeKey = "month" | "7d" | "30d" | "all"

export function rangeToParams(range: UsageRangeKey): { from?: string; to?: string } {
  if (range === "all") return {}
  const to = new Date()
  const from = new Date()
  if (range === "month") {
    from.setDate(1)
    from.setHours(0, 0, 0, 0)
  } else if (range === "7d") {
    from.setDate(from.getDate() - 7)
  } else if (range === "30d") {
    from.setDate(from.getDate() - 30)
  }
  return { from: from.toISOString(), to: to.toISOString() }
}
