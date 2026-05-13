import { useLocation, useNavigate } from "react-router-dom"

import { TopbarSearch } from "@/components/core/topbar-search"
import { SidebarTrigger } from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { T } from "@/lib/tokens"
import { cn } from "@/lib/utils"
import { initialsFromDisplayName } from "@/shared/lib/user-initials"
import { useAnalyticsPendingSummary } from "@/shared/queries/analytics.query"
import { useAuthStore } from "@/shared/stores/auth.store"
import { useUserStore } from "@/shared/stores/user.store"

const ROUTE_LABELS: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/rules": "Rules",
  "/workflow": "Workflows",
  "/run": "Live Run",
  "/content": "Content",
  "/upload": "Upload",
  "/analytics": "Analytics",
  "/logs": "Logs",
  "/components": "Components",
}

export function Topbar() {
  const location = useLocation()
  const navigate = useNavigate()
  const user = useUserStore((s) => s.user)
  const clearSession = useAuthStore((s) => s.clearSession)
  const clearUser = useUserStore((s) => s.clearUser)
  const { data: pendingSuggestions = 0 } = useAnalyticsPendingSummary()

  const displayName = user?.name?.trim() ? user.name.trim() : "Account"
  const initials = initialsFromDisplayName(user?.name)

  const label = location.pathname.startsWith("/workflow/")
    ? "Workflows"
    : location.pathname.startsWith("/upload/")
      ? "Upload"
      : location.pathname.startsWith("/analytics/")
        ? "Analytics"
        : ROUTE_LABELS[location.pathname] ?? "Dashboard"

  function handleLogout() {
    clearSession()
    clearUser()
    navigate("/login", { replace: true })
  }

  return (
    <header
      className={cn(
        "sticky top-0 z-10 flex h-14 min-h-14 shrink-0 items-center gap-3 border-b px-5 backdrop-blur-md",
      )}
      style={{
        background: T.topbarBg,
        borderColor: T.topbarBorder,
      }}
    >
      <SidebarTrigger
        className={cn(
          "flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md border bg-white hover:bg-[#F7F9FC] md:size-9",
        )}
        style={{ borderColor: T.surfaceBorder, color: T.textPrimary }}
      />

      <div className="flex shrink-0 items-center gap-1.5 text-xs" style={{ color: T.textSecondary }}>
        <span style={{ color: T.textMuted }}>NeuralTex</span>
        <span className="text-[10px]" style={{ color: T.textMuted }}>
          ›
        </span>
        <span className="font-semibold" style={{ color: T.textPrimary }}>
          {label}
        </span>
        {pendingSuggestions > 0 && location.pathname.startsWith("/analytics") ? (
          <span
            className="ml-1.5 rounded-full px-1.5 py-px text-[10px] font-bold text-white"
            style={{ background: T.accent }}
            title="Pending AI suggestions"
          >
            {pendingSuggestions > 99 ? "99+" : pendingSuggestions}
          </span>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 justify-center px-2">
        <TopbarSearch />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex cursor-pointer items-center gap-1.5 rounded-md border bg-white px-2.5 py-1.5 text-xs transition-colors outline-none",
                "focus-visible:ring-2 focus-visible:ring-[#00A589]/25",
              )}
              style={{ borderColor: T.surfaceBorder, color: T.textPrimary }}
              aria-label="Account menu"
            >
              <div className="flex size-5 shrink-0 items-center justify-center rounded-[5px] bg-gradient-to-br from-[#00A589] to-[#254C94] text-[9px] font-bold text-white">
                {initials}
              </div>
              <span className="max-w-[140px] truncate font-medium">{displayName}</span>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
                <path
                  d="M2 4l3 3 3-3"
                  stroke={T.textMuted}
                  strokeWidth="1.3"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            <DropdownMenuItem variant="destructive" onClick={handleLogout}>
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
