import { Home } from "lucide-react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { LanguageSwitcher } from "@/components/language-switcher"
import { buttonVariants } from "@/lib/button-variants"
import { cn } from "@/lib/utils"

type AuthPageShellProps = {
  children: ReactNode
}

/** Full-viewport auth layout with sticky header (beauty-phoo pattern). */
export function AuthPageShell({ children }: AuthPageShellProps) {
  const { t } = useTranslation("auth")

  return (
    <main className="bg-background text-foreground relative flex min-h-svh flex-1 flex-col">
      <header className="border-border bg-background/95 supports-backdrop-filter:bg-background/80 sticky top-0 z-10 w-full border-b backdrop-blur-sm">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link
            to="/"
            aria-label={t("backToHome")}
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "text-muted-foreground normal-case tracking-normal",
            )}
          >
            <Home className="size-4" strokeWidth={1.5} />
            <span className="hidden sm:inline">{t("backToHome")}</span>
          </Link>
          <LanguageSwitcher />
        </div>
      </header>

      <div className="flex flex-1 items-center justify-center px-4 py-10">
        {children}
      </div>
    </main>
  )
}
