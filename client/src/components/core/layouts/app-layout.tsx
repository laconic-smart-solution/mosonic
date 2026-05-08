import { useState } from "react"
import { Outlet } from "react-router-dom"

import { SidebarPanel } from "@/components/core/sidebar"
import { Topbar } from "@/components/core/topbar"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { T } from "@/lib/tokens"
import { cn } from "@/lib/utils"

function AppLayout() {
  const [navOpen, setNavOpen] = useState(false)

  return (
    <div className="flex h-screen min-w-0 flex-col overflow-hidden bg-[color:var(--nt-canvas)]">
      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className={cn(
            "p-0 shadow-none !w-[min(216px,100vw)] !max-w-none border-[#0F1F3D] sm:!max-w-none",
            "data-[side=left]:!w-[min(216px,100vw)]",
          )}
          style={{ borderColor: T.sidebarBorder, background: T.sidebarBg }}
        >
          <SheetTitle className="sr-only">Main navigation</SheetTitle>
          <SidebarPanel onNavigate={() => setNavOpen(false)} className="min-h-0 flex-1 border-r-0" />
        </SheetContent>
      </Sheet>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar onOpenNav={() => setNavOpen(true)} />
        <main className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-[color:var(--nt-canvas)]">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto [animation:fadeUp_0.3s_cubic-bezier(0.16,1,0.3,1)]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

export default AppLayout
