import type { ComponentType } from "react"
import {
  CheckCircle2,
  MapPin,
  MessageCircle,
  Phone,
  Shield,
  UserRound,
} from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { LineConnectDialog } from "@/features/settings/components/line-connect-dialog"
import { cn } from "@/lib/utils"
import { initialsFromDisplayName } from "@/shared/lib/user-initials"
import { useLineConnectStatusQuery } from "@/shared/queries/line.query"
import type { User } from "@/shared/types/user.type"

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

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5">
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground ring-1 ring-border">
        <Icon className="size-3.5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        <p className="mt-0.5 truncate text-[13px] font-medium text-foreground">
          {value}
        </p>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="mb-2.5 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
      {children}
    </p>
  )
}

export function AccountUserProfileCard({
  user,
  loading = false,
  className,
}: AccountUserProfileCardProps) {
  const { t } = useTranslation("settings")
  const [lineOpen, setLineOpen] = useState(false)
  const statusQuery = useLineConnectStatusQuery({ enabled: true })
  const lineConnected = statusQuery.data?.connected === true

  if (loading) {
    return (
      <section
        className={cn(
          "overflow-hidden rounded-2xl border border-border bg-card shadow-sm",
          className,
        )}
      >
        <div className="space-y-4 p-5">
          <div className="flex items-center gap-4">
            <Skeleton className="size-16 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-5 w-36 rounded-md" />
              <Skeleton className="h-4 w-28 rounded-md" />
            </div>
          </div>
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      </section>
    )
  }

  const displayName = user?.name?.trim() || t("profile.unnamed")
  const initials = initialsFromDisplayName(user?.name)
  const email = user?.email?.trim()
  const phone = user?.phoneNumber?.trim()
  const address = user?.address?.trim()

  return (
    <>
      <section
        className={cn(
          "overflow-hidden rounded-2xl border border-border bg-card shadow-sm lg:sticky lg:top-20",
          className,
        )}
      >
        <div className="border-b border-border bg-muted/25 px-5 py-4">
          <SectionLabel>{t("profile.sectionTitle")}</SectionLabel>
          <div className="flex items-center gap-4">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt=""
                className="size-16 shrink-0 rounded-full object-cover ring-2 ring-background shadow-sm"
              />
            ) : (
              <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#00A589] to-[#254C94] text-lg font-bold text-white ring-2 ring-background shadow-sm">
                {initials}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-semibold tracking-tight text-foreground">
                {displayName}
              </h2>
              <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                <Shield className="size-3" aria-hidden />
                {roleLabel(user?.roleName, t)}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-2.5 border-b border-border px-5 py-4">
          <SectionLabel>{t("profile.detailsTitle")}</SectionLabel>
          <DetailRow
            icon={UserRound}
            label={t("profile.email")}
            value={email || t("profile.notSet")}
          />
          <DetailRow
            icon={Phone}
            label={t("profile.phone")}
            value={phone || t("profile.notSet")}
          />
          <DetailRow
            icon={MapPin}
            label={t("profile.address")}
            value={address || t("profile.notSet")}
          />
        </div>

        <div className="px-5 py-4">
          <SectionLabel>{t("contact.messagingTitle")}</SectionLabel>
          <div
            className={cn(
              "rounded-xl border p-3.5",
              lineConnected
                ? "border-[#06C755]/25 bg-[#06C755]/6"
                : "border-border bg-muted/20",
            )}
          >
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#06C755]/15 text-[#06C755] ring-1 ring-[#06C755]/20">
                <MessageCircle className="size-5" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">
                    {t("contact.line.label")}
                  </p>
                  {lineConnected ? (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-[#06C755]/15 px-2 py-0.5 text-[10px] font-semibold text-[#06C755]">
                      <CheckCircle2 className="size-3" aria-hidden />
                      {t("contact.line.statusBadge")}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                  {statusQuery.isLoading
                    ? t("contact.line.statusLoading")
                    : lineConnected
                      ? t("contact.line.statusConnected")
                      : t("contact.line.description")}
                </p>
                <Button
                  type="button"
                  variant={lineConnected ? "outline" : "default"}
                  size="sm"
                  className="mt-3 h-8 rounded-full px-3.5 text-xs"
                  onClick={() => setLineOpen(true)}
                >
                  {lineConnected
                    ? t("contact.line.manage")
                    : t("contact.line.connect")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <LineConnectDialog open={lineOpen} onOpenChange={setLineOpen} />
    </>
  )
}
