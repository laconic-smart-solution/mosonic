import { format } from "date-fns"
import { motion } from "framer-motion"
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  CalendarClock,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { DashboardActivityChart } from "@/features/dashboard/components/dashboard-activity-chart"
import { DashboardEngagementChart } from "@/features/dashboard/components/dashboard-engagement-chart"
import {
  activityLast7Days,
  weeklyEngagementRows,
} from "@/features/dashboard/lib/dashboard-chart-data"
import { useDashboardQuery } from "@/shared/queries/dashboard.query"
import { useUserStore } from "@/shared/stores/user.store"
import { cn } from "@/lib/utils"

const listVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.04 },
  },
}

const riseVariants = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 380, damping: 28 },
  },
}

function dayGreetingKey(now: Date): "morning" | "afternoon" | "evening" {
  const h = now.getHours()
  if (h < 12) return "morning"
  if (h < 18) return "afternoon"
  return "evening"
}

function fmtCompact(n: number): string {
  if (!Number.isFinite(n)) return "0"
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n)
}

export default function DashboardPage() {
  const { t } = useTranslation(["dashboard", "common"])
  const navigate = useNavigate()
  const user = useUserStore((s) => s.user)
  const q = useDashboardQuery()

  const displayName = user?.name?.trim() ? user.name.trim() : t("dashboard:greeting.defaultName")
  const greeting = t(`dashboard:greeting.${dayGreetingKey(new Date())}`)

  const d = q.data
  const stats = d?.stats
  const actionItems = d?.actionItems
  const upcoming = d?.upcomingScheduled ?? []
  const perf = d?.weeklyPerformance
  const activity = d?.recentActivity ?? []

  const engagementData = weeklyEngagementRows(perf)
  const activitySeries = activityLast7Days(activity)

  const showQuickStart =
    !!d &&
    stats != null &&
    actionItems != null &&
    stats.postsPublishedThisMonth === 0 &&
    stats.pendingReviewCount === 0 &&
    stats.scheduledPostsCount === 0 &&
    stats.totalReachThisWeek === 0 &&
    actionItems.pendingSuggestionsCount === 0 &&
    actionItems.failedPostsCount === 0 &&
    upcoming.length === 0 &&
    activity.length === 0

  const statTiles = [
    {
      label: t("dashboard:stats.publishedMonth"),
      value: fmtCompact(stats?.postsPublishedThisMonth ?? 0),
      hint: t("dashboard:stats.publishedMonthHint"),
      icon: TrendingUp,
    },
    {
      label: t("dashboard:stats.pendingReview"),
      value: fmtCompact(stats?.pendingReviewCount ?? 0),
      hint: t("dashboard:stats.pendingReviewHint"),
      icon: AlertCircle,
    },
    {
      label: t("dashboard:stats.scheduled"),
      value: fmtCompact(stats?.scheduledPostsCount ?? 0),
      hint: t("dashboard:stats.scheduledHint"),
      icon: CalendarClock,
    },
    {
      label: t("dashboard:stats.reachWeek"),
      value: fmtCompact(stats?.totalReachThisWeek ?? 0),
      hint: t("dashboard:stats.reachWeekHint"),
      icon: Activity,
    },
  ] as const

  return (
    <div className="relative w-full min-h-0 overflow-x-hidden bg-linear-to-b from-muted/40 via-background to-background pb-8">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,hsl(var(--primary)/0.12),transparent)]"
        aria-hidden
      />

      <motion.div
        className="relative mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10"
        variants={listVariants}
        initial="hidden"
        animate="show"
      >
        <motion.header
          variants={riseVariants}
          className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Sparkles className="size-4 text-primary" aria-hidden />
              <span>{t("dashboard:header.overview")}</span>
            </div>
            <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              {greeting}, {displayName}
            </h1>
            <p className="max-w-xl text-sm text-muted-foreground sm:text-base">
              {t("dashboard:header.subtitle")}
            </p>
          </div>
          <Button size="lg" className="shrink-0 gap-2 shadow-sm" onClick={() => navigate("/")}>
            <Zap className="size-4" aria-hidden />
            {t("dashboard:header.startGeneration")}
          </Button>
        </motion.header>

        {q.isLoading ? (
          <motion.div variants={riseVariants} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-[120px] rounded-2xl" />
              ))}
            </div>
            <div className="grid gap-6 lg:grid-cols-3">
              <Skeleton className="h-[320px] rounded-2xl lg:col-span-2" />
              <Skeleton className="h-[320px] rounded-2xl" />
            </div>
          </motion.div>
        ) : q.isError ? (
          <motion.div variants={riseVariants}>
            <Card className="border-destructive/30 bg-destructive/5">
              <CardHeader>
                <CardTitle className="text-destructive">{t("dashboard:error.title")}</CardTitle>
                <CardDescription>{t("dashboard:error.desc")}</CardDescription>
              </CardHeader>
              <CardFooter>
                <Button variant="outline" onClick={() => q.refetch()}>
                  {t("common:actions.retry")}
                </Button>
              </CardFooter>
            </Card>
          </motion.div>
        ) : d ? (
          <>
            <motion.section variants={riseVariants} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {statTiles.map((tile) => (
                <motion.div key={tile.label} variants={riseVariants}>
                  <Card
                    size="sm"
                    className="border-border/80 bg-card/80 shadow-sm backdrop-blur-sm transition-shadow hover:shadow-md"
                  >
                    <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">{tile.label}</CardTitle>
                      <tile.icon className="size-4 text-primary/80" aria-hidden />
                    </CardHeader>
                    <CardContent>
                      <p className="font-heading text-3xl font-semibold tabular-nums tracking-tight">
                        {tile.value}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{tile.hint}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </motion.section>

            <div className="grid items-start gap-6 lg:grid-cols-3">
              <motion.section variants={riseVariants} className="space-y-6 lg:col-span-2">
                <Card className="overflow-hidden border-border/80 bg-card/90 shadow-sm backdrop-blur-sm">
                  <CardHeader className="border-b border-border/60 pb-4">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="size-4 text-primary" aria-hidden />
                      <CardTitle>{t("dashboard:charts.engagementTitle")}</CardTitle>
                    </div>
                    <CardDescription>{t("dashboard:charts.engagementDesc")}</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="h-[260px] w-full min-h-[220px]">
                      <DashboardEngagementChart data={engagementData} className="h-full w-full" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="overflow-hidden border-border/80 bg-card/90 shadow-sm backdrop-blur-sm">
                  <CardHeader className="border-b border-border/60 pb-4">
                    <div className="flex items-center gap-2">
                      <Activity className="size-4 text-primary" aria-hidden />
                      <CardTitle>{t("dashboard:charts.activityTitle")}</CardTitle>
                    </div>
                    <CardDescription>{t("dashboard:charts.activityDesc")}</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="h-[220px] w-full min-h-[200px]">
                      <DashboardActivityChart data={activitySeries} className="h-full w-full" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/80 bg-card/90 shadow-sm backdrop-blur-sm">
                  <CardHeader className="border-b border-border/60">
                    <CardTitle>{t("dashboard:recentActivity.title")}</CardTitle>
                    <CardDescription>{t("dashboard:recentActivity.desc")}</CardDescription>
                  </CardHeader>
                  <CardContent className="px-0">
                    {activity.length === 0 ? (
                      <p className="px-6 py-8 text-center text-sm text-muted-foreground">
                        {t("dashboard:recentActivity.empty")}
                      </p>
                    ) : (
                      <ul className="divide-y divide-border/60">
                        {activity.slice(0, 5).map((a, i) => (
                          <motion.li
                            key={`${a.at}_${i}`}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.03 }}
                            className="flex items-center justify-between gap-4 px-6 py-3.5"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{a.label}</p>
                              <p className="text-xs text-muted-foreground">{format(new Date(a.at), "MMM d, p")}</p>
                            </div>
                            {a.channel ? (
                              <Badge variant="outline" className="shrink-0 font-normal">
                                {a.channel}
                              </Badge>
                            ) : null}
                          </motion.li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </motion.section>

              <motion.aside variants={riseVariants} className="space-y-6">
                <Card className="border-border/80 bg-card/90 shadow-sm backdrop-blur-sm">
                  <CardHeader className="border-b border-border/60">
                    <CardTitle>{t("dashboard:actionQueue.title")}</CardTitle>
                    <CardDescription>{t("dashboard:actionQueue.desc")}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-0 px-0">
                    <div className="flex items-start justify-between gap-3 px-6 py-4">
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm font-medium leading-snug">
                          {t("dashboard:actionQueue.draftsApproval", {
                            count: actionItems?.pendingContentCount ?? 0,
                          })}
                        </p>
                        <p className="text-xs text-muted-foreground">{t("dashboard:actionQueue.draftsHint")}</p>
                      </div>
                      <Button size="sm" className="shrink-0" onClick={() => navigate("/content")}>
                        {t("dashboard:actionQueue.review")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/80 bg-card/90 shadow-sm backdrop-blur-sm">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border/60">
                    <div>
                      <CardTitle>{t("dashboard:scheduled.title")}</CardTitle>
                      <CardDescription>{t("dashboard:scheduled.desc")}</CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => navigate("/upload")}>
                      {t("dashboard:scheduled.viewAll")}
                      <ArrowUpRight className="size-3.5" />
                    </Button>
                  </CardHeader>
                  <CardContent className="px-0">
                    {upcoming.length === 0 ? (
                      <p className="px-6 py-6 text-sm text-muted-foreground">{t("dashboard:scheduled.empty")}</p>
                    ) : (
                      <ul className="divide-y divide-border/60">
                        {upcoming.slice(0, 5).map((u) => (
                          <li key={`${u.uploadId}_${u.channel}_${u.scheduledAt}`}>
                            <button
                              type="button"
                              onClick={() => navigate(`/upload/${u.uploadId}`)}
                              className={cn(
                                "flex w-full flex-col gap-1 px-6 py-3.5 text-left transition-colors",
                                "hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none",
                              )}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium">
                                  {format(new Date(u.scheduledAt), "MMM d, p")}
                                </span>
                                <Badge variant="secondary" className="font-normal">
                                  {u.channel}
                                </Badge>
                              </div>
                              <span className="line-clamp-2 text-xs text-muted-foreground">
                                {u.caption?.trim() ? u.caption : t("dashboard:scheduled.fallbackCaption")}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-border/80 bg-card/90 shadow-sm backdrop-blur-sm">
                  <CardHeader className="border-b border-border/60">
                    <CardTitle>{t("dashboard:highlights.title")}</CardTitle>
                    <CardDescription>{t("dashboard:highlights.desc")}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex flex-wrap gap-x-6 gap-y-2 text-muted-foreground">
                      <span>
                        <span className="font-semibold text-foreground">{fmtCompact(perf?.reach ?? 0)}</span>{" "}
                        {t("dashboard:highlights.reach")}
                      </span>
                      <span>
                        <span className="font-semibold text-foreground">{fmtCompact(perf?.likes ?? 0)}</span>{" "}
                        {t("dashboard:highlights.likes")}
                      </span>
                      <span>
                        <span className="font-semibold text-foreground">{fmtCompact(perf?.comments ?? 0)}</span>{" "}
                        {t("dashboard:highlights.comments")}
                      </span>
                      <span>
                        <span className="font-semibold text-foreground">{fmtCompact(perf?.clicks ?? 0)}</span>{" "}
                        {t("dashboard:highlights.clicks")}
                      </span>
                    </div>
                    <Separator />
                    <p className="text-xs leading-relaxed">
                      <span className="font-medium text-foreground">{t("dashboard:highlights.bestChannel")}</span>{" "}
                      {perf?.bestChannel?.trim() ? perf.bestChannel : "—"}
                    </p>
                    <p className="text-xs leading-relaxed">
                      <span className="font-medium text-foreground">{t("dashboard:highlights.bestPost")}</span>{" "}
                      {perf?.bestContent?.trim() ? perf.bestContent : "—"}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-1 w-full sm:w-auto"
                      onClick={() => navigate("/posts")}
                    >
                      {t("dashboard:highlights.viewPosts")}
                    </Button>
                  </CardContent>
                </Card>
              </motion.aside>
            </div>

            {showQuickStart ? (
              <motion.section variants={riseVariants}>
                <Card className="border-primary/20 bg-linear-to-br from-primary/5 via-card to-card shadow-sm">
                  <CardHeader>
                    <CardTitle>{t("dashboard:quickStart.title")}</CardTitle>
                    <CardDescription>{t("dashboard:quickStart.desc")}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-muted-foreground">
                    <ol className="list-none space-y-3">
                      {(["step1", "step2", "step3"] as const).map((stepKey, idx) => (
                        <li key={stepKey} className="flex items-center gap-3">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                            {idx + 1}
                          </span>
                          {t(`dashboard:quickStart.${stepKey}`)}
                        </li>
                      ))}
                    </ol>
                  </CardContent>
                  <CardFooter>
                    <Button onClick={() => navigate("/rules")}>{t("dashboard:quickStart.cta")}</Button>
                  </CardFooter>
                </Card>
              </motion.section>
            ) : null}
          </>
        ) : null}
      </motion.div>
    </div>
  )
}
