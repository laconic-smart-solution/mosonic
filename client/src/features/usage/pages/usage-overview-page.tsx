import { useMemo, useState } from "react"
import { ExternalLink, Info } from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

import { rangeToParams, type UsageRangeKey } from "@/features/usage/lib/usage-range"
import { usagePanelClass } from "@/features/usage/components/usage-plan-banner"
import { navigateAfterPipelineSuccess } from "@/features/workflow/lib/pipeline-completion-nav"
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
import {
  Tooltip as UiTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import {
  useUsageHistoryQuery,
  useUsageSummaryQuery,
} from "@/shared/queries/usage.query"

const RANGES: UsageRangeKey[] = ["month", "7d", "30d", "all"]

const chartConfig = {
  credits: {
    label: "Credits",
    theme: { light: "#00A589", dark: "#00C9A7" },
  },
} satisfies ChartConfig

function formatCredits(value: number): string {
  return Math.round(value).toLocaleString()
}

function formatOperation(nodeType: string): string {
  return nodeType.replace(/_/g, " ")
}

export default function UsageOverviewPage() {
  const { t } = useTranslation("usage")
  const { t: tc } = useTranslation("common")
  const navigate = useNavigate()
  const [range, setRange] = useState<UsageRangeKey>("month")
  const [page, setPage] = useState(1)
  const [viewingPipeline, setViewingPipeline] = useState<string | null>(null)

  const dateParams = useMemo(() => rangeToParams(range), [range])
  const summary = useUsageSummaryQuery()
  const history = useUsageHistoryQuery({ ...dateParams, page, limit: 20 })

  const data = summary.data
  const creditPriceUsd = data?.creditPriceUsd ?? 0.01
  const creditsPerDollar = Math.round(1 / creditPriceUsd)
  const creditsUsed = data?.creditsUsed ?? 0

  const byTypeChart = (data?.byNodeType ?? []).map((row) => ({
    name: formatOperation(row.nodeType),
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

  const ledgerEntries = history.data?.entries ?? []

  const handleViewPipeline = async (pipelineRef: string) => {
    setViewingPipeline(pipelineRef)
    try {
      await navigateAfterPipelineSuccess(navigate, { pipelineId: pipelineRef })
    } finally {
      setViewingPipeline(null)
    }
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-6" role="tabpanel" aria-label={t("tabs.overview")}>
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

        <div className="grid gap-2.5 sm:grid-cols-3">
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

        <div className="grid gap-4 lg:grid-cols-2">
          <section className={usagePanelClass}>
            <div className="border-b border-border px-5 py-4">
              <h2 className="font-heading text-[17px] tracking-tight text-foreground">
                {t("charts.byType")}
              </h2>
            </div>
            <div className="p-5 pt-4">
              {byTypeChart.length === 0 ? (
                <ChartEmpty label={t("charts.empty")} />
              ) : (
                <ChartContainer config={chartConfig} className="aspect-auto h-[220px] w-full">
                  <BarChart data={byTypeChart} barSize={20}>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="name"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      tick={{ fontSize: 10 }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      tick={{ fontSize: 11 }}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="credits" fill="var(--color-credits)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              )}
            </div>
          </section>

          <section className={usagePanelClass}>
            <div className="border-b border-border px-5 py-4">
              <h2 className="font-heading text-[17px] tracking-tight text-foreground">
                {t("charts.daily")}
              </h2>
            </div>
            <div className="p-5 pt-4">
              {dailyChart.length === 0 ? (
                <ChartEmpty label={t("charts.empty")} />
              ) : (
                <ChartContainer config={chartConfig} className="aspect-auto h-[220px] w-full">
                  <LineChart data={dailyChart}>
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
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line
                      type="monotone"
                      dataKey="credits"
                      stroke="var(--color-credits)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ChartContainer>
              )}
            </div>
          </section>
        </div>

        <section className={usagePanelClass}>
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-heading text-[17px] tracking-tight text-foreground">
              {t("ledger.title")}
            </h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("ledger.date")}</TableHead>
                <TableHead>{t("ledger.operation")}</TableHead>
                <TableHead>{t("ledger.provider")}</TableHead>
                <TableHead className="text-right">{t("ledger.credits")}</TableHead>
                <TableHead className="w-[100px] text-right">{t("ledger.action")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledgerEntries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    {t("ledger.empty")}
                  </TableCell>
                </TableRow>
              ) : (
                ledgerEntries.map((row) => (
                  <TableRow key={row._id ?? `${row.pipelineRef}-${row.createdAt}`}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {new Date(row.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm capitalize">
                      {formatOperation(row.nodeType)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{row.provider}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatCredits(row.creditsCharged)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1.5 px-2.5"
                        disabled={!row.pipelineRef || viewingPipeline === row.pipelineRef}
                        onClick={() => void handleViewPipeline(row.pipelineRef)}
                      >
                        <ExternalLink className="size-3.5" aria-hidden />
                        {tc("actions.view")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
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
        </section>
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
    <div className={cn(usagePanelClass, "p-4")}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {label}
        {tooltip ? (
          <UiTooltip>
            <TooltipTrigger className="inline-flex text-muted-foreground">
              <Info className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </UiTooltip>
        ) : null}
      </div>
      <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-foreground">
        {value}
      </div>
    </div>
  )
}

function ChartEmpty({ label }: { label: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
      {label}
    </div>
  )
}
