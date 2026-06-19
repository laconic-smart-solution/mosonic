import { useEffect, useMemo, useState } from "react"
import { Info } from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { rangeToParams, type UsageRangeKey } from "@/features/usage/lib/usage-range"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip as UiTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { T } from "@/lib/tokens"
import {
  useUsageHistoryQuery,
  useUsageSummaryQuery,
  useCreditBalanceSocketRefresh,
} from "@/shared/queries/usage.query"
import { onCreditLowBalance } from "@/shared/socket/credit-events"

const RANGES: UsageRangeKey[] = ["month", "7d", "30d", "all"]

function formatCredits(value: number): string {
  return Math.round(value).toLocaleString()
}

export default function UsagePage() {
  const { t } = useTranslation("usage")
  const { t: tc } = useTranslation("common")
  useCreditBalanceSocketRefresh()
  const [range, setRange] = useState<UsageRangeKey>("month")
  const [page, setPage] = useState(1)
  const [lowBalance, setLowBalance] = useState(false)

  const dateParams = useMemo(() => rangeToParams(range), [range])
  const summary = useUsageSummaryQuery()
  const history = useUsageHistoryQuery({ ...dateParams, page, limit: 20 })

  useEffect(() => {
    return onCreditLowBalance((payload) => {
      setLowBalance(true)
      toast.warning(t("planBanner.lowBalance"), {
        description: t("planBanner.remaining", {
          count: formatCredits(payload.creditsRemaining),
        }),
      })
    })
  }, [t])

  const data = summary.data
  const creditPriceUsd = data?.creditPriceUsd ?? 0.01
  const creditsPerDollar = Math.round(1 / creditPriceUsd)
  const creditsPerMonth = data?.creditsPerMonth ?? 0
  const creditsUsed = data?.creditsUsed ?? 0
  const percentUsed = data?.percentUsed ?? 0

  const byTypeChart = (data?.byNodeType ?? []).map((row) => ({
    name: row.nodeType.replace(/_/g, " "),
    credits: row.creditsCharged,
  }))

  const dailyChart = (data?.dailyTrend ?? []).map((row) => ({
    date: row.date.slice(5),
    credits: row.creditsCharged,
  }))

  const topOp =
    byTypeChart.length > 0
      ? [...byTypeChart].sort((a, b) => b.credits - a.credits)[0]?.name
      : "—"

  const resetDate = data?.billingPeriod
    ? new Date(data.billingPeriod)
    : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)

  return (
    <TooltipProvider>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-8">
        <div>
          <h1 className="m-0 text-2xl font-bold tracking-tight" style={{ color: T.textPrimary }}>
            {t("title")}
          </h1>
          <p className="mt-1.5 text-[13px]" style={{ color: T.textSecondary }}>
            {t("subtitle")}
          </p>
        </div>

        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-muted-foreground text-xs uppercase tracking-wide">
                  {t("planBanner.plan")}
                </div>
                <div className="text-lg font-semibold">{data?.plan?.name ?? "—"}</div>
              </div>
              <div className="text-right text-sm text-muted-foreground">
                {t("planBanner.resetDate", {
                  date: resetDate.toLocaleDateString(),
                })}
              </div>
            </div>
            <Progress value={Math.min(percentUsed, 100)} className="h-2.5" />
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <span>
                {t("planBanner.creditsUsed", {
                  used: formatCredits(creditsUsed),
                  total: formatCredits(creditsPerMonth),
                })}
              </span>
              <span className="text-muted-foreground">
                {t("planBanner.remaining", {
                  count: formatCredits(data?.creditsRemaining ?? 0),
                })}
              </span>
            </div>
            {lowBalance || (creditsPerMonth > 0 && data && data.creditsRemaining / creditsPerMonth < 0.1) ? (
              <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                {t("planBanner.lowBalance")}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-2">
          {RANGES.map((key) => (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={range === key ? "default" : "outline"}
              onClick={() => {
                setRange(key)
                setPage(1)
              }}
            >
              {t(`range.${key}`)}
            </Button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label={t("summary.usedThisMonth")}
            value={formatCredits(creditsUsed)}
            tooltip={t("summary.rateTooltip", { count: creditsPerDollar })}
          />
          <StatCard label={t("summary.topOperation")} value={topOp} />
          <StatCard
            label={t("summary.totalGenerations")}
            value={data?.totalGenerations ?? history.data?.total ?? 0}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("charts.byType")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={byTypeChart} barSize={20}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="credits" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("charts.daily")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={dailyChart}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="credits" stroke="hsl(var(--primary))" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("ledger.title")}</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("ledger.date")}</TableHead>
                  <TableHead>{t("ledger.pipeline")}</TableHead>
                  <TableHead>{t("ledger.operation")}</TableHead>
                  <TableHead>{t("ledger.provider")}</TableHead>
                  <TableHead className="text-right">{t("ledger.credits")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(history.data?.entries ?? []).map((row) => (
                  <TableRow key={row._id ?? `${row.pipelineRef}-${row.createdAt}`}>
                    <TableCell className="text-sm">
                      {new Date(row.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="max-w-[140px] truncate font-mono text-xs">
                      {row.pipelineRef}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.nodeType}</TableCell>
                    <TableCell>{row.provider}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCredits(row.creditsCharged)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex justify-center gap-2 border-t border-border p-4">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                {tc("actions.back")}
              </Button>
              <span className="self-center text-sm text-muted-foreground">
                {page} / {history.data?.totalPages ?? 1}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={page >= (history.data?.totalPages ?? 1)}
                onClick={() => setPage((p) => p + 1)}
              >
                {tc("actions.next")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  )
}

function StatCard({
  label,
  value,
  tooltip,
}: {
  label: string
  value: string | number
  tooltip?: string
}) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
          {label}
          {tooltip ? (
            <UiTooltip>
              <TooltipTrigger className="inline-flex text-muted-foreground">
                <Info className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent>{tooltip}</TooltipContent>
            </UiTooltip>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  )
}
