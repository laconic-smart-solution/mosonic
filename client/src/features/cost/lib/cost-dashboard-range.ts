import { format, formatISO, startOfMonth, subDays } from "date-fns"

export type CostDashboardRangeKey = "month" | "7d" | "30d" | "all"

export function rangeToParams(range: CostDashboardRangeKey): { from?: string; to?: string } {
  const to = formatISO(new Date(), { representation: "date" })
  if (range === "month") {
    return { from: formatISO(startOfMonth(new Date()), { representation: "date" }), to }
  }
  if (range === "7d") {
    return { from: formatISO(subDays(new Date(), 7), { representation: "date" }), to }
  }
  if (range === "30d") {
    return { from: formatISO(subDays(new Date(), 30), { representation: "date" }), to }
  }
  return {}
}

export function rangeSpendTitle(range: CostDashboardRangeKey): string {
  switch (range) {
    case "month":
      return "This month"
    case "7d":
      return "Last 7 days"
    case "30d":
      return "Last 30 days"
    case "all":
      return "All time"
  }
}

export function rangeSpendSubtitle(range: CostDashboardRangeKey): string {
  if (range === "all") {
    return "All recorded spend"
  }
  if (range === "month") {
    return `Billing: ${format(startOfMonth(new Date()), "MMMM yyyy")}`
  }
  const { from, to } = rangeToParams(range)
  if (from && to) {
    return `${from} → ${to}`
  }
  return ""
}
