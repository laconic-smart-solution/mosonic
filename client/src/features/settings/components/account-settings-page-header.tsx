import type { ReactNode } from "react"
import { UserCog } from "lucide-react"

import { T } from "@/lib/tokens"

type AccountSettingsPageHeaderProps = {
  className?: string
  /** Primary actions (e.g. profile + sync) aligned to the right on wide viewports. */
  actions?: ReactNode
}

export function AccountSettingsPageHeader({ className, actions }: AccountSettingsPageHeaderProps) {
  return (
    <header className={className}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <UserCog className="size-5 shrink-0" strokeWidth={1.75} style={{ color: T.accent }} aria-hidden />
            <h1 className="m-0 text-xl font-bold tracking-[-0.35px] sm:text-2xl" style={{ color: T.textPrimary }}>
              Account settings
            </h1>
          </div>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed" style={{ color: T.textSecondary }}>
            Link the channels you publish to. Connections are shared with upload and scheduling so you only
            authenticate once.
          </p>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 lg:pt-0.5">{actions}</div> : null}
      </div>
    </header>
  )
}
