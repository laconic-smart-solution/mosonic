import { useTranslation } from "react-i18next"

import { T } from "@/lib/tokens"

type Props = {
  totalUsd: number
  limitUsd: number | null
  warningPct: number
}

export function BudgetProgress({ totalUsd, limitUsd, warningPct }: Props) {
  const { t } = useTranslation("cost")

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
        <span style={{ color: T.textSecondary }}>{t("progress.usage")}</span>
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
        <span>{t("progress.spent", { amount: totalUsd.toFixed(4) })}</span>
        <span>{t("progress.limit", { amount: limitUsd.toFixed(2) })}</span>
      </div>
      {isWarn && !isOver ? (
        <p
          className="rounded-md px-3 py-2 text-xs"
          style={{ background: "#FEF3C7", color: "#92400E" }}
        >
          {t("progress.approaching", { pct: pct.toFixed(0) })}
        </p>
      ) : null}
      {isOver ? (
        <p
          className="rounded-md px-3 py-2 text-xs"
          style={{ background: "#FEE2E2", color: T.red }}
        >
          {t("progress.reached")}
        </p>
      ) : null}
    </div>
  )
}
