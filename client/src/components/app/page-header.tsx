import type { ReactNode } from "react"

import { T } from "@/lib/tokens"
import { cn } from "@/lib/utils"

type PageHeaderProps = {
  title: string
  description?: string
  className?: string
  actions?: ReactNode
}

export function PageHeader({ title, description, className, actions }: PageHeaderProps) {
  return (
    <div
      className={cn("flex flex-wrap items-start justify-between gap-3", className)}
    >
      <div>
        <h1
          className="m-0 text-[22px] font-bold tracking-[-0.5px]"
          style={{ color: T.textPrimary }}
        >
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-[13px]" style={{ color: T.textSecondary }}>
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}
