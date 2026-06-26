import { Outlet, useLocation } from "react-router-dom"

import { PageShell } from "@/components/app/page-shell"
import { MarketingFooter } from "@/features/marketing/components/marketing-footer"
import { MarketingNavbar } from "@/features/marketing/components/marketing-navbar"

export function MarketingLayout() {
  const { pathname } = useLocation()
  const hideFooter = pathname === "/home"

  return (
    <PageShell variant="marketing" className="bg-background font-sans" breadcrumbHidden>
      <MarketingNavbar />
      <div className="flex min-h-screen flex-1 flex-col">
        <Outlet />
      </div>
      {!hideFooter ? <MarketingFooter /> : null}
    </PageShell>
  )
}
