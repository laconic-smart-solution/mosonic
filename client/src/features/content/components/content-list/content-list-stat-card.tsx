import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function ContentListStatCard({
  value,
  label,
  dotClass,
}: {
  value: number | string
  label: ReactNode
  dotClass?: string
}) {
  return (
    <div className="min-w-[130px] flex-1 rounded-xl border border-canvas-200 bg-card px-[18px] py-3.5">
      <div className="font-heading text-[26px] leading-none text-navy-700">{value}</div>
      <div className="mt-1 flex items-center text-xs text-canvas-500">
        {dotClass ? (
          <span className={cn("mr-1.5 size-2 shrink-0 rounded-full", dotClass)} aria-hidden />
        ) : null}
        {label}
      </div>
    </div>
  )
}
