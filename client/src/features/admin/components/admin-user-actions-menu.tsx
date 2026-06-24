import { ChevronDown, Coins, Eye, UserCheck, UserX } from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export type AdminUserActionTarget = {
  userId: string
  email: string
  role: string
  isSuspended: boolean
  creditsRemaining: number | null
  creditsPerMonth: number | null
}

type Props = {
  user: AdminUserActionTarget
  disabled?: boolean
  onViewDetail: () => void
  onDisable: () => void
  onEnable: () => void
  onTopUp: () => void
}

export function AdminUserActionsMenu({
  user,
  disabled = false,
  onViewDetail,
  onDisable,
  onEnable,
  onTopUp,
}: Props) {
  const { t } = useTranslation("admin")
  const isAdmin = user.role === "ADMIN"
  const hasPlan = user.creditsRemaining != null || user.creditsPerMonth != null
  const label = user.email || user.userId

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        className="inline-flex h-8 items-center gap-1 rounded-md border border-input bg-background px-2.5 text-sm shadow-xs hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
        disabled={disabled}
        aria-label={t("users.actionsMenuLabel", { email: label })}
        onClick={(e) => e.stopPropagation()}
      >
        {t("users.actionsMenuTrigger")}
        <ChevronDown className="size-3.5 opacity-60" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuItem
          onClick={(e) => {
            e.stopPropagation()
            onViewDetail()
          }}
        >
          <Eye className="size-4" aria-hidden />
          {t("users.viewDetail")}
        </DropdownMenuItem>

        {!isAdmin ? (
          <>
            <DropdownMenuSeparator />
            {user.isSuspended ? (
              <DropdownMenuItem
                disabled={disabled}
                onClick={(e) => {
                  e.stopPropagation()
                  onEnable()
                }}
              >
                <UserCheck className="size-4" aria-hidden />
                {t("users.enableAccount")}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                variant="destructive"
                disabled={disabled}
                onClick={(e) => {
                  e.stopPropagation()
                  onDisable()
                }}
              >
                <UserX className="size-4" aria-hidden />
                {t("users.disableAccount")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              disabled={!hasPlan || disabled}
              title={!hasPlan ? t("users.topUpNoPlan") : undefined}
              onClick={(e) => {
                e.stopPropagation()
                if (hasPlan) onTopUp()
              }}
            >
              <Coins className="size-4" aria-hidden />
              {t("users.topUpCredits")}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
