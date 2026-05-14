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

import { CostChartEmpty } from "@/features/cost/components/cost-chart-empty"
import { T } from "@/lib/tokens"

const LABELS: Record<string, string> = {
  openai_llm: "Text / LLM",
  openai_image: "Image",
  openai_video: "Video",
  zernio_account: "Zernio",
}

const COLORS: Record<string, string> = {
  openai_llm: "#10a37f",
  openai_image: "#f59e0b",
  openai_video: "#8b5cf6",
  zernio_account: "#6366f1",
}

type Props = {
  byEntryType: Record<string, number>
}

export function SpendByTypeChart({ byEntryType }: Props) {
  const data = Object.entries(byEntryType).map(([key, value]) => ({
    name: LABELS[key] ?? key,
    value: Number(value.toFixed(6)),
    key,
  }))

  if (!data.length) {
    return <CostChartEmpty label="No spend data for this range" />
  }

  const spendTooltipFormatter: Formatter = (value) =>
    `$${Number(Array.isArray(value) ? value[0] : value ?? 0).toFixed(6)}`

  return (
    <div
      className="rounded-[10px] border p-4"
      style={{ background: T.surfaceBg, borderColor: T.surfaceBorder }}
    >
      <h3 className="mb-3 text-sm font-semibold" style={{ color: T.textPrimary }}>
        Spend by type
      </h3>
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barSize={36}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
            <Tooltip formatter={spendTooltipFormatter} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {data.map((entry) => (
                <Cell key={entry.key} fill={COLORS[entry.key] ?? "#94a3b8"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
