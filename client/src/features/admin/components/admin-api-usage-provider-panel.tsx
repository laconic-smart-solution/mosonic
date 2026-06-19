import { useEffect, useId, useMemo, useState } from "react"
import { AlertCircle, ExternalLink, RefreshCw, Save } from "lucide-react"
import { useTranslation } from "react-i18next"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

import { AdminZernioAnalyticsSection } from "./admin-zernio-analytics-section"
import type {
  ApiProviderBillingSummary,
  ApiProviderId,
  ApiUsageI18nPrefix,
} from "../types/api-usage.types"

const panelClass = "overflow-hidden rounded-2xl border border-border bg-card"

function formatUsd(value: number | null | undefined, digits = 2) {
  if (value == null || Number.isNaN(value)) return "—"
  return `$${value.toFixed(digits)}`
}

type AdminApiUsageProviderPanelProps = {
  providerId: ApiProviderId
  i18nPrefix: ApiUsageI18nPrefix
  brandColor: string
  billingUrl: string
  data: ApiProviderBillingSummary | undefined
  isLoading: boolean
  isFetching: boolean
  error: unknown
  onRefresh: () => void
  onSavePrepaid: (amount: number) => Promise<void>
  isSaving: boolean
}

export function AdminApiUsageProviderPanel({
  providerId,
  i18nPrefix,
  brandColor,
  billingUrl,
  data,
  isLoading,
  isFetching,
  error,
  onRefresh,
  onSavePrepaid,
  isSaving,
}: AdminApiUsageProviderPanelProps) {
  const { t } = useTranslation("admin")
  const [prepaidInput, setPrepaidInput] = useState("")
  const [dirty, setDirty] = useState(false)
  const prepaidFieldId = useId()
  const sectionTitleId = useId()
  const progressId = useId()

  const showPrepaidForm = providerId === "openai"
  const isZernio = providerId === "zernio"
  const isHeygen = providerId === "heygen"

  useEffect(() => {
    if (!showPrepaidForm || data?.prepaidCreditUsd == null) return
    const next = String(data.prepaidCreditUsd)
    if (!dirty) {
      setPrepaidInput(next)
    }
  }, [data?.prepaidCreditUsd, dirty, showPrepaidForm])

  const chartConfig = {
    spend: {
      label: t(`${i18nPrefix}.chartSpend`),
      theme: { light: brandColor, dark: brandColor },
    },
  } satisfies ChartConfig

  const chartData = useMemo(() => {
    const rows = data?.dailySpend ?? []
    return rows.map((row) => ({
      date: row.date.slice(5),
      amountUsd: row.amountUsd,
    }))
  }, [data?.dailySpend])

  const spentHint = data?.spendFrom && data?.spendTo
    ? t(`${i18nPrefix}.totalSpentHint`, {
        from: data.spendFrom,
        to: data.spendTo,
      })
    : t(`${i18nPrefix}.totalSpentHintFallback`, {
        days: data?.spendDays ?? 180,
      })

  const prepaid = data?.prepaidCreditUsd ?? 0
  const spent = data?.totalSpentUsd
  const available = data?.totalAvailableUsd
  const usagePct =
    spent != null && prepaid > 0
      ? Math.min(100, Math.round((spent / prepaid) * 100))
      : spent != null && prepaid === 0
        ? 100
        : 0

  const apiKeyMissing =
    i18nPrefix === "openai"
      ? !data?.adminKeyConfigured
      : !data?.apiKeyConfigured

  const handleSave = async () => {
    const parsed = parseFloat(prepaidInput)
    if (Number.isNaN(parsed) || parsed < 0) {
      toast.error(t(`${i18nPrefix}.prepaidInvalid`))
      return
    }
    try {
      await onSavePrepaid(parsed)
      setDirty(false)
      toast.success(t(`${i18nPrefix}.saveSuccess`))
    } catch {
      toast.error(t(`${i18nPrefix}.saveError`))
    }
  }

  return (
    <section className={panelClass} aria-labelledby={sectionTitleId}>
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div>
          <h2
            id={sectionTitleId}
            className="font-heading text-[17px] tracking-tight text-foreground"
          >
            {t(`${i18nPrefix}.title`)}
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {t(`${i18nPrefix}.subtitle`)}
          </p>
          {data?.liveBalanceFromApi ? (
            <p className="mt-1 text-[12px] font-medium text-emerald-600 dark:text-emerald-400">
              {t(`${i18nPrefix}.liveBalanceBadge`)}
            </p>
          ) : null}
          {data?.billingType ? (
            <p className="mt-1 text-[12px] text-muted-foreground">
              {t("heygen.billingType", { type: data.billingType })}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onRefresh}
            disabled={isFetching}
            aria-label={t(`${i18nPrefix}.refresh`)}
          >
            <RefreshCw
              className={cn("mr-1.5 size-3.5", isFetching && "animate-spin")}
              aria-hidden
            />
            {t(`${i18nPrefix}.refresh`)}
          </Button>
          <a
            href={billingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent hover:text-accent-foreground"
          >
            {t(`${i18nPrefix}.openBilling`)}
            <ExternalLink className="ml-1.5 size-3.5" aria-hidden />
          </a>
        </div>
      </div>

      <div className="space-y-5 p-5">
        {apiKeyMissing ? (
          <div
            role="alert"
            className="flex gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-foreground"
          >
            <AlertCircle
              className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
              aria-hidden
            />
            <p>
              {i18nPrefix === "openai"
                ? t("openai.adminKeyMissing")
                : t(`${i18nPrefix}.apiKeyMissing`)}
            </p>
          </div>
        ) : null}

        {data?.syncError ? (
          <div
            role="alert"
            className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-foreground"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
            <p>{t(`${i18nPrefix}.syncError`, { message: data.syncError })}</p>
          </div>
        ) : null}

        {error ? (
          <div role="alert" className="text-sm text-destructive">
            {t(`${i18nPrefix}.loadError`)}
          </div>
        ) : null}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t(`${i18nPrefix}.loading`)}</p>
        ) : (
          <>
            {isZernio ? (
              <AdminZernioAnalyticsSection data={data} />
            ) : (
              <div
                className={cn(
                  "grid gap-2.5",
                  isHeygen ? "sm:grid-cols-2" : "sm:grid-cols-3",
                )}
              >
                {!isHeygen ? (
                  <MetricCard
                    label={t(`${i18nPrefix}.totalGranted`)}
                    value={formatUsd(prepaid)}
                    hint={t(`${i18nPrefix}.totalGrantedHint`)}
                  />
                ) : null}
                <MetricCard
                  label={t(`${i18nPrefix}.totalSpent`)}
                  value={formatUsd(spent)}
                  hint={spentHint}
                />
                <MetricCard
                  label={t(`${i18nPrefix}.totalAvailable`)}
                  value={formatUsd(available)}
                  hint={
                    data?.liveBalanceFromApi
                      ? t(`${i18nPrefix}.totalAvailableLiveHint`)
                      : t(`${i18nPrefix}.totalAvailableHint`)
                  }
                  valueClass={
                    available != null && !isHeygen && available < prepaid * 0.1
                      ? "text-destructive"
                      : available != null && !isHeygen && available < prepaid * 0.25
                        ? "text-amber-600 dark:text-amber-400"
                        : undefined
                  }
                />
              </div>
            )}

            {showPrepaidForm && spent != null && prepaid > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[12px] text-muted-foreground">
                  <span id={progressId}>{t(`${i18nPrefix}.usageProgress`)}</span>
                  <span className="font-mono tabular-nums">{usagePct}%</span>
                </div>
                <div
                  role="progressbar"
                  aria-labelledby={progressId}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={usagePct}
                  className="h-2.5 overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      usagePct >= 90
                        ? "bg-destructive"
                        : usagePct >= 75
                          ? "bg-amber-500"
                          : "bg-emerald-600",
                    )}
                    style={{
                      width: `${usagePct}%`,
                      backgroundColor: usagePct < 75 ? brandColor : undefined,
                    }}
                  />
                </div>
              </div>
            ) : null}

            <div
              className={cn(
                "grid gap-4",
                showPrepaidForm
                  ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]"
                  : "grid-cols-1",
              )}
            >
              {showPrepaidForm ? (
                <form
                  className="rounded-xl border border-border bg-muted/20 p-4"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void handleSave()
                  }}
                >
                  <Label htmlFor={prepaidFieldId} className="text-[13px] font-medium">
                    {t(`${i18nPrefix}.prepaidLabel`)}
                  </Label>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    {t(`${i18nPrefix}.prepaidHint`)}
                  </p>
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="min-w-0 flex-1">
                      <div className="relative">
                        <span
                          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
                          aria-hidden
                        >
                          $
                        </span>
                        <Input
                          id={prepaidFieldId}
                          type="number"
                          min={0}
                          step="0.01"
                          inputMode="decimal"
                          className="pl-7 font-mono tabular-nums"
                          value={prepaidInput}
                          onChange={(e) => {
                            setPrepaidInput(e.target.value)
                            setDirty(true)
                          }}
                          aria-describedby={`${prepaidFieldId}-hint`}
                        />
                      </div>
                      <p id={`${prepaidFieldId}-hint`} className="sr-only">
                        {t(`${i18nPrefix}.prepaidHint`)}
                      </p>
                    </div>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={!dirty || isSaving}
                      className="shrink-0"
                    >
                      <Save className="mr-1.5 size-3.5" aria-hidden />
                      {isSaving ? t(`${i18nPrefix}.saving`) : t(`${i18nPrefix}.save`)}
                    </Button>
                  </div>
                  {data?.updatedAt ? (
                    <p className="mt-3 text-[11px] text-muted-foreground">
                      {t(`${i18nPrefix}.lastUpdated`, {
                        date: new Date(data.updatedAt).toLocaleString(),
                      })}
                    </p>
                  ) : null}
                </form>
              ) : null}

              <DailySpendChart
                i18nPrefix={i18nPrefix}
                chartConfig={chartConfig}
                chartData={chartData}
                t={t}
              />
            </div>
          </>
        )}
      </div>
    </section>
  )
}

