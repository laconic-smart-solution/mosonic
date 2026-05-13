import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { Formatter } from "recharts/types/component/DefaultTooltipContent"

import { CostChartEmpty } from "@/features/cost/components/cost-chart-empty"
import { T } from "@/lib/tokens"

type Props = {
  byDay: Record<string, number>
}

export function SpendByDayChart({ byDay }: Props) {
  const data = Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({
      date: date.slice(5),
      value: Number(value.toFixed(6)),
    }))

  if (!data.length) {
    return <CostChartEmpty label="No daily spend for this range" />
  }

  const spendTooltipFormatter: Formatter = (value) =>
    `$${Number(Array.isArray(value) ? value[0] : value ?? 0).toFixed(6)}`

  return (
    <div
      className="rounded-[10px] border p-4"
      style={{ background: T.surfaceBg, borderColor: T.surfaceBorder }}
    >
      <h3 className="mb-3 text-sm font-semibold" style={{ color: T.textPrimary }}>
        Daily spend
      </h3>
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
            <Tooltip formatter={spendTooltipFormatter} />
            <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
