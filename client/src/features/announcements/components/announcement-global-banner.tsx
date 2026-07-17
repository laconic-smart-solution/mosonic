import { useEffect, useMemo } from "react"
import { Link } from "react-router-dom"
import { ArrowRight, X } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { buttonVariants } from "@/lib/button-variants"
import { cn } from "@/lib/utils"
import { periodCreditBudget } from "@/shared/lib/period-credit-budget"
import {
  useCreditBalanceSocketRefresh,
  useUsageSummaryQuery,
} from "@/shared/queries/usage.query"
import { onCreditLowBalance } from "@/shared/socket/credit-events"

import {
  useGlobalBannerStore,
  upsertAnnouncementBanner,
  upsertLowCreditBanner,
} from "../announcement-banner.store"
import { useLatestAnnouncementQuery } from "../hooks/use-announcements"
import { announcementLevelTheme } from "../lib/announcement-level-theme"

export function AnnouncementGlobalBanner() {
  const { t } = useTranslation("announcements")
  const latestQuery = useLatestAnnouncementQuery(true)
  const summary = useUsageSummaryQuery()

  const items = useGlobalBannerStore((s) => s.items)
  const dismissedIds = useGlobalBannerStore((s) => s.dismissedIds)
  const dismiss = useGlobalBannerStore((s) => s.dismiss)

  useEffect(() => {
    upsertAnnouncementBanner(latestQuery.data ?? null)
  }, [latestQuery.data])

  useEffect(() => {
    const data = summary.data
    if (!data) return
    const creditsRemaining = Math.max(0, data.creditsRemaining ?? 0)
    const budget =
      data.creditsBudget ??
      periodCreditBudget({
        creditsPerMonth: data.creditsPerMonth ?? 0,
        creditsUsed: data.creditsUsed ?? 0,
        creditsRemaining,
      })
    if (budget <= 0 || creditsRemaining / budget >= 0.1) {
      useGlobalBannerStore.getState().removeKind("low_credit")
      return
    }
    const percentRemaining = Math.round((creditsRemaining / budget) * 100)
    upsertLowCreditBanner({
      title: t("lowCredit.title"),
      message: t("lowCredit.message", {
        remaining: Math.round(creditsRemaining).toLocaleString(),
        percent: percentRemaining,
      }),
    })
  }, [summary.data, t])

  useEffect(() => {
    return onCreditLowBalance((payload) => {
      upsertLowCreditBanner({
        title: t("lowCredit.title"),
        message: t("lowCredit.message", {
          remaining: Math.round(payload.creditsRemaining).toLocaleString(),
          percent: payload.percentRemaining,
        }),
        forceShow: true,
      })
    })
  }, [t])

  // Keep credit socket refresh alive app-wide so balance recovery clears the banner.
  useCreditBalanceSocketRefresh()

  const active = useMemo(() => {
    const visible = Object.values(items).filter(
      (item) => !dismissedIds.has(item.id),
    )
    if (visible.length === 0) return null
    const rank = (level: string, kind: string) => {
      if (kind === "announcement" && level === "critical") return 100
      if (kind === "announcement" && level === "warning") return 80
      if (kind === "low_credit") return 60
      return 40
    }
    return (
      visible.sort((a, b) => rank(b.level, b.kind) - rank(a.level, a.kind))[0] ??
      null
    )
  }, [items, dismissedIds])

  if (!active) return null

  const theme = announcementLevelTheme(active.level)
  const Icon = theme.Icon

  return (
    <div
      role="status"
      className={cn("relative shrink-0 overflow-hidden border-b", theme.banner)}
    >
      <div
        className={cn("absolute inset-y-0 left-0 w-1", theme.accent)}
        aria-hidden
      />
      <div className="flex w-full items-center gap-3 py-2.5 pr-3 pl-4 sm:gap-4 sm:pr-5 sm:pl-5">
        <div
          className={cn(
            "hidden size-9 shrink-0 items-center justify-center rounded-xl sm:flex",
            theme.iconWrap,
          )}
        >
          <Icon className="size-4" aria-hidden />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex h-5 items-center rounded-md border px-1.5 text-[10px] font-semibold tracking-wide uppercase",
                theme.badge,
              )}
            >
              {active.kind === "low_credit"
                ? t("lowCredit.badge")
                : t(`levels.${active.level}`)}
            </span>
            <p className="truncate text-sm font-semibold text-foreground">
              {active.title}
            </p>
          </div>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {active.message}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Link
            to={active.href}
            className={cn(
              buttonVariants({ variant: "secondary", size: "sm" }),
              "h-8 gap-1 bg-background/80 shadow-none hover:bg-background",
            )}
          >
            {t(active.actionLabelKey)}
            <ArrowRight className="size-3.5 opacity-70" aria-hidden />
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-8 text-muted-foreground hover:bg-background/60 hover:text-foreground"
            aria-label={t("banner.dismiss")}
            onClick={() => dismiss(active.id)}
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  )
}
