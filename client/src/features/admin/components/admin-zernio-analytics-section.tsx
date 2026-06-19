import { AlertTriangle, Coins, Link2, Star, Users } from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

import type { ApiProviderBillingSummary } from "../types/api-usage.types"

function formatCount(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—"
  return value.toLocaleString()
}

function formatUsd(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—"
  return `$${value.toFixed(2)}`
}

type Props = {
  data: ApiProviderBillingSummary | undefined
}

export function AdminZernioAnalyticsSection({ data }: Props) {
  const { t } = useTranslation("admin")
  const analyticsId = "zernio-analytics-heading"
  const profiles = data?.zernioProfiles ?? []

  const stats = [
    {
      key: "profilesTotal",
      label: t("zernio.analytics.profilesTotal"),
      hint: t("zernio.analytics.profilesTotalHint"),
      value: formatCount(data?.zernioProfilesTotal),
      icon: Users,
    },
    {
      key: "defaultProfiles",
      label: t("zernio.analytics.defaultProfiles"),
      hint: t("zernio.analytics.defaultProfilesHint"),
      value: formatCount(data?.zernioDefaultProfiles),
      icon: Star,
    },
    {
      key: "connectedAccounts",
      label: t("zernio.analytics.connectedAccounts"),
      hint: t("zernio.analytics.connectedAccountsHint"),
      value: formatCount(data?.zernioConnectedAccountsTotal),
      icon: Link2,
    },
    {
      key: "platformAccounts",
      label: t("zernio.analytics.platformAccounts"),
      hint: t("zernio.analytics.platformAccountsHint"),
      value: formatCount(data?.connectedAccountsCount),
      icon: Link2,
    },
    {
      key: "platformCost",
      label: t("zernio.analytics.platformCost"),
      hint: t("zernio.analytics.platformCostHint", { days: data?.spendDays ?? 180 }),
      value: formatUsd(data?.totalSpentUsd),
      icon: Coins,
    },
  ] as const

  const overLimitCount = data?.zernioOverLimitProfiles ?? 0

  return (
    <section aria-labelledby={analyticsId} className="space-y-4">
      <div>
        <h3 id={analyticsId} className="text-[13px] font-medium text-foreground">
          {t("zernio.analytics.title")}
        </h3>
        <p className="mt-1 text-[12px] text-muted-foreground">
          {t("zernio.analytics.subtitle")}
        </p>
      </div>

      <div
        role="group"
        aria-label={t("zernio.analytics.title")}
        className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5"
      >
        {stats.map((stat) => (
          <article
            key={stat.key}
            aria-label={`${stat.label}: ${stat.value}`}
            className="rounded-xl border border-border bg-card px-4 py-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
                {stat.label}
              </div>
              <stat.icon className="size-4 shrink-0 text-primary/70" aria-hidden />
            </div>
            <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-foreground">
              {stat.value}
            </p>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{stat.hint}</p>
          </article>
        ))}
      </div>

      {overLimitCount > 0 ? (
        <div
          role="status"
          className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm"
        >
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden
          />
          <p>
            {t("zernio.analytics.overLimitNotice", { count: overLimitCount })}
          </p>
        </div>
      ) : null}

      {profiles.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-border">
          <Table>
            <caption className="sr-only">{t("zernio.analytics.profilesTableCaption")}</caption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{t("zernio.analytics.profileName")}</TableHead>
                <TableHead scope="col" className="text-right">
                  {t("zernio.analytics.profileAccounts")}
                </TableHead>
                <TableHead scope="col" className="text-right">
                  {t("zernio.analytics.profileStatus")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.map((profile) => (
                <TableRow key={profile.id}>
                  <TableCell className="font-medium">{profile.name}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {profile.accountCount == null ? "—" : profile.accountCount.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
                        profile.overLimit
                          ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                          : profile.isDefault
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground",
                      )}
                    >
                      {profile.overLimit
                        ? t("zernio.analytics.statusOverLimit")
                        : profile.isDefault
                          ? t("zernio.analytics.statusDefault")
                          : t("zernio.analytics.statusActive")}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : data?.apiKeyConfigured ? (
        <p className="text-sm text-muted-foreground">{t("zernio.analytics.noProfiles")}</p>
      ) : null}
    </section>
  )
}
