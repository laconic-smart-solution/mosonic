import { useMemo, useState } from "react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import { AdminLayout } from "../components/admin-layout"
import { useAdminCostSummary, useAdminMonthOverMonth } from "../hooks/use-admin-cost"

function firstOfMonthIso() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
}

function daysAgoIso(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

export default function AdminCostPage() {
  const [range, setRange] = useState<"month" | "30d" | "90d">("month")

  const dateParams = useMemo(() => {
    if (range === "month") return { from: firstOfMonthIso() }
    if (range === "30d") return { from: daysAgoIso(30) }
    return { from: daysAgoIso(90) }
  }, [range])

  const { data, isLoading } = useAdminCostSummary(dateParams)
  const { data: mom } = useAdminMonthOverMonth()

  const changePct = mom?.changePct
  const momColor =
    changePct == null ? "" : changePct > 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"

  return (
    <AdminLayout>
      <div className="space-y-6 p-6 md:p-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <h1 className="text-2xl font-bold tracking-tight">Cost admin</h1>
          <div className="flex flex-wrap gap-2">
            {(["month", "30d", "90d"] as const).map((r) => (
              <Button
                key={r}
                type="button"
                size="sm"
                variant={range === r ? "default" : "outline"}
                onClick={() => setRange(r)}
              >
                {r === "month" ? "This month" : r === "30d" ? "Last 30d" : "Last 90d"}
              </Button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-muted-foreground text-xs font-medium">
                Total platform cost
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums">
                ${data?.totalCostUsd != null ? Number(data.totalCostUsd).toFixed(4) : "—"}
              </div>
            </CardContent>
          </Card>
          {mom ? (
            <>
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-muted-foreground text-xs font-medium">Last month</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold tabular-nums">
                    ${Number(mom.lastMonth.totalUsd).toFixed(4)}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle className="text-muted-foreground text-xs font-medium">Month over month</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold tabular-nums ${momColor}`}>
                    {changePct != null ? `${changePct > 0 ? "+" : ""}${changePct}%` : "—"}
                  </div>
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">By provider</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {Object.entries((data?.byProvider as Record<string, number>) ?? {}).map(([k, v]) => (
                <div key={k} className="flex justify-between text-sm">
                  <span className="text-muted-foreground capitalize">{k}</span>
                  <span className="font-medium tabular-nums">${Number(v).toFixed(6)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">By entry type</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {Object.entries((data?.byEntryType as Record<string, number>) ?? {}).map(([k, v]) => (
                <div key={k} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="font-medium tabular-nums">${Number(v).toFixed(6)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Daily cost trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data?.dailyTrend ?? []}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(value) => [`$${Number(value ?? 0).toFixed(6)}`, "Cost"]} />
                <Line type="monotone" dataKey="costUsd" stroke="hsl(32 95% 44%)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Top users by spend</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead className="text-right">Cost (USD)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.topUsers ?? []).map(
                  (
                    u: { userId: string; email: string; displayName?: string; costUsd: number },
                    i: number,
                  ) => (
                    <TableRow key={u.userId}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground text-xs">#{i + 1}</span>
                          <div>
                            <div>{u.email}</div>
                            {u.displayName ? (
                              <div className="text-muted-foreground text-xs">{u.displayName}</div>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        ${Number(u.costUsd).toFixed(6)}
                      </TableCell>
                    </TableRow>
                  ),
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Cost by model</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">Cost (USD)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.byModel ?? []).map((m: { model: string; count: number; costUsd: number }) => (
                  <TableRow key={m.model}>
                    <TableCell className="font-mono text-sm">{m.model}</TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">{m.count}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      ${Number(m.costUsd).toFixed(6)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  )
}
