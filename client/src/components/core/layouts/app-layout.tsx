import { Outlet } from "react-router-dom"

import { SidebarPanel } from "@/components/core/sidebar"
import { Topbar } from "@/components/core/topbar"
import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
  SidebarRail,
} from "@/components/ui/sidebar"
import { NotificationProvider } from "@/features/notifications/notification-provider"
import { useSessionBootstrap } from "@/shared/hooks/use-session-bootstrap"

function AppLayout() {
  useSessionBootstrap()

  return (
    <SidebarProvider className="h-screen max-h-[100dvh] min-h-0 w-full overflow-hidden [--sidebar-width:216px]">
      <NotificationProvider />
      <Sidebar collapsible="icon" variant="sidebar" className="border-sidebar-border">
        <SidebarPanel />
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[color:var(--nt-canvas)]">
        <Topbar />
        <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-y-auto [animation:fadeUp_0.3s_cubic-bezier(0.16,1,0.3,1)]">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default AppLayout
