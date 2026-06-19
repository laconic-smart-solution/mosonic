import type { ComponentType } from "react"
import { Mail, Phone, MapPin, Shield } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Skeleton } from "@/components/ui/skeleton"
import { initialsFromDisplayName } from "@/shared/lib/user-initials"
import type { User } from "@/shared/types/user.type"
import { cn } from "@/lib/utils"

type AccountUserProfileCardProps = {
  user: User | null
  loading?: boolean
  className?: string
}

function roleLabel(roleName: string | undefined, t: (key: string) => string): string {
  if (roleName === "ADMIN") return t("profile.roles.admin")
  if (roleName === "CUSTOMER") return t("profile.roles.member")
  return roleName?.trim() || "—"
}

function ProfileField({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Icon className="size-3.5 text-muted-foreground" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="mt-0.5 break-words text-sm text-foreground">{value}</div>
      </div>
    </div>
  )
}

export function AccountUserProfileCard({
  user,
  loading = false,
  className,
}: AccountUserProfileCardProps) {
  const { t } = useTranslation("settings")

  if (loading) {
    return (
      <section
        className={cn(
          "overflow-hidden rounded-2xl border border-border bg-card p-5",
          className,
        )}
      >
        <div className="flex flex-col items-center gap-3 border-b border-border pb-5">
          <Skeleton className="size-16 rounded-full" />
          <Skeleton className="h-5 w-36 rounded-md" />
          <Skeleton className="h-4 w-48 rounded-md" />
        </div>
        <div className="mt-5 space-y-4">
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      </section>
    )
  }

  const displayName = user?.name?.trim() || t("profile.unnamed")
  const initials = initialsFromDisplayName(user?.name)

  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-card lg:sticky lg:top-20",
        className,
      )}
    >
      <div className="flex flex-col items-center gap-2 border-b border-border px-5 py-6 text-center">
        {user?.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt=""
            className="size-16 shrink-0 rounded-full object-cover ring-2 ring-border"
          />
        ) : (
          <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#00A589] to-[#254C94] text-lg font-bold text-white ring-2 ring-border">
            {initials}
          </div>
        )}
        <div>
          <h2 className="text-base font-semibold text-foreground">{displayName}</h2>
          {user?.email ? (
            <p className="mt-0.5 text-[13px] text-muted-foreground">{user.email}</p>
          ) : null}
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          <Shield className="size-3" aria-hidden />
          {roleLabel(user?.roleName, t)}
        </span>
      </div>

      <div className="space-y-4 p-5">
        {user?.phoneNumber?.trim() ? (
          <ProfileField icon={Phone} label={t("profile.phone")} value={user.phoneNumber.trim()} />
        ) : null}
        {user?.address?.trim() ? (
          <ProfileField icon={MapPin} label={t("profile.address")} value={user.address.trim()} />
        ) : null}
        {!user?.phoneNumber?.trim() && !user?.address?.trim() ? (
          <ProfileField icon={Mail} label={t("profile.email")} value={user?.email?.trim() || "—"} />
        ) : null}
      </div>
    </section>
  )
}
