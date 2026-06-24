import type { ReactNode } from "react"

import { PageShell } from "@/components/app/page-shell"

type AuthPageShellProps = {
  children: ReactNode
}

/** Full-viewport auth layout with sticky header and breadcrumb. */
export function AuthPageShell({ children }: AuthPageShellProps) {
  return <PageShell variant="auth">{children}</PageShell>
}
