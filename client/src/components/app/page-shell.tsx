import type { ReactNode } from "react"

import { PageBreadcrumb } from "@/components/app/page-breadcrumb"
import { usePageBreadcrumbs } from "@/components/app/use-page-breadcrumbs"
import { LanguageSwitcher } from "@/components/language-switcher"
import { cn } from "@/lib/utils"
import type { BreadcrumbItem } from "@/lib/route-breadcrumbs"

export type PageShellVariant = "standard" | "canvas" | "auth" | "marketing"

type PageShellProps = {
  variant?: PageShellVariant
  breadcrumb?: BreadcrumbItem[]
  breadcrumbHidden?: boolean
  className?: string
  children: ReactNode
}

const STANDARD_SHELL =
  "min-h-full w-full bg-[color:var(--nt-canvas)] px-4 py-5 sm:px-5"

export function PageShell({
  variant = "standard",
  breadcrumb,
  breadcrumbHidden = false,
  className,
  children,
}: PageShellProps) {
  const items = usePageBreadcrumbs(breadcrumb)
  const showBreadcrumb = !breadcrumbHidden && items.length > 0

  if (variant === "auth") {
    return (
      <main
        className={cn(
          "relative flex min-h-svh flex-1 flex-col bg-background text-foreground",
          className,
        )}
      >
        <header className="sticky top-0 z-10 w-full border-b border-border bg-background/95 backdrop-blur-sm supports-backdrop-filter:bg-background/80">
          <div className="flex h-14 w-full items-center justify-between gap-3 px-4 sm:px-5">
            {showBreadcrumb ? (
              <PageBreadcrumb items={items} className="mb-0" />
            ) : (
              <span />
            )}
            <LanguageSwitcher />
          </div>
        </header>
        <div className="flex flex-1 items-center justify-center px-4 py-10">{children}</div>
      </main>
    )
  }

  if (variant === "marketing") {
    return (
      <div className={cn("relative flex min-h-screen w-full flex-col overflow-hidden", className)}>
        {showBreadcrumb ? (
          <div className="absolute top-4 left-4 z-20 sm:left-5">
            <PageBreadcrumb items={items} className="mb-0" />
          </div>
        ) : null}
        {children}
      </div>
    )
  }

  if (variant === "canvas") {
    return (
      <div
        className={cn(
          STANDARD_SHELL,
          "flex min-h-0 flex-1 flex-col overflow-hidden",
          className,
        )}
        style={{ minHeight: "100%" }}
      >
        {showBreadcrumb ? <PageBreadcrumb items={items} /> : null}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
      </div>
    )
  }

  return (
    <div className={cn(STANDARD_SHELL, className)} style={{ minHeight: "100%" }}>
      {/* {showBreadcrumb ? <PageBreadcrumb items={items} /> : null} */}
      {children}
    </div>
  )
}
