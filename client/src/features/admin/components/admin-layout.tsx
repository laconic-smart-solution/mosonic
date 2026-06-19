import type { LucideIcon } from "lucide-react"
import {
  ArrowLeft,
  Coins,
  CreditCard,
  FileText,
  Gauge,
  History,
  LayoutDashboard,
  Plug,
  Users,
  Workflow,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { Link, Outlet, useLocation } from "react-router-dom"

import { BreadcrumbOverrideProvider } from "@/components/app/breadcrumb-override.context"
import { cn } from "@/lib/utils"

const NAV_ITEMS: {
  key: "dashboard" | "users" | "cost" | "credit" | "nodeCredits" | "plans" | "usage" | "apiUsage" | "content"
  href: string
  icon: LucideIcon
}[] = [
  { key: "dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { key: "users", href: "/admin/users", icon: Users },
  { key: "credit", href: "/admin/credit", icon: Gauge },
  { key: "nodeCredits", href: "/admin/node-credits", icon: Workflow },
  { key: "plans", href: "/admin/plans", icon: CreditCard },
  { key: "usage", href: "/admin/usage", icon: History },
  { key: "cost", href: "/admin/cost", icon: Coins },
  { key: "apiUsage", href: "/admin/api-usage", icon: Plug },
  { key: "content", href: "/admin/content", icon: FileText },
]

function pathActive(pathname: string, href: string) {
  if (pathname === href) return true
  return pathname.startsWith(`${href}/`)
}

export function AdminLayout() {
  const { t } = useTranslation("admin")
  const { pathname } = useLocation()

  return (
    <div className="flex h-dvh min-h-0 w-full max-w-[100vw] overflow-hidden">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-muted/40">
        <div className="border-b border-border px-4 py-4">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {t("layout.brand")}
          </div>
          <div className="text-sm font-semibold">{t("layout.title")}</div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-2">
          {NAV_ITEMS.map((item) => {
            const active = pathActive(pathname, item.href)
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <item.icon className="size-4 shrink-0" aria-hidden />
                {t(`layout.nav.${item.key}`)}
              </Link>
            )
          })}
        </nav>
        <div className="border-t border-border px-4 py-3">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            {t("layout.backToApp")}
          </Link>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-auto">
        <BreadcrumbOverrideProvider>
          <Outlet />
        </BreadcrumbOverrideProvider>
      </main>
    </div>
  )
}
