import type { LucideIcon } from "lucide-react"
import {
  ArrowLeft,
  Coins,
  CreditCard,
  FileText,
  Gauge,
  History,
  LayoutDashboard,
  Megaphone,
  MessageCircle,
  MessageCircleQuestion,
  MessagesSquare,
  Plug,
  Settings2,
  ShoppingBag,
  Sparkles,
  Users,
  Workflow,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { Link, Outlet, useLocation } from "react-router-dom"

import { BreadcrumbOverrideProvider } from "@/components/app/breadcrumb-override.context"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { cn } from "@/lib/utils"

const NAV_ITEMS: {
  key:
    | "dashboard"
    | "users"
    | "cost"
    | "credit"
    | "nodeCredits"
    | "plans"
    | "topupPlans"
    | "usage"
    | "apiUsage"
    | "content"
    | "faq"
  href: string
  icon: LucideIcon
}[] = [
  { key: "dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { key: "users", href: "/admin/users", icon: Users },
  { key: "credit", href: "/admin/credit", icon: Gauge },
  { key: "nodeCredits", href: "/admin/node-credits", icon: Workflow },
  { key: "plans", href: "/admin/plans", icon: CreditCard },
  { key: "topupPlans", href: "/admin/topup-plans", icon: ShoppingBag },
  { key: "usage", href: "/admin/usage", icon: History },
  { key: "cost", href: "/admin/cost", icon: Coins },
  { key: "apiUsage", href: "/admin/api-usage", icon: Plug },
  { key: "content", href: "/admin/content", icon: FileText },
  { key: "faq", href: "/admin/faq", icon: MessageCircleQuestion },
]

const COMMUNICATION_CHILDREN: {
  key: "line" | "announcements"
  href: string
  icon: LucideIcon
}[] = [
  { key: "line", href: "/admin/communication/line", icon: MessageCircle },
  {
    key: "announcements",
    href: "/admin/communication/announcements",
    icon: Megaphone,
  },
]

const NODE_SETTINGS_CHILDREN: {
  key: "nodeSettingsImage"
  href: string
  icon: LucideIcon
}[] = [
  { key: "nodeSettingsImage", href: "/admin/node-settings/image", icon: Sparkles },
]

function pathActive(pathname: string, href: string) {
  if (pathname === href) return true
  return pathname.startsWith(`${href}/`)
}

export function AdminLayout() {
  const { t } = useTranslation("admin")
  const { pathname } = useLocation()
  const communicationActive = pathname.startsWith("/admin/communication")
  const nodeSettingsActive = pathname.startsWith("/admin/node-settings")

  return (
    <div className="flex h-dvh min-h-0 w-full max-w-[100vw] overflow-hidden">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-muted/40">
        <div className="border-b border-border px-4 py-4">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {t("layout.brand")}
          </div>
          <div className="text-sm font-semibold">{t("layout.title")}</div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
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

          <Accordion
            className="rounded-none border-0"
            defaultValue={communicationActive ? ["communication"] : undefined}
          >
            <AccordionItem value="communication" className="border-0 data-open:bg-transparent">
              <AccordionTrigger
                className={cn(
                  "rounded-lg px-3 py-2 hover:no-underline **:data-[slot=accordion-trigger-icon]:size-3.5",
                  communicationActive
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <MessagesSquare className="size-4 shrink-0" aria-hidden />
                  {t("layout.nav.communication")}
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-0 pb-0 [&_a]:no-underline">
                <div className="mt-0.5 flex flex-col gap-0.5 border-l border-border ml-4 pl-2">
                  {COMMUNICATION_CHILDREN.map((item) => {
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
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <Accordion
            className="rounded-none border-0"
            defaultValue={nodeSettingsActive ? ["node-settings"] : undefined}
          >
            <AccordionItem value="node-settings" className="border-0 data-open:bg-transparent">
              <AccordionTrigger
                className={cn(
                  "rounded-lg px-3 py-2 hover:no-underline **:data-[slot=accordion-trigger-icon]:size-3.5",
                  nodeSettingsActive
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <Settings2 className="size-4 shrink-0" aria-hidden />
                  {t("layout.nav.nodeSettings")}
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-0 pb-0 [&_a]:no-underline">
                <div className="mt-0.5 flex flex-col gap-0.5 border-l border-border ml-4 pl-2">
                  {NODE_SETTINGS_CHILDREN.map((item) => {
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
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
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
      <main className="relative min-w-0 flex-1 overflow-auto">
        <BreadcrumbOverrideProvider>
          <Outlet />
        </BreadcrumbOverrideProvider>
      </main>
    </div>
  )
}