function DailySpendChart({
  i18nPrefix,
  chartConfig,
  chartData,
  t,
}: {
  i18nPrefix: ApiUsageI18nPrefix
  chartConfig: ChartConfig
  chartData: Array<{ date: string; amountUsd: number }>
  t: (key: string, options?: Record<string, unknown>) => string
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3">
        <h3 className="text-[13px] font-medium text-foreground">
          {t(`${i18nPrefix}.dailySpend`)}
        </h3>
      </div>
      {chartData.length === 0 ? (
        <div className="flex h-[180px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
          {t(`${i18nPrefix}.chartEmpty`)}
        </div>
      ) : (
        <ChartContainer config={chartConfig} className="aspect-auto h-[180px] w-full">
          <LineChart data={chartData} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => `$${v}`}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => `$${Number(value ?? 0).toFixed(4)}`}
                />
              }
            />
            <Line
              type="monotone"
              dataKey="amountUsd"
              stroke="var(--color-spend)"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ChartContainer>
      )}
    </div>
  )
}

function MetricCard({
  label,
  value,
  hint,
  valueClass,
}: {
  label: string
  value: string
  hint: string
  valueClass?: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 font-mono text-lg font-semibold tabular-nums text-foreground",
          valueClass,
        )}
      >
        {value}
      </div>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{hint}</p>
    </div>
  )
}
