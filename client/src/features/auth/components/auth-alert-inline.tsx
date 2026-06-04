import { CircleAlert } from "lucide-react"
import type { ReactNode } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { cn } from "@/lib/utils"

type AuthAlertInlineProps = {
  title?: string
  children: ReactNode
  variant?: "default" | "destructive"
  className?: string
}

export function AuthAlertInline({
  title,
  children,
  variant = "destructive",
  className,
}: AuthAlertInlineProps) {
  return (
    <Alert variant={variant} className={cn("text-left", className)}>
      <CircleAlert className="size-4" />
      {title ? <AlertTitle>{title}</AlertTitle> : null}
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  )
}
