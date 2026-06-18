import type { ComponentType } from "react"
import { useMemo } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts"
import {
  Eye,
  Heart,
  Loader2,
  MessageCircle,
  RefreshCw,
  TrendingUp,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  buildAnalyticsChartData,
  buildAnalyticsDisplayRows,
  sumAnalyticsTotals,
  type PostAnalyticsDisplayRow,
} from "@/features/posts/lib/post-detail-analytics.util"
import { cn } from "@/lib/utils"
import type {
  PostAnalyticsSnapshot,
  PostPlatformMetric,
  PostRecord,
} from "@/shared/types/post.type"

type Props = {
  post: PostRecord
  analytics: PostAnalyticsSnapshot | null | undefined
  busy?: boolean
  onRefresh?: () => void
  className?: string
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(Math.round(n))
}

function fmtIso(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString()
}

function syncStatusLabelKey(
  status: PostPlatformMetric["syncStatus"],
): string {
  switch (status) {
    case "synced":
      return "detail.analytics.platformStatus.synced"
    case "failed":
      return "detail.analytics.platformStatus.failed"
    case "unavailable":
      return "detail.analytics.platformStatus.unavailable"
    default:
      return "detail.analytics.platformStatus.awaiting"
  }
}

function overallDescriptionKey(
  analytics: PostAnalyticsSnapshot | null | undefined,
): string {
  if (!analytics) return "detail.analytics.notSyncedYet"
  switch (analytics.syncStatus) {
    case "synced":
      return "detail.analytics.lastSynced"
    case "partial":
      return "detail.analytics.partialSync"
    case "unavailable":
      return "detail.analytics.unavailable"
    default:
      return "detail.analytics.awaitingFirstSync"
  }
}

const chartConfig = {
  views: { label: "Views", color: "#00A589" },
  likes: { label: "Likes", color: "#254C94" },
  comments: { label: "Comments", color: "#F5A623" },
} satisfies ChartConfig

function StatTile({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="rounded-lg border bg-muted/20 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="size-3.5 shrink-0" aria-hidden />
        <span>{label}</span>
      </div>
      <p className="mt-1 font-heading text-lg font-semibold tracking-tight">{value}</p>
    </div>
  )
}

function PlatformRow({
  row,
  t,
}: {
  row: PostAnalyticsDisplayRow
  t: (key: string) => string
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
      <span className="capitalize font-medium">{row.platform}</span>
      <div className="flex flex-wrap items-center gap-2">
        {row.hasSyncedMetrics ? (
          <span className="inline-flex flex-wrap items-center gap-3 text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Eye className="size-3.5" aria-hidden />
              <span className="font-medium text-foreground">{fmtNum(row.metrics.views)}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <Heart className="size-3.5" aria-hidden />
              <span className="font-medium text-foreground">{fmtNum(row.metrics.likes)}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <MessageCircle className="size-3.5" aria-hidden />
              <span className="font-medium text-foreground">{fmtNum(row.metrics.comments)}</span>
            </span>
          </span>
        ) : (
          <Badge variant="secondary" className="text-[11px] font-normal">
            {t(syncStatusLabelKey(row.syncStatus))}
          </Badge>
        )}
      </div>
    </div>
  )
}

export function PostAnalyticsPanel({
  post,
  analytics,
  busy = false,
  onRefresh,
  className,
}: Props) {
  const { t } = useTranslation("posts")

  const rows = useMemo(
    () => buildAnalyticsDisplayRows(post, analytics),
    [post, analytics],
  )
  const totals = useMemo(() => sumAnalyticsTotals(rows), [rows])
  const chartData = useMemo(() => buildAnalyticsChartData(rows), [rows])

  const descKey = overallDescriptionKey(analytics)
  const description =
    descKey === "detail.analytics.lastSynced" && analytics?.pulledAt
      ? t(descKey, { date: fmtIso(analytics.pulledAt) })
      : t(descKey)

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div>
          <CardTitle className="text-base">{t("detail.analytics.title")}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {onRefresh ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0 gap-1.5"
            disabled={busy}
            onClick={onRefresh}
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="size-3.5" aria-hidden />
            )}
            {t("detail.analytics.refresh")}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile
            icon={Eye}
            label={t("detail.analytics.stats.views")}
            value={fmtNum(totals.views)}
          />
          <StatTile
            icon={Heart}
            label={t("detail.analytics.stats.likes")}
            value={fmtNum(totals.likes)}
          />
          <StatTile
            icon={MessageCircle}
            label={t("detail.analytics.stats.comments")}
            value={fmtNum(totals.comments)}
          />
          <StatTile
            icon={TrendingUp}
            label={t("detail.analytics.stats.engagement")}
            value={fmtNum(totals.engagement)}
          />
        </div>

        <div className="rounded-lg border bg-muted/10 p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            {t("detail.analytics.chartTitle")}
          </p>
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("detail.analytics.chartEmpty")}
            </p>
          ) : (
            <ChartContainer
              config={chartConfig}
              className={cn("aspect-auto h-[220px] w-full")}
            >
              <BarChart data={chartData} barGap={4} barCategoryGap="20%">
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="label"
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
                  width={36}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar dataKey="views" fill="var(--color-views)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="likes" fill="var(--color-likes)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="comments" fill="var(--color-comments)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            {t("detail.analytics.byPlatform")}
          </p>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("detail.analytics.noPlatforms")}
            </p>
          ) : (
            rows.map((row) => (
              <PlatformRow key={row.platform} row={row} t={t} />
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
