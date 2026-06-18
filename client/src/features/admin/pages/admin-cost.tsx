import { useMemo, useState } from "react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

import { Button } from "@/components/ui/button"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

import { useAdminCostSummary, useAdminMonthOverMonth } from "../hooks/use-admin-cost"

const panelClass = "overflow-hidden rounded-2xl border border-border bg-card"

type CostRange = "month" | "year" | "30d" | "90d"

function firstOfMonthIso() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
}

function firstOfYearIso() {
  const d = new Date()
  return new Date(d.getFullYear(), 0, 1).toISOString()
}

function daysAgoIso(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

function rangeToParams(range: CostRange): { from?: string; to?: string } {
  switch (range) {
    case "month":
      return { from: firstOfMonthIso() }
    case "year":
      return { from: firstOfYearIso() }
    case "30d":
      return { from: daysAgoIso(30) }
    case "90d":
      return { from: daysAgoIso(90) }
  }
}

const RANGE_OPTIONS: CostRange[] = ["month", "year", "30d", "90d"]

export default function AdminCostPage() {
  const { t } = useTranslation("admin")
  const navigate = useNavigate()
  const [range, setRange] = useState<CostRange>("month")

  const dateParams = useMemo(() => rangeToParams(range), [range])

  const chartConfig = {
    cost: {
      label: t("cost.costTooltip"),
      theme: { light: "#D48A0E", dark: "#F5A623" },
    },
  } satisfies ChartConfig

  const { data, isLoading } = useAdminCostSummary(dateParams)
  const { data: mom } = useAdminMonthOverMonth()

  const changePct = mom?.changePct
  const momColor =
    changePct == null
      ? ""
      : changePct > 0
        ? "text-destructive"
        : "text-emerald-600 dark:text-emerald-400"

  const providerRows = Object.entries((data?.byProvider as Record<string, number>) ?? {})
  const entryTypeRows = Object.entries((data?.byEntryType as Record<string, number>) ?? {})
  const dailyTrend = (data?.dailyTrend ?? []) as Array<{ date: string; costUsd: number }>
  const topUsers = (data?.topUsers ?? []) as Array<{
    userId: string
    email: string
    displayName?: string
    costUsd: number
  }>
  const byModel = (data?.byModel ?? []) as Array<{ model: string; count: number; costUsd: number }>

  const totalCost =
    data?.totalCostUsd != null ? `$${Number(data.totalCostUsd).toFixed(4)}` : "—"

  return (
    <div className="min-h-full bg-background px-7 py-8 pb-20">
      <div className="mx-auto max-w-[1180px] space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-[26px] leading-tight tracking-tight text-foreground">
              {t("cost.title")}
            </h1>
            <p className="mt-1 text-[13px] text-muted-foreground">{t("cost.pageSubtitle")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {RANGE_OPTIONS.map((r) => (
              <Button
                key={r}
                type="button"
                size="sm"
                variant={range === r ? "default" : "outline"}
                onClick={() => setRange(r)}
              >
                {r === "month"
                  ? t("cost.rangeMonth")
                  : r === "year"
                    ? t("cost.rangeThisYear")
                    : r === "30d"
                      ? t("cost.range30d")
                      : t("cost.range90d")}
              </Button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("cost.loading")}</p>
        ) : null}

        <div className="grid gap-2.5 sm:grid-cols-3">
          <StatCard label={t("cost.totalPlatformCost")} value={totalCost} />
          {mom ? (
            <>
              <StatCard
                label={t("cost.lastMonth")}
                value={`$${Number(mom.lastMonth.totalUsd).toFixed(4)}`}
              />
              <StatCard
                label={t("cost.monthOverMonth")}
                value={changePct != null ? `${changePct > 0 ? "+" : ""}${changePct}%` : "—"}
                valueClass={momColor}
              />
            </>
          ) : (
            <>
              <StatCard label={t("cost.lastMonth")} value="—" />
              <StatCard label={t("cost.monthOverMonth")} value="—" />
            </>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <BreakdownPanel title={t("cost.byProvider")} rows={providerRows} />
          <BreakdownPanel title={t("cost.byEntryType")} rows={entryTypeRows} capitalizeLabels />
        </div>

        <section className={panelClass}>
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-heading text-[17px] tracking-tight text-foreground">
              {t("cost.dailyTrend")}
            </h2>
          </div>
          <div className="p-5 pt-4">
            {dailyTrend.length === 0 ? (
              <ChartEmpty label={t("cost.chartEmpty")} />
            ) : (
              <ChartContainer config={chartConfig} className="aspect-auto h-[220px] w-full">
                <LineChart data={dailyTrend}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => String(v).slice(5)}
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
                        formatter={(value) =>
                          `$${Number(value ?? 0).toFixed(6)}`
                        }
                      />
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="costUsd"
                    stroke="var(--color-cost)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ChartContainer>
            )}
          </div>
        </section>

        <section className={panelClass}>
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-heading text-[17px] tracking-tight text-foreground">
              {t("cost.topUsers")}
            </h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("cost.tableUser")}</TableHead>
                <TableHead className="text-right">{t("cost.tableCostUsd")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className="py-8 text-center text-muted-foreground">
                    {t("cost.tableEmpty")}
                  </TableCell>
                </TableRow>
              ) : (
                topUsers.map((u, i) => (
                  <TableRow
                    key={u.userId}
                    className="cursor-pointer"
                    onClick={() => navigate(`/admin/users/${u.userId}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">#{i + 1}</span>
                        <div>
                          <div className="font-medium">{u.email}</div>
                          {u.displayName ? (
                            <div className="text-xs text-muted-foreground">{u.displayName}</div>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      ${Number(u.costUsd).toFixed(6)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </section>

        <section className={panelClass}>
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-heading text-[17px] tracking-tight text-foreground">
              {t("cost.costByModel")}
            </h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("cost.tableModel")}</TableHead>
                <TableHead className="text-right">{t("cost.tableCalls")}</TableHead>
                <TableHead className="text-right">{t("cost.tableCostUsd")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byModel.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                    {t("cost.tableEmpty")}
                  </TableCell>
                </TableRow>
              ) : (
                byModel.map((m) => (
                  <TableRow key={m.model}>
                    <TableCell className="font-mono text-sm">{m.model}</TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {m.count}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      ${Number(m.costUsd).toFixed(6)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </section>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  valueClass,
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-1 font-mono text-base font-semibold tabular-nums text-foreground", valueClass)}>
        {value}
      </div>
    </div>
  )
}

function BreakdownPanel({
  title,
  rows,
  capitalizeLabels = false,
}: {
  title: string
  rows: [string, number][]
  capitalizeLabels?: boolean
}) {
  const { t } = useTranslation("admin")

  return (
    <section className={panelClass}>
      <div className="border-b border-border px-5 py-4">
        <h2 className="font-heading text-[17px] tracking-tight text-foreground">{title}</h2>
      </div>
      <div className="px-2 py-2">
        {rows.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            {t("cost.emptyBreakdown")}
          </p>
        ) : (
          rows.map(([key, value]) => (
            <div
              key={key}
              className="flex items-center justify-between rounded-[9px] px-3 py-[11px] transition-colors hover:bg-muted/60"
            >
              <span
                className={cn(
                  "text-[13px] text-muted-foreground",
                  capitalizeLabels && "capitalize",
                )}
              >
                {key}
              </span>
              <span className="font-mono text-[13px] font-medium tabular-nums text-foreground">
                ${Number(value).toFixed(6)}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

function ChartEmpty({ label }: { label: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
      {label}
    </div>
  )
}
