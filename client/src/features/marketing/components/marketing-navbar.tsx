import { Menu } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { NavLink, useNavigate } from "react-router-dom"

import Logo from "@/assets/icon/logo"
import { LanguageSwitcher } from "@/components/language-switcher"
import { ThemeToggle } from "@/components/theme-toggle"
import { TopbarCreditBalance } from "@/components/core/topbar-credit-balance"
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { initialsFromDisplayName } from "@/shared/lib/user-initials"
import { useAuthStore } from "@/shared/stores/auth.store"
import { useUserStore } from "@/shared/stores/user.store"

const MARKETING_NAV = [
  { path: "/pricing", labelKey: "marketing:nav.pricing" },
  { path: "/about", labelKey: "marketing:nav.about" },
] as const

function marketingNavLinkClass(isActive: boolean, compact = false) {
  return cn(
    compact
      ? "rounded-lg px-3 py-2.5 text-sm font-medium"
      : "rounded-full px-3 py-1.5 text-xs font-medium",
    "transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#00A589]/25",
    isActive
      ? "bg-foreground/5 text-foreground"
      : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
  )
}

type MarketingNavLinksProps = {
  className?: string
  compact?: boolean
  onNavigate?: () => void
}

function MarketingNavLinks({
  className,
  compact = false,
  onNavigate,
}: MarketingNavLinksProps) {
  const { t } = useTranslation("marketing")

  return (
    <div className={cn(compact ? "flex flex-col gap-0.5" : "flex items-center gap-0.5", className)}>
      {MARKETING_NAV.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          onClick={onNavigate}
          className={({ isActive }) => marketingNavLinkClass(isActive, compact)}
        >
          {t(item.labelKey)}
        </NavLink>
      ))}
    </div>
  )
}

