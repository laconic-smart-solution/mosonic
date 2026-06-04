import { useTranslation } from "react-i18next"
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"
import type { Formatter } from "recharts/types/component/DefaultTooltipContent"

import { CostChartEmpty } from "@/features/cost/components/cost-chart-empty"
import { T } from "@/lib/tokens"

const COLORS: Record<string, string> = {
  openai: "#10a37f",
  anthropic: "#D97706",
  google: "#4285F4",
  groq: "#F55036",
  ollama: "#64748B",
  zernio: "#6366f1",
}

type Props = {
  byProvider: Record<string, number>
}

export function SpendByProviderChart({ byProvider }: Props) {
  const { t } = useTranslation("cost")
  const data = Object.entries(byProvider).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value: Number(value.toFixed(6)),
    key: name.toLowerCase(),
  }))

  if (!data.length) {
    return <CostChartEmpty label={t("charts.noSpend")} />
  }

  const spendTooltipFormatter: Formatter = (value) =>
    `$${Number(Array.isArray(value) ? value[0] : value ?? 0).toFixed(6)}`

  return (
    <div
      className="rounded-[10px] border p-4"
      style={{ background: T.surfaceBg, borderColor: T.surfaceBorder }}
    >
      <h3 className="mb-3 text-sm font-semibold" style={{ color: T.textPrimary }}>
        {t("charts.byProvider")}
      </h3>
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={56}
              outerRadius={88}
              paddingAngle={3}
              dataKey="value"
              nameKey="name"
            >
              {data.map((entry) => (
                <Cell key={entry.key} fill={COLORS[entry.key] ?? "#94a3b8"} />
              ))}
            </Pie>
            <Tooltip formatter={spendTooltipFormatter} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
