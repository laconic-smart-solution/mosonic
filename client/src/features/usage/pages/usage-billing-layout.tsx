import { NavLink, Outlet, useLocation } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { PageShell } from "@/components/app/page-shell"
import { cn } from "@/lib/utils"
import { UsagePlanBanner } from "@/features/usage/components/usage-plan-banner"
import { useCreditBalanceSocketRefresh } from "@/shared/queries/usage.query"
import { onCreditLowBalance } from "@/shared/socket/credit-events"

const TAB_ROUTES = [
  { id: "overview", path: "/usage" },
  { id: "topup", path: "/usage/topup" },
  { id: "plans", path: "/usage/plans" },
  { id: "history", path: "/usage/history" },
] as const

type TabId = (typeof TAB_ROUTES)[number]["id"]

function activeTabFromPath(pathname: string): TabId {
  if (pathname.startsWith("/usage/topup")) return "topup"
  if (pathname.startsWith("/usage/plans")) return "plans"
  if (pathname.startsWith("/usage/history")) return "history"
  return "overview"
}

export default function UsageBillingLayout() {
  const { t } = useTranslation("usage")
  const location = useLocation()
  const activeTab = activeTabFromPath(location.pathname)
  const [lowBalance, setLowBalance] = useState(false)
  useCreditBalanceSocketRefresh()

  useEffect(() => {
    return onCreditLowBalance((payload) => {
      setLowBalance(true)
      toast.warning(t("planBanner.lowBalance"), {
        description: t("planBanner.remaining", {
          count: Math.round(payload.creditsRemaining).toLocaleString(),
        }),
      })
    })
  }, [t])

  return (
    <PageShell>
      <div className="flex w-full flex-col gap-6">
        <div>
          <h1 className="font-heading m-0 text-[26px] leading-tight tracking-tight text-foreground">
            {t("title")}
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">{t("subtitle")}</p>
        </div>

        <UsagePlanBanner lowBalance={lowBalance} />

        <div role="tablist" aria-label={t("tabs.label")} className="flex flex-wrap gap-1 rounded-xl bg-muted/50 p-1">
          {TAB_ROUTES.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <NavLink
                key={tab.id}
                to={tab.path}
                end={tab.id === "overview"}
                role="tab"
                aria-selected={isActive}
                className={cn(
                  "inline-flex h-8 items-center justify-center rounded-lg px-3 text-sm font-medium transition-colors outline-none",
                  "focus-visible:ring-2 focus-visible:ring-ring/25",
                  isActive
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`tabs.${tab.id}`)}
              </NavLink>
            )
          })}
        </div>

        <Outlet />
      </div>
    </PageShell>
  )
}
