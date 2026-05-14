import { T } from "@/lib/tokens"

type Props = {
  totalUsd: number
  limitUsd: number | null
  warningPct: number
}

export function BudgetProgress({ totalUsd, limitUsd, warningPct }: Props) {
  if (limitUsd == null || limitUsd <= 0) {
    return null
  }

  const pct = Math.min((totalUsd / limitUsd) * 100, 100)
  const isWarn = pct >= warningPct && pct < 100
  const isOver = pct >= 100

  const barColor = isOver ? T.red : isWarn ? "#D97706" : T.green

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span style={{ color: T.textSecondary }}>Monthly budget usage</span>
        <span
          className="font-medium"
          style={{ color: isOver ? T.red : isWarn ? "#D97706" : T.textPrimary }}
        >
          {pct.toFixed(1)}%
        </span>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full"
        style={{ background: `${T.surfaceBorder}55` }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: barColor }}
        />
      </div>
      <div
        className="flex justify-between text-[11px]"
        style={{ color: T.textMuted }}
      >
        <span>${totalUsd.toFixed(4)} spent</span>
        <span>${limitUsd.toFixed(2)} limit</span>
      </div>
      {isWarn && !isOver ? (
        <p
          className="rounded-md px-3 py-2 text-xs"
          style={{ background: "#FEF3C7", color: "#92400E" }}
        >
          Approaching monthly limit ({pct.toFixed(0)}% used).
        </p>
      ) : null}
      {isOver ? (
        <p
          className="rounded-md px-3 py-2 text-xs"
          style={{ background: "#FEE2E2", color: T.red }}
        >
          Monthly budget limit reached.
        </p>
      ) : null}
    </div>
  )
}