export function MarketingNavbar() {
  const { t } = useTranslation(["home", "common", "marketing"])
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const accessToken = useAuthStore((s) => s.accessToken)
  const user = useUserStore((s) => s.user)
  const clearSession = useAuthStore((s) => s.clearSession)
  const clearUser = useUserStore((s) => s.clearUser)

  const displayName = user?.name?.trim() ? user.name.trim() : t("home:userStrip.loading")
  const roleLabel =
    user?.roleName === "ADMIN"
      ? t("home:userStrip.admin")
      : user?.roleName === "CUSTOMER"
        ? t("home:userStrip.member")
        : t("home:userStrip.account")

  function handleLogout() {
    clearSession()
    clearUser()
    navigate("/login", { replace: true })
  }

  function closeMobileMenu() {
    setMobileOpen(false)
  }

  function navigateFromMenu(path: string) {
    closeMobileMenu()
    navigate(path)
  }

  const userAvatar = user?.avatarUrl ? (
    <img
      src={user.avatarUrl}
      alt=""
      className="size-8 shrink-0 rounded-full object-cover shadow-[0_2px_8px_#00A58940]"
    />
  ) : (
    <div className="flex size-8 shrink-0 cursor-default items-center justify-center rounded-full bg-gradient-to-br from-[#00A589] to-[#254C94] text-xs font-bold text-white shadow-[0_2px_8px_#00A58940]">
      {initialsFromDisplayName(user?.name)}
    </div>
  )

  return (
    <>
      <header className="fixed top-0 right-0 left-0 z-20 flex h-14 items-center justify-between gap-2 border-b border-border/60 bg-background/40 px-3 backdrop-blur-md sm:gap-3 sm:px-6">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="relative z-10 flex min-w-0 shrink items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[#00A589]/25"
          aria-label={t("common:appName")}
        >
          <Logo className="size-7 shrink-0" />
          <span className="hidden truncate text-sm font-semibold tracking-wide text-foreground sm:inline">
            {t("common:appName")}
          </span>
        </button>

        <nav
          className="pointer-events-none absolute inset-x-0 hidden items-center justify-center md:flex"
          aria-label={t("marketing:nav.ariaLabel")}
        >
          <div className="pointer-events-auto">
            <MarketingNavLinks />
          </div>
        </nav>

        <div className="relative z-10 flex min-w-0 shrink-0 items-center gap-1 sm:gap-1.5 md:gap-2">
          <LanguageSwitcher
            size="sm"
            className="hidden h-8 min-w-[6.75rem] rounded-full border-border/60 bg-background/60 text-xs shadow-none md:flex"
          />
          <ThemeToggle className="size-8 rounded-full hover:bg-foreground/5" />

          {accessToken ? (
            <>
              <TopbarCreditBalance className="hidden rounded-full px-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:flex" />
              <span className="hidden max-w-[140px] truncate text-xs font-medium text-muted-foreground lg:inline">
                {displayName}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger
                  type="button"
                  className={cn(
                    "flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card text-[11px] font-medium text-muted-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
                    "p-1 pr-2.5 outline-none focus-visible:ring-2 focus-visible:ring-[#00A589]/25 md:px-2.5 md:py-1",
                  )}
                  aria-label={t("common:accountMenu")}
                >
                  {userAvatar}
                  <span className="hidden md:inline">{roleLabel}</span>
                  <svg
                    className="hidden md:block"
                    width="9"
                    height="9"
                    viewBox="0 0 9 9"
                    fill="none"
                    aria-hidden
                  >
                    <path
                      d="M1.5 3.5l3 3 3-3"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                    />
                  </svg>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-48">
                  <DropdownMenuItem onClick={() => navigate("/usage")}>
                    {t("home:userStrip.usage")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/dashboard")}>
                    {t("home:userStrip.dashboard")}
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={handleLogout}>
                    {t("common:logOut")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="hidden h-8 rounded-full px-4 text-xs sm:inline-flex"
                onClick={() => navigate("/login")}
              >
                {t("home:userStrip.logIn")}
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-8 rounded-full px-3 text-xs sm:px-4"
                onClick={() => navigate("/signup")}
              >
                {t("home:userStrip.signUp")}
              </Button>
            </>
          )}

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="rounded-full md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label={t("marketing:nav.openMenu")}
          >
            <Menu className="size-5" aria-hidden />
          </Button>
        </div>
      </header>

      <Drawer open={mobileOpen} onOpenChange={setMobileOpen} direction="right">
        <DrawerContent variant="panel" showCloseButton className="w-[min(100vw-2rem,20rem)] p-0">
          <DrawerHeader className="border-b border-border px-4 py-4 text-left">
            <DrawerTitle className="font-heading text-base">{t("marketing:nav.menu")}</DrawerTitle>
          </DrawerHeader>

          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
            <nav aria-label={t("marketing:nav.ariaLabel")}>
              <MarketingNavLinks compact onNavigate={closeMobileMenu} />
            </nav>

            <Separator />

            <div className="space-y-2">
              <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                {t("common:language")}
              </p>
              <LanguageSwitcher
                size="sm"
                className="h-9 w-full min-w-0 rounded-lg border-border/60 bg-background/60 text-xs shadow-none"
              />
            </div>

            {accessToken ? (
              <>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    {userAvatar}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
                      <p className="text-xs text-muted-foreground">{roleLabel}</p>
                    </div>
                  </div>
                  <TopbarCreditBalance
                    alwaysShowCount
                    className="h-10 w-full justify-center gap-2 rounded-lg px-3"
                  />
                  <div className="flex flex-col gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-10 justify-start px-3"
                      onClick={() => navigateFromMenu("/usage")}
                    >
                      {t("home:userStrip.usage")}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-10 justify-start px-3"
                      onClick={() => navigateFromMenu("/dashboard")}
                    >
                      {t("home:userStrip.dashboard")}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-10 justify-start px-3 text-destructive hover:text-destructive"
                      onClick={() => {
                        closeMobileMenu()
                        handleLogout()
                      }}
                    >
                      {t("common:logOut")}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <Separator />
                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 w-full"
                    onClick={() => navigateFromMenu("/login")}
                  >
                    {t("home:userStrip.logIn")}
                  </Button>
                  <Button
                    type="button"
                    className="h-10 w-full"
                    onClick={() => navigateFromMenu("/signup")}
                  >
                    {t("home:userStrip.signUp")}
                  </Button>
                </div>
              </>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  )
}
