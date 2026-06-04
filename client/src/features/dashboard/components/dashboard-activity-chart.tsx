import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { Formatter } from "recharts/types/component/DefaultTooltipContent"

import { useTranslation } from "react-i18next"

import type { ActivityDayRow } from "@/features/dashboard/lib/dashboard-chart-data"

type Props = {
  data: ActivityDayRow[]
  className?: string
}

export function DashboardActivityChart({ data, className }: Props) {
  const { t } = useTranslation("dashboard")
  const tooltipFormatter: Formatter = (value) => [
    t("charts.events", {
      count: Number(Array.isArray(value) ? value[0] : value ?? 0),
    }),
    t("charts.activity"),
  ]

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="dashActivityFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00A589" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#00A589" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/60" />
          <XAxis
            dataKey="day"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            className="fill-muted-foreground"
          />
          <YAxis
            allowDecimals={false}
            width={28}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            className="fill-muted-foreground"
          />
          <Tooltip
            contentStyle={{
              borderRadius: "12px",
              border: "1px solid hsl(var(--border))",
              background: "hsl(var(--popover))",
              fontSize: "12px",
            }}
            labelFormatter={(_, payload) => {
              const row = payload?.[0]?.payload as ActivityDayRow | undefined
              return row?.shortDate ?? ""
            }}
            formatter={tooltipFormatter}
          />
          <Area
            type="monotone"
            dataKey="events"
            stroke="#00A589"
            strokeWidth={2}
            fill="url(#dashActivityFill)"
            dot={{ r: 3, fill: "#00A589", strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
