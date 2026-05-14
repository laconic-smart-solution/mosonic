import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { CardDescription, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type AuthPageHeaderProps = {
  icon: LucideIcon
  title: string
  description: ReactNode
  className?: string
}

export function AuthPageHeader({
  icon: Icon,
  title,
  description,
  className,
}: AuthPageHeaderProps) {
  return (
    <div className={cn("flex flex-row items-start gap-4", className)}>
      <div
        className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15"
        aria-hidden
      >
        <Icon className="size-5" strokeWidth={1.75} />
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <CardTitle className="text-lg tracking-tight">{title}</CardTitle>
        <CardDescription className="text-pretty leading-relaxed">
          {description}
        </CardDescription>
      </div>
    </div>
  )
}
