import { useMemo, useState } from "react"
import { ChevronDown, X } from "lucide-react"

import { PageShell } from "@/components/app/page-shell"
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

import { Button } from "@/components/ui/button"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

import { useAdminUsageHistory, useAdminUsageSummary } from "../hooks/use-admin-usage"
import {
  AdminUserPickerDialog,
  type AdminUserPickerValue,
} from "../components/admin-user-picker-dialog"

const panelClass = "overflow-hidden rounded-2xl border border-border bg-card"

type DatePreset = "month" | "year" | null

function toDateInputValue(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function getThisMonthRange() {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return { from: toDateInputValue(from), to: toDateInputValue(to) }
}

function getThisYearRange() {
  const now = new Date()
  const from = new Date(now.getFullYear(), 0, 1)
  const to = new Date(now.getFullYear(), 11, 31)
  return { from: toDateInputValue(from), to: toDateInputValue(to) }
}

function num(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function formatUsd(value: unknown, digits: number): string {
  return num(value).toFixed(digits)
}

export default function AdminUsagePage() {
  const { t } = useTranslation("admin")
  const navigate = useNavigate()
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [datePreset, setDatePreset] = useState<DatePreset>(null)
  const [selectedUser, setSelectedUser] = useState<AdminUserPickerValue | null>(null)
  const [userPickerOpen, setUserPickerOpen] = useState(false)
  const [page, setPage] = useState(1)

  const chartConfig = {
    credits: {
      label: t("usage.colCredits"),
      theme: { light: "#00A589", dark: "#00C9A7" },
    },
    cost: {
      label: t("usage.colCost"),
      theme: { light: "#D48A0E", dark: "#F5A623" },
    },
  } satisfies ChartConfig

  const dateParams = useMemo(
    () => ({
      from: from || undefined,
      to: to || undefined,
      userId: selectedUser?.userId,
    }),
    [from, to, selectedUser?.userId],
  )

  const { data: summary } = useAdminUsageSummary(dateParams)
  const { data: history } = useAdminUsageHistory({
    ...dateParams,
    page,
    limit: 20,
  })

  const byNodeChart = (summary?.byNodeType ?? []).map(
    (row: {
      nodeType: string
      creditsCharged?: number
      creditsDeducted?: number
    }) => ({
      name: row.nodeType.replace(/_/g, " "),
      credits: num(row.creditsCharged ?? row.creditsDeducted),
    }),
  )

  const dailyChart = (summary?.dailyTrend ?? []).map(
    (row: {
      date: string
      creditsCharged?: number
      creditsDeducted?: number
      rawCostUsd?: number
      costUsd?: number
    }) => ({
      date: row.date.slice(5),
      credits: num(row.creditsCharged ?? row.creditsDeducted),
      cost: num(row.rawCostUsd ?? row.costUsd),
    }),
  )

  const topOperation =
    byNodeChart.length > 0
      ? [...byNodeChart].sort((a, b) => b.credits - a.credits)[0]?.name
      : "—"

  const applyDatePreset = (preset: Exclude<DatePreset, null>) => {
    const range = preset === "month" ? getThisMonthRange() : getThisYearRange()
    setFrom(range.from)
    setTo(range.to)
    setDatePreset(preset)
    setPage(1)
  }

  return (
    <PageShell>
      <div className="w-full space-y-6">
        <div>
          <h1 className="font-heading text-[26px] leading-tight tracking-tight text-foreground">
            {t("usage.title")}
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">{t("usage.pageSubtitle")}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={datePreset === "month" ? "default" : "outline"}
            onClick={() => applyDatePreset("month")}
          >
            {t("usage.rangeThisMonth")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={datePreset === "year" ? "default" : "outline"}
            onClick={() => applyDatePreset("year")}
          >
            {t("usage.rangeThisYear")}
          </Button>
          <Input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value)
              setDatePreset(null)
              setPage(1)
            }}
            className="w-40 [color-scheme:light] dark:[color-scheme:dark]"
          />
          <Input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value)
              setDatePreset(null)
              setPage(1)
            }}
            className="w-40 [color-scheme:light] dark:[color-scheme:dark]"
          />
          <div className="flex min-w-[220px] items-center gap-1">
            <Button
              type="button"
              variant="outline"
              className="h-9 min-w-0 flex-1 justify-between gap-2 px-3 font-normal"
              onClick={() => setUserPickerOpen(true)}
            >
              <span className="truncate text-left">
                {selectedUser?.email ?? selectedUser?.displayName ?? t("usage.allUsers")}
              </span>
              <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
            </Button>
            {selectedUser ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t("usage.clearUserFilter")}
                onClick={() => {
                  setSelectedUser(null)
                  setPage(1)
                }}
              >
                <X className="size-4" />
              </Button>
            ) : null}
          </div>
        </div>

        <AdminUserPickerDialog
          open={userPickerOpen}
          onOpenChange={setUserPickerOpen}
          selectedUserId={selectedUser?.userId}
          onSelect={(user) => {
            setSelectedUser(user)
            setPage(1)
          }}
        />

        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={t("usage.totalCredits")}
            value={num(
              summary?.totalCreditsCharged ??
                (summary as { totalCreditsDeducted?: number } | undefined)?.totalCreditsDeducted,
            ).toLocaleString()}
          />
          <StatCard
            label={t("usage.totalCost")}
            value={`$${formatUsd(
              summary?.totalRawCostUsd ??
                (summary as { totalCostUsd?: number } | undefined)?.totalCostUsd,
              4,
            )}`}
          />
          <StatCard label={t("usage.uniqueUsers")} value={summary?.uniqueUsers ?? "—"} />
          <StatCard label={t("usage.topOperation")} value={topOperation} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className={panelClass}>
            <div className="border-b border-border px-5 py-4">
              <h2 className="font-heading text-[17px] tracking-tight text-foreground">
                {t("usage.byOperation")}
              </h2>
            </div>
            <div className="p-5 pt-4">
              {byNodeChart.length === 0 ? (
                <ChartEmpty label={t("usage.chartEmpty")} />
              ) : (
                <ChartContainer config={chartConfig} className="aspect-auto h-[220px] w-full">
                  <BarChart data={byNodeChart} barSize={20}>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="name"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      tick={{ fontSize: 10 }}
                    />
                    <YAxis tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="credits" fill="var(--color-credits)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              )}
            </div>
          </section>

          <section className={panelClass}>
            <div className="border-b border-border px-5 py-4">
              <h2 className="font-heading text-[17px] tracking-tight text-foreground">
                {t("usage.dailyTrend")}
              </h2>
            </div>
            <div className="p-5 pt-4">
              {dailyChart.length === 0 ? (
                <ChartEmpty label={t("usage.chartEmpty")} />
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
                      yAxisId="credits"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis
                      yAxisId="cost"
                      orientation="right"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) => `$${v}`}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line
                      yAxisId="credits"
                      type="monotone"
                      dataKey="credits"
                      stroke="var(--color-credits)"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      yAxisId="cost"
                      type="monotone"
                      dataKey="cost"
                      stroke="var(--color-cost)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ChartContainer>
              )}
            </div>
          </section>
        </div>

        <section className={panelClass}>
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-heading text-[17px] tracking-tight text-foreground">
              {t("usage.byUser")}
            </h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("usage.colUser")}</TableHead>
                <TableHead>{t("usage.colPlan")}</TableHead>
                <TableHead className="text-right">{t("usage.colCredits")}</TableHead>
                <TableHead className="text-right">{t("usage.colCost")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(summary?.byUser ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    {t("usage.tableEmpty")}
                  </TableCell>
                </TableRow>
              ) : (
                (summary?.byUser ?? []).map(
                  (row: {
                    userId: string
                    email?: string
                    planName?: string
                    creditsCharged?: number
                    creditsDeducted?: number
                    rawCostUsd?: number
                    costUsd?: number
                  }) => (
                    <TableRow
                      key={row.userId}
                      className="cursor-pointer"
                      onClick={() => navigate(`/admin/users/${row.userId}`)}
                    >
                      <TableCell>{row.email ?? row.userId}</TableCell>
                      <TableCell className="text-muted-foreground">{row.planName ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {num(row.creditsCharged ?? row.creditsDeducted).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        ${formatUsd(row.rawCostUsd ?? row.costUsd, 4)}
                      </TableCell>
                    </TableRow>
                  ),
                )
              )}
            </TableBody>
          </Table>
        </section>

        <section className={panelClass}>
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-heading text-[17px] tracking-tight text-foreground">
              {t("usage.ledger")}
            </h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("credit.colDate")}</TableHead>
                <TableHead>{t("usage.colUser")}</TableHead>
                <TableHead>{t("credit.colOperation")}</TableHead>
                <TableHead>{t("credit.colProvider")}</TableHead>
                <TableHead className="text-right">{t("usage.colCredits")}</TableHead>
                <TableHead className="text-right">{t("usage.colCost")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(history?.entries ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    {t("usage.tableEmpty")}
                  </TableCell>
                </TableRow>
              ) : (
                (history?.entries ?? []).map(
                  (row: {
                    _id: string
                    createdAt: string
                    email?: string
                    userId: string
                    nodeType: string
                    provider: string
                    creditsCharged?: number
                    creditsDeducted?: number
                    rawCostUsd?: number
                    costUsd?: number
                  }) => (
                    <TableRow key={row._id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {new Date(row.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-sm">{row.email ?? row.userId}</TableCell>
                      <TableCell className="font-mono text-xs">{row.nodeType}</TableCell>
                      <TableCell className="text-muted-foreground">{row.provider}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {num(row.creditsCharged ?? row.creditsDeducted).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        ${formatUsd(row.rawCostUsd ?? row.costUsd, 6)}
                      </TableCell>
                    </TableRow>
                  ),
                )
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
              {t("usage.prev")}
            </Button>
            <span className="self-center text-sm text-muted-foreground">
              {page} / {history?.totalPages ?? 1}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={page >= (history?.totalPages ?? 1)}
              onClick={() => setPage((p) => p + 1)}
            >
              {t("usage.next")}
            </Button>
          </div>
        </section>
      </div>
    </PageShell>
  )
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-mono text-base font-semibold tabular-nums text-foreground">
        {value}
      </div>
    </div>
  )
}

function ChartEmpty({ label }: { label: string }) {
  return (
    <div
      className={cn(
        "flex h-[220px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-sm text-muted-foreground",
      )}
    >
      {label}
    </div>
  )
}
