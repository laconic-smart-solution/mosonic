import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { Formatter } from "recharts/types/component/DefaultTooltipContent"

import type { EngagementRow } from "@/features/dashboard/lib/dashboard-chart-data"

/** SVG-safe palette (matches `index.css` --chart-*); avoid `var()` in Recharts fills — often resolves to black. */
const BAR_COLORS = ["#00A589", "#254C94", "#F5A623", "#3FD8BA"] as const

type Props = {
  data: EngagementRow[]
  className?: string
}

function formatTick(n: number): string {
  if (!Number.isFinite(n)) return "0"
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n)
}

export function DashboardEngagementChart({ data, className }: Props) {
  const tooltipFormatter: Formatter = (value) => [
    formatTick(Number(Array.isArray(value) ? value[0] : value ?? 0)),
    "This week",
  ]

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="18%">
          <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border/60" />
          <XAxis
            dataKey="metric"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            className="fill-muted-foreground"
          />
          <YAxis
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatTick}
            width={44}
            className="fill-muted-foreground"
          />
          <Tooltip
            cursor={{ fill: "rgba(0, 0, 0, 0.06)" }}
            contentStyle={{
              borderRadius: "12px",
              border: "1px solid hsl(var(--border))",
              background: "hsl(var(--popover))",
              fontSize: "12px",
            }}
            formatter={tooltipFormatter}
          />
          <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={48} stroke="transparent">
            {data.map((entry, i) => (
              <Cell key={entry.metric} fill={BAR_COLORS[i % BAR_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
