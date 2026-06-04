import { eachDayOfInterval, format, startOfDay, subDays } from "date-fns"

import type {
  DashboardRecentActivityItem,
  DashboardWeeklyPerformance,
} from "@/shared/types/dashboard.type"

export type EngagementMetricKey = "reach" | "likes" | "comments" | "clicks"

export type EngagementRow = { metricKey: EngagementMetricKey; value: number }

export function weeklyEngagementRows(
  perf: DashboardWeeklyPerformance | undefined,
): EngagementRow[] {
  if (!perf) {
    return [
      { metricKey: "reach", value: 0 },
      { metricKey: "likes", value: 0 },
      { metricKey: "comments", value: 0 },
      { metricKey: "clicks", value: 0 },
    ]
  }
  return [
    { metricKey: "reach", value: Math.max(0, perf.reach) },
    { metricKey: "likes", value: Math.max(0, perf.likes) },
    { metricKey: "comments", value: Math.max(0, perf.comments) },
    { metricKey: "clicks", value: Math.max(0, perf.clicks) },
  ]
}

export type ActivityDayRow = { day: string; shortDate: string; events: number }

/** Counts recent activity items per calendar day for the last 7 days (inclusive). */
export function activityLast7Days(activity: DashboardRecentActivityItem[]): ActivityDayRow[] {
  const end = startOfDay(new Date())
  const start = subDays(end, 6)
  const days = eachDayOfInterval({ start, end })
  const counts = new Map<string, number>()
  for (const d of days) {
    counts.set(format(d, "yyyy-MM-dd"), 0)
  }
  for (const a of activity) {
    const key = format(startOfDay(new Date(a.at)), "yyyy-MM-dd")
    if (counts.has(key)) {
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return days.map((d) => {
    const key = format(d, "yyyy-MM-dd")
    return {
      day: format(d, "EEE"),
      shortDate: format(d, "MMM d"),
      events: counts.get(key) ?? 0,
    }
  })
}
