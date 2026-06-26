import { Menu } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useLocation, useNavigate } from "react-router-dom"

import { TopbarSearch } from "@/components/core/topbar-search"
import { TopbarCreditBalance } from "@/components/core/topbar-credit-balance"
import { LanguageSwitcher } from "@/components/language-switcher"
import { ThemeToggle } from "@/components/theme-toggle"
import { NotificationBell } from "@/features/notifications/components/notification-bell"
import { useNotificationStore } from "@/features/notifications/notification.store"
import { disconnectSharedSocket } from "@/shared/socket/socket-client"
import { SidebarTrigger } from "@/components/ui/sidebar"
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
import { T } from "@/lib/tokens"
import { cn } from "@/lib/utils"
import { initialsFromDisplayName } from "@/shared/lib/user-initials"
import { useAuthStore } from "@/shared/stores/auth.store"
import { useUserStore } from "@/shared/stores/user.store"

const ROUTE_LABEL_KEYS: Record<string, string> = {
  "/dashboard": "routes.dashboard",
  "/rules": "routes.rules",
  "/workflow": "routes.workflow",
  "/content": "routes.content",
  "/upload": "routes.upload",
  "/posts": "routes.posts",
  "/pipelines": "routes.pipelines",
  "/usage": "routes.usage",
  "/cost": "routes.usage",
}

export function Topbar() {
  const { t } = useTranslation("common")
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const user = useUserStore((s) => s.user)
  const clearSession = useAuthStore((s) => s.clearSession)
  const clearUser = useUserStore((s) => s.clearUser)

  const displayName = user?.name?.trim() ? user.name.trim() : t("account")
  const initials = initialsFromDisplayName(user?.name)

  const label = location.pathname.startsWith("/workflow/")
    ? t("routes.workflow")
    : location.pathname.startsWith("/upload/")
      ? t("routes.upload")
      : location.pathname.startsWith("/posts/")
        ? t("routes.posts")
        : t(ROUTE_LABEL_KEYS[location.pathname] ?? "routes.dashboard")

  function handleLogout() {
    disconnectSharedSocket()
    useNotificationStore.getState().clearAll()
    clearSession()
    clearUser()
    navigate("/login", { replace: true })
  }

  function closeMobileMenu() {
    setMobileOpen(false)
  }

  const userAvatar = (
    <div className="flex size-5 shrink-0 items-center justify-center rounded-[5px] bg-gradient-to-br from-[#00A589] to-[#254C94] text-[9px] font-bold text-white">
      {initials}
    </div>
  )

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-10 flex h-14 min-h-14 shrink-0 items-center gap-1.5 border-b px-3 backdrop-blur-md sm:gap-2 sm:px-4 lg:gap-3 lg:px-5",
        )}
        style={{
          background: T.topbarBg,
          borderColor: T.topbarBorder,
        }}
      >
        <SidebarTrigger
          className={cn(
            "flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md border bg-card hover:bg-muted sm:size-9",
          )}
          style={{ borderColor: T.surfaceBorder, color: T.textPrimary }}
        />

        <div
          className="flex min-w-0 max-w-[38%] items-center gap-1 text-xs sm:max-w-none sm:gap-1.5"
          style={{ color: T.textSecondary }}
        >
          <span className="hidden shrink-0 md:inline" style={{ color: T.textMuted }}>
            {t("appName")}
          </span>
          <span className="hidden text-[10px] md:inline" style={{ color: T.textMuted }}>
            ›
          </span>
          <span className="truncate font-semibold" style={{ color: T.textPrimary }}>
            {label}
          </span>
        </div>

        <div className="hidden min-w-0 flex-1 justify-center px-2 lg:flex">
          <TopbarSearch />
        </div>

        <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1 sm:gap-1.5 lg:gap-2">
          <TopbarSearch compact className="lg:hidden" />
          <TopbarCreditBalance alwaysShowCount className="rounded-md" />
          <LanguageSwitcher className="hidden min-w-[7.5rem] xl:flex" />
          <ThemeToggle className="hidden md:flex" />
          <NotificationBell />
          <DropdownMenu>
            <DropdownMenuTrigger
              type="button"
              className={cn(
                "flex cursor-pointer items-center gap-1.5 rounded-md border bg-card text-xs transition-colors outline-none hover:bg-muted",
                "p-1 focus-visible:ring-2 focus-visible:ring-ring/25 md:px-2.5 md:py-1.5",
              )}
              style={{ borderColor: T.surfaceBorder, color: T.textPrimary }}
              aria-label={t("accountMenu")}
            >
              {userAvatar}
              <span className="hidden max-w-[140px] truncate font-medium md:inline">
                {displayName}
              </span>
              <svg
                className="hidden md:block"
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                aria-hidden
              >
                <path
                  d="M2 4l3 3 3-3"
                  stroke={T.textMuted}
                  strokeWidth="1.3"
                  strokeLinecap="round"
                />
              </svg>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              <DropdownMenuItem variant="destructive" onClick={handleLogout}>
                {t("logOut")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="xl:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label={t("topbar.openMenu")}
          >
            <Menu className="size-5" aria-hidden />
          </Button>
        </div>
      </header>

      <Drawer open={mobileOpen} onOpenChange={setMobileOpen} direction="right">
        <DrawerContent variant="panel" showCloseButton className="w-[min(100vw-2rem,20rem)] p-0">
          <DrawerHeader className="border-b border-border px-4 py-4 text-left">
            <DrawerTitle className="font-heading text-base">{t("topbar.menu")}</DrawerTitle>
          </DrawerHeader>

          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
            <div className="space-y-2 lg:hidden">
              <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                {t("search.ariaLabel")}
              </p>
              <TopbarSearch
                className="w-full max-w-none"
                onNavigate={closeMobileMenu}
              />
            </div>

            <Separator className="lg:hidden" />

            <div className="space-y-2">
              <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                {t("language")}
              </p>
              <LanguageSwitcher
                size="sm"
                className="h-9 w-full min-w-0 rounded-lg border-border/60 bg-background/60 text-xs shadow-none"
              />
            </div>

            <div className="space-y-2 md:hidden">
              <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                {t("topbar.theme")}
              </p>
              <ThemeToggle className="size-9 rounded-lg border border-border bg-card" />
            </div>

            <Separator />

            <div className="flex items-center gap-3">
              {userAvatar}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
                <p className="text-xs text-muted-foreground">{t("account")}</p>
              </div>
            </div>

            <Button
              type="button"
              variant="ghost"
              className="h-10 justify-start px-3 text-destructive hover:text-destructive"
              onClick={() => {
                closeMobileMenu()
                handleLogout()
              }}
            >
              {t("logOut")}
            </Button>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  )
}
