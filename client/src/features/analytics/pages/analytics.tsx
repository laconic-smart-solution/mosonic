import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, motion } from "framer-motion"
import { AxiosError } from "axios"
import { BarChart3, Inbox, Sparkles } from "lucide-react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { AnalyticsListCard } from "@/features/analytics/components/analytics-list-card"
import { relTime } from "@/features/analytics/lib/analytics-list-format"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import {
  analyticsQueryKeys,
  useAnalyticsListQuery,
  useAnalyticsPullMutation,
} from "@/shared/queries/analytics.query"

const SUMMARY_TILE_KEYS = ["rules", "pending", "pull"] as const

const gridVariants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.055 },
  },
}

const cardVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
}

export default function AnalyticsListPage() {
  const { t } = useTranslation("analytics")
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data, isLoading, isError } = useAnalyticsListQuery({ page: 1, limit: 50 })
  const pullMu = useAnalyticsPullMutation()
  const [pullingRuleId, setPullingRuleId] = useState<string | null>(null)

  const summaryThemes = useMemo(
    () =>
      ({
        rules: {
          idle: "border-[color:var(--nt-border)] bg-[color:var(--nt-surface)]",
          label: "text-muted-foreground",
          count: "text-foreground",
        },
        pending: {
          idle: "border-[#AFA9EC]/50 bg-[#EEEDFE]/40",
          label: "text-[#3C3489]/80",
          count: "text-[#3C3489]",
        },
        pull: {
          idle: "border-[color:var(--nt-border)] bg-[color:var(--nt-surface)]",
          label: "text-muted-foreground",
          count: "text-foreground text-base font-medium",
        },
      }) as const,
    [],
  )

  const stats = useMemo(() => {
    const items = data?.analytics ?? []
    const totalRules = items.length
    const totalPending = items.reduce(
      (acc, r) => acc + (r.pendingSuggestionCount || 0),
      0,
    )
    const lastPulledAt = items
      .map((r) => r.latest?.pulledAt)
      .filter((s): s is string => typeof s === "string" && s.length > 0)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
    return { totalRules, totalPending, lastPulledAt }
  }, [data])

  const items = data?.analytics ?? []
  const empty = !isLoading && !isError && items.length === 0

  function pullErrorMessage(e: unknown): string {
    if (e instanceof AxiosError) {
      const d = e.response?.data as { message?: string } | undefined
      if (typeof d?.message === "string" && d.message.trim()) return d.message
      return e.message || t("page.syncFailed")
    }
    if (e instanceof Error) return e.message
    return t("page.syncFailed")
  }

  async function handleSync(ruleId: string) {
    setPullingRuleId(ruleId)
    try {
      await pullMu.mutateAsync(ruleId)
      void qc.invalidateQueries({ queryKey: analyticsQueryKeys.latest(ruleId) })
      toast.success(t("toast.synced"))
    } catch (e: unknown) {
      toast.error(pullErrorMessage(e))
    } finally {
      setPullingRuleId(null)
    }
  }

  function summaryValue(key: (typeof SUMMARY_TILE_KEYS)[number]): string {
    if (isLoading) return "…"
    if (key === "rules") return String(stats.totalRules)
    if (key === "pending") return String(stats.totalPending)
    return stats.lastPulledAt ? relTime(stats.lastPulledAt, t) : "—"
  }

  function summaryLabel(key: (typeof SUMMARY_TILE_KEYS)[number]): string {
    if (key === "rules") return t("summary.rules")
    if (key === "pending") return t("summary.suggestions")
    return t("summary.lastPull")
  }

  return (
    <motion.div
      className="min-h-full w-full bg-[color:var(--nt-canvas)] px-4 py-5 sm:px-5"
      style={{ minHeight: "100%" }}
    >
      <motion.div className="flex w-full flex-col gap-5">
        <header className="space-y-1">
          <div className="mb-1 flex items-center gap-2 text-muted-foreground">
            <BarChart3 className="size-5 shrink-0" aria-hidden />
            <span className="text-xs font-semibold tracking-wide uppercase">
              {t("page.eyebrow")}
            </span>
          </div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            {t("page.title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("page.subtitle")}</p>
        </header>

        <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3">
          {SUMMARY_TILE_KEYS.map((key) => {
            const theme = summaryThemes[key]
            return (
              <div
                key={key}
                className={cn(
                  "flex min-h-[72px] flex-col justify-center rounded-xl border px-3 py-2",
                  theme.idle,
                )}
              >
                <span
                  className={cn(
                    "text-[11px] font-medium tracking-wide uppercase",
                    theme.label,
                  )}
                >
                  {summaryLabel(key)}
                </span>
                <span
                  className={cn(
                    "text-xl font-semibold tabular-nums",
                    theme.count,
                    key === "pending" &&
                      !isLoading &&
                      stats.totalPending > 0 &&
                      "inline-flex items-center gap-1.5",
                  )}
                >
                  {summaryValue(key)}
                  {key === "pending" && !isLoading && stats.totalPending > 0 ? (
                    <Sparkles className="size-4 shrink-0 opacity-80" aria-hidden />
                  ) : null}
                </span>
              </div>
            )
          })}
        </div>

        {isError ? (
          <Alert variant="destructive">
            <AlertTitle>{t("page.loadErrorTitle")}</AlertTitle>
            <AlertDescription>{t("page.loadErrorDesc")}</AlertDescription>
          </Alert>
        ) : null}

        {!isLoading && items.length > 0 ? (
          <p className="border-b border-[color:var(--nt-border)] pb-3 text-[13px] text-muted-foreground">
            <span className="font-semibold text-foreground">{items.length}</span>{" "}
            {t("page.rulesCount", { count: items.length })}
          </p>
        ) : null}

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex min-h-[240px] flex-col rounded-2xl border border-[color:var(--nt-border)] bg-[color:var(--nt-surface)] p-4"
              >
                <Skeleton className="mb-3 h-8 w-8 rounded-lg bg-muted" />
                <Skeleton className="mb-2 h-5 w-[75%] bg-muted" />
                <Skeleton className="mb-3 h-3 w-32 bg-muted" />
                <div className="mb-3 flex flex-wrap gap-1.5">
                  <Skeleton className="h-6 w-14 rounded-md bg-muted" />
                  <Skeleton className="h-6 w-14 rounded-md bg-muted" />
                  <Skeleton className="h-6 w-12 rounded-md bg-muted" />
                </div>
                <Skeleton className="mt-auto h-8 w-full rounded-md bg-muted" />
              </div>
            ))}
          </div>
        ) : empty ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-[color:var(--nt-border)] bg-[color:var(--nt-surface)]/60 py-16 text-center">
            <Inbox
              className="mb-3 size-11 text-muted-foreground/60"
              aria-hidden
            />
            <p className="text-sm font-medium text-foreground">{t("page.emptyTitle")}</p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              {t("page.emptyDesc")}
            </p>
          </div>
        ) : (
          <motion.div
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
            variants={gridVariants}
            initial="hidden"
            animate="show"
          >
            <AnimatePresence initial={false} mode="popLayout">
              {items.map((row, index) => (
                <motion.div
                  key={row.ruleRef}
                  layout
                  variants={cardVariants}
                  transition={{ duration: 0.22 }}
                  className="min-h-[240px]"
                >
                  <AnalyticsListCard
                    row={row}
                    index={index}
                    syncing={pullingRuleId === row.ruleRef}
                    syncDisabled={pullingRuleId !== null}
                    onOpen={(ruleRef) => navigate(`/analytics/${ruleRef}`)}
                    onSync={(ruleRef) => void handleSync(ruleRef)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  )
}
