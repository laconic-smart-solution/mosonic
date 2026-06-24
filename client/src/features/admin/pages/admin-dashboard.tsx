import { useMemo, useState } from "react"
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

import { PageShell } from "@/components/app/page-shell"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

import {
  useAdminCostTrend,
  useAdminNodeTypes,
  useAdminOverview,
  useAdminPipelineTrend,
  useAdminUserGrowth,
} from "../hooks/use-admin-dashboard"

function toChartData(record: Record<string, number> | undefined) {
  if (!record) return []
  return Object.entries(record)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date: date.slice(5), value }))
}

export default function AdminDashboardPage() {
  const { t } = useTranslation("admin")
  const [days, setDays] = useState(30)
  const { data: overview } = useAdminOverview()
  const { data: userGrowth } = useAdminUserGrowth(days)
  const { data: pipelineTrend } = useAdminPipelineTrend(days)
  const { data: costTrend } = useAdminCostTrend(days)
  const { data: nodeTypes } = useAdminNodeTypes()

  const userChart = useMemo(() => toChartData(userGrowth as Record<string, number>), [userGrowth])
  const pipeChart = useMemo(
    () => toChartData(pipelineTrend as Record<string, number>),
    [pipelineTrend],
  )
  const costChart = useMemo(() => toChartData(costTrend as Record<string, number>), [costTrend])

  const mtdCost =
    overview != null ? `$${Number(overview.cost.totalThisMonthUsd).toFixed(4)}` : "—"

  return (
    <PageShell>
      <div className="w-full space-y-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <h1 className="text-2xl font-bold tracking-tight">{t("dashboard.title")}</h1>
          <div className="flex flex-wrap gap-2">
            {[7, 14, 30].map((d) => (
              <Button
                key={d}
                type="button"
                size="sm"
                variant={days === d ? "default" : "outline"}
                onClick={() => setDays(d)}
              >
                {d}d
              </Button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={t("dashboard.totalUsers")} value={overview?.users.total ?? "—"} />
          <StatCard label={t("dashboard.newThisMonth")} value={overview?.users.newThisMonth ?? "—"} />
          <StatCard label={t("dashboard.activeThisMonth")} value={overview?.users.activeThisMonth ?? "—"} />
          <StatCard label={t("dashboard.pipelinesMtd")} value={overview?.usage.pipelinesThisMonth ?? "—"} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label={t("dashboard.contentMtd")} value={overview?.usage.contentThisMonth ?? "—"} />
          <StatCard label={t("dashboard.platformCostMtd")} value={mtdCost} />
          <StatCard label={t("dashboard.newThisWeek")} value={overview?.users.newThisWeek ?? "—"} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard title={t("dashboard.userGrowth")}>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={userChart}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title={t("dashboard.pipelinesRun")}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={pipeChart} barSize={16}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" fill="hsl(142 76% 36%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard title={t("dashboard.platformCost")}>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={costChart}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(value) => [`$${Number(value ?? 0).toFixed(6)}`, t("dashboard.costTooltip")]} />
                <Line type="monotone" dataKey="value" stroke="hsl(32 95% 44%)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title={t("dashboard.nodeTypeUsage")}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={nodeTypes ?? []} layout="vertical" barSize={14}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="nodeType" tick={{ fontSize: 11 }} width={100} />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(262 83% 58%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>
    </PageShell>
  )
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  )
}
