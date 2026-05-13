import { useNavigate } from "react-router-dom"

import { NtChip } from "@/components/app/nt-chip"
import { NtStatCard } from "@/components/app/nt-stat-card"
import { Button } from "@/components/ui/button"
import { useDashboardQuery } from "@/shared/queries/dashboard.query"
import { useUserStore } from "@/shared/stores/user.store"
import { T } from "@/lib/tokens"
import { format } from "date-fns"

function dayGreeting(now: Date): string {
  const h = now.getHours()
  if (h < 12) return "Good morning"
  if (h < 18) return "Good afternoon"
  return "Good evening"
}

function fmtCompact(n: number): string {
  if (!Number.isFinite(n)) return "0"
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(n)
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const user = useUserStore((s) => s.user)
  const q = useDashboardQuery()

  const displayName = user?.name?.trim() ? user.name.trim() : "there"
  const greeting = dayGreeting(new Date())

  const d = q.data
  const stats = d?.stats
  const actionItems = d?.actionItems
  const upcoming = d?.upcomingScheduled ?? []
  const perf = d?.weeklyPerformance
  const activity = d?.recentActivity ?? []

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

  return (
    <div className="flex max-w-[1200px] flex-col gap-7 px-7 pt-7 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="m-0 text-2xl font-bold tracking-[-0.5px]" style={{ color: T.textPrimary }}>
            {greeting}, {displayName}
          </h1>
          <p className="mt-1.5 text-[13px]" style={{ color: T.textSecondary }}>
            Here&apos;s what&apos;s happening across your campaigns today.
          </p>
        </div>
        <Button size="default" className="gap-1.5" onClick={() => navigate("/")}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
            <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          Start New Generation
        </Button>
      </div>

      {q.isLoading ? (
        <div className="rounded-[10px] border p-4 text-sm" style={{ background: T.surfaceBg, borderColor: T.surfaceBorder }}>
          Loading dashboard…
        </div>
      ) : q.isError ? (
        <div className="rounded-[10px] border p-4 text-sm" style={{ background: T.surfaceBg, borderColor: T.surfaceBorder }}>
          Couldn&apos;t load dashboard.{" "}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => q.refetch()}
            style={{ color: T.accent }}
          >
            Retry
          </button>
        </div>
      ) : d ? (
        <>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            <NtStatCard
              label="Posts Published (this month)"
              value={fmtCompact(stats?.postsPublishedThisMonth ?? 0)}
            />
            <NtStatCard
              label="Pending Review"
              value={fmtCompact(stats?.pendingReviewCount ?? 0)}
            />
            <NtStatCard
              label="Scheduled Posts"
              value={fmtCompact(stats?.scheduledPostsCount ?? 0)}
            />
            <NtStatCard
              label="Total Reach (this week)"
              value={fmtCompact(stats?.totalReachThisWeek ?? 0)}
            />
          </div>

          <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-[3fr_2fr]">
            <div
              className="overflow-hidden rounded-[10px] border shadow-[var(--nt-surface-shadow)]"
              style={{
                background: T.surfaceBg,
                borderColor: T.surfaceBorder,
                boxShadow: T.surfaceShadow,
              }}
            >
              <div
                className="flex items-center justify-between border-b px-[18px] py-3.5"
                style={{ borderColor: T.surfaceBorder }}
              >
                <span className="text-[13px] font-bold" style={{ color: T.textPrimary }}>
                  Action Required
                </span>
              </div>

              <div className="space-y-3 px-[18px] py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold" style={{ color: T.textPrimary }}>
                      {actionItems?.pendingContentCount ?? 0} content drafts waiting for approval
                    </div>
                    <div className="text-[11px]" style={{ color: T.textMuted }}>
                      Review drafts before publishing
                    </div>
                  </div>
                  <Button size="sm" onClick={() => navigate("/content")}>
                    Review now
                  </Button>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold" style={{ color: T.textPrimary }}>
                      {actionItems?.pendingSuggestionsCount ?? 0} rule improvement suggestions
                    </div>
                    <div className="text-[11px]" style={{ color: T.textMuted }}>
                      Apply suggestions to improve performance
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => navigate("/analytics")}>
                    View suggestions
                  </Button>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold" style={{ color: T.textPrimary }}>
                      {actionItems?.failedPostsCount ?? 0} posts failed to publish
                    </div>
                    <div className="text-[11px]" style={{ color: T.textMuted }}>
                      Retry failed publishes from Uploads
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => navigate("/upload")}>
                    Open uploads →
                  </Button>
                </div>
              </div>
            </div>

            <div
              className="overflow-hidden rounded-[10px] border shadow-[var(--nt-surface-shadow)]"
              style={{
                background: T.surfaceBg,
                borderColor: T.surfaceBorder,
                boxShadow: T.surfaceShadow,
              }}
            >
              <div
                className="flex items-center justify-between border-b px-[18px] py-3.5"
                style={{ borderColor: T.surfaceBorder }}
              >
                <span className="text-[13px] font-bold" style={{ color: T.textPrimary }}>
                  Scheduled Posts
                </span>
                <Button variant="ghost" size="sm" onClick={() => navigate("/upload")}>
                  View all →
                </Button>
              </div>

              {upcoming.length === 0 ? (
                <div className="px-[18px] py-4 text-xs" style={{ color: T.textMuted }}>
                  No upcoming scheduled posts.
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: T.surfaceBorder }}>
                  {upcoming.map((u) => (
                    <button
                      key={`${u.uploadId}_${u.channel}_${u.scheduledAt}`}
                      type="button"
                      onClick={() => navigate(`/upload/${u.uploadId}`)}
                      className="w-full cursor-pointer px-[18px] py-3 text-left transition-colors hover:bg-[#FDFCFA]"
                    >
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <div className="text-xs font-semibold" style={{ color: T.textPrimary }}>
                          {format(new Date(u.scheduledAt), "MMM d, p")}
                        </div>
                        <NtChip label={u.channel} color="indigo" size="xs" />
                      </div>
                      <div className="line-clamp-2 text-[11px] leading-relaxed" style={{ color: T.textSecondary }}>
                        {u.caption?.trim() ? u.caption : "Scheduled post"}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-[2fr_3fr]">
            <div
              className="overflow-hidden rounded-[10px] border shadow-[var(--nt-surface-shadow)]"
              style={{
                background: T.surfaceBg,
                borderColor: T.surfaceBorder,
                boxShadow: T.surfaceShadow,
              }}
            >
              <div
                className="flex items-center justify-between border-b px-[18px] py-3.5"
                style={{ borderColor: T.surfaceBorder }}
              >
                <span className="text-[13px] font-bold" style={{ color: T.textPrimary }}>
                  This Week
                </span>
                <Button variant="ghost" size="sm" onClick={() => navigate("/analytics")}>
                  View full analytics →
                </Button>
              </div>

              <div className="space-y-3 px-[18px] py-4 text-xs" style={{ color: T.textSecondary }}>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  <div>
                    <span className="font-semibold" style={{ color: T.textPrimary }}>
                      {fmtCompact(perf?.reach ?? 0)}
                    </span>{" "}
                    reach
                  </div>
                  <div>
                    <span className="font-semibold" style={{ color: T.textPrimary }}>
                      {fmtCompact(perf?.likes ?? 0)}
                    </span>{" "}
                    likes
                  </div>
                  <div>
                    <span className="font-semibold" style={{ color: T.textPrimary }}>
                      {fmtCompact(perf?.comments ?? 0)}
                    </span>{" "}
                    comments
                  </div>
                  <div>
                    <span className="font-semibold" style={{ color: T.textPrimary }}>
                      {fmtCompact(perf?.clicks ?? 0)}
                    </span>{" "}
                    clicks
                  </div>
                </div>

                <div className="pt-1 text-[11px]" style={{ color: T.textMuted }}>
                  Best channel:{" "}
                  <span className="font-semibold" style={{ color: T.textPrimary }}>
                    {perf?.bestChannel?.trim() ? perf.bestChannel : "—"}
                  </span>
                </div>
                <div className="text-[11px]" style={{ color: T.textMuted }}>
                  Best post:{" "}
                  <span className="font-semibold" style={{ color: T.textPrimary }}>
                    {perf?.bestContent?.trim() ? perf.bestContent : "—"}
                  </span>
                </div>
              </div>
            </div>

            <div
              className="overflow-hidden rounded-[10px] border shadow-[var(--nt-surface-shadow)]"
              style={{
                background: T.surfaceBg,
                borderColor: T.surfaceBorder,
                boxShadow: T.surfaceShadow,
              }}
            >
              <div
                className="flex items-center justify-between border-b px-[18px] py-3.5"
                style={{ borderColor: T.surfaceBorder }}
              >
                <span className="text-[13px] font-bold" style={{ color: T.textPrimary }}>
                  Recent Activity
                </span>
              </div>

              {activity.length === 0 ? (
                <div className="px-[18px] py-4 text-xs" style={{ color: T.textMuted }}>
                  No recent activity yet.
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: T.surfaceBorder }}>
                  {activity.map((a, i) => (
                    <div key={`${a.at}_${i}`} className="flex items-center justify-between gap-3 px-[18px] py-3">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold" style={{ color: T.textPrimary }}>
                          {a.label}
                        </div>
                        <div className="text-[11px]" style={{ color: T.textMuted }}>
                          {format(new Date(a.at), "MMM d, p")}
                        </div>
                      </div>
                      {a.channel ? <NtChip label={a.channel} color="gray" size="xs" /> : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {showQuickStart ? (
            <div
              className="overflow-hidden rounded-[10px] border shadow-[var(--nt-surface-shadow)]"
              style={{
                background: T.surfaceBg,
                borderColor: T.surfaceBorder,
                boxShadow: T.surfaceShadow,
              }}
            >
              <div className="border-b px-[18px] py-3.5" style={{ borderColor: T.surfaceBorder }}>
                <span className="text-[13px] font-bold" style={{ color: T.textPrimary }}>
                  Welcome to NeuralTex
                </span>
                <div className="mt-1 text-[11px]" style={{ color: T.textMuted }}>
                  Get started in 3 steps
                </div>
              </div>
              <div className="space-y-2 px-[18px] py-4 text-xs" style={{ color: T.textSecondary }}>
                <div className="flex items-center gap-2">
                  <span className="inline-flex size-5 items-center justify-center rounded-md" style={{ background: T.accentLight, color: T.accent }}>
                    1
                  </span>
                  Create your Rule
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex size-5 items-center justify-center rounded-md border" style={{ borderColor: T.surfaceBorder, color: T.textMuted }}>
                    2
                  </span>
                  Generate your first content
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex size-5 items-center justify-center rounded-md border" style={{ borderColor: T.surfaceBorder, color: T.textMuted }}>
                    3
                  </span>
                  Publish to social media
                </div>
                <div className="pt-2">
                  <Button onClick={() => navigate("/rules")}>Create your first rule</Button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

    </div>
  )
}
