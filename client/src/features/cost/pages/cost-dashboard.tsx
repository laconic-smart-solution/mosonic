import { useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"

import { BudgetProgress } from "@/features/cost/components/budget-progress"
import { CostSummaryCards } from "@/features/cost/components/cost-summary-cards"
import { PipelineCostTable } from "@/features/cost/components/pipeline-cost-table"
import { SpendByDayChart } from "@/features/cost/components/spend-by-day-chart"
import { SpendByProviderChart } from "@/features/cost/components/spend-by-provider-chart"
import { SpendByTypeChart } from "@/features/cost/components/spend-by-type-chart"
import {
  rangeSpendSubtitle,
  rangeSpendTitle,
  rangeToParams,
  type CostDashboardRangeKey,
} from "@/features/cost/lib/cost-dashboard-range"
import { Button } from "@/components/ui/button"
import { T } from "@/lib/tokens"
import {
  useCostDashboardQuery,
  useCostPipelineQuery,
} from "@/shared/queries/cost.query"

export default function CostDashboardPage() {
  const { t } = useTranslation("cost")
  const { t: tc } = useTranslation("common")
  const [searchParams] = useSearchParams()
  const pipelineId = searchParams.get("pipeline")?.trim() || undefined

  const [range, setRange] = useState<CostDashboardRangeKey>("month")
  const dateParams = useMemo(() => rangeToParams(range), [range])

  const dashboard = useCostDashboardQuery(dateParams)
  const pipelineQ = useCostPipelineQuery(pipelineId)

  const summaryLoading =
    !dashboard.isError && (dashboard.isPending || dashboard.data == null)

  return (
    <div className="mx-auto flex w-full flex-col gap-6 px-6 py-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h1
            className="m-0 text-2xl font-bold tracking-[-0.5px]"
            style={{ color: T.textPrimary }}
          >
            {t("dashboard.title")}
          </h1>
          <p className="mt-1.5 text-[13px]" style={{ color: T.textSecondary }}>
            {t("dashboard.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["month", "7d", "30d", "all"] as const).map((r) => (
            <Button
              key={r}
              type="button"
              size="sm"
              variant={range === r ? "default" : "outline"}
              onClick={() => setRange(r)}
            >
              {rangeSpendTitle(r)}
            </Button>
          ))}
          <Button type="button" size="sm" variant="secondary">
            <Link to="/cost/budget">{t("dashboard.budgetSettings")}</Link>
          </Button>
        </div>
      </div>

      {dashboard.isError ? (
        <div
          className="rounded-[10px] border p-4 text-sm"
          style={{ borderColor: T.surfaceBorder, color: T.red }}
        >
          {t("dashboard.loadError")}{" "}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => dashboard.refetch()}
          >
            {tc("actions.retry")}
          </button>
        </div>
      ) : null}

      <CostSummaryCards
        rangeIsLoading={summaryLoading}
        rangeSpendTitle={rangeSpendTitle(range)}
        rangeSpendSubtitle={rangeSpendSubtitle(range)}
        rangeTotalUsd={dashboard.data?.totalUsd ?? 0}
      />

      {dashboard.data?.monthly ? (
        <div
          className="rounded-[10px] border p-4"
          style={{ background: T.surfaceBg, borderColor: T.surfaceBorder }}
        >
          <BudgetProgress
            totalUsd={dashboard.data.monthly.totalUsd}
            limitUsd={dashboard.data.monthly.limitUsd}
            warningPct={dashboard.data.monthly.warningPct}
          />
        </div>
      ) : null}

      {dashboard.isPending && !dashboard.data ? (
        <div className="text-sm" style={{ color: T.textSecondary }}>
          {t("dashboard.loadingCharts")}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <SpendByProviderChart byProvider={dashboard.data?.byProvider ?? {}} />
          <SpendByTypeChart byEntryType={dashboard.data?.byEntryType ?? {}} />
        </div>
      )}

      <SpendByDayChart byDay={dashboard.data?.byDay ?? {}} />

      {pipelineId ? (
        <PipelineCostTable
          data={pipelineQ.data}
          isLoading={pipelineQ.isLoading}
        />
      ) : null}
    </div>
  )
}
