import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function ContentListStatCard({
  value,
  label,
  dotClass,
  active = false,
  onClick,
}: {
  value: number | string
  label: ReactNode
  dotClass?: string
  active?: boolean
  onClick?: () => void
}) {
  const className = cn(
    "min-w-[130px] flex-1 rounded-xl border px-[18px] py-3.5 text-left transition-colors",
    active
      ? "border-primary/40 bg-primary/5 shadow-sm"
      : "border-border bg-card hover:border-muted-foreground/30 hover:bg-muted/20",
  )

  const inner = (
    <>
      <div className="font-heading text-[26px] leading-none text-foreground">{value}</div>
      <div className="mt-1 flex items-center text-xs text-muted-foreground">
        {dotClass ? (
          <span className={cn("mr-1.5 size-2 shrink-0 rounded-full", dotClass)} aria-hidden />
        ) : null}
        {label}
      </div>
    </>
  )

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        {inner}
      </button>
    )
  }

  return <div className={className}>{inner}</div>
}
