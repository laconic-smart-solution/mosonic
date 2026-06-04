import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

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

export function HomeUserStrip() {
  const { t } = useTranslation(["home", "common"])
  const navigate = useNavigate()
  const accessToken = useAuthStore((s) => s.accessToken)
  const user = useUserStore((s) => s.user)
  const clearSession = useAuthStore((s) => s.clearSession)
  const clearUser = useUserStore((s) => s.clearUser)

  if (!accessToken) return null

  const displayName = user?.name?.trim() ? user.name.trim() : t("home:userStrip.loading")
  const initials = initialsFromDisplayName(user?.name)
  const contextLabel =
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

  return (
    <div className="fixed top-0 right-0 z-20 flex items-center gap-2.5 p-4 pr-6">
      <span className="max-w-[160px] truncate text-xs font-medium text-muted-foreground">
        {displayName}
      </span>
      {user?.avatarUrl ? (
        <img
          src={user.avatarUrl}
          alt=""
          className="size-8 shrink-0 rounded-full object-cover shadow-[0_2px_8px_#00A58940]"
        />
      ) : (
        <div className="flex size-8 shrink-0 cursor-default items-center justify-center rounded-full bg-gradient-to-br from-[#00A589] to-[#254C94] text-xs font-bold text-white shadow-[0_2px_8px_#00A58940]">
          {initials}
        </div>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          type="button"
          className={cn(
            "flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
            "outline-none focus-visible:ring-2 focus-visible:ring-[#00A589]/25",
          )}
          aria-label={t("common:accountMenu")}
        >
          {contextLabel}
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
          <DropdownMenuItem onClick={() => navigate("/dashboard")}>
            {t("home:userStrip.dashboard")}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={handleLogout}>
            {t("common:logOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
