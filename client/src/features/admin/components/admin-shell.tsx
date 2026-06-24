import { AdminLayout } from "@/features/admin/components/admin-layout"
import { useSessionBootstrap } from "@/shared/hooks/use-session-bootstrap"

/** Standalone admin shell — outside main app sidebar/topbar. */
export function AdminShell() {
  useSessionBootstrap()
  return <AdminLayout />
}
