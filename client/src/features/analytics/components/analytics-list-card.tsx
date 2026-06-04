import type { MouseEvent } from "react"
import { useTranslation } from "react-i18next"
import { motion } from "framer-motion"
import {
  BarChart3,
  ChevronRight,
  Eye,
  Heart,
  MessageCircle,
  Megaphone,
  RefreshCw,
  Sparkles,
  TrendingUp,
} from "lucide-react"

import {
  channelLabel,
  fmtMetric,
  relTime,
} from "@/features/analytics/lib/analytics-list-format"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { AnalyticsListItem } from "@/shared/types/analytics.type"

type Props = {
  row: AnalyticsListItem
  index: number
  syncing: boolean
  syncDisabled: boolean
  onOpen: (ruleRef: string) => void
  onSync: (ruleRef: string) => void
}

export function AnalyticsListCard({
  row,
  index,
  syncing,
  syncDisabled,
  onOpen,
  onSync,
}: Props) {
  const { t } = useTranslation("analytics")
  const latest = row.latest
  const summary = latest?.campaignSummary
  const hasData = Boolean(latest && summary)

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.22, delay: index * 0.04 }}
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-2xl border border-[color:var(--nt-border)] bg-[color:var(--nt-surface)] shadow-[var(--nt-surface-shadow)]",
        "transition-shadow hover:shadow-md"
      )}
    >
      <button
        type="button"
        onClick={() => onOpen(row.ruleRef)}
        className="flex flex-1 flex-col p-4 text-left transition-colors hover:bg-muted/20"
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#E6F1FB] text-[#185FA5]"
            aria-hidden
          >
            <BarChart3 className="size-4" />
          </span>
          {row.pendingSuggestionCount > 0 ? (
            <Badge
              variant="secondary"
              className="shrink-0 gap-1 border-[#AFA9EC]/50 bg-[#EEEDFE] text-[#3C3489]"
            >
              <Sparkles className="size-3" aria-hidden />
              {row.pendingSuggestionCount}
            </Badge>
          ) : null}
        </div>

        <h2 className="mb-1 line-clamp-2 text-[15px] leading-snug font-semibold text-foreground">
          {row.ruleName}
        </h2>
        <p className="mb-3 text-[11px] text-muted-foreground">
          {latest
            ? t("card.lastPulled", { time: relTime(latest.pulledAt, t) })
            : t("card.noSnapshot")}
        </p>

        {hasData && summary ? (
          <div className="mb-3 flex flex-wrap gap-1.5">
            <MetricChip
              icon={Eye}
              label={t("card.views")}
              value={fmtMetric(summary.totalViews)}
              className="border-sky-200/80 bg-sky-50 text-sky-800"
              iconClass="text-sky-700"
            />
            <MetricChip
              icon={Heart}
              label={t("card.likes")}
              value={fmtMetric(summary.totalLikes)}
              className="border-rose-200/80 bg-rose-50 text-rose-800"
              iconClass="text-rose-700"
            />
            <MetricChip
              icon={MessageCircle}
              label={t("card.comments")}
              value={fmtMetric(summary.totalComments)}
              className="border-violet-200/80 bg-violet-50 text-violet-800"
              iconClass="text-violet-700"
            />
            <MetricChip
              icon={TrendingUp}
              label={t("card.engagement")}
              value={`${summary.averageEngagementRate.toFixed(1)}%`}
              className="border-emerald-200/80 bg-emerald-50 text-emerald-800"
              iconClass="text-emerald-700"
            />
          </div>
        ) : (
          <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
            {t("card.emptyHint")}
          </p>
        )}

        {hasData && summary ? (
          <p className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Megaphone className="size-3 shrink-0" aria-hidden />
            <span>
              {t("card.best")}{" "}
              <span className="font-medium text-foreground">
                {channelLabel(summary.bestPerformingChannel)}
              </span>
            </span>
          </p>
        ) : null}

        <motion.div
          className="mt-auto flex items-center justify-end gap-1 pt-3 text-[11px] font-medium text-muted-foreground transition-colors group-hover:text-foreground"
          initial={false}
        >
          {t("card.viewDetails")}
          <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </motion.div>
      </button>

      <div className="border-t border-border/50 px-3 py-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-full text-xs"
          disabled={syncDisabled}
          onClick={(e: MouseEvent<HTMLButtonElement>) => {
            e.stopPropagation()
            onSync(row.ruleRef)
          }}
        >
          <RefreshCw
            className={cn("mr-1.5 size-3.5", syncing && "animate-spin")}
            aria-hidden
          />
          {syncing ? t("card.syncing") : t("card.syncAnalytics")}
        </Button>
      </div>
    </motion.article>
  )
}

function MetricChip({
  icon: Icon,
  label,
  value,
  className,
  iconClass,
}: {
  icon: typeof Eye
  label: string
  value: string
  className: string
  iconClass: string
}) {
  return (
    <span
      title={`${label}: ${value}`}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5",
        className
      )}
    >
      <Icon className={cn("size-3.5 shrink-0", iconClass)} aria-hidden />
      <span className="text-[10px] font-medium tabular-nums">{value}</span>
    </span>
  )
}
