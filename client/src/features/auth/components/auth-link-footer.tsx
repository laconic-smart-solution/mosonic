import type { ReactNode } from "react"
import { Link } from "react-router-dom"

import { buttonVariants } from "@/lib/button-variants"
import { cn } from "@/lib/utils"

type AuthLinkFooterProps = {
  children?: ReactNode
  className?: string
}

export function AuthLinkFooter({ children, className }: AuthLinkFooterProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 text-center text-sm text-muted-foreground",
        className,
      )}
    >
      {children}
    </div>
  )
}

type AuthTextLinkProps = {
  to: string
  children: ReactNode
  className?: string
}

/** Standalone footer link (block row). */
export function AuthTextLink({ to, children, className }: AuthTextLinkProps) {
  return (
    <Link
      to={to}
      className={cn(
        buttonVariants({ variant: "link", size: "default" }),
        "h-auto min-h-0 justify-center p-0 text-sm font-medium",
        className,
      )}
    >
      {children}
    </Link>
  )
}

type AuthInlineLinkProps = {
  to: string
  children: ReactNode
}

/** Link embedded in a sentence (e.g. "Back to <Sign in>"). */
export function AuthInlineLink({ to, children }: AuthInlineLinkProps) {
  return (
    <Link
      to={to}
      className={cn(
        buttonVariants({ variant: "link", size: "default" }),
        "inline h-auto min-h-0 p-0 align-baseline text-sm font-medium",
      )}
    >
      {children}
    </Link>
  )
}
