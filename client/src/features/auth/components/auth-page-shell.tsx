import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

type AuthPageShellProps = {
  children: ReactNode
  className?: string
}

/** Centered auth layout with subtle background (viewport-centered, not top-pinned). */
export function AuthPageShell({ children, className }: AuthPageShellProps) {
  return (
    <div
      className={cn(
        "relative flex min-h-dvh w-full flex-col justify-center bg-linear-to-b from-muted/50 via-background to-background px-4 py-10 sm:py-12",
        "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-linear-to-r before:from-transparent before:via-border before:to-transparent",
        className,
      )}
    >
      <div className="relative mx-auto w-full max-w-md shrink-0">{children}</div>
    </div>
  )
}
