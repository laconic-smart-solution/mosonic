import { format, formatISO, startOfMonth, subDays } from "date-fns"

import i18n from "@/i18n"

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
  return i18n.t(`cost:range.${range}`)
}

export function rangeSpendSubtitle(range: CostDashboardRangeKey): string {
  if (range === "all") {
    return i18n.t("cost:range.allRecorded")
  }
  if (range === "month") {
    return i18n.t("cost:range.billing", {
      month: format(startOfMonth(new Date()), "MMMM yyyy"),
    })
  }
  const { from, to } = rangeToParams(range)
  if (from && to) {
    return `${from} → ${to}`
  }
  return ""
}
