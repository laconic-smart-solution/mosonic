import { useEffect, useMemo, useState } from "react"
import { Link, useParams } from "react-router-dom"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeftIcon,
  EyeIcon,
  HeartIcon,
  MessageCircleIcon,
  RefreshCwIcon,
  SparklesIcon,
  TrendingUpIcon,
} from "lucide-react"
import {
  analyticsQueryKeys,
  useAnalyticsApplyMutation,
  useAnalyticsGenerateSuggestionsMutation,
  useAnalyticsLatestQuery,
  useAnalyticsPullMutation,
  useAnalyticsRejectMutation,
} from "@/shared/queries/analytics.query"
import { analyticsService } from "@/shared/services/analytics.service"
import type {
  ContentPerformanceEntry,
  FeedbackSuggestion,
} from "@/shared/types/analytics.type"
import {
  joinAnalyticsRuleRoom,
  leaveAnalyticsRuleRoom,
  onAnalyticsPullCompleted,
  onAnalyticsPullFailed,
  onAnalyticsPullStarted,
  onAnalyticsSuggestionReady,
} from "@/shared/socket/analytics-events"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(Math.round(n))
}

function formatRange(fromIso: string, toIso: string): string {
  try {
    const a = new Date(fromIso)
    const b = new Date(toIso)
    const o: Intl.DateTimeFormatOptions = {
      month: "short",
      day: "numeric",
      year: "numeric",
    }
    return `${a.toLocaleDateString(undefined, o)} – ${b.toLocaleDateString(undefined, o)}`
  } catch {
    return `${fromIso} – ${toIso}`
  }
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime()
  const d = Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000))
  if (d <= 0) return "today"
  if (d === 1) return "1 day ago"
  return `${d} days ago`
}

function confidenceBadgeVariant(
  c: FeedbackSuggestion["confidence"]
): "default" | "secondary" | "outline" {
  if (c === "high") return "default"
  if (c === "medium") return "secondary"
  return "outline"
}

