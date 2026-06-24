import { useTranslation } from "react-i18next"
import { NavLink, useNavigate } from "react-router-dom"

import Logo from "@/assets/icon/logo"
import { LanguageSwitcher } from "@/components/language-switcher"
import { ThemeToggle } from "@/components/theme-toggle"
import { TopbarCreditBalance } from "@/components/core/topbar-credit-balance"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { initialsFromDisplayName } from "@/shared/lib/user-initials"
import { useAuthStore } from "@/shared/stores/auth.store"
import { useUserStore } from "@/shared/stores/user.store"

const MARKETING_NAV = [
  { path: "/pricing", labelKey: "marketing:nav.pricing" },
  { path: "/about", labelKey: "marketing:nav.about" },
] as const

export function MarketingNavbar() {
  const { t } = useTranslation(["home", "common", "marketing"])
  const navigate = useNavigate()
  const accessToken = useAuthStore((s) => s.accessToken)
  const user = useUserStore((s) => s.user)
  const clearSession = useAuthStore((s) => s.clearSession)
  const clearUser = useUserStore((s) => s.clearUser)

  function handleLogout() {
    clearSession()
    clearUser()
    navigate("/login", { replace: true })
  }

  return (
    <header className="fixed top-0 right-0 left-0 z-20 flex h-14 items-center justify-between border-b border-border/60 bg-background/40 px-4 backdrop-blur-md sm:px-6">
      <button
        type="button"
        onClick={() => navigate("/")}
        className="relative z-10 flex w-fit shrink-0 items-center gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[#00A589]/25"
        aria-label={t("common:appName")}
      >
        <Logo className="size-7 shrink-0" />
        <span className="text-sm font-semibold tracking-wide text-foreground">
          {t("common:appName")}
        </span>
      </button>

      <nav
        className="pointer-events-none absolute inset-x-0 hidden items-center justify-center md:flex"
        aria-label={t("marketing:nav.ariaLabel")}
      >
        <div className="pointer-events-auto flex items-center gap-0.5">
          {MARKETING_NAV.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#00A589]/25",
                  isActive
                    ? "bg-foreground/5 text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )
              }
            >
              {t(item.labelKey)}
            </NavLink>
          ))}
        </div>
      </nav>

      <div className="relative z-10 flex shrink-0 items-center gap-1.5 sm:gap-2">
        <LanguageSwitcher
          size="sm"
          className="h-8 min-w-[6.75rem] rounded-full border-border/60 bg-background/60 text-xs shadow-none"
        />
        <ThemeToggle className="size-8 rounded-full hover:bg-foreground/5" />
        {accessToken ? (
          <>
            <TopbarCreditBalance
              className="rounded-full px-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
              alwaysShowCount
            />
            <span className="hidden max-w-[140px] truncate text-xs font-medium text-muted-foreground sm:inline">
              {user?.name?.trim() ? user.name.trim() : t("home:userStrip.loading")}
            </span>
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt=""
                className="size-8 shrink-0 rounded-full object-cover shadow-[0_2px_8px_#00A58940]"
              />
            ) : (
              <div className="flex size-8 shrink-0 cursor-default items-center justify-center rounded-full bg-gradient-to-br from-[#00A589] to-[#254C94] text-xs font-bold text-white shadow-[0_2px_8px_#00A58940]">
                {initialsFromDisplayName(user?.name)}
              </div>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger
                type="button"
                className={cn(
                  "flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
                  "outline-none focus-visible:ring-2 focus-visible:ring-[#00A589]/25",
                )}
                aria-label={t("common:accountMenu")}
              >
                {user?.roleName === "ADMIN"
                  ? t("home:userStrip.admin")
                  : user?.roleName === "CUSTOMER"
                    ? t("home:userStrip.member")
                    : t("home:userStrip.account")}
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden>
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
              className="h-8 rounded-full px-4 text-xs"
              onClick={() => navigate("/login")}
            >
              {t("home:userStrip.logIn")}
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 rounded-full px-4 text-xs"
              onClick={() => navigate("/signup")}
            >
              {t("home:userStrip.signUp")}
            </Button>
          </>
        )}
      </div>
    </header>
  )
}
