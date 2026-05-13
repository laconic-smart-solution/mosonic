import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { AxiosError } from "axios"
import { toast } from "sonner"
import { RefreshCwIcon, SparklesIcon } from "lucide-react"
import {
  analyticsQueryKeys,
  useAnalyticsListQuery,
  useAnalyticsPullMutation,
} from "@/shared/queries/analytics.query"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

function pullErrorMessage(e: unknown): string {
  if (e instanceof AxiosError) {
    const d = e.response?.data as { message?: string } | undefined
    if (typeof d?.message === "string" && d.message.trim()) return d.message
    return e.message || "Sync failed"
  }
  if (e instanceof Error) return e.message
  return "Sync failed"
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(Math.round(n))
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime()
  const d = Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000))
  if (d <= 0) return "today"
  if (d === 1) return "1 day ago"
  return `${d} days ago`
}

export default function AnalyticsListPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data, isLoading, isError } = useAnalyticsListQuery({ page: 1, limit: 50 })
  const pullMu = useAnalyticsPullMutation()
  const [pullingRuleId, setPullingRuleId] = useState<string | null>(null)

  const stats = useMemo(() => {
    const items = data?.analytics ?? []
    const totalRules = items.length
    const totalPending = items.reduce((acc, r) => acc + (r.pendingSuggestionCount || 0), 0)
    const lastPulledAt = items
      .map((r) => r.latest?.pulledAt)
      .filter((s): s is string => typeof s === "string" && s.length > 0)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
    return { totalRules, totalPending, lastPulledAt }
  }, [data])

  async function handleRowRefresh(ruleId: string) {
    setPullingRuleId(ruleId)
    try {
      await pullMu.mutateAsync(ruleId)
      void qc.invalidateQueries({ queryKey: analyticsQueryKeys.latest(ruleId) })
      toast.success("Analytics synced")
    } catch (e: unknown) {
      toast.error(pullErrorMessage(e))
    } finally {
      setPullingRuleId(null)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Performance by rule. Open a rule for channel breakdown and AI suggestions.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Rules</CardDescription>
            <CardTitle className="text-2xl">{isLoading ? <Skeleton className="h-7 w-14" /> : stats.totalRules}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending suggestions</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              {isLoading ? <Skeleton className="h-7 w-16" /> : stats.totalPending}
              {!isLoading && stats.totalPending > 0 ? <SparklesIcon className="h-4 w-4 text-muted-foreground" /> : null}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Last pull</CardDescription>
            <CardTitle className="text-base font-medium">
              {isLoading ? <Skeleton className="h-5 w-28" /> : stats.lastPulledAt ? relTime(stats.lastPulledAt) : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {isError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not load analytics</AlertTitle>
          <AlertDescription>Try refreshing the page.</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-5 w-52" />
                  <Skeleton className="mt-2 h-4 w-40" />
                </CardHeader>
                <CardContent className="pt-2">
                  <div className="flex flex-wrap gap-3">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                </CardContent>
              </Card>
            ))
          : (data?.analytics ?? []).map((row) => {
              const latest = row.latest
              const s = latest?.campaignSummary
              const syncing = pullingRuleId === row.ruleRef

              return (
                <Card
                  key={row.ruleRef}
                  className="group cursor-pointer transition hover:bg-muted/40"
                  onClick={() => navigate(`/analytics/${row.ruleRef}`)}
                >
                  <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
                    <div className="space-y-1">
                      <CardTitle className="text-base">{row.ruleName}</CardTitle>
                      <CardDescription>
                        {latest ? `Last pulled ${relTime(latest.pulledAt)}` : "No snapshot yet"}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {row.pendingSuggestionCount > 0 ? (
                        <Badge variant="secondary">
                          {row.pendingSuggestionCount} suggestion{row.pendingSuggestionCount === 1 ? "" : "s"}
                        </Badge>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={pullingRuleId !== null}
                        onClick={(e) => {
                          e.stopPropagation()
                          void handleRowRefresh(row.ruleRef)
                        }}
                      >
                        <RefreshCwIcon className={syncing ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
                        {syncing ? "Syncing" : "Sync"}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {latest && s ? (
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
                          <span>
                            <span className="text-muted-foreground">Views </span>
                            <span className="font-medium text-foreground">{fmtNum(s.totalViews)}</span>
                          </span>
                          <span>
                            <span className="text-muted-foreground">Likes </span>
                            <span className="font-medium text-foreground">{fmtNum(s.totalLikes)}</span>
                          </span>
                          <span>
                            <span className="text-muted-foreground">Comments </span>
                            <span className="font-medium text-foreground">{fmtNum(s.totalComments)}</span>
                          </span>
                          <span>
                            <span className="text-muted-foreground">Eng. rate </span>
                            <span className="font-medium text-foreground">{s.averageEngagementRate.toFixed(1)}%</span>
                          </span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Best channel:{" "}
                          <span className="font-medium capitalize text-foreground">
                            {s.bestPerformingChannel || "—"}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        Publish content with Zernio IDs, then sync this rule to generate analytics.
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
      </div>

      {!isLoading && (data?.analytics?.length ?? 0) === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No analytics yet</CardTitle>
            <CardDescription>
              Publish content with Zernio, then sync a rule to generate the first snapshot.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}
    </div>
  )
}