export default function AnalyticsDetailPage() {
  const { ruleId } = useParams<{ ruleId: string }>()
  const qc = useQueryClient()
  const { data, isLoading, refetch } = useAnalyticsLatestQuery(ruleId)
  const pullMu = useAnalyticsPullMutation()
  const generateMu = useAnalyticsGenerateSuggestionsMutation()
  const analyticsId = data?.analytics?.analyticsId
  const applyMu = useAnalyticsApplyMutation(analyticsId)
  const rejectMu = useAnalyticsRejectMutation(analyticsId)
  const [pullOverlay, setPullOverlay] = useState(false)
  const [suggestionBanner, setSuggestionBanner] = useState<number | null>(null)

  useEffect(() => {
    if (!ruleId) return
    joinAnalyticsRuleRoom(ruleId)
    const off1 = onAnalyticsPullStarted(() => {
      setPullOverlay(true)
    })
    const off2 = onAnalyticsPullCompleted(async (p) => {
      if (p.ruleRef !== ruleId) return
      setPullOverlay(false)
      const res = await analyticsService.latest(ruleId)
      qc.setQueryData(analyticsQueryKeys.latest(ruleId), res)
      void qc.invalidateQueries({ queryKey: analyticsQueryKeys.summary })
      toast.success(p.message?.trim() || "Analytics synced")
    })
    const off3 = onAnalyticsSuggestionReady((p) => {
      if (p.ruleRef !== ruleId) return
      setSuggestionBanner(p.count)
      void refetch()
      void qc.invalidateQueries({ queryKey: analyticsQueryKeys.summary })
    })
    const off4 = onAnalyticsPullFailed((p) => {
      if (p.ruleId !== ruleId) return
      setPullOverlay(false)
      toast.error(p.message || "Analytics pull failed")
    })
    return () => {
      off1()
      off2()
      off3()
      off4()
      leaveAnalyticsRuleRoom(ruleId)
    }
  }, [ruleId, qc, refetch])

  const snap = data?.analytics ?? null
  const ruleName = data?.ruleName ?? "Rule"
  const display = data?.display ?? { contentByRef: {}, uploadByRef: {} }

  const byChannel = useMemo(() => {
    const m = new Map<string, { views: number; engagement: number }>()
    for (const row of snap?.contentPerformance ?? []) {
      const k = row.channel.toLowerCase()
      const cur = m.get(k) ?? { views: 0, engagement: 0 }
      cur.views += row.metrics.views
      cur.engagement += row.metrics.engagement
      m.set(k, cur)
    }
    return [...m.entries()].sort((a, b) => b[1].engagement - a[1].engagement)
  }, [snap])

  const byPost = useMemo(() => {
    const m = new Map<string, ContentPerformanceEntry[]>()
    for (const row of snap?.contentPerformance ?? []) {
      const k = row.uploadRef
      const arr = m.get(k) ?? []
      arr.push(row)
      m.set(k, arr)
    }
    return [...m.values()]
  }, [snap])

  const byVariant = useMemo(() => {
    const m = new Map<string, { views: number; engagement: number }>()
    for (const row of snap?.contentPerformance ?? []) {
      const k = row.variantId?.trim() || "control"
      const cur = m.get(k) ?? { views: 0, engagement: 0 }
      cur.views += row.metrics.views
      cur.engagement += row.metrics.engagement
      m.set(k, cur)
    }
    return [...m.entries()].sort((a, b) => b[1].engagement - a[1].engagement)
  }, [snap])

  const bestContentTitle = useMemo(() => {
    const ref = snap?.campaignSummary?.bestPerformingContent
    if (!ref) return "—"
    return display.contentByRef[ref]?.title ?? "Content item"
  }, [snap, display])

  async function handleRefresh() {
    if (!ruleId) return
    setPullOverlay(true)
    try {
      const pullRes = await pullMu.mutateAsync(ruleId)
      setPullOverlay(false)
      const res = await analyticsService.latest(ruleId)
      qc.setQueryData(analyticsQueryKeys.latest(ruleId), res)
      void qc.invalidateQueries({ queryKey: analyticsQueryKeys.summary })
      toast.success(pullRes.message?.trim() || "Analytics synced")
    } catch (e: unknown) {
      setPullOverlay(false)
      const msg =
        e && typeof e === "object" && "message" in e
          ? String((e as Error).message)
          : "Sync failed"
      toast.error(msg)
    }
  }

  async function handleGenerateSuggestions() {
    if (!analyticsId) return
    try {
      const res = await generateMu.mutateAsync(analyticsId)
      await refetch()
      void qc.invalidateQueries({ queryKey: analyticsQueryKeys.summary })
      if (res.suggestionCount > 0) {
        toast.success(
          `${res.suggestionCount} suggestion${res.suggestionCount === 1 ? "" : "s"} ready`
        )
      } else {
        toast.success("No new suggestions from the current data")
      }
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "message" in e
          ? String((e as Error).message)
          : "Could not generate suggestions"
      toast.error(msg)
    }
  }

  if (!ruleId) {
    return (
      <div className="mx-auto w-full max-w-5xl px-6 py-8">
        <Alert variant="destructive">
          <AlertTitle>Missing rule</AlertTitle>
          <AlertDescription>
            Open Analytics from the list and select a rule.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
      {pullOverlay || (pullMu.isPending && pullMu.variables === ruleId) ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center bg-background/60 pt-28 backdrop-blur-[1px]">
          <Card className="pointer-events-none">
            <CardContent className="flex items-center gap-2 px-4 py-3 text-sm">
              <RefreshCwIcon className="h-4 w-4 animate-spin" />
              Syncing analytics…
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Link
            to="/analytics"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            All analytics
          </Link>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              {isLoading ? <Skeleton className="h-7 w-60" /> : ruleName}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isLoading ? (
                <Skeleton className="h-4 w-56" />
              ) : snap ? (
                <>
                  {formatRange(
                    String(snap.period.from),
                    String(snap.period.to)
                  )}{" "}
                  · Last pulled {relTime(snap.pulledAt)}
                </>
              ) : (
                "No snapshot yet"
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={
              pullOverlay || (pullMu.isPending && pullMu.variables === ruleId)
            }
            onClick={() => void handleRefresh()}
          >
            <RefreshCwIcon
              className={
                pullOverlay || (pullMu.isPending && pullMu.variables === ruleId)
                  ? "mr-2 h-4 w-4 animate-spin"
                  : "mr-2 h-4 w-4"
              }
            />
            Sync
          </Button>
          <Button
            type="button"
            disabled={
              !analyticsId ||
              !snap?.contentPerformance?.length ||
              generateMu.isPending
            }
            onClick={() => void handleGenerateSuggestions()}
          >
            <SparklesIcon className="mr-2 h-4 w-4" />
            {generateMu.isPending ? "Generating" : "Get AI suggestions"}
          </Button>
        </div>
      </div>

      {suggestionBanner !== null ? (
        <Alert>
          <AlertTitle>Suggestions ready</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {suggestionBanner} new suggestion
              {suggestionBanner === 1 ? "" : "s"} available for this snapshot.
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSuggestionBanner(null)}
            >
              Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {!isLoading && !snap ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              No snapshot for this rule
            </CardTitle>
            <CardDescription>
              Publish or schedule posts with Zernio, then sync analytics to
              generate the first snapshot.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="mt-2 h-7 w-16" />
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : null}

      {snap ? (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              {
                label: "Views",
                value: snap.campaignSummary.totalViews,
                icon: EyeIcon,
              },
              {
                label: "Likes",
                value: snap.campaignSummary.totalLikes,
                icon: HeartIcon,
              },
              {
                label: "Comments",
                value: snap.campaignSummary.totalComments,
                icon: MessageCircleIcon,
              },
              {
                label: "Shares",
                value: snap.campaignSummary.totalShares,
                icon: TrendingUpIcon,
              },
            ].map(({ label, value, icon: Icon }) => (
              <Card key={label}>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {label}
                  </CardDescription>
                  <CardTitle className="text-2xl">
                    {fmtNum(Number(value))}
                  </CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>

          <Tabs defaultValue="overview" className="w-full">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="posts">Per post</TabsTrigger>
              <TabsTrigger value="suggestions">Suggestions</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Campaign summary</CardTitle>
                  <CardDescription>
                    Avg engagement rate{" "}
                    <span className="font-medium text-foreground">
                      {snap.campaignSummary.averageEngagementRate.toFixed(1)}%
                    </span>
                    {" · "}Best channel{" "}
                    <span className="font-medium text-foreground capitalize">
                      {snap.campaignSummary.bestPerformingChannel || "—"}
                    </span>
                    {" · "}Best content{" "}
                    <span className="font-medium text-foreground">
                      {bestContentTitle}
                    </span>
                  </CardDescription>
                </CardHeader>
              </Card>

              {byVariant.length > 1 ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">A/B variants</CardTitle>
                    <CardDescription>
                      Performance grouped by experiment variant when available.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {byVariant.map(([variant, v]) => (
                      <div
                        key={variant}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                      >
                        <span className="font-medium">{variant}</span>
                        <span className="text-muted-foreground">
                          Views{" "}
                          <span className="font-medium text-foreground">
                            {fmtNum(v.views)}
                          </span>
                          {" · "}Engagement{" "}
                          <span className="font-medium text-foreground">
                            {fmtNum(v.engagement)}
                          </span>
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ) : null}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Per channel</CardTitle>
                  <CardDescription>
                    Aggregated views and engagement by channel.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {byChannel.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      No channel data for this snapshot.
                    </div>
                  ) : (
                    byChannel.map(([ch, v]) => (
                      <div
                        key={ch}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                      >
                        <span className="font-medium capitalize">{ch}</span>
                        <span className="text-muted-foreground">
                          Views{" "}
                          <span className="font-medium text-foreground">
                            {fmtNum(v.views)}
                          </span>
                          {" · "}Engagement{" "}
                          <span className="font-medium text-foreground">
                            {fmtNum(v.engagement)}
                          </span>
                        </span>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="posts" className="mt-4 space-y-3">
              {byPost.length === 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">No post entries</CardTitle>
                    <CardDescription>
                      Sync analytics to populate per-post metrics.
                    </CardDescription>
                  </CardHeader>
                </Card>
              ) : (
                byPost.map((rows) => {
                  const first = rows[0]
                  if (!first) return null
                  const uploadLabel =
                    display.uploadByRef[first.uploadRef]?.label ?? "Upload"
                  const contentTitle =
                    display.contentByRef[first.contentRef]?.title ??
                    "Content item"
                  return (
                    <Card key={first.uploadRef}>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">
                          {uploadLabel}
                        </CardTitle>
                        <CardDescription>
                          <Link
                            className="font-medium text-foreground underline-offset-4 hover:underline"
                            to={`/content/${first.contentRef}`}
                          >
                            {contentTitle}
                          </Link>
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {rows.map((r) => (
                          <div
                            key={`${r.channel}-${r.zernioPostId}`}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                          >
                            <span className="text-muted-foreground capitalize">
                              {r.channel}
                            </span>
                            <span className="text-muted-foreground">
                              <span className="inline-flex items-center gap-1">
                                <EyeIcon className="h-4 w-4" />
                                <span className="font-medium text-foreground">
                                  {fmtNum(r.metrics.views)}
                                </span>
                              </span>
                              {" · "}
                              <span className="inline-flex items-center gap-1">
                                <HeartIcon className="h-4 w-4" />
                                <span className="font-medium text-foreground">
                                  {fmtNum(r.metrics.likes)}
                                </span>
                              </span>
                              {" · "}
                              <span className="inline-flex items-center gap-1">
                                <MessageCircleIcon className="h-4 w-4" />
                                <span className="font-medium text-foreground">
                                  {fmtNum(r.metrics.comments)}
                                </span>
                              </span>
                            </span>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )
                })
              )}
            </TabsContent>

            <TabsContent value="suggestions" className="mt-4 space-y-3">
              {(snap.feedbackSignal.suggestions ?? []).length === 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      No suggestions yet
                    </CardTitle>
                    <CardDescription>
                      {snap.contentPerformance.length === 0
                        ? "Sync analytics first to enable suggestions."
                        : "Generate suggestions to analyze this snapshot."}
                    </CardDescription>
                  </CardHeader>
                </Card>
              ) : null}
              {(snap.feedbackSignal.suggestions ?? []).map((sug, idx) => (
                <SuggestionCard
                  key={`${sug.field}-${idx}`}
                  sug={sug}
                  index={idx}
                  onApply={async () => {
                    try {
                      await applyMu.mutateAsync(idx)
                      toast.success("Suggestion applied to your rule")
                      void refetch()
                    } catch {
                      toast.error("Could not apply suggestion")
                    }
                  }}
                  onReject={async () => {
                    try {
                      await rejectMu.mutateAsync(idx)
                      toast.success("Suggestion rejected")
                      void refetch()
                    } catch {
                      toast.error("Could not reject suggestion")
                    }
                  }}
                  applying={applyMu.isPending}
                  rejecting={rejectMu.isPending}
                />
              ))}
            </TabsContent>
          </Tabs>
        </>
      ) : null}
    </div>
  )
}

function SuggestionCard(props: {
  sug: FeedbackSuggestion
  index: number
  onApply: () => Promise<void>
  onReject: () => Promise<void>
  applying: boolean
  rejecting: boolean
}) {
  const { sug } = props
  const pending = sug.status === "pending"
  return (
    <Card className={sug.status === "rejected" ? "opacity-70" : ""}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{sug.field}</CardTitle>
          <Badge
            variant={confidenceBadgeVariant(sug.confidence)}
            className="uppercase"
          >
            {sug.confidence}
          </Badge>
        </div>
        <CardDescription>{sug.reason}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2 text-sm">
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">
              Current
            </div>
            <pre className="max-h-40 overflow-auto rounded-md border bg-muted/30 p-2 text-xs">
              {JSON.stringify(sug.currentValue, null, 2)}
            </pre>
          </div>
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">
              Suggested
            </div>
            <pre className="max-h-40 overflow-auto rounded-md border bg-muted/30 p-2 text-xs">
              {JSON.stringify(sug.suggestedValue, null, 2)}
            </pre>
          </div>
        </div>

        {sug.status === "applied" ? (
          <div className="text-sm font-medium text-green-700">
            Applied to rule
          </div>
        ) : null}
        {sug.status === "rejected" ? (
          <div className="text-sm font-medium text-muted-foreground line-through">
            Rejected
          </div>
        ) : null}

        {pending ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={props.applying || props.rejecting}
              onClick={() => void props.onApply()}
            >
              Apply
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={props.applying || props.rejecting}
              onClick={() => void props.onReject()}
            >
              Reject
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
