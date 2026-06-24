import { Outlet } from "react-router-dom"

import { PageShell } from "@/components/app/page-shell"
import { MarketingFooter } from "@/features/marketing/components/marketing-footer"
import { MarketingNavbar } from "@/features/marketing/components/marketing-navbar"

export function MarketingLayout() {
  return (
    <PageShell variant="marketing" className="bg-background font-sans" breadcrumbHidden>
      <MarketingNavbar />
      <div className="flex min-h-screen flex-1 flex-col">
        <Outlet />
      </div>
      <MarketingFooter />
    </PageShell>
  )
}
