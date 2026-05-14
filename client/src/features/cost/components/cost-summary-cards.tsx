import { useCostMonthlyQuery } from "@/shared/queries/cost.query"
import { T } from "@/lib/tokens"
import { format } from "date-fns"

function fmtMoney(n: number, digits = 4) {
  if (!Number.isFinite(n)) return "$0"
  return `$${n.toFixed(digits)}`
}

function StatBlock(props: {
  label: string
  value: string
  sub?: string
  highlight?: boolean
}) {
  return (
    <div
      className="rounded-[10px] p-4 pr-5"
      style={{
        background: T.surfaceBg,
        border: `1px solid ${props.highlight ? "#F59E0B" : T.surfaceBorder}`,
        boxShadow: T.surfaceShadow,
      }}
    >
      <div
        className="mb-2.5 text-[10px] font-bold tracking-wide uppercase"
        style={{ color: T.textMuted }}
      >
        {props.label}
      </div>
      <div
        className="mb-1 text-[28px] font-bold tracking-[-1px]"
        style={{ color: T.textPrimary }}
      >
        {props.value}
      </div>
      {props.sub ? (
        <div className="text-[11px]" style={{ color: T.textSecondary }}>
          {props.sub}
        </div>
      ) : null}
    </div>
  )
}

export function CostSummaryCards(props: {
  rangeTotalUsd: number
  rangeIsLoading: boolean
  rangeSpendTitle: string
  rangeSpendSubtitle: string
}) {
  const monthlyQ = useCostMonthlyQuery()

  if (props.rangeIsLoading || monthlyQ.isLoading || !monthlyQ.data) {
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-[120px] animate-pulse rounded-[10px]"
            style={{ background: `${T.surfaceBorder}33` }}
          />
        ))}
      </div>
    )
  }

  const monthly = monthlyQ.data
  const limit = monthly.limitUsd
  const usedPct = monthly.usedPct
  const remaining =
    limit != null && Number.isFinite(limit) ? Math.max(0, limit - monthly.totalUsd) : null
  const warn = usedPct != null && usedPct >= 80
  const bp = monthly.billingPeriod ? new Date(monthly.billingPeriod) : null
  const billingLabel =
    bp && !Number.isNaN(bp.getTime()) ? `Billing: ${format(bp, "MMMM yyyy")}` : ""

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <StatBlock
        label={props.rangeSpendTitle}
        value={fmtMoney(props.rangeTotalUsd)}
        sub={props.rangeSpendSubtitle}
      />
      <StatBlock
        label="Monthly budget"
        value={limit != null ? fmtMoney(limit, 2) : "No limit"}
        sub={usedPct != null ? `${usedPct}% used (${billingLabel || "this cycle"})` : "—"}
        highlight={warn}
      />
      <StatBlock
        label="Remaining (this cycle)"
        value={limit != null ? fmtMoney(remaining ?? 0) : "Unlimited"}
        sub={limit != null ? "vs monthly limit" : "no cap set"}
      />
    </div>
  )
}
