import type { ReactNode } from "react"

import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

type AuthOtpBlockProps = {
  label?: string
  children: ReactNode
  className?: string
}

export function AuthOtpBlock({
  label = "Code",
  children,
  className,
}: AuthOtpBlockProps) {
  return (
    <div className={cn("space-y-3", className)}>
      <Label className="text-foreground">{label}</Label>
      <div className="flex justify-center sm:justify-start">{children}</div>
    </div>
  )
}
